import type {
  AnalysisRunStatus,
  CoachVerdict,
  DefinitionLifecycleStatus,
  EditorialNoteStatus,
  EvidenceGrade,
  EvidenceImportBatchStatus,
  EvidenceScoreDimension,
  EvidenceStatus,
  EntityMappingTaskStatus,
  MaturityStage,
  RiskCode,
  RiskLevel,
  TrendState,
  TrendWindow
} from "./enums.js";
import type { ObjectSchema } from "./schema-types.js";

export type Identifier = string;
export type CanonicalEntityId = `ent_${string}`;
export type EntityTypeId = string;
export type BuildSlot = string;
export type IsoDate = string;
export type IsoDateTime = string;
export type Score = number | null;
export type Stars = 1 | 2 | 3 | 4 | 5 | null;

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface EntityTargetReference {
  readonly targetType: "entity";
  readonly entityId: CanonicalEntityId;
  readonly comboId?: never;
}

export interface ComboTargetReference {
  readonly targetType: "combo";
  readonly entityId?: never;
  readonly comboId: Identifier;
}

export type TargetReference = EntityTargetReference | ComboTargetReference;

export interface Series {
  readonly id: Identifier;
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface CatalogEntity {
  readonly id: CanonicalEntityId;
  readonly entityTypeId: EntityTypeId;
  readonly entityTypeVersion: string;
  readonly canonicalName: string;
  readonly displayNameZh: string;
  readonly referenceNameEn?: string;
  readonly seriesIds: readonly Identifier[];
  readonly legacyIds: readonly string[];
  readonly attributes: Readonly<Record<string, JsonValue>>;
  readonly active: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface EntityTypeDefinition {
  readonly typeId: EntityTypeId;
  readonly displayName: string;
  readonly category: string;
  readonly supportedSeries: readonly Identifier[];
  readonly attributesSchema: ObjectSchema;
  readonly lifecycleStatus: DefinitionLifecycleStatus;
  readonly version: string;
}

export interface EntityAlias {
  readonly id: Identifier;
  readonly entityId: CanonicalEntityId;
  readonly value: string;
  readonly normalizedValue: string;
  readonly locale?: string;
  readonly source?: string;
  readonly active: boolean;
  readonly createdAt: IsoDateTime;
}

export interface Product {
  readonly id: Identifier;
  readonly productCode: string;
  readonly displayName: string;
  readonly seriesId: Identifier;
  readonly stockConfigurationIds: readonly Identifier[];
  readonly legacyRecordIds: readonly string[];
  readonly attributes: Readonly<Record<string, JsonValue>>;
  readonly active: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface StockConfiguration {
  readonly id: Identifier;
  readonly productId: Identifier;
  readonly buildSystemId: Identifier;
  readonly buildSystemVersion: string;
  readonly name: string;
  readonly entries: readonly StockConfigurationEntry[];
  readonly variantKey?: string;
  readonly setId?: Identifier;
  readonly isDefault: boolean;
  readonly legacyData: Readonly<Record<string, JsonValue>>;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface StockConfigurationEntry {
  readonly slotId: BuildSlot;
  readonly entityId: CanonicalEntityId;
  readonly position?: number;
}

export interface Combo {
  readonly id: Identifier;
  readonly buildSystemId: Identifier;
  readonly name?: string;
  readonly componentIds: readonly Identifier[];
  readonly legacyKey?: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ComboComponent {
  readonly id: Identifier;
  readonly comboId: Identifier;
  readonly entityId: CanonicalEntityId;
  readonly slot: BuildSlot;
  readonly order: number;
  readonly createdAt: IsoDateTime;
}

export interface BuildSystemDefinition {
  readonly id: Identifier;
  readonly name: string;
  readonly seriesIds: readonly Identifier[];
  readonly slots: readonly BuildSlotDefinition[];
  readonly exclusiveSlotGroups: readonly (readonly BuildSlot[])[];
  readonly active: boolean;
  readonly version: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface BuildSlotDefinition {
  readonly slotId: BuildSlot;
  readonly displayName: string;
  readonly allowedEntityTypeIds: readonly EntityTypeId[];
  readonly allowedEntityTypeVersions: Readonly<Record<EntityTypeId, string>>;
  readonly minimumEntries: number;
  readonly maximumEntries: number | null;
}

export interface EvidenceSource {
  readonly id: Identifier;
  readonly name: string;
  readonly sourceType: string;
  readonly uri?: string;
  readonly region?: string;
  readonly independentSourceGroup: string;
  readonly defaultGrade: EvidenceGrade;
  readonly active: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface PerformanceObservation {
  readonly matchWins: number | null;
  readonly matchLosses: number | null;
  readonly winRate: number | null;
}

export interface EvidenceRecord {
  readonly id: Identifier;
  readonly sourceId: Identifier;
  readonly status: EvidenceStatus;
  readonly grade: EvidenceGrade;
  readonly eventName: string;
  readonly eventDate: IsoDate;
  readonly region: string;
  readonly independentSourceGroup: string;
  readonly observedAt: IsoDateTime;
  readonly importBatchId?: Identifier;
  readonly placement?: number;
  readonly performance: PerformanceObservation;
  readonly rawPayload: JsonValue;
  readonly createdAt: IsoDateTime;
  readonly createdBy: Identifier;
}

export type EvidenceTarget = {
  readonly id: Identifier;
  readonly evidenceRecordId: Identifier;
  readonly isPrimary: boolean;
  readonly createdAt: IsoDateTime;
} & TargetReference;

export interface EvidenceRevision {
  readonly id: Identifier;
  readonly evidenceRecordId: Identifier;
  readonly revisionNumber: number;
  readonly supersedesRevisionId?: Identifier;
  readonly reason: string;
  readonly changes: Readonly<Record<string, JsonValue>>;
  readonly createdAt: IsoDateTime;
  readonly createdBy: Identifier;
}

export interface EvidenceImportBatch {
  readonly id: Identifier;
  readonly sourceId: Identifier;
  readonly importKey: string;
  readonly status: EvidenceImportBatchStatus;
  readonly checksum: string;
  readonly recordCount: number;
  readonly importedAt: IsoDateTime;
  readonly importedBy: Identifier;
}

export interface EntityMappingTask {
  readonly id: Identifier;
  readonly rawName: string;
  readonly normalizedName: string;
  readonly entityTypeIdGuess?: EntityTypeId;
  readonly sourceId?: Identifier;
  readonly status: EntityMappingTaskStatus;
  readonly resolvedEntityId?: CanonicalEntityId;
  readonly resolutionNote?: string;
  readonly createdAt: IsoDateTime;
  readonly resolvedAt?: IsoDateTime;
  readonly resolvedBy?: Identifier;
}

export interface AnalysisRuleDefinition {
  readonly id: Identifier;
  readonly engine: string;
  readonly version: string;
  readonly activeFrom: IsoDateTime;
  readonly activeUntil?: IsoDateTime;
  readonly definition: JsonValue;
  readonly checksum: string;
  readonly createdAt: IsoDateTime;
  readonly createdBy: Identifier;
}

export interface AnalysisModelDefinition {
  readonly modelId: Identifier;
  readonly version: string;
  readonly inputSchemaId: Identifier;
  readonly inputSchemaVersion: string;
  readonly outputSchemaId: Identifier;
  readonly outputSchemaVersion: string;
  readonly supportedEntityTypes: readonly EntityTypeId[];
  readonly lifecycleStatus: DefinitionLifecycleStatus;
  readonly reasonCodeNamespace: string;
}

export interface AnalysisRun {
  readonly id: Identifier;
  readonly status: AnalysisRunStatus;
  readonly cutoffAt: IsoDateTime;
  readonly startedAt: IsoDateTime;
  readonly completedAt?: IsoDateTime;
  readonly ruleDefinitionIds: readonly Identifier[];
  readonly inputHash: string;
  readonly createdBy: Identifier;
}

export interface AnalysisRecordBase {
  readonly id: Identifier;
  readonly analysisRunId: Identifier;
  readonly ruleDefinitionIds: readonly Identifier[];
  readonly calculatedAt: IsoDateTime;
  readonly reasons: readonly string[];
}

export type EvidenceDimensionScores = Readonly<
  Record<EvidenceScoreDimension, Score>
>;

export type EvidenceAnalysis = AnalysisRecordBase & TargetReference & {
  readonly score: Score;
  readonly dimensionScores: EvidenceDimensionScores;
  readonly inputEvidenceIds: readonly Identifier[];
};

export type ConfidenceAnalysis = AnalysisRecordBase & TargetReference & {
  readonly score: Score;
  readonly hardCap: Score;
  readonly inputEvidenceAnalysisIds: readonly Identifier[];
};

export interface TrendWindowAnalysis {
  readonly windowWeeks: TrendWindow;
  readonly state: TrendState | null;
  readonly score: Score;
  readonly reasons: readonly string[];
}

export type TrendAnalysis = AnalysisRecordBase & TargetReference & {
  readonly windows: readonly TrendWindowAnalysis[];
  readonly inputAnalysisIds: readonly Identifier[];
};

export type MaturityAnalysis = AnalysisRecordBase & TargetReference & {
  readonly stage: MaturityStage | null;
  readonly score: Score;
  readonly inputAnalysisIds: readonly Identifier[];
};

export type RiskAnalysis = AnalysisRecordBase & TargetReference & {
  readonly level: RiskLevel;
  readonly score: Score;
  readonly riskCodes: readonly RiskCode[];
  readonly inputAnalysisIds: readonly Identifier[];
};

export type RecommendationAnalysis = AnalysisRecordBase & TargetReference & {
  readonly verdict: CoachVerdict;
  readonly score: Score;
  readonly stars: Stars;
  readonly positiveFactors: readonly string[];
  readonly riskFactors: readonly string[];
  readonly inputAnalysisIds: readonly Identifier[];
};

export type CoachAnalysis = AnalysisRecordBase & TargetReference & {
  readonly headline: string;
  readonly verdict: CoachVerdict;
  readonly positiveFactors: readonly string[];
  readonly riskFactors: readonly string[];
  readonly actionAdvice: readonly string[];
  readonly inputAnalysisIds: readonly Identifier[];
  readonly traceId: Identifier;
};

export interface AnalysisTrace {
  readonly id: Identifier;
  readonly modelId: Identifier;
  readonly modelVersion: string;
  readonly outputId: Identifier;
  readonly analysisRunId: Identifier;
  readonly ruleDefinitionIds: readonly Identifier[];
  readonly inputEvidenceIds: readonly Identifier[];
  readonly inputAnalysisIds: readonly Identifier[];
  readonly calculatedAt: IsoDateTime;
  readonly calculationDetails: JsonValue;
}

export interface MetaProfileAnalysisResult {
  readonly modelId: Identifier;
  readonly modelVersion: string;
  readonly generatedAt: IsoDateTime;
  readonly output: JsonValue;
  readonly reasonCodes: readonly string[];
  readonly sourceSnapshotId: Identifier;
}

export type MetaProfile = TargetReference & {
  readonly id: Identifier;
  readonly analysisRunId: Identifier;
  readonly analysisResults: readonly MetaProfileAnalysisResult[];
  readonly currentAt: IsoDateTime;
};

export interface WeeklyMetaSnapshot {
  readonly id: Identifier;
  readonly weekStart: IsoDate;
  readonly weekEnd: IsoDate;
  readonly analysisRunId: Identifier;
  readonly profileIds: readonly Identifier[];
  readonly immutable: true;
  readonly createdAt: IsoDateTime;
}

export type MetaTimelineEvent = TargetReference & {
  readonly id: Identifier;
  readonly eventType: string;
  readonly occurredAt: IsoDateTime;
  readonly snapshotId?: Identifier;
  readonly summary: string;
  readonly sourceEvidenceIds: readonly Identifier[];
  readonly createdAt: IsoDateTime;
};

export interface ComboRoute {
  readonly id: Identifier;
  readonly name: string;
  readonly comboId?: Identifier;
  readonly primaryEntityId?: CanonicalEntityId;
  readonly componentEntityIds: readonly CanonicalEntityId[];
  readonly role: string;
  readonly evidenceIds: readonly Identifier[];
  readonly notes: readonly string[];
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ComponentSynergy {
  readonly id: Identifier;
  readonly componentEntityIds: readonly CanonicalEntityId[];
  readonly score: Score;
  readonly confidenceScore: Score;
  readonly evidenceIds: readonly Identifier[];
  readonly reasons: readonly string[];
  readonly analysisRunId: Identifier;
  readonly calculatedAt: IsoDateTime;
}

export interface CounterRelationship {
  readonly id: Identifier;
  readonly sourceEntityId?: CanonicalEntityId;
  readonly sourceComboId?: Identifier;
  readonly targetEntityId?: CanonicalEntityId;
  readonly targetComboId?: Identifier;
  readonly score: Score;
  readonly evidenceIds: readonly Identifier[];
  readonly reasons: readonly string[];
  readonly analysisRunId: Identifier;
  readonly calculatedAt: IsoDateTime;
}

export type EditorialNote = TargetReference & {
  readonly id: Identifier;
  readonly title: string;
  readonly body: string;
  readonly status: EditorialNoteStatus;
  readonly authorId: Identifier;
  readonly relatedEvidenceIds: readonly Identifier[];
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly publishedAt?: IsoDateTime;
};

export interface DomainModelMap {
  readonly Series: Series;
  readonly EntityTypeDefinition: EntityTypeDefinition;
  readonly CatalogEntity: CatalogEntity;
  readonly EntityAlias: EntityAlias;
  readonly Product: Product;
  readonly StockConfiguration: StockConfiguration;
  readonly Combo: Combo;
  readonly ComboComponent: ComboComponent;
  readonly BuildSystemDefinition: BuildSystemDefinition;
  readonly EvidenceSource: EvidenceSource;
  readonly EvidenceRecord: EvidenceRecord;
  readonly EvidenceTarget: EvidenceTarget;
  readonly EvidenceRevision: EvidenceRevision;
  readonly EvidenceImportBatch: EvidenceImportBatch;
  readonly EntityMappingTask: EntityMappingTask;
  readonly AnalysisRuleDefinition: AnalysisRuleDefinition;
  readonly AnalysisModelDefinition: AnalysisModelDefinition;
  readonly AnalysisRun: AnalysisRun;
  readonly EvidenceAnalysis: EvidenceAnalysis;
  readonly ConfidenceAnalysis: ConfidenceAnalysis;
  readonly TrendAnalysis: TrendAnalysis;
  readonly MaturityAnalysis: MaturityAnalysis;
  readonly RiskAnalysis: RiskAnalysis;
  readonly RecommendationAnalysis: RecommendationAnalysis;
  readonly CoachAnalysis: CoachAnalysis;
  readonly AnalysisTrace: AnalysisTrace;
  readonly MetaProfile: MetaProfile;
  readonly WeeklyMetaSnapshot: WeeklyMetaSnapshot;
  readonly MetaTimelineEvent: MetaTimelineEvent;
  readonly ComboRoute: ComboRoute;
  readonly ComponentSynergy: ComponentSynergy;
  readonly CounterRelationship: CounterRelationship;
  readonly EditorialNote: EditorialNote;
}

export type DomainModelName = keyof DomainModelMap;
