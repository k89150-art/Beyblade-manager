import { COACH_MODEL_VERSION } from "../coach/index.js";
import {
  CONFIDENCE_MODEL_VERSION,
  type MetaProfileRepository
} from "../confidence/index.js";
import type {
  CanonicalEntityId,
  IsoDate
} from "../domain/index.js";
import {
  EvidenceValidationError,
  type EvidenceCreateDraft,
  type EvidenceService
} from "../evidence/index.js";
import type { MetaAccess } from "../firebase/index.js";
import type { FullAnalysisViewModel } from "../full-analysis/index.js";
import { MATURITY_MODEL_VERSION } from "../maturity/index.js";
import { RECOMMENDATION_MODEL_VERSION } from "../recommendation/index.js";
import { RISK_MODEL_VERSION } from "../risk/index.js";
import { TREND_MODEL_VERSION } from "../trend/index.js";
import type {
  FormalEntityCatalog,
  MetaDashboardState,
  MetaDataMode
} from "./types.js";

const CANONICAL_ENTITY_ID =
  /^ent_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function isCanonicalEntityId(value: string): value is CanonicalEntityId {
  return CANONICAL_ENTITY_ID.test(value);
}

function asCanonicalEntityId(value: string): CanonicalEntityId | null {
  return isCanonicalEntityId(value) ? value : null;
}

