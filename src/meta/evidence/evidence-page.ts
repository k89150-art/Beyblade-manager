import {
  EVIDENCE_SCORE_DIMENSIONS,
  type CanonicalEntityId,
  type EvidenceScoreDimension
} from "../domain/index.js";
import {
  CONFIDENCE_MODEL_ID,
  CONFIDENCE_MODEL_VERSION,
  ConfidenceService,
  ConfidenceViewModel,
  InMemoryMetaProfileRepository,
  type ConfidenceModelOutput,
  type ConfidenceViewState
} from "../confidence/index.js";
import {
  MATURITY_MODEL_ID,
  MATURITY_MODEL_VERSION,
  MaturityService,
  MaturityViewModel,
  type MaturityModelOutput,
  type MaturityViewState
} from "../maturity/index.js";
import {
  COACH_MODEL_ID,
  COACH_MODEL_VERSION,
  type MetaCoachModelOutput
} from "../coach/index.js";
import {
  FullAnalysisPipelineService,
  FullAnalysisViewModel,
  createPhase5AnalysisModelRegistry,
  type FullAnalysisViewState,
  type PipelineTraceIds
} from "../full-analysis/index.js";
import {
  RECOMMENDATION_MODEL_ID,
  RECOMMENDATION_MODEL_VERSION,
  type RecommendationModelOutput
} from "../recommendation/index.js";
import {
  RISK_MODEL_ID,
  RISK_MODEL_VERSION,
  type RiskModelOutput
} from "../risk/index.js";
import {
  TREND_MODEL_ID,
  TREND_MODEL_VERSION,
  TrendService,
  TrendViewModel,
  type TrendDirection,
  type TrendModelOutput,
  type TrendViewState,
  type TrendWindowOutput
} from "../trend/index.js";
import {
  EVIDENCE_SEED_DRAFTS,
  createEvidenceDevCatalog
} from "./seed.js";
import {
  LocalStorageEvidenceRepository,
  type EvidenceEntryParser
} from "./repository.js";
import { EvidenceService } from "./service.js";
import type {
  EvidenceCreateDraft,
  EvidenceEntry,
  EvidenceInputDimensionScores,
  EvidenceViewState
} from "./types.js";
import { validateEvidenceEntry } from "./validation.js";
import { EvidenceViewModel } from "./view-model.js";

const STORAGE_KEY = "beyblade-meta-full-analysis-mvp-v4";
const DIMENSION_LABELS: Readonly<Record<EvidenceScoreDimension, string>> = {
  source_quality: "來源品質",
  sample_size: "樣本量",
  regional_diversity: "區域多樣性",
  time_consistency: "時間一致性",
  configuration_consistency: "配置一致性",
  independent_confirmation: "獨立來源確認"
};
const CONFIDENCE_LEVEL_LABELS = {
  very_high: "非常高",
  high: "高",
  medium: "中",
  low: "低",
  insufficient: "資料不足"
} as const;
const TREND_DIRECTION_LABELS: Readonly<Record<TrendDirection, string>> = {
  strong_up: "強勢上升",
  up: "上升",
  stable: "穩定",
  down: "下降",
  strong_down: "強勢下降",
  volatile: "高波動",
  insufficient_data: "資料不足"
};
const MATURITY_STAGE_LABELS = {
  seed: "Seed／早期資料",
  emerging: "Emerging／新興",
  established: "Established／成長",
  mature: "Mature／成熟",
  legacy: "Legacy／衰退或歷史階段"
} as const;
const RISK_LEVEL_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  unknown: "資料不足"
} as const;
const RECOMMENDATION_LABELS = {
  strong_buy: "強烈推薦",
  recommended: "推薦",
  observe_and_test: "觀察並測試",
  conditional: "謹慎使用",
  wait: "等待更多資料",
  avoid: "不建議",
  insufficient_data: "資料不足，無法建議"
} as const;
const CANONICAL_ENTITY_ID_PATTERN =
  /^ent_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isCanonicalEntityId(value: string): value is CanonicalEntityId {
  return CANONICAL_ENTITY_ID_PATTERN.test(value);
}

function canonicalEntityId(value: string): CanonicalEntityId {
  if (!isCanonicalEntityId(value)) {
    throw new Error(`Invalid Entity ID '${value}'.`);
  }
  return value;
}

function requiredElement<T extends Element>(
  selector: string,
  expectedType: { new (): T }
): T {
  const element = document.querySelector(selector);
  if (!(element instanceof expectedType)) {
    throw new Error(`Required page element '${selector}' was not found.`);
  }
  return element;
}

function fieldValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function todayInTaipei(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function fieldNullableNumber(
  formData: FormData,
  name: string
): number | null {
  const value = fieldValue(formData, name);
  return value.length === 0 ? null : Number(value);
}

function scoreText(score: number | null): string {
  return score === null ? "未知" : String(score);
}

function scoreSummary(entry: EvidenceEntry): string {
  return EVIDENCE_SCORE_DIMENSIONS.map(
    (dimension) =>
      `${DIMENSION_LABELS[dimension]} ${scoreText(entry.dimensionScores[dimension])}`
  ).join(" / ");
}

function appendCell(row: HTMLTableRowElement, text: string): void {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.append(cell);
}

function renderEvidenceState(state: EvidenceViewState): void {
  const errorBox = requiredElement("#evidenceErrors", HTMLDivElement);
  const body = requiredElement("#evidenceTableBody", HTMLTableSectionElement);
  const empty = requiredElement("#evidenceEmpty", HTMLParagraphElement);
  const count = requiredElement("#evidenceCount", HTMLSpanElement);

  errorBox.replaceChildren();
  if (state.errors.length > 0) {
    const list = document.createElement("ul");
    state.errors.forEach((validationIssue) => {
      const item = document.createElement("li");
      item.textContent =
        `${validationIssue.path}: ${validationIssue.message}`;
      list.append(item);
    });
    errorBox.append(list);
    errorBox.hidden = false;
  } else {
    errorBox.hidden = true;
  }

  body.replaceChildren();
  state.entries.forEach((entry) => {
    const row = document.createElement("tr");
    appendCell(row, entry.record.id);
    appendCell(
      row,
      entry.target.targetType === "entity" ? entry.target.entityId : "-"
    );
    appendCell(row, entry.evidenceType);
    appendCell(row, `${entry.record.status} / Grade ${entry.record.grade}`);
    appendCell(row, entry.record.eventDate);
    appendCell(row, entry.sourceName);
    appendCell(row, scoreSummary(entry));
    appendCell(row, entry.validationStatus === "valid" ? "通過" : "未通過");
    body.append(row);
  });

  count.textContent = String(state.entries.length);
  empty.hidden = state.entries.length > 0;
}

function makeDraft(formData: FormData): EvidenceCreateDraft {
  const dimensionScores: EvidenceInputDimensionScores = {
    source_quality: fieldNullableNumber(formData, "source_quality"),
    sample_size: fieldNullableNumber(formData, "sample_size"),
    regional_diversity: fieldNullableNumber(formData, "regional_diversity"),
    time_consistency: fieldNullableNumber(formData, "time_consistency"),
    configuration_consistency: fieldNullableNumber(
      formData,
      "configuration_consistency"
    ),
    independent_confirmation: fieldNullableNumber(
      formData,
      "independent_confirmation"
    )
  };
  const status = fieldValue(formData, "status");
  const grade = fieldValue(formData, "grade");

  return {
    id: fieldValue(formData, "id"),
    entityId: fieldValue(formData, "entityId"),
    evidenceType: fieldValue(formData, "evidenceType"),
    status:
      status === "verified" ||
      status === "rejected" ||
      status === "superseded"
        ? status
        : "pending",
    grade:
      grade === "A" ||
      grade === "B" ||
      grade === "D" ||
      grade === "E"
        ? grade
        : "C",
    eventDate: fieldValue(formData, "eventDate"),
    sourceId: fieldValue(formData, "sourceId"),
    sourceName: fieldValue(formData, "sourceName"),
    region: fieldValue(formData, "region"),
    dimensionScores
  };
}

function appendMetric(
  container: HTMLElement,
  label: string,
  value: string
): void {
  const metric = document.createElement("div");
  metric.className = "confidence-metric";
  const name = document.createElement("span");
  name.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  metric.append(name, content);
  container.append(metric);
}

function appendList(
  container: HTMLElement,
  title: string,
  values: readonly string[],
  emptyText: string
): void {
  const section = document.createElement("section");
  section.className = "confidence-detail";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  const displayedValues = values.length === 0 ? [emptyText] : values;
  displayedValues.forEach((value) => {
    const item = document.createElement("li");
    item.textContent = value;
    list.append(item);
  });
  section.append(heading, list);
  container.append(section);
}

function excludedLines(output: ConfidenceModelOutput): readonly string[] {
  return output.excludedEvidence.map(
    (item) => `${item.evidenceId}：${item.reason}`
  );
}

function dimensionLines(output: ConfidenceModelOutput): readonly string[] {
  return output.dimensions.map(
    (item) =>
      `${item.dimensionId}：${scoreText(item.score)}。${item.explanation}`
  );
}

function renderConfidenceState(state: ConfidenceViewState): void {
  const errorBox = requiredElement("#confidenceErrors", HTMLDivElement);
  const resultBox = requiredElement("#confidenceResult", HTMLDivElement);
  errorBox.replaceChildren();
  resultBox.replaceChildren();

  if (state.errors.length > 0) {
    const list = document.createElement("ul");
    state.errors.forEach((message) => {
      const item = document.createElement("li");
      item.textContent = message;
      list.append(item);
    });
    errorBox.append(list);
    errorBox.hidden = false;
  } else {
    errorBox.hidden = true;
  }

  if (state.result === null) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "選擇 Entity 與分析日期後計算 Confidence。";
    resultBox.append(empty);
    return;
  }

  const output = state.result;
  const summary = document.createElement("div");
  summary.className = "confidence-summary";
  appendMetric(summary, "Entity ID", output.entityId);
  appendMetric(summary, "Confidence Score", scoreText(output.confidenceScore));
  appendMetric(
    summary,
    "Confidence Level",
    CONFIDENCE_LEVEL_LABELS[output.confidenceLevel]
  );
  appendMetric(summary, "Evidence Count", String(output.evidenceCount));
  appendMetric(
    summary,
    "Source Diversity",
    `${output.sourceDiversity.sourceCount} 個來源 / ${scoreText(output.sourceDiversity.score)}`
  );
  appendMetric(
    summary,
    "Recency",
    output.recency.ageDays === null
      ? "未知"
      : `${output.recency.ageDays} 天 / ${scoreText(output.recency.score)}`
  );
  appendMetric(
    summary,
    "Completeness",
    `${output.completeness.knownDimensionCount}/${output.completeness.totalDimensionCount} / ${scoreText(output.completeness.score)}`
  );
  appendMetric(
    summary,
    "Consistency",
    scoreText(output.consistency.score)
  );
  appendMetric(summary, "Calculated At", output.calculatedAt);
  resultBox.append(summary);

  appendList(
    resultBox,
    "各評估維度",
    dimensionLines(output),
    "目前沒有可評估維度。"
  );
  appendList(
    resultBox,
    "主要加分因素",
    output.positiveFactors,
    "目前沒有明確加分因素。"
  );
  appendList(
    resultBox,
    "主要扣分因素",
    output.negativeFactors,
    "目前沒有觸發扣分或 Hard Cap。"
  );
  appendList(
    resultBox,
    `排除 Evidence（${output.excludedEvidence.length}）`,
    excludedLines(output),
    "沒有 Evidence 被排除。"
  );
  appendList(
    resultBox,
    "計算理由",
    output.reasons,
    "沒有可顯示理由。"
  );
}

