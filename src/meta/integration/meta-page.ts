import {
  EVIDENCE_SCORE_DIMENSIONS,
  type EvidenceScoreDimension,
  type IsoDate
} from "../domain/index.js";
import type {
  ConfidenceModelOutput
} from "../confidence/index.js";
import type {
  EvidenceCreateDraft,
  EvidenceEntry,
  EvidenceInputDimensionScores
} from "../evidence/index.js";
import type {
  FullAnalysisResult
} from "../full-analysis/index.js";
import type {
  TrendWindowOutput
} from "../trend/index.js";
import {
  globalMetaFirebaseConfig,
  globalMetaFirebaseRuntimeFactory
} from "../firebase/index.js";
import {
  createMetaEnvironment,
  parseMetaLocation,
  resolveMetaDataMode,
  type MetaEnvironment
} from "./environment.js";
import type {
  FormalEntityCatalog,
  FormalEntitySummary,
  MetaDashboardState,
  MetaEnvironmentStatus
} from "./types.js";
import { MetaDashboardViewModel } from "./view-model.js";

const DIMENSION_LABELS: Readonly<Record<EvidenceScoreDimension, string>> = {
  source_quality: "來源品質",
  sample_size: "樣本量",
  regional_diversity: "區域多樣性",
  time_consistency: "時間一致性",
  configuration_consistency: "配置一致性",
  independent_confirmation: "獨立確認"
};

function element<T extends Element>(
  selector: string,
  expected: { new (): T }
): T {
  const value = document.querySelector(selector);
  if (!(value instanceof expected)) {
    throw new Error(`Required element '${selector}' is unavailable.`);
  }
  return value;
}

function todayInTaipei(): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  content: string,
  className = ""
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = content;
  node.className = className;
  return node;
}

function score(value: number | null): string {
  return value === null ? "資料不足" : String(value);
}

function dateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat("zh-TW", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Taipei"
      }).format(timestamp);
}

function listBlock(
  title: string,
  values: readonly string[],
  emptyText: string
): HTMLElement {
  const block = text("div", "", "meta-reason-block");
  block.append(text("h3", title));
  const list = document.createElement("ul");
  (values.length > 0 ? values : [emptyText]).forEach((value) => {
    list.append(text("li", value));
  });
  block.append(list);
  return block;
}

function miniMetric(label: string, value: string): HTMLElement {
  const metric = text("div", "", "meta-mini-metric");
  metric.append(text("span", label), text("strong", value));
  return metric;
}

function analysisCard(
  title: string,
  eyebrow: string,
  value: string,
  subvalue: string
): HTMLElement {
  const card = text("section", "", "meta-analysis-card");
  const header = text("div", "", "meta-card-header");
  const titleBox = document.createElement("div");
  titleBox.append(text("span", eyebrow, "eyebrow"), text("h2", title));
  const valueBox = text("div", value, "meta-card-value");
  valueBox.append(text("span", subvalue, "meta-card-subvalue"));
  header.append(titleBox, valueBox);
  card.append(header);
  return card;
}

function metricCard(label: string, value: string): HTMLElement {
  const metric = text("div", "", "meta-metric");
  metric.append(text("span", label), text("strong", value));
  return metric;
}

function renderMode(status: MetaEnvironmentStatus): void {
  const badge = element("#metaModeBadge", HTMLSpanElement);
  badge.textContent = status.label;
  badge.dataset.mode = status.mode;
  const notice = element("#metaModeNotice", HTMLDivElement);
  notice.replaceChildren(text("span", status.description));
  if (status.warnings.length > 0) {
    const list = document.createElement("ul");
    status.warnings.forEach((warning) => list.append(text("li", warning)));
    notice.append(list);
  }
}

