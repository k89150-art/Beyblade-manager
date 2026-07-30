import {
  MaturityServiceError,
  type MaturityService
} from "./service.js";
import type {
  MaturityAnalysisRequest,
  MaturityViewState
} from "./types.js";

export class MaturityViewModel {
  readonly #service: MaturityService;
  #result: MaturityViewState["result"] = null;
  #errors: readonly string[] = [];
  #loading = false;

  constructor(service: MaturityService) {
    this.#service = service;
  }

  get state(): MaturityViewState {
    return {
      result: this.#result,
      errors: this.#errors,
      loading: this.#loading
    };
  }

  async calculate(
    request: MaturityAnalysisRequest
  ): Promise<MaturityViewState> {
    this.#loading = true;
    this.#errors = [];
    try {
      const result = await this.#service.calculate(request);
      this.#result = result.output;
    } catch (error) {
      this.#result = null;
      this.#errors =
        error instanceof MaturityServiceError
          ? error.details
          : [
              error instanceof Error
                ? error.message
                : "Maturity calculation failed."
            ];
    } finally {
      this.#loading = false;
    }
    return this.state;
  }
}