function signedText(value: number | null): string {
  if (value === null) return "未知";
  return value > 0 ? `+${value}` : String(value);
}

function renderAnalysisErrors(
  selector: string,
  errors: readonly string[]
): void {
  const errorBox = requiredElement(selector, HTMLDivElement);
  errorBox.replaceChildren();
  if (errors.length === 0) {
    errorBox.hidden = true;
    return;
  }
  const list = document.createElement("ul");
  errors.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  errorBox.append(list);
  errorBox.hidden = false;
}

function trendExcludedLines(
  output: TrendWindowOutput
): readonly string[] {
  return output.excludedEvidence.map(
    (item) => `${item.evidenceId}：${item.reason}`
  );
}

function renderTrendWindow(output: TrendWindowOutput): HTMLElement {
  const card = document.createElement("article");
  card.className = `trend-card trend-${output.trendDirection}`;
  const heading = document.createElement("div");
  heading.className = "trend-card-heading";
  const title = document.createElement("h3");
  title.textContent = `${output.windowWeeks} 週趨勢`;
  const badge = document.createElement("span");
  badge.className = "trend-badge";
  badge.textContent = TREND_DIRECTION_LABELS[output.trendDirection];
  heading.append(title, badge);

  const period = document.createElement("p");
  period.className = "trend-period";
  period.textContent =
    `本期 ${output.periodStart}～${output.periodEnd}｜` +
    `比較期 ${output.comparisonStart}～${output.comparisonEnd}`;

  const bar = document.createElement("div");
  bar.className = "trend-bar";
  const fill = document.createElement("span");
  fill.style.width = `${Math.min(100, output.trendStrength ?? 0)}%`;
  bar.append(fill);

  const metrics = document.createElement("div");
  metrics.className = "trend-metrics";
  appendMetric(metrics, "前期值", scoreText(output.previousValue));
  appendMetric(metrics, "本期值", scoreText(output.currentValue));
  appendMetric(metrics, "變化量", signedText(output.absoluteChange));
  appendMetric(
    metrics,
    "變化率",
    output.percentageChange === null
      ? "未知"
      : `${signedText(output.percentageChange)}%`
  );
  appendMetric(
    metrics,
    "樣本",
    `${output.validSampleCount}/${output.sampleCount}`
  );
  appendMetric(metrics, "Trend Confidence", scoreText(output.confidence));

  card.append(heading, period, bar, metrics);
  appendList(card, "判定理由", output.reasons, "目前沒有判定理由。");
  appendList(
    card,
    `排除 Evidence（${output.excludedEvidence.length}）`,
    trendExcludedLines(output),
    "沒有 Evidence 被排除。"
  );
  return card;
}

function renderTrendState(state: TrendViewState): void {
  renderAnalysisErrors("#trendErrors", state.errors);
  const resultBox = requiredElement("#trendResult", HTMLDivElement);
  resultBox.replaceChildren();
  if (state.result === null) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "選擇 Entity 與日期後計算 4／8／12 週 Trend。";
    resultBox.append(empty);
    return;
  }
  const header = document.createElement("div");
  header.className = "analysis-result-header";
  const entity = document.createElement("strong");
  entity.textContent = state.result.entityId;
  const date = document.createElement("span");
  date.textContent = `Analysis Date：${state.result.analysisDate}`;
  header.append(entity, date);
  const grid = document.createElement("div");
  grid.className = "trend-grid";
  state.result.windows.forEach((window) => {
    grid.append(renderTrendWindow(window));
  });
  resultBox.append(header, grid);
}

