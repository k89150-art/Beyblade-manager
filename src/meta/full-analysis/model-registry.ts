import { AnalysisModelRegistry } from "../domain/index.js";
import { registerCoachAnalysisModel } from "../coach/model.js";
import { registerConfidenceAnalysisModel } from "../confidence/model.js";
import { registerMaturityAnalysisModel } from "../maturity/model.js";
import { registerRecommendationAnalysisModel } from "../recommendation/model.js";
import { registerRiskAnalysisModel } from "../risk/model.js";
import { registerTrendAnalysisModel } from "../trend/model.js";

export function registerPhase5AnalysisModels(
  registry: AnalysisModelRegistry
): void {
  registerConfidenceAnalysisModel(registry);
  registerTrendAnalysisModel(registry);
  registerMaturityAnalysisModel(registry);
  registerRiskAnalysisModel(registry);
  registerRecommendationAnalysisModel(registry);
  registerCoachAnalysisModel(registry);
}

export function createPhase5AnalysisModelRegistry(): AnalysisModelRegistry {
  const registry = new AnalysisModelRegistry();
  registerPhase5AnalysisModels(registry);
  registry.seal();
  return registry;
}