function asIsoDate(value: string): IsoDate | null {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

export class MetaDashboardViewModel {
  readonly #catalog: FormalEntityCatalog;
  readonly #evidence: EvidenceService;
  readonly #pipeline: FullAnalysisViewModel;
  readonly #dataMode: MetaDataMode;
  readonly #access: MetaAccess;
  readonly #profileRepository: MetaProfileRepository | null;
  #state: MetaDashboardState;

  constructor(
    catalog: FormalEntityCatalog,
    evidence: EvidenceService,
    pipeline: FullAnalysisViewModel,
    dataMode: MetaDataMode,
    initialDate: IsoDate,
    access: MetaAccess = {
      authenticated: false,
      canRead: true,
      canWriteEvidence: dataMode === "development",
      canSaveAnalysis: false,
      principal: null
    },
    profileRepository: MetaProfileRepository | null = null
  ) {
    this.#catalog = catalog;
    this.#evidence = evidence;
    this.#pipeline = pipeline;
    this.#dataMode = dataMode;
    this.#access = access;
    this.#profileRepository = profileRepository;
    this.#state = {
      status: "idle",
      selectedEntity: null,
      analysisDate: initialDate,
      evidence: [],
      result: null,
      failedStage: null,
      persistenceStatus: "not-calculated",
      persistenceMessage: "尚未執行分析。",
      errors: []
    };
  }

  get state(): MetaDashboardState {
    return this.#state;
  }

  async selectEntity(entityId: string): Promise<MetaDashboardState> {
    const canonicalId = asCanonicalEntityId(entityId);
    const selected =
      canonicalId === null ? undefined : this.#catalog.findById(canonicalId);
    if (selected === undefined) {
      this.#state = {
        ...this.#state,
        status: "error",
        selectedEntity: null,
        evidence: [],
        result: null,
        failedStage: null,
        persistenceStatus: "not-calculated",
        persistenceMessage: "尚未執行分析。",
        errors: ["找不到指定的 Entity，請重新搜尋或選擇。"]
      };
      return this.state;
    }
    this.#state = {
      ...this.#state,
      status: "loading",
      selectedEntity: selected,
      evidence: [],
      result: null,
      failedStage: null,
      persistenceStatus: "not-calculated",
      persistenceMessage: "切換 Entity 後需重新分析。",
      errors: []
    };
    return this.loadEvidence();
  }

  setAnalysisDate(value: string): MetaDashboardState {
    const date = asIsoDate(value);
    if (date === null) {
      this.#state = {
        ...this.#state,
        status: "error",
        result: null,
        failedStage: null,
        persistenceStatus: "not-calculated",
        persistenceMessage: "分析日期不合法。",
        errors: ["分析日期格式不正確。"]
      };
      return this.state;
    }
    this.#state = {
      ...this.#state,
      status:
        this.#state.selectedEntity === null
          ? "idle"
          : this.#state.evidence.length === 0
            ? "empty"
            : "ready",
      analysisDate: date,
      result: null,
      failedStage: null,
      persistenceStatus: "not-calculated",
      persistenceMessage: "分析日期已變更，需重新分析。",
      errors: []
    };
    return this.state;
  }

  async loadEvidence(): Promise<MetaDashboardState> {
    const selected = this.#state.selectedEntity;
    if (selected === null) return this.state;
    try {
      const evidence = await this.#evidence.list({
        entityId: selected.entity.id,
        sortDirection: "descending"
      });
      this.#state = {
        ...this.#state,
        status: evidence.length === 0 ? "empty" : "ready",
        evidence,
        errors: []
      };
    } catch (error) {
      this.#state = {
        ...this.#state,
        status: "error",
        evidence: [],
        result: null,
        persistenceStatus: "not-calculated",
        persistenceMessage: "Evidence 讀取失敗。",
        errors: [
          error instanceof Error
            ? error.message
            : "Evidence Repository 無法使用。"
        ]
      };
    }
    return this.state;
  }

  async addEvidence(
    draft: EvidenceCreateDraft
  ): Promise<MetaDashboardState> {
    if (!this.#access.canWriteEvidence) {
      this.#state = {
        ...this.#state,
        status: "error",
        result: null,
        persistenceStatus: "not-calculated",
        persistenceMessage: "目前帳號只有唯讀權限。",
        errors: ["你沒有新增正式 Evidence 的權限。"]
      };
      return this.state;
    }
    try {
      await this.#evidence.create(draft);
      this.#state = {
        ...this.#state,
        result: null,
        failedStage: null,
        persistenceStatus: "not-calculated",
        persistenceMessage: "Evidence 已變更，需重新分析。",
        errors: []
      };
      return this.loadEvidence();
    } catch (error) {
      const errors =
        error instanceof EvidenceValidationError
          ? error.issues.map(
              issue => `${issue.path}: ${issue.message}`
            )
          : [
              error instanceof Error
                ? error.message
                : "Evidence creation failed."
            ];
      this.#state = {
        ...this.#state,
        status: "error",
        result: null,
        persistenceStatus: "not-calculated",
        persistenceMessage: "Evidence 未寫入。",
        errors
      };
      return this.state;
    }
  }

  async runAnalysis(): Promise<MetaDashboardState> {
    const selected = this.#state.selectedEntity;
    if (selected === null) {
      this.#state = {
        ...this.#state,
        status: "error",
        errors: ["請先選擇 Entity。"]
      };
      return this.state;
    }
    this.#state = {
      ...this.#state,
      status: "loading",
      result: null,
      failedStage: null,
      persistenceStatus: "not-calculated",
      persistenceMessage: "分析執行中。",
      errors: []
    };
    const pipelineState = await this.#pipeline.run({
      entityId: selected.entity.id,
      analysisDate: this.#state.analysisDate,
      versions: {
        confidence: CONFIDENCE_MODEL_VERSION,
        trend: TREND_MODEL_VERSION,
        maturity: MATURITY_MODEL_VERSION,
        risk: RISK_MODEL_VERSION,
        recommendation: RECOMMENDATION_MODEL_VERSION,
        coach: COACH_MODEL_VERSION
      },
      dataMode:
        this.#dataMode === "development" ? "development" : "production",
      locale: "zh-TW"
    });
    if (pipelineState.result === null) {
      this.#state = {
        ...this.#state,
        status: "error",
        failedStage:
          pipelineState.currentStage === "idle" ||
          pipelineState.currentStage === "completed"
            ? null
            : pipelineState.currentStage,
        persistenceStatus: "not-calculated",
        persistenceMessage: "分析未完成，沒有保存任何結果。",
        errors:
          pipelineState.errors.length > 0
            ? pipelineState.errors
            : ["完整分析無法完成。"]
      };
      return this.state;
    }

    const result = pipelineState.result;
    if (
      this.#dataMode === "development" ||
      !this.#access.canSaveAnalysis ||
      this.#profileRepository === null
    ) {
      this.#state = {
        ...this.#state,
        status: "ready",
        result,
        failedStage: null,
        persistenceStatus: "preview-only",
        persistenceMessage:
          this.#dataMode === "development"
            ? "開發模式分析僅供本次預覽，不寫入 Firebase。"
            : "分析完成，但目前帳號沒有保存權限；結果僅供本次預覽。",
        errors: []
      };
      return this.state;
    }

    try {
      await this.#profileRepository.save(result.profile);
      this.#state = {
        ...this.#state,
        status: "ready",
        result,
        failedStage: null,
        persistenceStatus: "saved",
        persistenceMessage: "分析結果已保存至 Firebase。",
        errors: []
      };
    } catch (error) {
      this.#state = {
        ...this.#state,
        status: "ready",
        result,
        failedStage: null,
        persistenceStatus: "save-failed",
        persistenceMessage:
          "分析已完成，但 Firebase 保存失敗；此結果僅供本次預覽。",
        errors: [
          error instanceof Error ? error.message : "MetaProfile save failed."
        ]
      };
    }
    return this.state;
  }
}
