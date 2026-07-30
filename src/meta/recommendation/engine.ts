import type { CoachVerdict } from "../domain/index.js";
import type { TrendDirection } from "../trend/index.js";
import type {
  RecommendationEngineInput,
  RecommendationModelOutput
} from "./types.js";

export const RECOMMENDATION_POLICY_VERSION =
  "recommendation-policy-mvp-1.0.0";

export const RECOMMENDATION_POLICY = {
  minimumEvidence: 2,
  strongMinimumEvidence: 4,
  thresholds: {
    strongBuy: 85,
    recommended: 70,
    observe: 55,
    conditional: 35
  },
  caps: {
    lowConfidence: 45,
    mediumRisk: 70,
    highRisk: 40,
    volatile: 55,
    rapidDecline: 30
  }
} as const;

export class RecommendationEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecommendationEngineError";
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function trendValue(direction: TrendDirection): number | null {
  switch (direction) {
    case "strong_up":
      return 90;
    case "up":
      return 82;
    case "stable":
      return 76;
    case "down":
      return 45;
    case "strong_down":
      return 20;
    case "volatile":
      return 40;
    case "insufficient_data":
      return null;
  }
}

function statusTitle(status: CoachVerdict): string {
  switch (status) {
    case "strong_buy":
      return "強烈推薦投入測試";
    case "recommended":
      return "推薦投入測試";
    case "observe_and_test":
      return "建議觀察並測試";
    case "conditional":
      return "可條件式、謹慎使用";
    case "wait":
      return "建議等待更多資料";
    case "avoid":
      return "目前不建議投入";
    case "insufficient_data":
      return "資料不足，無法建議";
  }
}

function targetEntityId(input: RecommendationEngineInput): void {
  const ids = [
    input.confidenceResult.entityId,
    input.trendResults.entityId,
    input.maturityResult.entityId,
    input.riskResult.entityId
  ];
  if (ids.some((id) => id !== input.entityId)) {
    throw new RecommendationEngineError(
      "All prerequisite results must target the requested Entity."
    );
  }
}

