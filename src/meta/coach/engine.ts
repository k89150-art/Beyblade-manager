import type { TrendDirection } from "../trend/index.js";
import type {
  MetaCoachEngineInput,
  MetaCoachModelOutput
} from "./types.js";

export class MetaCoachEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaCoachEngineError";
  }
}

const TREND_LABELS: Readonly<Record<TrendDirection, string>> = {
  strong_up: "強勢上升",
  up: "上升",
  stable: "穩定",
  down: "下降",
  strong_down: "強勢下降",
  volatile: "高波動",
  insufficient_data: "資料不足"
};

function nameFor(input: MetaCoachEngineInput): string {
  return input.entity.displayNameZh.trim().length > 0
    ? input.entity.displayNameZh
    : input.entity.referenceNameEn ?? input.entity.entityId;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

export function generateMetaCoach(
  input: MetaCoachEngineInput
): MetaCoachModelOutput {
  const prerequisiteIds = [
    input.confidenceResult.entityId,
    input.trendResults.entityId,
    input.maturityResult.entityId,
    input.riskResult.entityId,
    input.recommendationResult.entityId
  ];
  if (prerequisiteIds.some((id) => id !== input.entity.entityId)) {
    throw new MetaCoachEngineError(
      "All prerequisite results must target the requested Entity."
    );
  }
  if (
    input.confidenceResult.calculatedAt.slice(0, 10) !== input.analysisDate ||
    input.trendResults.analysisDate !== input.analysisDate ||
    input.maturityResult.calculatedAt.slice(0, 10) !== input.analysisDate ||
    input.riskResult.calculatedAt.slice(0, 10) !== input.analysisDate ||
    input.recommendationResult.calculatedAt.slice(0, 10) !==
      input.analysisDate
  ) {
    throw new MetaCoachEngineError(
      "All prerequisite results must use the requested analysisDate."
    );
  }
  if (input.locale !== "zh-TW") {
    throw new MetaCoachEngineError("Meta Coach MVP supports zh-TW only.");
  }

  const entityName = nameFor(input);
  const directions = input.trendResults.windows.map(
    (window) =>
      `${window.windowWeeks} 週${TREND_LABELS[window.trendDirection]}`
  );
  const confidenceText =
    input.confidenceResult.confidenceScore === null
      ? "Confidence 目前未知，不能形成確定結論。"
      : `Confidence 為 ${input.confidenceResult.confidenceScore}（${input.confidenceResult.confidenceLevel}），使用 ${input.confidenceResult.evidenceCount} 筆有效 Evidence。`;
  const riskText =
    input.riskResult.riskScore === null
      ? "Risk 目前未知，因前置資料不足。"
      : `Risk 為 ${input.riskResult.riskLevel}（${input.riskResult.riskScore}），觸發 ${input.riskResult.riskCodes.length} 個 Risk Code。`;
  const evidenceText =
    input.evidenceSummary.verifiedCount === 0
      ? "目前沒有 verified Evidence。"
      : `目前有 ${input.evidenceSummary.verifiedCount} 筆 verified Evidence，來自 ${input.evidenceSummary.sourceCount} 個獨立來源群組，最新日期為 ${input.evidenceSummary.newestEvidenceDate ?? "未知"}。`;
  const warnings = [...input.recommendationResult.cautions];
  if (input.dataMode === "development") {
    warnings.unshift(
      "這是開發測試資料，不代表正式賽事結果或實戰保證。"
    );
  }
  if (
    input.recommendationResult.recommendationStatus === "insufficient_data"
  ) {
    warnings.push("資料不足，Meta Coach 不會補猜缺少的資訊。");
  }
  if (
    input.trendResults.windows.some(
      (window) => window.trendDirection === "volatile"
    )
  ) {
    warnings.push("Trend 高波動只表示觀察值不穩定，不代表特定原因。");
  }

  return {
    entityId: input.entity.entityId,
    locale: input.locale,
    headline: `${entityName}：${input.recommendationResult.title}`,
    verdict: input.recommendationResult.recommendationStatus,
    overallAssessment:
      `${input.recommendationResult.summary} ` +
      `Maturity 為 ${input.maturityResult.maturityStage ?? "資料不足"}。`,
    whatIsWorking: unique([
      ...input.riskResult.mitigatingFactors,
      ...input.confidenceResult.positiveFactors
    ]),
    whatToWatch: unique([
      ...input.riskResult.contributingFactors,
      ...input.recommendationResult.cautions
    ]),
    recommendedNextStep: [...input.recommendationResult.suggestedActions],
    evidenceSummary: evidenceText,
    confidenceExplanation: confidenceText,
    trendExplanation: `目前 Trend：${directions.join("、")}。這些是時間相關訊號，不代表因果。`,
    riskExplanation: riskText,
    recommendationExplanation:
      `${input.recommendationResult.title}；依據為 ` +
      `${input.recommendationResult.reasons.join("；")}`,
    warnings: unique(warnings),
    traceReferences: [...input.traceReferences],
    generatedAt: `${input.analysisDate}T00:00:00.000Z`
  };
}
