import type { RiskCode, RiskLevel } from "../domain/index.js";
import type { EvidenceEntry } from "../evidence/index.js";
import type {
  RiskEngineInput,
  RiskModelOutput
} from "./types.js";

export const RISK_POLICY_VERSION = "risk-policy-mvp-1.0.0";

export const RISK_POLICY = {
  minimumEvidence: 2,
  staleDays: 180,
  shortObservationDays: 30,
  lowConfidenceScore: 50,
  lowConsistencyScore: 50,
  weights: {
    insufficientSample: 28,
    singleSource: 18,
    singleRegion: 10,
    staleData: 20,
    trendVolatility: 25,
    rapidDecline: 25,
    lowConfidence: 20,
    emergingUncertainty: 15,
    shortObservation: 12,
    conflictingEvidence: 20,
    missingMatchData: 8,
    configurationNotConverged: 15
  },
  mitigation: {
    highConfidence: 12,
    diverseSources: 10,
    matureAndStable: 10,
    recentEvidence: 8
  },
  levels: {
    medium: 30,
    high: 60
  }
} as const;

export class RiskEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiskEngineError";
  }
}

function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function targetEntity(entry: EvidenceEntry): string | null {
  return entry.target.targetType === "entity" ? entry.target.entityId : null;
}

function riskLevel(score: number): RiskLevel {
  if (score >= RISK_POLICY.levels.high) return "high";
  if (score >= RISK_POLICY.levels.medium) return "medium";
  return "low";
}