export function calculateRecommendation(
  input: RecommendationEngineInput
): RecommendationModelOutput {
  targetEntityId(input);
  const calculatedAt = `${input.analysisDate}T00:00:00.000Z`;
  const verified = input.evidenceRecords.filter(
    (entry) =>
      entry.target.targetType === "entity" &&
      entry.target.entityId === input.entityId &&
      entry.record.status === "verified" &&
      entry.record.eventDate <= input.analysisDate
  );
  const onlyEGrade =
    verified.length > 0 &&
    verified.every((entry) => entry.record.grade === "E");
  const prerequisitesMatchDate =
    input.confidenceResult.calculatedAt.slice(0, 10) === input.analysisDate &&
    input.trendResults.analysisDate === input.analysisDate &&
    input.maturityResult.calculatedAt.slice(0, 10) === input.analysisDate &&
    input.riskResult.calculatedAt.slice(0, 10) === input.analysisDate;
  if (!prerequisitesMatchDate) {
    throw new RecommendationEngineError(
      "All prerequisite results must use the requested analysisDate."
    );
  }

  if (
    verified.length < RECOMMENDATION_POLICY.minimumEvidence ||
    input.confidenceResult.confidenceScore === null ||
    input.confidenceResult.confidenceLevel === "insufficient" ||
    onlyEGrade
  ) {
    const reasons = [];
    if (verified.length < RECOMMENDATION_POLICY.minimumEvidence) {
      reasons.push(
        `只有 ${verified.length} 筆有效 Evidence，少於正式規則要求的 2 筆。`
      );
    }
    if (
      input.confidenceResult.confidenceScore === null ||
      input.confidenceResult.confidenceLevel === "insufficient"
    ) {
      reasons.push("Confidence 為未知或資料不足。");
    }
    if (onlyEGrade) {
      reasons.push("目前有效 Evidence 全部為 E Grade。");
    }
    return {
      entityId: input.entityId,
      recommendationStatus: "insufficient_data",
      recommendationStrength: null,
      recommendationScore: null,
      stars: null,
      recommendationCodes: ["recommendation.insufficient_data"],
      title: statusTitle("insufficient_data"),
      summary: "目前資料不足以回答是否值得投入。",
      reasons,
      cautions: ["Prefer Unknown over Guessing。"],
      suggestedActions: ["等待至少兩筆可驗證且非全 E Grade 的 Evidence。"],
      supportingAnalysisIds: [...input.supportingAnalysisIds],
      calculatedAt
    };
  }

  const trendScores = input.trendResults.windows
    .map((window) => trendValue(window.trendDirection))
    .filter((value): value is number => value !== null);
  const scoreFactors = [
    input.confidenceResult.confidenceScore,
    input.maturityResult.maturityScore,
    input.riskResult.riskScore === null
      ? null
      : 100 - input.riskResult.riskScore,
    mean(trendScores)
  ].filter((value): value is number => value !== null);
  let score = mean(scoreFactors) ?? 0;
  const codes: string[] = [];
  const reasons: string[] = [];
  const cautions = [...input.riskResult.contributingFactors];
  const actions: string[] = [];
  const directions = input.trendResults.windows.map(
    (window) => window.trendDirection
  );
  const volatile = directions.includes("volatile");
  const rapidDecline = directions.includes("strong_down");
  const declining = rapidDecline || directions.includes("down");

  if (input.riskResult.riskLevel === "high") {
    score = Math.min(score, RECOMMENDATION_POLICY.caps.highRisk);
    codes.push("recommendation.high_risk_cap");
    reasons.push("Risk Level 為 high，建議強度受到限制。");
  } else if (input.riskResult.riskLevel === "medium") {
    score = Math.min(score, RECOMMENDATION_POLICY.caps.mediumRisk);
    codes.push("recommendation.medium_risk_cap");
    reasons.push("Risk Level 為 medium，未採用強推薦。");
  }
  if (input.confidenceResult.confidenceLevel === "low") {
    score = Math.min(score, RECOMMENDATION_POLICY.caps.lowConfidence);
    codes.push("recommendation.low_confidence_cap");
    reasons.push("Confidence 偏低，不得產生強推薦。");
  }
  if (volatile) {
    score = Math.min(score, RECOMMENDATION_POLICY.caps.volatile);
    codes.push("recommendation.volatile_trend_cap");
    reasons.push("Trend 高波動，需要先觀察與實測。");
    actions.push("先進行小規模實測，確認波動是否持續。");
  }
  if (rapidDecline) {
    score = Math.min(score, RECOMMENDATION_POLICY.caps.rapidDecline);
    codes.push("recommendation.rapid_decline_cap");
    reasons.push("快速下降 Trend 不可被成熟度高分掩蓋。");
    actions.push("等待下一個時間視窗確認下降是否持續。");
  }

  score = round(Math.max(0, Math.min(100, score)));
  let status: CoachVerdict;
  const strongEligible =
    score >= RECOMMENDATION_POLICY.thresholds.strongBuy &&
    verified.length >= RECOMMENDATION_POLICY.strongMinimumEvidence &&
    (input.confidenceResult.confidenceLevel === "high" ||
      input.confidenceResult.confidenceLevel === "very_high") &&
    input.riskResult.riskLevel === "low" &&
    !volatile &&
    !declining &&
    (input.maturityResult.maturityStage === "established" ||
      input.maturityResult.maturityStage === "mature");

  if (strongEligible) {
    status = "strong_buy";
  } else if (
    score >= RECOMMENDATION_POLICY.thresholds.recommended &&
    input.riskResult.riskLevel !== "high" &&
    !rapidDecline
  ) {
    status = "recommended";
  } else if (
    input.riskResult.riskLevel === "high" &&
    rapidDecline &&
    verified.length >= RECOMMENDATION_POLICY.strongMinimumEvidence
  ) {
    status = "avoid";
  } else if (
    volatile ||
    input.maturityResult.maturityStage === "emerging" ||
    score >= RECOMMENDATION_POLICY.thresholds.observe
  ) {
    status = "observe_and_test";
  } else if (score >= RECOMMENDATION_POLICY.thresholds.conditional) {
    status = "conditional";
  } else {
    status = "wait";
  }

  codes.unshift(`recommendation.${status}`);
  reasons.unshift(
    `Confidence ${input.confidenceResult.confidenceLevel}、Risk ${input.riskResult.riskLevel}、Maturity ${input.maturityResult.maturityStage ?? "unknown"}。`
  );
  if (actions.length === 0) {
    actions.push(
      status === "strong_buy" || status === "recommended"
        ? "保留核心方向並用下一批 Evidence 驗證。"
        : "先保留觀察，依下一個 4 週 Trend 再調整投入。"
    );
  }
  const summary =
    status === "strong_buy" || status === "recommended"
      ? "目前分析鏈支持投入測試，但仍不保證實戰結果。"
      : status === "avoid"
        ? "目前負面證據與風險足以支持暫不投入。"
        : "目前適合條件式測試或持續觀察，不宜當成確定結論。";

  return {
    entityId: input.entityId,
    recommendationStatus: status,
    recommendationStrength: score,
    recommendationScore: score,
    stars: Math.max(1, Math.min(5, Math.round(score / 20))),
    recommendationCodes: codes,
    title: statusTitle(status),
    summary,
    reasons,
    cautions,
    suggestedActions: actions,
    supportingAnalysisIds: [...input.supportingAnalysisIds],
    calculatedAt
  };
}
