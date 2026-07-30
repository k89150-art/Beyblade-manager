import { TrendServiceError, type TrendService } from "./service.js";
import type {
  TrendAnalysisRequest,
  TrendViewState
} from "./types.js";

export class TrendViewModel {
  readonly #service: TrendService;
  #result: TrendViewState["result"] = null;
  #errors: readonly string[] = [];
  #loading = false;

  constructor(service: TrendService) {
    this.#service = service;
  }

  get state(): TrendViewState {
    return {
      result: this.#result,
      errors: this.#errors,
      loading: this.#loading
    };
  }

  async calculate(request: TrendAnalysisRequest): Promise<TrendViewState> {
    this.#loading = true;
    this.#errors = [];
    try {
      const result = await this.#service.calculate(request);
      this.#result = result.output;
    } catch (error) {
      this.#result = null;
      this.#errors =
        error instanceof TrendServiceError
          ? error.details
          : [
              error instanceof Error
                ? error.message
                : "Trend calculation failed."
            ];
    } finally {
      this.#loading = false;
    }
    return this.state;
  }
}