function maturityMetricText(
  metric: MaturityModelOutput["evidenceVolume"],
  unit: string
): string {
  return `${scoreText(metric.value)}${metric.value === null ? "" : unit} / ${scoreText(metric.score)}`;
}

function renderMaturityState(state: MaturityViewState): void {
  renderAnalysisErrors("#maturityErrors", state.errors);
  const resultBox = requiredElement("#maturityResult", HTMLDivElement);
  resultBox.replaceChildren();
  if (state.result === null) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent =
      "請先以相同 Entity 與日期計算 Confidence、Trend，再計算 Maturity。";
    resultBox.append(empty);
    return;
  }
  const output = state.result;
  const summary = document.createElement("div");
  summary.className = "confidence-summary maturity-summary";
  appendMetric(summary, "Entity ID", output.entityId);
  appendMetric(
    summary,
    "Maturity Stage",
    output.maturityStage === null
      ? "資料不足"
      : MATURITY_STAGE_LABELS[output.maturityStage]
  );
  appendMetric(summary, "Maturity Score", scoreText(output.maturityScore));
  appendMetric(
    summary,
    "Evidence Volume",
    maturityMetricText(output.evidenceVolume, " 筆")
  );
  appendMetric(
    summary,
    "Evidence Duration",
    maturityMetricText(output.evidenceDuration, " 天")
  );
  appendMetric(
    summary,
    "Source Diversity",
    maturityMetricText(output.sourceDiversity, " 個來源")
  );
  appendMetric(
    summary,
    "Trend Stability",
    maturityMetricText(output.trendStability, " 個有效視窗")
  );
  appendMetric(
    summary,
    "Confidence Level",
    CONFIDENCE_LEVEL_LABELS[output.confidenceLevel]
  );
  appendMetric(summary, "Calculated At", output.calculatedAt);
  resultBox.append(summary);
  appendList(
    resultBox,
    "Maturity 判定理由",
    output.reasons,
    "目前沒有判定理由。"
  );
}

function renderRisk(output: RiskModelOutput | null): void {
  const resultBox = requiredElement("#riskResult", HTMLDivElement);
  resultBox.replaceChildren();
  if (output === null) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent =
      "請先完成同一 Entity 與日期的 Confidence、Trend 與 Maturity。";
    resultBox.append(empty);
    return;
  }
  const summary = document.createElement("div");
  summary.className = "confidence-summary";
  appendMetric(summary, "Risk Score", scoreText(output.riskScore));
  appendMetric(summary, "Risk Level", RISK_LEVEL_LABELS[output.riskLevel]);
  appendMetric(summary, "Evidence Count", String(output.evidenceCount));
  appendMetric(
    summary,
    "Confidence",
    CONFIDENCE_LEVEL_LABELS[output.confidenceLevel]
  );
  appendMetric(
    summary,
    "Maturity",
    output.maturityStage === null
      ? "資料不足"
      : MATURITY_STAGE_LABELS[output.maturityStage]
  );
  appendMetric(summary, "Calculated At", output.calculatedAt);
  resultBox.append(summary);
  appendList(
    resultBox,
    "Risk Codes",
    output.riskCodes,
    "目前沒有觸發正式 Risk Code。"
  );
  appendList(
    resultBox,
    "Contributing Factors",
    output.contributingFactors,
    "目前沒有可量化的風險因素。"
  );
  appendList(
    resultBox,
    "Mitigating Factors",
    output.mitigatingFactors,
    "目前沒有明確的緩解因素。"
  );
  appendList(resultBox, "Reasons", output.reasons, "目前沒有判定理由。");
}

function renderRecommendation(
  output: RecommendationModelOutput | null
): void {
  const resultBox = requiredElement("#recommendationResult", HTMLDivElement);
  resultBox.replaceChildren();
  if (output === null) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "完成 Risk 後才能產生 Recommendation。";
    resultBox.append(empty);
    return;
  }
  const summary = document.createElement("div");
  summary.className = "confidence-summary";
  appendMetric(
    summary,
    "Status",
    RECOMMENDATION_LABELS[output.recommendationStatus]
  );
  appendMetric(
    summary,
    "Strength",
    scoreText(output.recommendationStrength)
  );
  appendMetric(summary, "Score", scoreText(output.recommendationScore));
  appendMetric(
    summary,
    "Stars",
    output.stars === null ? "未知" : `${output.stars} / 5`
  );
  appendMetric(summary, "Title", output.title);
  appendMetric(summary, "Calculated At", output.calculatedAt);
  resultBox.append(summary);

  const overview = document.createElement("div");
  overview.className = "coach-copy";
  const heading = document.createElement("h3");
  heading.textContent = "摘要";
  const copy = document.createElement("p");
  copy.textContent = output.summary;
  overview.append(heading, copy);
  resultBox.append(overview);
  appendList(resultBox, "Reasons", output.reasons, "目前沒有判定理由。");
  appendList(
    resultBox,
    "Cautions",
    output.cautions,
    "目前沒有額外警告。"
  );
  appendList(
    resultBox,
    "Suggested Actions",
    output.suggestedActions,
    "目前沒有下一步建議。"
  );
  appendList(
    resultBox,
    "Supporting Analysis",
    output.supportingAnalysisIds,
    "沒有可追溯的前置分析。"
  );
}