function renderAccess(environment: MetaEnvironment): void {
  const access = environment.access;
  const status = element("#metaAuthStatus", HTMLSpanElement);
  status.textContent = access.principal === null
    ? "尚未登入"
    : access.canSaveAnalysis
      ? `已授權：${access.principal.email ?? access.principal.uid}`
      : `唯讀：${access.principal.email ?? access.principal.uid}`;
  element("#metaSignInBtn", HTMLButtonElement).hidden =
    environment.auth === null || access.authenticated;
  element("#metaSignOutBtn", HTMLButtonElement).hidden =
    environment.auth === null || !access.authenticated;
  element("#toggleEvidenceFormBtn", HTMLButtonElement).hidden =
    !access.canWriteEvidence;
  element("#metaReadOnlyNotice", HTMLParagraphElement).hidden =
    access.canWriteEvidence;
}

function optionLabel(summary: FormalEntitySummary): string {
  const english =
    summary.entity.referenceNameEn === undefined
      ? ""
      : `（${summary.entity.referenceNameEn}）`;
  return `${summary.entity.displayNameZh}${english} · ${summary.model} · ${summary.entityTypeLabel}`;
}

function fillEntityOptions(
  catalog: FormalEntityCatalog,
  summaries: readonly FormalEntitySummary[] = catalog.summaries
): void {
  const select = element("#metaEntitySelect", HTMLSelectElement);
  const selected = select.value;
  select.replaceChildren(new Option("請選擇分析項目", ""));
  summaries.forEach((summary) => {
    select.append(new Option(optionLabel(summary), summary.entity.id));
  });
  if (summaries.some((summary) => summary.entity.id === selected)) {
    select.value = selected;
  }
}

function renderErrors(state: MetaDashboardState): void {
  const box = element("#metaErrors", HTMLDivElement);
  box.replaceChildren();
  if (state.errors.length === 0) {
    box.hidden = true;
    return;
  }
  box.append(
    text(
      "strong",
      state.failedStage === null
        ? "無法完成目前操作"
        : `分析在 ${state.failedStage} 階段停止`
    )
  );
  const list = document.createElement("ul");
  state.errors.forEach((message) => list.append(text("li", message)));
  box.append(list);
  box.hidden = false;
}

function renderAuthenticationError(error: unknown): void {
  const box = element("#metaErrors", HTMLDivElement);
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";
  const messages: Readonly<Record<string, string>> = {
    "auth/unauthorized-domain":
      "目前網址尚未加入 Firebase 授權網域，請聯絡管理員確認 Authorized Domains。",
    "auth/popup-blocked":
      "瀏覽器阻擋了登入視窗，請允許彈出式視窗後再試。",
    "auth/popup-closed-by-user":
      "登入視窗已關閉，尚未完成登入。",
    "auth/cancelled-popup-request":
      "已有另一個登入視窗正在處理，請完成後再試。",
    "auth/network-request-failed":
      "網路連線異常，請確認連線後再試。"
  };
  const message =
    messages[code] ?? "帳號服務目前無法使用，請稍後再試。";
  box.replaceChildren(
    text("strong", "帳號操作失敗"),
    text("p", message)
  );
  box.hidden = false;
}

function renderEntity(summary: FormalEntitySummary | null): void {
  const container = element("#metaEntitySummary", HTMLElement);
  container.replaceChildren();
  if (summary === null) {
    const empty = text("div", "", "meta-empty-state");
    empty.append(
      text("strong", "尚未選擇 Entity"),
      text("span", "可搜尋上蓋、固鎖、軸心與 CX 分件。")
    );
    container.append(empty);
    return;
  }

  const grid = text("div", "", "meta-entity-grid");
  const main = text("div", "", "meta-entity-main");
  const series = text("div", "", "meta-series-row");
  summary.series.forEach((value) =>
    series.append(text("span", value, "meta-series-tag"))
  );
  series.append(text("span", summary.entityTypeLabel, "meta-code-tag"));
  main.append(
    series,
    text("h2", summary.entity.displayNameZh),
    text(
      "p",
      summary.entity.referenceNameEn ?? "尚無英文對照名稱",
      "meta-entity-en"
    ),
    text("p", summary.entity.id, "meta-entity-id")
  );
  grid.append(
    main,
    metricCard("系列", summary.series.join(" / ")),
    metricCard("Entity Type", summary.entityTypeLabel),
    metricCard("Tier", summary.tier ?? "未標示"),
    metricCard("定位", summary.role ?? "資料待補")
  );
  container.append(grid);

  const related = text("div", "", "meta-related-row");
  related.append(text("strong", "關聯零件"));
  const relatedList = text("div", "", "meta-related-list");
  const values =
    summary.relatedParts.length > 0
      ? summary.relatedParts
      : ["目前沒有可顯示的關聯資料"];
  values.slice(0, 12).forEach((value) =>
    relatedList.append(text("span", value))
  );
  related.append(relatedList);
  container.append(related);
}

