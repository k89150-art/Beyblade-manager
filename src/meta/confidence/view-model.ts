import { ConfidenceServiceError } from "./service.js";
import type { ConfidenceService } from "./service.js";
import type {
  ConfidenceAnalysisRequest,
  ConfidenceViewState
} from "./types.js";

export class ConfidenceViewModel {
  readonly #service: ConfidenceService;
  #result: ConfidenceViewState["result"] = null;
  #errors: readonly string[] = [];
  #loading = false;

  constructor(service: ConfidenceService) {
    this.#service = service;
  }

  get state(): ConfidenceViewState {
    return {
      result: this.#result,
      errors: this.#errors,
      loading: this.#loading
    };
  }

  async calculate(
    request: ConfidenceAnalysisRequest
  ): Promise<ConfidenceViewState> {
    this.#loading = true;
    this.#errors = [];
    try {
      const result = await this.#service.calculate(request);
      this.#result = result.output;
    } catch (error) {
      this.#result = null;
      if (error instanceof ConfidenceServiceError) {
        this.#errors = error.details;
      } else {
        this.#errors = [
          error instanceof Error
            ? error.message
            : "Confidence calculation failed."
        ];
      }
    } finally {
      this.#loading = false;
    }
    return this.state;
  }
}