function coachCopy(
  container: HTMLElement,
  title: string,
  text: string
): void {
  const section = document.createElement("section");
  section.className = "coach-copy";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = text;
  section.append(heading, copy);
  container.append(section);
}

function renderCoach(output: MetaCoachModelOutput | null): void {
  const resultBox = requiredElement("#coachResult", HTMLDivElement);
  resultBox.replaceChildren();
  if (output === null) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "完成 Recommendation 後才能產生 Meta Coach。";
    resultBox.append(empty);
    return;
  }
  const header = document.createElement("div");
  header.className = "analysis-result-header";
  const headline = document.createElement("strong");
  headline.textContent = output.headline;
  const generated = document.createElement("span");
  generated.textContent = `Generated At：${output.generatedAt}`;
  header.append(headline, generated);

  const grid = document.createElement("div");
  grid.className = "coach-grid";
  coachCopy(grid, "整體評估", output.overallAssessment);
  coachCopy(grid, "Evidence 摘要", output.evidenceSummary);
  coachCopy(grid, "Confidence 解釋", output.confidenceExplanation);
  coachCopy(grid, "Trend 解釋", output.trendExplanation);
  coachCopy(grid, "Risk 解釋", output.riskExplanation);
  coachCopy(
    grid,
    "Recommendation 解釋",
    output.recommendationExplanation
  );
  resultBox.append(header, grid);
  appendList(
    resultBox,
    "目前優勢",
    output.whatIsWorking,
    "目前沒有足夠資料辨識優勢。"
  );
  appendList(
    resultBox,
    "需要注意",
    output.whatToWatch,
    "目前沒有新增警告。"
  );
  appendList(
    resultBox,
    "建議下一步",
    output.recommendedNextStep,
    "先補充 Evidence 再重新分析。"
  );
  appendList(
    resultBox,
    "警告與資料限制",
    output.warnings,
    "目前沒有額外限制。"
  );
}

function renderPipelineTraces(traces: PipelineTraceIds | null): void {
  const container = requiredElement("#pipelineTraces", HTMLDivElement);
  container.replaceChildren();
  if (traces === null) {
    const item = document.createElement("span");
    item.textContent = "完整分析後顯示每一階段的 Trace ID。";
    container.append(item);
    return;
  }
  Object.entries(traces).forEach(([stage, id]) => {
    const item = document.createElement("span");
    item.textContent = `${stage}：${id}`;
    container.append(item);
  });
}

function renderPipelineState(state: FullAnalysisViewState): void {
  renderAnalysisErrors("#pipelineErrors", state.errors);
  renderRisk(state.risk);
  renderRecommendation(state.recommendation);
  renderCoach(state.coach);
  renderPipelineTraces(state.result?.traceIds ?? null);
  const status = requiredElement("#pipelineStatus", HTMLSpanElement);
  status.className = "pipeline-status";
  if (state.loading) {
    status.classList.add("is-running");
    status.textContent = `執行中：${state.currentStage}`;
  } else if (state.errors.length > 0) {
    status.classList.add("is-error");
    status.textContent = `失敗階段：${state.currentStage}`;
  } else if (state.currentStage === "completed") {
    status.classList.add("is-success");
    status.textContent = "分析完成";
  } else {
    status.textContent = "尚未執行";
  }
}

