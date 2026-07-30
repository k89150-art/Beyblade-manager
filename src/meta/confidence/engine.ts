import {
  EVIDENCE_SCORE_DIMENSIONS,
  type EvidenceGrade
} from "../domain/index.js";
import {
  CONFIDENCE_MODEL_ID,
  CONFIDENCE_MODEL_VERSION
} from "./model.js";
import type {
  ConfidenceDimensionResult,
  ConfidenceEngineInput,
  ConfidenceExcludedEvidence,
  ConfidenceLevel,
  ConfidenceModelOutput
} from "./types.js";
import type { EvidenceEntry } from "../evidence/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const GRADE_WEIGHTS: Readonly<Record<EvidenceGrade, number>> = {
  A: 1,
  B: 0.85,
  C: 0.65,
  D: 0.35,
  E: 0.15
};

// The source specification names these caps but does not assign numbers.
// Keeping the operational thresholds together makes the MVP reproducible.
const RULES = {
  sufficientSampleCount: 4,
  diverseSourceCount: 3,
  diverseRegionCount: 3,
  shortObservationDays: 30,
  staleEvidenceDays: 180,
  conflictSpread: 30,
  caps: {
    singleEvidence: 40,
    singleSource: 55,
    singleRegion: 65,
    shortObservation: 65,
    lowGradeMajority: 50,
    conflictingEvidence: 55,
    staleEvidence: 45
  }
} as const;

