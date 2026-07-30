export const DEFINITION_LIFECYCLE_STATUSES = [
  "active",
  "deprecated",
  "inactive"
] as const;

export type DefinitionLifecycleStatus =
  (typeof DEFINITION_LIFECYCLE_STATUSES)[number];

export const MATURITY_STAGES = [
  "seed",
  "emerging",
  "established",
  "mature",
  "legacy"
] as const;

export type MaturityStage = (typeof MATURITY_STAGES)[number];

export const EVIDENCE_GRADES = ["A", "B", "C", "D", "E"] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

export const EVIDENCE_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "superseded"
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const TREND_STATES = [
  "strong_up",
  "up",
  "stable",
  "down",
  "strong_down"
] as const;

export type TrendState = (typeof TREND_STATES)[number];

export const COACH_VERDICTS = [
  "strong_buy",
  "recommended",
  "conditional",
  "observe_and_test",
  "wait",
  "avoid",
  "insufficient_data"
] as const;

export type CoachVerdict = (typeof COACH_VERDICTS)[number];

export const RISK_LEVELS = ["low", "medium", "high", "unknown"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_CODES = [
  "insufficient_sample",
  "single_source_dependency",
  "single_region_dependency",
  "configuration_not_converged",
  "short_observation_period",
  "counter_growth",
  "trend_instability",
  "new_release_uncertainty",
  "conflicting_evidence",
  "stale_data",
  "missing_match_data"
] as const;
export type RiskCode = (typeof RISK_CODES)[number];

export const EVIDENCE_SCORE_DIMENSIONS = [
  "source_quality",
  "sample_size",
  "regional_diversity",
  "time_consistency",
  "configuration_consistency",
  "independent_confirmation"
] as const;
export type EvidenceScoreDimension =
  (typeof EVIDENCE_SCORE_DIMENSIONS)[number];

export const ANALYSIS_RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed"
] as const;
export type AnalysisRunStatus = (typeof ANALYSIS_RUN_STATUSES)[number];

export const EVIDENCE_IMPORT_BATCH_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed"
] as const;
export type EvidenceImportBatchStatus =
  (typeof EVIDENCE_IMPORT_BATCH_STATUSES)[number];

export const ENTITY_MAPPING_TASK_STATUSES = [
  "pending",
  "resolved",
  "dismissed"
] as const;
export type EntityMappingTaskStatus =
  (typeof ENTITY_MAPPING_TASK_STATUSES)[number];

export const EDITORIAL_NOTE_STATUSES = [
  "draft",
  "published",
  "archived"
] as const;
export type EditorialNoteStatus = (typeof EDITORIAL_NOTE_STATUSES)[number];

export const TARGET_TYPES = ["entity", "combo"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const TREND_WINDOWS = [4, 8, 12] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];
