import {
  FullAnalysisPipelineError,
  type FullAnalysisPipelineService
} from "./service.js";
import type {
  CoachStageRequest,
  FullAnalysisRequest,
  FullAnalysisViewState,
  RecommendationStageRequest,
  RiskStageRequest
} from "./types.js";

export class FullAnalysisViewModel {
  readonly #service: FullAnalysisPipelineService;
  #state: FullAnalysisViewState = {
    result: null,
    risk: null,
    recommendation: null,
    coach: null,
    currentStage: "idle",
    errors: [],
    loading: false
  };

  constructor(service: FullAnalysisPipelineService) {
    this.#service = service;
  }

  get state(): FullAnalysisViewState {
    return this.#state;
  }

  #failure(error: unknown): void {
    if (error instanceof FullAnalysisPipelineError) {
      this.#state = {
        ...this.#state,
        currentStage: error.stage,
        errors: error.details,
        loading: false
      };
      return;
    }
    this.#state = {
      ...this.#state,
      errors: [
        error instanceof Error ? error.message : "Full analysis failed."
      ],
      loading: false
    };
  }

  async calculateRisk(
    request: RiskStageRequest
  ): Promise<FullAnalysisViewState> {
    this.#state = {
      ...this.#state,
      risk: null,
      recommendation: null,
      coach: null,
      currentStage: "risk",
      errors: [],
      loading: true
    };
    try {
      const risk = await this.#service.calculateRiskStage(request);
      this.#state = {
        ...this.#state,
        risk,
        recommendation: null,
        coach: null,
        currentStage: "completed",
        loading: false
      };
    } catch (error) {
      this.#failure(error);
    }
    return this.state;
  }

  async calculateRecommendation(
    request: RecommendationStageRequest
  ): Promise<FullAnalysisViewState> {
    this.#state = {
      ...this.#state,
      recommendation: null,
      coach: null,
      currentStage: "recommendation",
      errors: [],
      loading: true
    };
    try {
      const recommendation =
        await this.#service.calculateRecommendationStage(request);
      this.#state = {
        ...this.#state,
        recommendation,
        coach: null,
        currentStage: "completed",
        loading: false
      };
    } catch (error) {
      this.#failure(error);
    }
    return this.state;
  }

  async calculateCoach(
    request: CoachStageRequest
  ): Promise<FullAnalysisViewState> {
    this.#state = {
      ...this.#state,
      coach: null,
      currentStage: "coach",
      errors: [],
      loading: true
    };
    try {
      const coach = await this.#service.calculateCoachStage(request);
      this.#state = {
        ...this.#state,
        coach,
        currentStage: "completed",
        loading: false
      };
    } catch (error) {
      this.#failure(error);
    }
    return this.state;
  }

  async run(request: FullAnalysisRequest): Promise<FullAnalysisViewState> {
    this.#state = {
      result: null,
      risk: null,
      recommendation: null,
      coach: null,
      currentStage: "evidence",
      errors: [],
      loading: true
    };
    try {
      const result = await this.#service.run(request);
      this.#state = {
        result,
        risk: result.risk,
        recommendation: result.recommendation,
        coach: result.coach,
        currentStage: "completed",
        errors: [],
        loading: false
      };
    } catch (error) {
      this.#failure(error);
    }
    return this.state;
  }
}