export class ConfidenceEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfidenceEngineError";
  }
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function dateValue(value: string): number | null {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function ageInDays(analysisDate: string, eventDate: string): number | null {
  const analysis = dateValue(analysisDate);
  const event = dateValue(eventDate);
  if (analysis === null || event === null) {
    return null;
  }
  return Math.floor((analysis - event) / DAY_MS);
}

function recencyScore(ageDays: number): number {
  if (ageDays <= 30) return 100;
  if (ageDays <= 90) return 75;
  if (ageDays <= 180) return 50;
  if (ageDays <= 365) return 25;
  return 10;
}

function levelFor(score: number | null): ConfidenceLevel {
  if (score === null) return "insufficient";
  if (score >= 85) return "very_high";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function knownScores(entry: EvidenceEntry): readonly number[] {
  return EVIDENCE_SCORE_DIMENSIONS.flatMap((dimension) => {
    const score = entry.dimensionScores[dimension];
    return typeof score === "number" ? [score] : [];
  });
}

function evidenceAverage(entry: EvidenceEntry): number | null {
  return mean(knownScores(entry));
}

function duplicateKey(entry: EvidenceEntry): string {
  const record = entry.record;
  return [
    record.eventName,
    record.eventDate,
    record.region,
    record.placement ?? "",
    entry.target.targetType,
    entry.target.targetType === "entity" ? entry.target.entityId : entry.target.comboId,
    record.independentSourceGroup
  ].join("\u0000");
}

function addUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function exclude(
  excluded: ConfidenceExcludedEvidence[],
  evidenceId: string,
  reasonCode: string,
  reason: string
): void {
  excluded.push({ evidenceId, reasonCode, reason });
}

function dimension(
  dimensionId: string,
  score: number | null,
  explanation: string
): ConfidenceDimensionResult {
  return {
    dimensionId,
    score: score === null ? null : roundScore(score),
    explanation
  };
}

function checkInput(input: ConfidenceEngineInput): void {
  if (
    input.modelId !== CONFIDENCE_MODEL_ID ||
    input.modelVersion !== CONFIDENCE_MODEL_VERSION
  ) {
    throw new ConfidenceEngineError(
      `Unsupported Confidence model '${input.modelId}@${input.modelVersion}'.`
    );
  }
  const analysis = dateValue(input.analysisDate);
  if (
    analysis === null ||
    new Date(analysis).toISOString().slice(0, 10) !== input.analysisDate
  ) {
    throw new ConfidenceEngineError(
      `Invalid analysisDate '${input.analysisDate}'.`
    );
  }
}

export function calculateConfidence(
  input: ConfidenceEngineInput
): ConfidenceModelOutput {
  checkInput(input);
  const originalOrder = [...input.evidenceRecords];
  const ordered = [...originalOrder].sort((left, right) =>
    left.record.id.localeCompare(right.record.id)
  );
  const excluded: ConfidenceExcludedEvidence[] = [];
  const eligible: EvidenceEntry[] = [];
  const duplicateKeys = new Set<string>();

  ordered.forEach((entry) => {
    const evidenceId = entry.record.id;
    if (
      entry.target.targetType !== "entity" ||
      entry.target.entityId !== input.entityId
    ) {
      exclude(
        excluded,
        evidenceId,
        "confidence.wrong_target",
        "Evidence targets a different Entity."
      );
      return;
    }
    if (entry.record.status !== "verified") {
      exclude(
        excluded,
        evidenceId,
        "confidence.unverified_evidence",
        `Evidence status '${entry.record.status}' is not eligible.`
      );
      return;
    }
    const ageDays = ageInDays(input.analysisDate, entry.record.eventDate);
    if (ageDays === null) {
      exclude(
        excluded,
        evidenceId,
        "confidence.invalid_event_date",
        "Evidence has an invalid event date."
      );
      return;
    }
    if (ageDays < 0) {
      exclude(
        excluded,
        evidenceId,
        "confidence.future_evidence",
        "Evidence occurs after the analysis date."
      );
      return;
    }
    const key = duplicateKey(entry);
    if (duplicateKeys.has(key)) {
      exclude(
        excluded,
        evidenceId,
        "confidence.duplicate_evidence",
        "Evidence duplicates an already included event and source group."
      );
      return;
    }
    duplicateKeys.add(key);
    eligible.push(entry);
  });

  const calculatedAt = `${input.analysisDate}T00:00:00.000Z`;
  if (eligible.length === 0) {
    const exclusionCodes = excluded.map((item) => item.reasonCode);
    return {
      entityId: input.entityId,
      confidenceScore: null,
      hardCap: null,
      confidenceLevel: "insufficient",
      evidenceCount: 0,
      sourceDiversity: { sourceCount: 0, score: null },
      recency: {
        newestEvidenceDate: null,
        ageDays: null,
        score: null
      },
      completeness: {
        knownDimensionCount: 0,
        totalDimensionCount: 0,
        score: null
      },
      consistency: { score: null, spread: null },
      dimensions: [
        dimension(
          "evidence_availability",
          null,
          "No verified and eligible Evidence is available."
        )
      ],
      includedEvidenceIds: [],
      excludedEvidence: excluded,
      reasonCodes: [
        "confidence.no_valid_evidence",
        ...exclusionCodes.filter(
          (code, index) => exclusionCodes.indexOf(code) === index
        )
      ],
      reasons: [
        "沒有可用的 verified Evidence，因此 Confidence 保持未知。"
      ],
      positiveFactors: [],
      negativeFactors: ["沒有可計分 Evidence。"],
      calculatedAt
    };
  }

  const sources = new Set(
    eligible.map((entry) => entry.record.independentSourceGroup)
  );
  const regions = new Set(eligible.map((entry) => entry.record.region));
  const dates = eligible
    .map((entry) => entry.record.eventDate)
    .sort((left, right) => left.localeCompare(right));
  const newestDate = dates[dates.length - 1] ?? input.analysisDate;
  const oldestDate = dates[0] ?? newestDate;
  const newestAge = ageInDays(input.analysisDate, newestDate) ?? 0;
  const observationSpan = Math.max(
    0,
    (dateValue(newestDate) ?? 0) - (dateValue(oldestDate) ?? 0)
  ) / DAY_MS;

  const sampleScore = Math.min(
    100,
    (eligible.length / RULES.sufficientSampleCount) * 100
  );
  const sourceScore = Math.min(
    100,
    (sources.size / RULES.diverseSourceCount) * 100
  );
  const regionScore = Math.min(
    100,
    (regions.size / RULES.diverseRegionCount) * 100
  );
  const currentRecencyScore = recencyScore(newestAge);
  const knownDimensionCount = eligible.reduce(
    (total, entry) => total + knownScores(entry).length,
    0
  );
  const totalDimensionCount =
    eligible.length * EVIDENCE_SCORE_DIMENSIONS.length;
  const completenessScore =
    totalDimensionCount === 0
      ? null
      : (knownDimensionCount / totalDimensionCount) * 100;
  const evidenceAverages = eligible
    .map(evidenceAverage)
    .filter((value): value is number => value !== null);
  const consistencySpread =
    evidenceAverages.length < 2
      ? null
      : Math.max(...evidenceAverages) - Math.min(...evidenceAverages);
  const consistencyScore =
    consistencySpread === null
      ? null
      : Math.max(0, 100 - consistencySpread);
  const gradeScore =
    mean(
      eligible.map((entry) => GRADE_WEIGHTS[entry.record.grade] * 100)
    ) ?? 0;

  const factors = [
    sampleScore,
    sourceScore,
    regionScore,
    currentRecencyScore,
    completenessScore,
    consistencyScore,
    gradeScore
  ].filter((value): value is number => value !== null);
  const rawScore = mean(factors) ?? 0;
  let hardCap = 100;
  const reasonCodes: string[] = [];
  const reasons: string[] = [];
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];

  const applyCap = (
    cap: number,
    code: string,
    reason: string,
    factor: string
  ): void => {
    hardCap = Math.min(hardCap, cap);
    addUnique(reasonCodes, code);
    reasons.push(reason);
    negativeFactors.push(factor);
  };

  if (eligible.length === 1) {
    applyCap(
      RULES.caps.singleEvidence,
      "confidence.insufficient_sample",
      "只有 1 筆有效 Evidence，少量樣本不能形成高 Confidence。",
      "有效 Evidence 樣本不足。"
    );
  }
  if (sources.size === 1) {
    applyCap(
      RULES.caps.singleSource,
      "confidence.single_source_dependency",
      "所有有效 Evidence 來自同一獨立來源群組。",
      "來源缺乏獨立多樣性。"
    );
  }
  if (regions.size === 1) {
    applyCap(
      RULES.caps.singleRegion,
      "confidence.single_region_dependency",
      "所有有效 Evidence 都來自同一地區。",
      "地區樣本單一。"
    );
  }
  if (eligible.length > 1 && observationSpan < RULES.shortObservationDays) {
    applyCap(
      RULES.caps.shortObservation,
      "confidence.short_observation_period",
      `觀察期只有 ${roundScore(observationSpan)} 天，尚不足以確認時間一致性。`,
      "觀察期間偏短。"
    );
  }
  const lowGradeCount = eligible.filter(
    (entry) => entry.record.grade === "D" || entry.record.grade === "E"
  ).length;
  if (lowGradeCount / eligible.length >= 0.5) {
    applyCap(
      RULES.caps.lowGradeMajority,
      "confidence.low_grade_majority",
      "D／E Grade Evidence 佔一半以上，可信度受到限制。",
      "低 Grade Evidence 比例偏高。"
    );
  }
  if (
    consistencySpread !== null &&
    consistencySpread >= RULES.conflictSpread
  ) {
    applyCap(
      RULES.caps.conflictingEvidence,
      "confidence.conflicting_evidence",
      `Evidence 平均分數差距達 ${roundScore(consistencySpread)}，存在明顯矛盾。`,
      "Evidence 結果互相矛盾。"
    );
  }
  if (newestAge > RULES.staleEvidenceDays) {
    applyCap(
      RULES.caps.staleEvidence,
      "confidence.stale_data",
      `最新 Evidence 距分析日已有 ${newestAge} 天。`,
      "Evidence 已過期。"
    );
  }
  if (
    completenessScore !== null &&
    completenessScore < 100
  ) {
    addUnique(reasonCodes, "confidence.incomplete_evidence");
    reasons.push(
      `六維資料完整度為 ${roundScore(completenessScore)}%，缺值保持 null，未當作零分。`
    );
    negativeFactors.push("部分 Evidence 六維資料不完整。");
  }

  excluded.forEach((item) => addUnique(reasonCodes, item.reasonCode));
  if (eligible.length >= RULES.sufficientSampleCount) {
    positiveFactors.push(`共有 ${eligible.length} 筆有效 Evidence。`);
  }
  if (sources.size >= RULES.diverseSourceCount) {
    positiveFactors.push(`Evidence 來自 ${sources.size} 個獨立來源群組。`);
  }
  if (newestAge <= 30) {
    positiveFactors.push(`最新 Evidence 僅距分析日 ${newestAge} 天。`);
  }
  if (consistencyScore !== null && consistencyScore >= 80) {
    positiveFactors.push("不同 Evidence 的六維結果大致一致。");
  }
  if (reasonCodes.length === 0) {
    reasonCodes.push("confidence.strong_evidence_base");
    reasons.push("有效 Evidence 在樣本、來源、時效與一致性上沒有觸發限制。");
  }
  if (positiveFactors.length === 0) {
    positiveFactors.push("已有至少一筆可追溯的 verified Evidence。");
  }

  const finalScore = roundScore(Math.min(rawScore, hardCap));
  const dimensions: readonly ConfidenceDimensionResult[] = [
    dimension(
      "sample_size",
      sampleScore,
      `${eligible.length} 筆有效 Evidence；${RULES.sufficientSampleCount} 筆達到 MVP 完整樣本基準。`
    ),
    dimension(
      "source_diversity",
      sourceScore,
      `${sources.size} 個 independentSourceGroup。`
    ),
    dimension(
      "regional_diversity",
      regionScore,
      `${regions.size} 個地區。`
    ),
    dimension(
      "recency",
      currentRecencyScore,
      `最新 Evidence 距分析日 ${newestAge} 天。`
    ),
    dimension(
      "completeness",
      completenessScore,
      `已知 ${knownDimensionCount}/${totalDimensionCount} 個六維欄位。`
    ),
    dimension(
      "consistency",
      consistencyScore,
      consistencySpread === null
        ? "少於 2 筆可比較 Evidence，一致性保持 null。"
        : `Evidence 平均分數最大差距為 ${roundScore(consistencySpread)}。`
    ),
    dimension(
      "grade_quality",
      gradeScore,
      "依正式 Grade 權重 A=1、B=0.85、C=0.65、D=0.35、E=0.15 計算。"
    )
  ];

  return {
    entityId: input.entityId,
    confidenceScore: finalScore,
    hardCap,
    confidenceLevel: levelFor(finalScore),
    evidenceCount: eligible.length,
    sourceDiversity: {
      sourceCount: sources.size,
      score: roundScore(sourceScore)
    },
    recency: {
      newestEvidenceDate: newestDate,
      ageDays: newestAge,
      score: roundScore(currentRecencyScore)
    },
    completeness: {
      knownDimensionCount,
      totalDimensionCount,
      score:
        completenessScore === null ? null : roundScore(completenessScore)
    },
    consistency: {
      score: consistencyScore === null ? null : roundScore(consistencyScore),
      spread:
        consistencySpread === null ? null : roundScore(consistencySpread)
    },
    dimensions,
    includedEvidenceIds: eligible.map((entry) => entry.record.id),
    excludedEvidence: excluded,
    reasonCodes,
    reasons,
    positiveFactors,
    negativeFactors,
    calculatedAt
  };
}
