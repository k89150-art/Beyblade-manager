import {
  TREND_WINDOWS,
  type EvidenceGrade,
  type IsoDate,
  type TrendWindow
} from "../domain/index.js";
import type { EvidenceEntry } from "../evidence/index.js";
import type {
  TrendDirection,
  TrendEngineInput,
  TrendExcludedEvidence,
  TrendWindowOutput
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const GRADE_WEIGHTS: Readonly<Record<EvidenceGrade, number>> = {
  A: 1,
  B: 0.85,
  C: 0.65,
  D: 0.35,
  E: 0.15
};

// The formal rules define windows and safety constraints but not thresholds.
// These versioned MVP thresholds keep the operational result reproducible.
const RULES = {
  minimumPeriodSamples: 2,
  stableChange: 5,
  strongChange: 15,
  volatileSpread: 30,
  newSignalDays: 7
} as const;

export class TrendEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrendEngineError";
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

function isoDate(timestamp: number): IsoDate {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function shiftDays(value: number, days: number): number {
  return value + days * DAY_MS;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function evidenceSignal(entry: EvidenceEntry): number | null {
  const known = Object.values(entry.dimensionScores).filter(
    (value): value is number => value !== null
  );
  const average = mean(known);
  return average === null
    ? null
    : round(average * GRADE_WEIGHTS[entry.record.grade]);
}

function targetEntity(entry: EvidenceEntry): string | null {
  return entry.target.targetType === "entity" ? entry.target.entityId : null;
}

function deduplicationKey(entry: EvidenceEntry): string {
  return [
    entry.record.eventName,
    entry.record.eventDate,
    entry.record.region,
    entry.record.placement ?? "",
    targetEntity(entry) ?? "",
    entry.record.independentSourceGroup
  ].join("|");
}

function excluded(
  entry: EvidenceEntry,
  reasonCode: string,
  reason: string
): TrendExcludedEvidence {
  return { evidenceId: entry.record.id, reasonCode, reason };
}

function trendDirection(
  change: number,
  volatilitySpread: number
): TrendDirection {
  if (volatilitySpread >= RULES.volatileSpread) return "volatile";
  if (change >= RULES.strongChange) return "strong_up";
  if (change >= RULES.stableChange) return "up";
  if (change <= -RULES.strongChange) return "strong_down";
  if (change <= -RULES.stableChange) return "down";
  return "stable";
}

export function calculateTrend(input: TrendEngineInput): TrendWindowOutput {
  const analysisTimestamp = parseDate(input.analysisDate);
  if (analysisTimestamp === null) {
    throw new TrendEngineError("analysisDate must be a real ISO date.");
  }
  if (!TREND_WINDOWS.includes(input.windowWeeks)) {
    throw new TrendEngineError("windowWeeks must be 4, 8, or 12.");
  }
  if (
    input.modelId.trim().length === 0 ||
    input.modelVersion.trim().length === 0
  ) {
    throw new TrendEngineError("modelId and modelVersion are required.");
  }

  const windowDays = input.windowWeeks * 7;
  const currentStartTimestamp = shiftDays(
    analysisTimestamp,
    -(windowDays - 1)
  );
  const comparisonEndTimestamp = shiftDays(currentStartTimestamp, -1);
  const comparisonStartTimestamp = shiftDays(
    comparisonEndTimestamp,
    -(windowDays - 1)
  );
  const excludedEvidence: TrendExcludedEvidence[] = [];
  const seen = new Set<string>();
  const current: { entry: EvidenceEntry; value: number }[] = [];
  const comparison: { entry: EvidenceEntry; value: number }[] = [];

  for (const entry of input.evidenceRecords) {
    const eventTimestamp = parseDate(entry.record.eventDate);
    if (eventTimestamp === null) {
      throw new TrendEngineError(
        `Evidence '${entry.record.id}' has an invalid eventDate.`
      );
    }
    if (targetEntity(entry) !== input.entityId) {
      excludedEvidence.push(
        excluded(entry, "trend.target_mismatch", "Evidence 不屬於目標 Entity。")
      );
      continue;
    }
    if (entry.record.status !== "verified") {
      excludedEvidence.push(
        excluded(
          entry,
          `trend.status_${entry.record.status}`,
          `Evidence 狀態為 ${entry.record.status}，不可計算 Trend。`
        )
      );
      continue;
    }
    if (eventTimestamp > analysisTimestamp) {
      excludedEvidence.push(
        excluded(
          entry,
          "trend.future_evidence",
          "Evidence 日期晚於 Analysis Date。"
        )
      );
      continue;
    }
    const key = deduplicationKey(entry);
    if (seen.has(key)) {
      excludedEvidence.push(
        excluded(
          entry,
          "trend.duplicate_evidence",
          "Evidence 與同事件、來源群組及目標的資料重複。"
        )
      );
      continue;
    }
    seen.add(key);
    const value = evidenceSignal(entry);
    if (value === null) {
      excludedEvidence.push(
        excluded(
          entry,
          "trend.missing_signal",
          "Evidence 六維分數皆為 null，無法形成 Trend 訊號。"
        )
      );
      continue;
    }
    if (
      eventTimestamp >= currentStartTimestamp &&
      eventTimestamp <= analysisTimestamp
    ) {
      current.push({ entry, value });
    } else if (
      eventTimestamp >= comparisonStartTimestamp &&
      eventTimestamp <= comparisonEndTimestamp
    ) {
      comparison.push({ entry, value });
    } else {
      excludedEvidence.push(
        excluded(
          entry,
          "trend.outside_window",
          `Evidence 不在 ${input.windowWeeks} 週本期或比較期內。`
        )
      );
    }
  }

  const included = [...current, ...comparison].sort((left, right) =>
    left.entry.record.id.localeCompare(right.entry.record.id)
  );
  const sampleCount = input.evidenceRecords.filter(
    (entry) => targetEntity(entry) === input.entityId
  ).length;
  const validSampleCount = included.length;
  const currentValue = mean(current.map((item) => item.value));
  const previousValue = mean(comparison.map((item) => item.value));
  const reasonCodes: string[] = [];
  const reasons: string[] = [];
  const calculatedAt = `${input.analysisDate}T00:00:00.000Z`;

  const base = {
    entityId: input.entityId,
    windowWeeks: input.windowWeeks,
    periodStart: isoDate(currentStartTimestamp),
    periodEnd: input.analysisDate,
    comparisonStart: isoDate(comparisonStartTimestamp),
    comparisonEnd: isoDate(comparisonEndTimestamp),
    sampleCount,
    validSampleCount,
    currentSampleCount: current.length,
    comparisonSampleCount: comparison.length,
    includedEvidenceIds: included.map((item) => item.entry.record.id),
    excludedEvidence,
    calculatedAt
  } as const;

  if (
    current.length < RULES.minimumPeriodSamples ||
    comparison.length < RULES.minimumPeriodSamples ||
    currentValue === null ||
    previousValue === null
  ) {
    if (current.length < RULES.minimumPeriodSamples) {
      reasonCodes.push("trend.current_period_insufficient");
      reasons.push(
        `本期只有 ${current.length} 筆有效 Evidence，至少需要 ${RULES.minimumPeriodSamples} 筆。`
      );
    }
    if (comparison.length < RULES.minimumPeriodSamples) {
      reasonCodes.push("trend.comparison_period_insufficient");
      reasons.push(
        `比較期只有 ${comparison.length} 筆有效 Evidence，至少需要 ${RULES.minimumPeriodSamples} 筆。`
      );
    }
    return {
      ...base,
      trendDirection: "insufficient_data",
      trendStrength: null,
      currentValue: currentValue === null ? null : round(currentValue),
      previousValue: previousValue === null ? null : round(previousValue),
      absoluteChange: null,
      percentageChange: null,
      confidence: null,
      reasonCodes,
      reasons
    };
  }

  const absoluteChange = currentValue - previousValue;
  const percentageChange =
    previousValue === 0 ? null : (absoluteChange / previousValue) * 100;
  const currentSpread =
    Math.max(...current.map((item) => item.value)) -
    Math.min(...current.map((item) => item.value));
  const comparisonSpread =
    Math.max(...comparison.map((item) => item.value)) -
    Math.min(...comparison.map((item) => item.value));
  const volatilitySpread = Math.max(currentSpread, comparisonSpread);
  let direction = trendDirection(absoluteChange, volatilitySpread);
  const allDates = included
    .map((item) => parseDate(item.entry.record.eventDate))
    .filter((value): value is number => value !== null);
  const evidenceAgeDays =
    allDates.length === 0
      ? 0
      : Math.floor((analysisTimestamp - Math.min(...allDates)) / DAY_MS);
  const sourceCount = new Set(
    included.map((item) => item.entry.record.independentSourceGroup)
  ).size;

  if (direction === "strong_up") {
    if (validSampleCount === 1) {
      direction = "up";
      reasonCodes.push("trend.single_event_cap");
      reasons.push("單一事件不得判定為 strong_up，已限制為 up。");
    }
    if (previousValue === 0) {
      direction = "up";
      reasonCodes.push("trend.zero_to_positive_cap");
      reasons.push("0→正值不得判定為 strong_up，已限制為 up。");
    }
    if (evidenceAgeDays < RULES.newSignalDays) {
      direction = "up";
      reasonCodes.push("trend.new_signal_cap");
      reasons.push("Evidence 觀察未滿 7 日，不得判定為 strong_up。");
    }
  }

  if (direction === "volatile") {
    reasonCodes.push("trend.high_volatility");
    reasons.push(
      `期內訊號最大差距為 ${round(volatilitySpread)}，方向判定為 volatile。`
    );
  } else {
    reasonCodes.push(`trend.${direction}`);
    reasons.push(
      `本期值 ${round(currentValue)}、前期值 ${round(previousValue)}，變化 ${round(absoluteChange)}。`
    );
  }
  if (percentageChange === null) {
    reasonCodes.push("trend.percentage_baseline_unavailable");
    reasons.push("前期值為 0，percentageChange 保持 null。");
  }

  const sampleCoverage = Math.min(100, validSampleCount * 25);
  const sourceCoverage = Math.min(100, sourceCount * (100 / 3));
  const confidenceScore = input.confidenceResult.confidenceScore;
  const trendConfidence =
    confidenceScore === null
      ? null
      : round(Math.min(confidenceScore, sampleCoverage, sourceCoverage));

  return {
    ...base,
    trendDirection: direction,
    trendStrength: round(
      direction === "volatile" ? volatilitySpread : Math.abs(absoluteChange)
    ),
    currentValue: round(currentValue),
    previousValue: round(previousValue),
    absoluteChange: round(absoluteChange),
    percentageChange:
      percentageChange === null ? null : round(percentageChange),
    confidence: trendConfidence,
    reasonCodes,
    reasons
  };
}

export function calculateTrendWindows(
  input: Omit<TrendEngineInput, "windowWeeks">
): readonly TrendWindowOutput[] {
  return TREND_WINDOWS.map((windowWeeks: TrendWindow) =>
    calculateTrend({ ...input, windowWeeks })
  );
}