async function startPage(): Promise<void> {
  const catalog = createEvidenceDevCatalog();
  const parser: EvidenceEntryParser = (value) => {
    const result = validateEvidenceEntry(value, catalog.entities);
    return result.success
      ? { success: true, data: result.data }
      : {
          success: false,
          messages: result.issues.map(
            (validationIssue) =>
              `${validationIssue.path}: ${validationIssue.message}`
          )
        };
  };
  const repository = new LocalStorageEvidenceRepository(
    window.localStorage,
    STORAGE_KEY,
    parser
  );
  const service = new EvidenceService(repository, catalog.entities);
  const viewModel = new EvidenceViewModel(service);
  const analysisModels = createPhase5AnalysisModelRegistry();
  const profileRepository = new InMemoryMetaProfileRepository();
  const confidenceService = new ConfidenceService(
    repository,
    profileRepository,
    analysisModels
  );
  const confidenceViewModel = new ConfidenceViewModel(confidenceService);
  const trendViewModel = new TrendViewModel(
    new TrendService(repository, profileRepository, analysisModels)
  );
  const maturityViewModel = new MaturityViewModel(
    new MaturityService(repository, profileRepository, analysisModels)
  );
  const fullAnalysisViewModel = new FullAnalysisViewModel(
    new FullAnalysisPipelineService(
      repository,
      profileRepository,
      analysisModels,
      catalog.entities
    )
  );
  let latestConfidence: ConfidenceModelOutput | null = null;
  let latestTrend: TrendModelOutput | null = null;
  let latestMaturity: MaturityModelOutput | null = null;
  let latestRisk: RiskModelOutput | null = null;
  let latestRecommendation: RecommendationModelOutput | null = null;

  const entitySelect = requiredElement(
    "#evidenceEntityId",
    HTMLSelectElement
  );
  const filterSelect = requiredElement(
    "#evidenceEntityFilter",
    HTMLSelectElement
  );
  const confidenceEntity = requiredElement(
    "#confidenceEntityId",
    HTMLSelectElement
  );
  const trendEntity = requiredElement("#trendEntityId", HTMLSelectElement);
  const pipelineEntity = requiredElement(
    "#pipelineEntityId",
    HTMLSelectElement
  );
  catalog.items.forEach((entity) => {
    const label =
      `${entity.displayNameZh} (${entity.referenceNameEn ?? entity.canonicalName})`;
    entitySelect.add(new Option(label, entity.id));
    filterSelect.add(new Option(label, entity.id));
    confidenceEntity.add(new Option(label, entity.id));
    trendEntity.add(new Option(label, entity.id));
    pipelineEntity.add(new Option(label, entity.id));
  });

  const existingEntries = await service.list();
  if (existingEntries.length === 0) {
    for (const draft of EVIDENCE_SEED_DRAFTS) {
      await service.create(draft);
    }
  }

  const today = todayInTaipei();
  const eventDate = requiredElement("#evidenceEventDate", HTMLInputElement);
  eventDate.value = today;
  const analysisDate = requiredElement(
    "#confidenceAnalysisDate",
    HTMLInputElement
  );
  analysisDate.value = today;
  const trendAnalysisDate = requiredElement(
    "#trendAnalysisDate",
    HTMLInputElement
  );
  trendAnalysisDate.value = today;
  const pipelineAnalysisDate = requiredElement(
    "#pipelineAnalysisDate",
    HTMLInputElement
  );
  pipelineAnalysisDate.value = today;

  const idInput = requiredElement("#evidenceId", HTMLInputElement);
  idInput.value = `evidence-${crypto.randomUUID()}`;

  const form = requiredElement("#evidenceForm", HTMLFormElement);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const submit = async (): Promise<void> => {
      const state = await viewModel.submit(makeDraft(new FormData(form)));
      renderEvidenceState(state);
      if (state.errors.length === 0) {
        idInput.value = `evidence-${crypto.randomUUID()}`;
        const staleNotice = requiredElement(
          "#confidenceStaleNotice",
          HTMLParagraphElement
        );
        staleNotice.hidden = false;
        requiredElement(
          "#trendStaleNotice",
          HTMLParagraphElement
        ).hidden = false;
        latestConfidence = null;
        latestTrend = null;
        latestMaturity = null;
        latestRisk = null;
        latestRecommendation = null;
        renderTrendState({ result: null, errors: [], loading: false });
        renderMaturityState({ result: null, errors: [], loading: false });
        renderPipelineState({
          result: null,
          risk: null,
          recommendation: null,
          coach: null,
          currentStage: "idle",
          errors: [
            "Evidence 已變更，請使用相同 Entity 與分析日期重新執行分析。"
          ],
          loading: false
        });
      }
    };
    void submit();
  });

  filterSelect.addEventListener("change", () => {
    const update = async (): Promise<void> => {
      renderEvidenceState(await viewModel.setFilter(filterSelect.value));
    };
    void update();
  });

  const confidenceForm = requiredElement(
    "#confidenceForm",
    HTMLFormElement
  );
  const calculate = async (): Promise<void> => {
    const state = await confidenceViewModel.calculate({
      entityId: canonicalEntityId(confidenceEntity.value),
      analysisDate: analysisDate.value,
      modelId: CONFIDENCE_MODEL_ID,
      modelVersion: CONFIDENCE_MODEL_VERSION
    });
    renderConfidenceState(state);
    latestConfidence = state.result;
    latestTrend = null;
    latestMaturity = null;
    latestRisk = null;
    latestRecommendation = null;
    renderTrendState({ result: null, errors: [], loading: false });
    renderMaturityState({ result: null, errors: [], loading: false });
    renderPipelineState({
      result: null,
      risk: null,
      recommendation: null,
      coach: null,
      currentStage: "idle",
      errors: [],
      loading: false
    });
    requiredElement(
      "#confidenceStaleNotice",
      HTMLParagraphElement
    ).hidden = true;
    requiredElement(
      "#trendStaleNotice",
      HTMLParagraphElement
    ).hidden = false;
  };
  confidenceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void calculate();
  });

  const trendForm = requiredElement("#trendForm", HTMLFormElement);
  const calculateTrendForPage = async (): Promise<void> => {
    const entityId = canonicalEntityId(trendEntity.value);
    const date = trendAnalysisDate.value;
    const confidenceState = await confidenceViewModel.calculate({
      entityId,
      analysisDate: date,
      modelId: CONFIDENCE_MODEL_ID,
      modelVersion: CONFIDENCE_MODEL_VERSION
    });
    renderConfidenceState(confidenceState);
    latestConfidence = confidenceState.result;
    confidenceEntity.value = entityId;
    analysisDate.value = date;
    if (latestConfidence === null) {
      latestTrend = null;
      renderTrendState({
        result: null,
        errors: ["Confidence 計算失敗，無法開始 Trend。"],
        loading: false
      });
      return;
    }
    const trendState = await trendViewModel.calculate({
      entityId,
      analysisDate: date,
      modelId: TREND_MODEL_ID,
      modelVersion: TREND_MODEL_VERSION,
      confidenceResult: latestConfidence
    });
    renderTrendState(trendState);
    latestTrend = trendState.result;
    latestMaturity = null;
    latestRisk = null;
    latestRecommendation = null;
    renderMaturityState(maturityViewModel.state);
    requiredElement(
      "#confidenceStaleNotice",
      HTMLParagraphElement
    ).hidden = true;
    requiredElement(
      "#trendStaleNotice",
      HTMLParagraphElement
    ).hidden = true;
  };
  trendForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void calculateTrendForPage();
  });

  const maturityButton = requiredElement(
    "#calculateMaturityBtn",
    HTMLButtonElement
  );
  maturityButton.addEventListener("click", () => {
    const run = async (): Promise<void> => {
      const entityId = canonicalEntityId(trendEntity.value);
      const state = await maturityViewModel.calculate({
        entityId,
        analysisDate: trendAnalysisDate.value,
        modelId: MATURITY_MODEL_ID,
        modelVersion: MATURITY_MODEL_VERSION,
        confidenceResult:
          latestConfidence?.entityId === entityId &&
          latestConfidence.calculatedAt.slice(0, 10) ===
            trendAnalysisDate.value
            ? latestConfidence
            : null,
        trendResults:
          latestTrend?.entityId === entityId &&
          latestTrend.analysisDate === trendAnalysisDate.value
            ? latestTrend
            : null
      });
      renderMaturityState(state);
      latestMaturity = state.result;
      latestRisk = null;
      latestRecommendation = null;
      renderPipelineState({
        result: null,
        risk: null,
        recommendation: null,
        coach: null,
        currentStage: "idle",
        errors: [],
        loading: false
      });
    };
    void run();
  });

  const matchesDate = (
    entityId: CanonicalEntityId,
    date: string,
    outputEntityId: CanonicalEntityId,
    outputDate: string
  ): boolean => outputEntityId === entityId && outputDate === date;

  const riskButton = requiredElement(
    "#calculateRiskBtn",
    HTMLButtonElement
  );
  riskButton.addEventListener("click", () => {
    const run = async (): Promise<void> => {
      const entityId = canonicalEntityId(pipelineEntity.value);
      const date = pipelineAnalysisDate.value;
      const state = await fullAnalysisViewModel.calculateRisk({
        entityId,
        analysisDate: date,
        modelId: RISK_MODEL_ID,
        modelVersion: RISK_MODEL_VERSION,
        confidenceModelVersion: CONFIDENCE_MODEL_VERSION,
        trendModelVersion: TREND_MODEL_VERSION,
        maturityModelVersion: MATURITY_MODEL_VERSION,
        confidenceResult:
          latestConfidence !== null &&
          matchesDate(
            entityId,
            date,
            latestConfidence.entityId,
            latestConfidence.calculatedAt.slice(0, 10)
          )
            ? latestConfidence
            : null,
        trendResults:
          latestTrend !== null &&
          matchesDate(
            entityId,
            date,
            latestTrend.entityId,
            latestTrend.analysisDate
          )
            ? latestTrend
            : null,
        maturityResult:
          latestMaturity !== null &&
          matchesDate(
            entityId,
            date,
            latestMaturity.entityId,
            latestMaturity.calculatedAt.slice(0, 10)
          )
            ? latestMaturity
            : null
      });
      latestRisk = state.risk;
      latestRecommendation = null;
      renderPipelineState(state);
    };
    void run();
  });

  const recommendationButton = requiredElement(
    "#calculateRecommendationBtn",
    HTMLButtonElement
  );
  recommendationButton.addEventListener("click", () => {
    const run = async (): Promise<void> => {
      const entityId = canonicalEntityId(pipelineEntity.value);
      const date = pipelineAnalysisDate.value;
      const state = await fullAnalysisViewModel.calculateRecommendation({
        entityId,
        analysisDate: date,
        modelId: RECOMMENDATION_MODEL_ID,
        modelVersion: RECOMMENDATION_MODEL_VERSION,
        confidenceModelVersion: CONFIDENCE_MODEL_VERSION,
        trendModelVersion: TREND_MODEL_VERSION,
        maturityModelVersion: MATURITY_MODEL_VERSION,
        riskModelVersion: RISK_MODEL_VERSION,
        confidence:
          latestConfidence !== null &&
          matchesDate(
            entityId,
            date,
            latestConfidence.entityId,
            latestConfidence.calculatedAt.slice(0, 10)
          )
            ? latestConfidence
            : null,
        trend:
          latestTrend !== null &&
          matchesDate(
            entityId,
            date,
            latestTrend.entityId,
            latestTrend.analysisDate
          )
            ? latestTrend
            : null,
        maturity:
          latestMaturity !== null &&
          matchesDate(
            entityId,
            date,
            latestMaturity.entityId,
            latestMaturity.calculatedAt.slice(0, 10)
          )
            ? latestMaturity
            : null,
        risk:
          latestRisk !== null &&
          matchesDate(
            entityId,
            date,
            latestRisk.entityId,
            latestRisk.calculatedAt.slice(0, 10)
          )
            ? latestRisk
            : null,
        supportingAnalysisIds: [
          `confidence-${entityId}-${date}`,
          `trend-${entityId}-${date}`,
          `maturity-${entityId}-${date}`,
          `risk-${entityId}-${date}`
        ]
      });
      latestRecommendation = state.recommendation;
      renderPipelineState(state);
    };
    void run();
  });

  const coachButton = requiredElement(
    "#calculateCoachBtn",
    HTMLButtonElement
  );
  coachButton.addEventListener("click", () => {
    const run = async (): Promise<void> => {
      const entityId = canonicalEntityId(pipelineEntity.value);
      const date = pipelineAnalysisDate.value;
      const state = await fullAnalysisViewModel.calculateCoach({
        entityId,
        analysisDate: date,
        modelId: COACH_MODEL_ID,
        modelVersion: COACH_MODEL_VERSION,
        confidence:
          latestConfidence !== null &&
          matchesDate(
            entityId,
            date,
            latestConfidence.entityId,
            latestConfidence.calculatedAt.slice(0, 10)
          )
            ? latestConfidence
            : null,
        trend:
          latestTrend !== null &&
          matchesDate(
            entityId,
            date,
            latestTrend.entityId,
            latestTrend.analysisDate
          )
            ? latestTrend
            : null,
        maturity:
          latestMaturity !== null &&
          matchesDate(
            entityId,
            date,
            latestMaturity.entityId,
            latestMaturity.calculatedAt.slice(0, 10)
          )
            ? latestMaturity
            : null,
        risk:
          latestRisk !== null &&
          matchesDate(
            entityId,
            date,
            latestRisk.entityId,
            latestRisk.calculatedAt.slice(0, 10)
          )
            ? latestRisk
            : null,
        recommendation:
          latestRecommendation !== null &&
          matchesDate(
            entityId,
            date,
            latestRecommendation.entityId,
            latestRecommendation.calculatedAt.slice(0, 10)
          )
            ? latestRecommendation
            : null,
        traceReferences: [
          `evidence-${entityId}-${date}`,
          `confidence-${entityId}-${date}`,
          `trend-${entityId}-${date}`,
          `maturity-${entityId}-${date}`,
          `risk-${entityId}-${date}`,
          `recommendation-${entityId}-${date}`
        ],
        dataMode: "development"
      });
      renderPipelineState(state);
    };
    void run();
  });

  const fullAnalysisButton = requiredElement(
    "#runFullAnalysisBtn",
    HTMLButtonElement
  );
  fullAnalysisButton.addEventListener("click", () => {
    const run = async (): Promise<void> => {
      const entityId = canonicalEntityId(pipelineEntity.value);
      const date = pipelineAnalysisDate.value;
      const pending = fullAnalysisViewModel.run({
        entityId,
        analysisDate: date,
        versions: {
          confidence: CONFIDENCE_MODEL_VERSION,
          trend: TREND_MODEL_VERSION,
          maturity: MATURITY_MODEL_VERSION,
          risk: RISK_MODEL_VERSION,
          recommendation: RECOMMENDATION_MODEL_VERSION,
          coach: COACH_MODEL_VERSION
        },
        dataMode: "development",
        locale: "zh-TW"
      });
      renderPipelineState(fullAnalysisViewModel.state);
      const state = await pending;
      renderPipelineState(state);
      if (state.result === null) return;
      latestConfidence = state.result.confidence;
      latestTrend = state.result.trend;
      latestMaturity = state.result.maturity;
      latestRisk = state.result.risk;
      latestRecommendation = state.result.recommendation;
      confidenceEntity.value = entityId;
      trendEntity.value = entityId;
      analysisDate.value = date;
      trendAnalysisDate.value = date;
      renderConfidenceState({
        result: latestConfidence,
        errors: [],
        loading: false
      });
      renderTrendState({
        result: latestTrend,
        errors: [],
        loading: false
      });
      renderMaturityState({
        result: latestMaturity,
        errors: [],
        loading: false
      });
      requiredElement(
        "#confidenceStaleNotice",
        HTMLParagraphElement
      ).hidden = true;
      requiredElement(
        "#trendStaleNotice",
        HTMLParagraphElement
      ).hidden = true;
    };
    void run();
  });

  renderEvidenceState(await viewModel.initialize());
  await calculate();
  renderTrendState(trendViewModel.state);
  renderMaturityState(maturityViewModel.state);
  renderPipelineState(fullAnalysisViewModel.state);
}

void startPage().catch((error: unknown) => {
  const box = document.querySelector("#evidenceErrors");
  if (box instanceof HTMLDivElement) {
    box.hidden = false;
    box.textContent =
      error instanceof Error ? error.message : "Evidence MVP failed to start.";
  }
});