export function calculateRisk(input: RiskEngineInput): RiskModelOutput {
  const analysisTimestamp = parseDate(input.analysisDate);
  if (analysisTimestamp === null) {
    throw new RiskEngineError("analysisDate must be a real ISO date.");
  }
  if (
    input.confidenceResult.entityId !== input.entityId ||
    input.trendResults.entityId !== input.entityId ||
    input.maturityResult.entityId !== input.entityId
  ) {
    throw new RiskEngineError(
      "All prerequisite results must target the requested Entity."
    );
  }
  if (
    input.confidenceResult.calculatedAt.slice(0, 10) !== input.analysisDate ||
    input.trendResults.analysisDate !== input.analysisDate ||
    input.maturityResult.calculatedAt.slice(0, 10) !== input.analysisDate
  ) {
    throw new RiskEngineError(
      "All prerequisite results must use the requested analysisDate."
    );
  }

  const eligible = input.evidenceRecords.filter((entry) => {
    const eventTimestamp = parseDate(entry.record.eventDate);
    if (eventTimestamp === null) {
      throw new RiskEngineError(
        `Evidence '${entry.record.id}' has an invalid eventDate.`
      );
    }
    return (
      targetEntity(entry) === input.entityId &&
      entry.record.status === "verified" &&
      eventTimestamp <= analysisTimestamp
    );
  });
  const evidenceCount = eligible.length;
  const sourceCount = new Set(
    eligible.map((entry) => entry.record.independentSourceGroup)
  ).size;
  const regionCount = new Set(eligible.map((entry) => entry.record.region))
    .size;
  const timestamps = eligible
    .map((entry) => parseDate(entry.record.eventDate))
    .filter((value): value is number => value !== null);
  const newestAgeDays =
    timestamps.length === 0
      ? null
      : Math.floor(
          (analysisTimestamp - Math.max(...timestamps)) / 86_400_000
        );
  const observationDays =
    timestamps.length < 2
      ? timestamps.length === 0
        ? null
        : 0
      : Math.floor(
          (Math.max(...timestamps) - Math.min(...timestamps)) / 86_400_000
        );
  const riskCodes: RiskCode[] = [];
  const reasons: string[] = [];
  const contributingFactors: string[] = [];
  const mitigatingFactors: string[] = [];
  let score = 8;

  const addRisk = (
    code: RiskCode,
    points: number,
    reason: string,
    factor: string
  ): void => {
    if (!riskCodes.includes(code)) riskCodes.push(code);
    score += points;
    reasons.push(reason);
    contributingFactors.push(factor);
  };

  if (
    evidenceCount === 0 ||
    input.confidenceResult.confidenceLevel === "insufficient" ||
    input.confidenceResult.confidenceScore === null
  ) {
    if (evidenceCount < RISK_POLICY.minimumEvidence) {
      riskCodes.push("insufficient_sample");
    }
    if (
      eligible.every(
        (entry) =>
          entry.record.performance.matchWins === null &&
          entry.record.performance.matchLosses === null &&
          entry.record.performance.winRate === null
      )
    ) {
      riskCodes.push("missing_match_data");
    }
    return {
      entityId: input.entityId,
      riskScore: null,
      riskLevel: "unknown",
      riskCodes,
      reasons: [
        "Evidence 或 Confidence 不足，Risk Score 保持未知。"
      ],
      contributingFactors: ["目前無法形成可靠的風險估計。"],
      mitigatingFactors: [],
      evidenceCount,
      confidenceLevel: input.confidenceResult.confidenceLevel,
      maturityStage: input.maturityResult.maturityStage,
      trendSummary: input.trendResults.windows.map((window) => ({
        windowWeeks: window.windowWeeks,
        direction: window.trendDirection,
        confidence: window.confidence
      })),
      calculatedAt: `${input.analysisDate}T00:00:00.000Z`
    };
  }

  if (evidenceCount < RISK_POLICY.minimumEvidence) {
    addRisk(
      "insufficient_sample",
      RISK_POLICY.weights.insufficientSample,
      `只有 ${evidenceCount} 筆 verified Evidence，樣本不足。`,
      "有效 Evidence 樣本量不足。"
    );
  }
  if (sourceCount === 1) {
    addRisk(
      "single_source_dependency",
      RISK_POLICY.weights.singleSource,
      "所有 Evidence 都來自同一獨立來源群組。",
      "結果過度依賴單一來源。"
    );
  }
  if (regionCount === 1) {
    addRisk(
      "single_region_dependency",
      RISK_POLICY.weights.singleRegion,
      "所有 Evidence 都來自同一地區。",
      "缺少跨地區驗證。"
    );
  }
  if (
    newestAgeDays !== null &&
    newestAgeDays > RISK_POLICY.staleDays
  ) {
    addRisk(
      "stale_data",
      RISK_POLICY.weights.staleData,
      `最新 Evidence 已距分析日 ${newestAgeDays} 天。`,
      "Evidence 已過期。"
    );
  }
  if (
    observationDays !== null &&
    observationDays < RISK_POLICY.shortObservationDays
  ) {
    addRisk(
      "short_observation_period",
      RISK_POLICY.weights.shortObservation,
      `Evidence 觀察期只有 ${observationDays} 天。`,
      "觀察期間偏短。"
    );
  }
  if (
    input.confidenceResult.confidenceScore <
    RISK_POLICY.lowConfidenceScore
  ) {
    addRisk(
      "insufficient_sample",
      RISK_POLICY.weights.lowConfidence,
      `Confidence Score 為 ${input.confidenceResult.confidenceScore}，可信度偏低。`,
      "Confidence 偏低。"
    );
  }
  if (
    input.confidenceResult.reasonCodes.includes(
      "confidence.conflicting_evidence"
    )
  ) {
    addRisk(
      "conflicting_evidence",
      RISK_POLICY.weights.conflictingEvidence,
      "Confidence 已辨識出互相矛盾的 Evidence。",
      "Evidence 結果存在衝突。"
    );
  }
  if (
    input.confidenceResult.consistency.score !== null &&
    input.confidenceResult.consistency.score <
      RISK_POLICY.lowConsistencyScore
  ) {
    addRisk(
      "configuration_not_converged",
      RISK_POLICY.weights.configurationNotConverged,
      "Evidence 的配置或結果一致性尚未收斂。",
      "配置訊號尚未收斂。"
    );
  }

  const volatileWindows = input.trendResults.windows.filter(
    (window) => window.trendDirection === "volatile"
  );
  const declineWindows = input.trendResults.windows.filter(
    (window) =>
      window.trendDirection === "down" ||
      window.trendDirection === "strong_down"
  );
  const strongDeclineWindows = declineWindows.filter(
    (window) => window.trendDirection === "strong_down"
  );
  if (volatileWindows.length > 0) {
    addRisk(
      "trend_instability",
      RISK_POLICY.weights.trendVolatility,
      `${volatileWindows.map((window) => window.windowWeeks).join("／")} 週 Trend 呈現高波動。`,
      "Trend 高波動。"
    );
  }
  if (strongDeclineWindows.length > 0) {
    addRisk(
      "trend_instability",
      RISK_POLICY.weights.rapidDecline,
      `${strongDeclineWindows.map((window) => window.windowWeeks).join("／")} 週 Trend 快速下降。`,
      "Trend 快速下降。"
    );
  }
  if (
    input.maturityResult.maturityStage === "emerging" &&
    (volatileWindows.length > 0 ||
      input.confidenceResult.confidenceLevel === "low")
  ) {
    addRisk(
      "new_release_uncertainty",
      RISK_POLICY.weights.emergingUncertainty,
      "目前仍在 emerging 階段，且訊號尚未穩定。",
      "新興訊號尚未穩定。"
    );
  }
  if (
    (input.maturityResult.maturityStage === "mature" ||
      input.maturityResult.maturityStage === "legacy") &&
    declineWindows.length > 0
  ) {
    addRisk(
      "trend_instability",
      RISK_POLICY.weights.rapidDecline,
      "長期成熟訊號已出現下降，需要避免被既有成熟度掩蓋。",
      "成熟或歷史階段開始衰退。"
    );
  }
  if (
    eligible.every(
      (entry) =>
        entry.record.performance.matchWins === null &&
        entry.record.performance.matchLosses === null &&
        entry.record.performance.winRate === null
    )
  ) {
    addRisk(
      "missing_match_data",
      RISK_POLICY.weights.missingMatchData,
      "Evidence 沒有來源直接提供的 Match Wins／Losses／Win Rate。",
      "缺少可驗證的對戰成績。"
    );
  }

  if (
    input.confidenceResult.confidenceLevel === "high" ||
    input.confidenceResult.confidenceLevel === "very_high"
  ) {
    score -= RISK_POLICY.mitigation.highConfidence;
    mitigatingFactors.push("Confidence 已達高可信度。");
  }
  if (sourceCount >= 3) {
    score -= RISK_POLICY.mitigation.diverseSources;
    mitigatingFactors.push(`Evidence 來自 ${sourceCount} 個獨立來源群組。`);
  }
  if (
    input.maturityResult.maturityStage === "mature" &&
    declineWindows.length === 0 &&
    volatileWindows.length === 0
  ) {
    score -= RISK_POLICY.mitigation.matureAndStable;
    mitigatingFactors.push("Maturity 已成熟，且沒有下降或高波動 Trend。");
  }
  if (newestAgeDays !== null && newestAgeDays <= 30) {
    score -= RISK_POLICY.mitigation.recentEvidence;
    mitigatingFactors.push(`最新 Evidence 距分析日僅 ${newestAgeDays} 天。`);
  }

  const riskScore = round(Math.max(0, Math.min(100, score)));
  if (riskCodes.length === 0) {
    reasons.push("目前沒有觸發正式 Risk Code。");
  }
  return {
    entityId: input.entityId,
    riskScore,
    riskLevel: riskLevel(riskScore),
    riskCodes,
    reasons,
    contributingFactors,
    mitigatingFactors,
    evidenceCount,
    confidenceLevel: input.confidenceResult.confidenceLevel,
    maturityStage: input.maturityResult.maturityStage,
    trendSummary: input.trendResults.windows.map((window) => ({
      windowWeeks: window.windowWeeks,
      direction: window.trendDirection,
      confidence: window.confidence
    })),
    calculatedAt: `${input.analysisDate}T00:00:00.000Z`
  };
}