function evidenceScoreSummary(entry: EvidenceEntry): string {
  return EVIDENCE_SCORE_DIMENSIONS.map((dimension) => {
    const value = entry.dimensionScores[dimension];
    return `${DIMENSION_LABELS[dimension]} ${value === null ? "-" : value}`;
  }).join(" / ");
}

function renderEvidence(state: MetaDashboardState): void {
  const metrics = element("#metaEvidenceSummary", HTMLDivElement);
  const body = element("#metaEvidenceTableBody", HTMLTableSectionElement);
  const empty = element("#metaEvidenceEmpty", HTMLParagraphElement);
  metrics.replaceChildren();
  body.replaceChildren();

  const sources = new Set(
    state.evidence.map((entry) => entry.record.independentSourceGroup)
  );
  const newest = state.evidence[0]?.record.eventDate ?? "尚無資料";
  const excluded =
    state.result?.confidence.excludedEvidence.length ?? 0;
  metrics.append(
    metricCard("Evidence 筆數", String(state.evidence.length)),
    metricCard("最近更新", newest),
    metricCard("來源數", String(sources.size)),
    metricCard("有效 Evidence", String(
      state.result?.confidence.evidenceCount ?? state.evidence.length
    )),
    metricCard(
      "排除 Evidence",
      state.result === null ? "分析後顯示" : String(excluded)
    )
  );

  state.evidence.forEach((entry) => {
    const row = document.createElement("tr");
    [
      entry.record.eventDate,
      `${entry.record.id} / ${entry.evidenceType}`,
      entry.sourceName,
      `${entry.record.status} / ${entry.record.grade}`,
      evidenceScoreSummary(entry)
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
  empty.hidden = state.selectedEntity !== null && state.evidence.length > 0;
  empty.textContent =
    state.selectedEntity === null
      ? "選擇 Entity 後顯示 Evidence。"
      : "目前沒有 Evidence。仍可執行分析，系統會明確回傳資料不足。";
}

function confidenceCard(output: ConfidenceModelOutput): HTMLElement {
  const card = analysisCard(
    "Confidence",
    "CONFIDENCE",
    score(output.confidenceScore),
    output.confidenceLevel
  );
  const metrics = text("div", "", "meta-mini-metrics");
  metrics.append(
    miniMetric("Evidence", String(output.evidenceCount)),
    miniMetric("來源數", String(output.sourceDiversity.sourceCount)),
    miniMetric("Recency", score(output.recency.score)),
    miniMetric("Completeness", score(output.completeness.score)),
    miniMetric("Consistency", score(output.consistency.score)),
    miniMetric("Hard Cap", score(output.hardCap))
  );
  card.append(
    metrics,
    listBlock("主要加分因素", output.positiveFactors, "目前沒有額外加分因素。"),
    listBlock("主要扣分因素", output.negativeFactors, "目前沒有重大扣分因素。"),
    listBlock(
      "排除 Evidence",
      output.excludedEvidence.map(
        (item) => `${item.evidenceId}：${item.reason}`
      ),
      "沒有 Evidence 被排除。"
    )
  );
  return card;
}

function trendLabel(direction: string): string {
  const labels: Readonly<Record<string, string>> = {
    strong_up: "強勢上升",
    up: "上升",
    stable: "穩定",
    down: "下降",
    strong_down: "強勢下降",
    volatile: "高波動",
    insufficient_data: "資料不足"
  };
  return labels[direction] ?? direction;
}

function trendRow(window: TrendWindowOutput): HTMLElement {
  const row = text("div", "", "meta-trend-row");
  const strength =
    window.trendStrength === null
      ? 0
      : Math.max(0, Math.min(100, Math.abs(window.trendStrength)));
  const direction = document.createElement("div");
  direction.append(
    text("strong", `${window.windowWeeks} 週`),
    text("div", trendLabel(window.trendDirection)),
    (() => {
      const bar = text("div", "", "meta-trend-bar");
      const fill = document.createElement("span");
      fill.style.width = `${strength}%`;
      bar.append(fill);
      return bar;
    })()
  );
  row.append(
    text("strong", `${window.windowWeeks}W`),
    direction,
    miniMetric("前期", score(window.previousValue)),
    miniMetric("本期", score(window.currentValue)),
    miniMetric(
      "樣本",
      `${window.validSampleCount}/${window.sampleCount}`
    )
  );
  row.children[3]?.classList.add("meta-trend-secondary");
  return row;
}

function renderAnalysis(result: FullAnalysisResult | null): void {
  const container = element("#metaAnalysisResults", HTMLElement);
  const technical = element("#metaTechnicalContent", HTMLDivElement);
  const calculatedAt = element("#metaCalculatedAt", HTMLSpanElement);
  container.replaceChildren();
  technical.replaceChildren();
  if (result === null) {
    const empty = text(
      "div",
      "",
      "meta-empty-state meta-analysis-placeholder"
    );
    empty.append(
      text("strong", "分析結果尚未建立"),
      text("span", "選擇 Entity 與日期後，按下「執行完整分析」。")
    );
    container.append(empty);
    calculatedAt.textContent = "尚未計算";
    technical.textContent = "完整分析後顯示。";
    return;
  }

  const grid = text("div", "", "meta-analysis-grid");
  grid.append(confidenceCard(result.confidence));

  const trend = analysisCard(
    "Trend",
    "4 / 8 / 12 WEEKS",
    trendLabel(result.trend.windows[0]?.trendDirection ?? "insufficient_data"),
    "短中長期趨勢"
  );
  const trendList = text("div", "", "meta-trend-list");
  result.trend.windows.forEach((window) => trendList.append(trendRow(window)));
  trend.append(
    trendList,
    listBlock(
      "趨勢理由",
      result.trend.windows.flatMap((window) => window.reasons),
      "目前沒有足夠資料建立趨勢。"
    )
  );
  grid.append(trend);

  const maturity = analysisCard(
    "Maturity",
    "META MATURITY",
    score(result.maturity.maturityScore),
    result.maturity.maturityStage ?? "資料不足"
  );
  const maturityMetrics = text("div", "", "meta-mini-metrics");
  maturityMetrics.append(
    miniMetric("Evidence Volume", score(result.maturity.evidenceVolume.score)),
    miniMetric("Duration", score(result.maturity.evidenceDuration.score)),
    miniMetric("Source Diversity", score(result.maturity.sourceDiversity.score)),
    miniMetric("Trend Stability", score(result.maturity.trendStability.score)),
    miniMetric("Confidence", result.maturity.confidenceLevel)
  );
  maturity.append(
    maturityMetrics,
    listBlock(
      "成熟度理由",
      result.maturity.reasons,
      "目前沒有足夠資料判定成熟度。"
    )
  );
  grid.append(maturity);

  const risk = analysisCard(
    "Risk",
    "RISK",
    score(result.risk.riskScore),
    result.risk.riskLevel
  );
  const riskMetrics = text("div", "", "meta-mini-metrics");
  riskMetrics.append(
    miniMetric("Evidence", String(result.risk.evidenceCount)),
    miniMetric("Confidence", result.risk.confidenceLevel),
    miniMetric("Maturity", result.risk.maturityStage ?? "資料不足")
  );
  risk.append(
    riskMetrics,
    listBlock(
      "Risk Codes",
      result.risk.riskCodes,
      "目前沒有可用的 Risk Code。"
    ),
    listBlock(
      "風險因素",
      result.risk.contributingFactors,
      "目前沒有重大結構性風險。"
    ),
    listBlock(
      "緩解因素",
      result.risk.mitigatingFactors,
      "目前沒有可確認的緩解因素。"
    )
  );
  grid.append(risk);

  const recommendation = analysisCard(
    "Recommendation",
    "RECOMMENDATION",
    score(result.recommendation.recommendationScore),
    result.recommendation.recommendationStatus
  );
  recommendation.append(
    text("p", result.recommendation.title, "meta-coach-headline"),
    text("p", result.recommendation.summary, "meta-coach-summary"),
    listBlock(
      "建議理由",
      result.recommendation.reasons,
      "目前沒有足夠資料建立建議。"
    ),
    listBlock(
      "注意事項",
      result.recommendation.cautions,
      "目前沒有額外注意事項。"
    ),
    listBlock(
      "建議下一步",
      result.recommendation.suggestedActions,
      "請先補充 Evidence。"
    )
  );
  grid.append(recommendation);

  const coach = analysisCard(
    "Meta Coach",
    "EXPLAINABLE COACH",
    result.coach.verdict,
    "整體評估"
  );
  coach.classList.add("meta-coach-card");
  coach.append(
    text("p", result.coach.headline, "meta-coach-headline"),
    text("p", result.coach.overallAssessment, "meta-coach-summary")
  );
  const coachColumns = text("div", "", "meta-coach-columns");
  coachColumns.append(
    listBlock(
      "目前優勢",
      result.coach.whatIsWorking,
      "目前沒有足夠資料確認優勢。"
    ),
    listBlock(
      "需要注意",
      result.coach.whatToWatch,
      "目前沒有額外警告。"
    ),
    listBlock(
      "建議下一步",
      result.coach.recommendedNextStep,
      "請先補充可驗證 Evidence。"
    )
  );
  coach.append(
    coachColumns,
    listBlock(
      "警告",
      result.coach.warnings,
      "目前沒有額外警告。"
    )
  );
  grid.append(coach);
  container.append(grid);

  calculatedAt.textContent = `計算時間：${dateTime(result.coach.generatedAt)}`;
  Object.entries(result.traceIds).forEach(([stage, traceId]) => {
    technical.append(text("div", `${stage}: ${traceId}`));
  });
  technical.append(
    text(
      "div",
      `分析版本：${result.profile.analysisResults
        .map((item) => `${item.modelId}@${item.modelVersion}`)
        .join(" / ")}`
    )
  );
}

function renderState(state: MetaDashboardState): void {
  renderErrors(state);
  renderEntity(state.selectedEntity);
  renderEvidence(state);
  renderAnalysis(state.result);
  const persistence = element("#metaPersistenceStatus", HTMLSpanElement);
  persistence.textContent = state.persistenceMessage;
  persistence.dataset.status = state.persistenceStatus;
  const button = element("#runMetaAnalysisBtn", HTMLButtonElement);
  button.disabled =
    state.selectedEntity === null ||
    state.status === "loading" ||
    state.status === "error";
  button.textContent =
    state.status === "loading" ? "分析計算中..." : "執行完整分析";
  const status = element("#metaPipelineStatus", HTMLSpanElement);
  status.textContent =
    state.status === "loading"
      ? "計算中"
      : state.result !== null
        ? "分析完成"
        : state.status === "error"
          ? "發生錯誤"
          : state.status === "empty"
            ? "Evidence 0 筆"
            : "等待執行";
}

function formValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function nullableScore(data: FormData, name: string): number | null {
  const value = formValue(data, name);
  return value.length === 0 ? null : Number(value);
}

function evidenceDraft(
  data: FormData,
  state: MetaDashboardState
): EvidenceCreateDraft | null {
  const selected = state.selectedEntity;
  if (selected === null) return null;
  const status = formValue(data, "status");
  const grade = formValue(data, "grade");
  const dimensions: EvidenceInputDimensionScores = {
    source_quality: nullableScore(data, "source_quality"),
    sample_size: nullableScore(data, "sample_size"),
    regional_diversity: nullableScore(data, "regional_diversity"),
    time_consistency: nullableScore(data, "time_consistency"),
    configuration_consistency: nullableScore(
      data,
      "configuration_consistency"
    ),
    independent_confirmation: nullableScore(
      data,
      "independent_confirmation"
    )
  };
  const id = formValue(data, "id");
  return {
    id:
      id.length > 0
        ? id
        : `evidence-manual-${Date.now().toString(36)}`,
    entityId: selected.entity.id,
    evidenceType: formValue(data, "evidenceType"),
    eventDate: formValue(data, "eventDate"),
    sourceId: formValue(data, "sourceId"),
    sourceName: formValue(data, "sourceName"),
    region: formValue(data, "region"),
    status:
      status === "verified" ||
      status === "pending" ||
      status === "rejected" ||
      status === "superseded"
        ? status
        : "pending",
    grade:
      grade === "A" ||
      grade === "B" ||
      grade === "C" ||
      grade === "D" ||
      grade === "E"
        ? grade
        : "C",
    dimensionScores: dimensions
  };
}

function updateUrl(summary: FormalEntitySummary | null): void {
  const url = new URL(location.href);
  url.searchParams.delete("name");
  url.searchParams.delete("q");
  if (summary === null) {
    url.searchParams.delete("entityId");
  } else {
    url.searchParams.set("entityId", summary.entity.id);
  }
  history.replaceState(null, "", url);
}

async function initialize(): Promise<void> {
  const selection = parseMetaLocation(location.search);
  const firebaseConfig = globalMetaFirebaseConfig();
  const mode = resolveMetaDataMode(
    location.hostname,
    selection.requestedDevelopmentMode,
    firebaseConfig.mode
  );
  const response = await fetch("beyblade_x_database_v1_zhTW.json", {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`正式 Entity 資料載入失敗（HTTP ${response.status}）。`);
  }
  const database: unknown = await response.json();
  const environment = await createMetaEnvironment(
    database,
    mode,
    window.localStorage,
    {
      config: firebaseConfig,
      runtimeFactory: globalMetaFirebaseRuntimeFactory()
    }
  );
  renderMode(environment.status);
  renderAccess(environment);
  fillEntityOptions(environment.catalog);

  const viewModel = new MetaDashboardViewModel(
    environment.catalog,
    environment.evidenceService,
    environment.pipeline,
    mode,
    todayInTaipei(),
    environment.access,
    environment.profileRepository
  );
  const entitySelect = element("#metaEntitySelect", HTMLSelectElement);
  const search = element("#metaEntitySearch", HTMLInputElement);
  const date = element("#metaAnalysisDate", HTMLInputElement);
  const runButton = element("#runMetaAnalysisBtn", HTMLButtonElement);
  const formPanel = element("#metaEvidenceFormPanel", HTMLDivElement);
  const form = element("#metaEvidenceForm", HTMLFormElement);
  date.value = viewModel.state.analysisDate;
  const eventDate = form.elements.namedItem("eventDate");
  if (eventDate instanceof HTMLInputElement) eventDate.value = todayInTaipei();
  renderState(viewModel.state);

  element("#metaRetryBtn", HTMLButtonElement).addEventListener(
    "click",
    async () => renderState(await viewModel.loadEvidence())
  );
  element("#metaSignInBtn", HTMLButtonElement).addEventListener(
    "click",
    async () => {
      if (environment.auth === null) return;
      try {
        await environment.auth.signInWithGoogle();
        location.reload();
      } catch (error) {
        renderAuthenticationError(error);
      }
    }
  );
  element("#metaSignOutBtn", HTMLButtonElement).addEventListener(
    "click",
    async () => {
      if (environment.auth === null) return;
      try {
        await environment.auth.signOut();
        location.reload();
      } catch (error) {
        renderAuthenticationError(error);
      }
    }
  );

  search.addEventListener("input", () => {
    fillEntityOptions(environment.catalog, environment.catalog.search(search.value));
  });
  entitySelect.addEventListener("change", async () => {
    const state = entitySelect.value.length === 0
      ? viewModel.state
      : await viewModel.selectEntity(entitySelect.value);
    updateUrl(state.selectedEntity);
    renderState(state);
  });
  date.addEventListener("change", () => {
    renderState(viewModel.setAnalysisDate(date.value));
  });
  runButton.addEventListener("click", async () => {
    renderState({
      ...viewModel.state,
      status: "loading",
      result: null,
      errors: []
    });
    renderState(await viewModel.runAnalysis());
  });

  const setFormOpen = (open: boolean): void => {
    formPanel.hidden = !open;
    if (open) {
      formPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };
  element("#toggleEvidenceFormBtn", HTMLButtonElement).addEventListener(
    "click",
    () => setFormOpen(true)
  );
  [
    "#closeEvidenceFormBtn",
    "#cancelEvidenceBtn"
  ].forEach((selector) => {
    element(selector, HTMLButtonElement).addEventListener(
      "click",
      () => setFormOpen(false)
    );
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const draft = evidenceDraft(new FormData(form), viewModel.state);
    if (draft === null) {
      renderState(await viewModel.selectEntity(""));
      return;
    }
    const state = await viewModel.addEvidence(draft);
    renderState(state);
    if (state.errors.length === 0) {
      form.reset();
      const formEventDate = form.elements.namedItem("eventDate");
      if (formEventDate instanceof HTMLInputElement) {
        formEventDate.value = viewModel.state.analysisDate;
      }
      setFormOpen(false);
    }
  });

  let initial: FormalEntitySummary | undefined;
  if (selection.entityId !== null) {
    initial = environment.catalog.summaries.find(
      (summary) => summary.entity.id === selection.entityId
    );
    if (initial === undefined) {
      renderState(await viewModel.selectEntity(selection.entityId));
      return;
    }
  } else if (selection.alias !== null) {
    initial = environment.catalog.findByAlias(selection.alias)[0];
    if (initial === undefined) {
      search.value = selection.alias;
      fillEntityOptions(
        environment.catalog,
        environment.catalog.search(selection.alias)
      );
    }
  }
  if (initial !== undefined) {
    entitySelect.value = initial.entity.id;
    renderState(await viewModel.selectEntity(initial.entity.id));
    updateUrl(initial);
  }
}

function renderInitializationFailure(error: unknown): void {
  const message =
    error instanceof Error ? error.message : "Unknown initialization error.";
  const badge = element("#metaModeBadge", HTMLSpanElement);
  badge.textContent = "設定缺失";
  badge.dataset.mode = "error";
  const notice = element("#metaModeNotice", HTMLDivElement);
  notice.replaceChildren(
    text(
      "span",
      "Meta 資料服務目前無法啟動。請確認 Firebase 公開設定後重試。"
    )
  );
  const box = element("#metaErrors", HTMLDivElement);
  box.hidden = false;
  box.replaceChildren(
    text("strong", "Meta Dashboard 無法啟動"),
    text("span", message)
  );
  element("#metaAuthStatus", HTMLSpanElement).textContent = "資料服務未就緒";
  element("#metaSignInBtn", HTMLButtonElement).hidden = true;
  element("#metaSignOutBtn", HTMLButtonElement).hidden = true;
  element("#toggleEvidenceFormBtn", HTMLButtonElement).hidden = true;
  element("#metaEvidenceFormPanel", HTMLDivElement).hidden = true;
  element("#runMetaAnalysisBtn", HTMLButtonElement).disabled = true;
  const retry = element("#metaRetryBtn", HTMLButtonElement);
  retry.onclick = () => location.reload();
}

initialize().catch(renderInitializationFailure);
