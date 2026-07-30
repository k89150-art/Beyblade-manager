import type { MaturityStage } from "../domain/index.js";
import type { EvidenceEntry } from "../evidence/index.js";
import type { TrendDirection } from "../trend/index.js";
import type {
  MaturityEngineInput,
  MaturityMetric,
  MaturityModelOutput
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Stage names and safety rules are formal. The specification does not assign
// numeric thresholds, so the operational MVP thresholds are versioned here.
const RULES = {
  volumeTarget: 8,
  durationTargetDays: 84,
  sourceTarget: 3,
  seedMinimumCount: 3,
  emergingMinimumDays: 14,
  establishedCount: 6,
  establishedDays: 56,
  matureCount: 8,
  matureDays: 84,
  legacyMinimumCount: 6,
  legacyMinimumDays: 84,
  staleDays: 84
} as const;

export class MaturityEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaturityEngineError";
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function metric(value: number | null, score: number | null): MaturityMetric {
  return {
    value: value === null ? null : round(value),
    score: score === null ? null : round(score)
  };
}

function stabilityScore(direction: TrendDirection): number | null {
  switch (direction) {
    case "stable":
      return 100;
    case "up":
    case "down":
      return 75;
    case "strong_up":
    case "strong_down":
      return 55;
    case "volatile":
      return 20;
    case "insufficient_data":
      return null;
  }
}

function targetEntity(entry: EvidenceEntry): string | null {
  return entry.target.targetType === "entity" ? entry.target.entityId : null;
}

function isGrowthDirection(direction: TrendDirection): boolean {
  return direction === "up" || direction === "strong_up";
}

function isDeclineDirection(direction: TrendDirection): boolean {
  return direction === "down" || direction === "strong_down";
}

export function calculateMaturity(
  input: MaturityEngineInput
): MaturityModelOutput {
  const analysisTimestamp = parseDate(input.analysisDate);
  if (analysisTimestamp === null) {
    throw new MaturityEngineError("analysisDate must be a real ISO date.");
  }
  if (
    input.confidenceResult.entityId !== input.entityId ||
    input.trendResults.entityId !== input.entityId
  ) {
    throw new MaturityEngineError(
      "Confidence and Trend results must target the requested Entity."
    );
  }
  if (
    input.trendResults.analysisDate !== input.analysisDate ||
    input.confidenceResult.calculatedAt.slice(0, 10) !== input.analysisDate
  ) {
    throw new MaturityEngineError(
      "Confidence and Trend results must use the requested analysisDate."
    );
  }

  const eligible = input.evidenceRecords.filter((entry) => {
    const timestamp = parseDate(entry.record.eventDate);
    if (timestamp === null) {
      throw new MaturityEngineError(
        `Evidence '${entry.record.id}' has an invalid eventDate.`
      );
    }
    return (
      targetEntity(entry) === input.entityId &&
      entry.record.status === "verified" &&
      timestamp <= analysisTimestamp
    );
  });
  const timestamps = eligible
    .map((entry) => parseDate(entry.record.eventDate))
    .filter((value): value is number => value !== null);
  const evidenceCount = eligible.length;
  const durationDays =
    timestamps.length < 2
      ? timestamps.length === 0
        ? null
        : 0
      : Math.floor((Math.max(...timestamps) - Math.min(...timestamps)) / DAY_MS);
  const newestAgeDays =
    timestamps.length === 0
      ? null
      : Math.floor((analysisTimestamp - Math.max(...timestamps)) / DAY_MS);
  const sourceCount = new Set(
    eligible.map((entry) => entry.record.independentSourceGroup)
  ).size;
  const trendScores = input.trendResults.windows
    .map((window) => stabilityScore(window.trendDirection))
    .filter((value): value is number => value !== null);
  const trendStabilityScore = mean(trendScores);
  const volumeScore = Math.min(
    100,
    (evidenceCount / RULES.volumeTarget) * 100
  );
  const durationScore =
    durationDays === null
      ? null
      : Math.min(100, (durationDays / RULES.durationTargetDays) * 100);
  const sourceScore = Math.min(
    100,
    (sourceCount / RULES.sourceTarget) * 100
  );
  const scoreFactors = [
    volumeScore,
    durationScore,
    sourceScore,
    trendStabilityScore,
    input.confidenceResult.confidenceScore
  ].filter((value): value is number => value !== null);
  const maturityScore =
    scoreFactors.length === 0 ? null : round(mean(scoreFactors) ?? 0);
  const reasonCodes: string[] = [];
  const reasons: string[] = [];
  let maturityStage: MaturityStage | null = null;

  if (
    evidenceCount === 0 ||
    input.confidenceResult.confidenceLevel === "insufficient" ||
    input.confidenceResult.confidenceScore === null
  ) {
    reasonCodes.push("maturity.insufficient_data");
    reasons.push(
      "沒有足夠的 verified Evidence 或 Confidence，Maturity Stage 保持 null。"
    );
  } else {
    const decliningWindows = input.trendResults.windows.filter((window) =>
      isDeclineDirection(window.trendDirection)
    );
    const declining = decliningWindows.length > 0;
    const stale = newestAgeDays !== null && newestAgeDays > RULES.staleDays;

    if (
      evidenceCount >= RULES.legacyMinimumCount &&
      (durationDays ?? 0) >= RULES.legacyMinimumDays &&
      (declining || stale)
    ) {
      maturityStage = "legacy";
      reasonCodes.push("maturity.legacy");
      reasons.push(
        declining
          ? `${decliningWindows.map((window) => window.windowWeeks).join("／")} 週 Trend 已轉為下降，且具備長期 Evidence，判定為 legacy；legacy 不代表 avoid。`
          : `最新 Evidence 已距分析日 ${newestAgeDays} 天，長期訊號進入 legacy。`
      );
    } else if (
      evidenceCount >= RULES.matureCount &&
      (durationDays ?? 0) >= RULES.matureDays &&
      sourceCount >= RULES.sourceTarget &&
      (input.confidenceResult.confidenceLevel === "high" ||
        input.confidenceResult.confidenceLevel === "very_high") &&
      (trendStabilityScore ?? 0) >= 70 &&
      !input.trendResults.windows.some(
        (window) => window.trendDirection === "volatile"
      )
    ) {
      maturityStage = "mature";
      reasonCodes.push("maturity.mature");
      reasons.push(
        "Evidence 量、持續時間、來源多樣性、Confidence 與 Trend 穩定度均達成熟條件。"
      );
    } else if (
      evidenceCount >= RULES.establishedCount &&
      (durationDays ?? 0) >= RULES.establishedDays &&
      sourceCount >= 2 &&
      input.confidenceResult.confidenceLevel !== "low"
    ) {
      maturityStage = "established";
      reasonCodes.push("maturity.established");
      reasons.push("Evidence 已持續累積並跨來源驗證，進入 established。");
    } else if (
      evidenceCount >= RULES.seedMinimumCount &&
      (durationDays ?? 0) >= RULES.emergingMinimumDays &&
      sourceCount >= 2
    ) {
      maturityStage = "emerging";
      reasonCodes.push("maturity.emerging");
      reasons.push("Evidence 開始跨來源累積，但尚未達 established 條件。");
    } else {
      maturityStage = "seed";
      reasonCodes.push("maturity.seed");
      reasons.push("目前仍是早期 Evidence 訊號，維持 seed 階段。");
    }

    if (
      maturityStage !== "legacy" &&
      input.trendResults.windows.some((window) =>
        isGrowthDirection(window.trendDirection)
      )
    ) {
      reasonCodes.push("maturity.growth_signal");
      reasons.push("至少一個 Trend 視窗呈現成長方向。");
    }
    if (
      input.trendResults.windows.some(
        (window) => window.trendDirection === "volatile"
      )
    ) {
      reasonCodes.push("maturity.trend_volatility");
      reasons.push("Trend 存在高波動，降低成熟度穩定性。");
    }
    if (sourceCount === 1) {
      reasonCodes.push("maturity.single_source");
      reasons.push("Evidence 雖有累積，但來源群組仍然單一。");
    }
  }

  return {
    entityId: input.entityId,
    maturityStage,
    maturityScore:
      maturityStage === null ? null : maturityScore,
    evidenceVolume: metric(evidenceCount, volumeScore),
    evidenceDuration: metric(durationDays, durationScore),
    sourceDiversity: metric(sourceCount, sourceScore),
    trendStability: metric(
      trendScores.length,
      trendStabilityScore
    ),
    confidenceLevel: input.confidenceResult.confidenceLevel,
    reasonCodes,
    reasons,
    calculatedAt: `${input.analysisDate}T00:00:00.000Z`
  };
}
