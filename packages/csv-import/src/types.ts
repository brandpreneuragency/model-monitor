/**
 * Typed records produced by parseMasterCsv.
 * Pure in-memory shapes — no database IDs. Next phase maps these into Drizzle rows.
 */

export type ProseBoolean = {
  /** true = affirmative, false = explicit negative, null = unknown / not confirmed / empty */
  value: boolean | null;
  /** Full original cell text (always preserved). */
  prose: string;
};

export type ParsedModel = {
  /** 0-based index into the CSV data rows (after header). */
  rowIndex: number;
  /** 1-based physical spreadsheet row number (row 5 is first data row). */
  sheetRow: number;
  name: string;
  providerName: string;
  packageName: string;
  modelId: string;
  family: string | null;
  /** Text generation label. Decimal-comma mangling like "5,6" is normalised to "5.6". */
  generation: string | null;
  status: string | null;
  releaseDate: string | null;
  modelType: string | null;
  codingSpecialization: string | null;
  knowledgeCutoff: string | null;
  contextTokens: number | null;
  maxOutputTokens: number | null;
  speedRating: string | null;
  verifiedTps: number | null;
  bestUse: string | null;
  avoidFor: string | null;
  needsRecheck: string | null;
  globalCapabilityEligible: boolean | null;
  balancedValueEligible: boolean | null;
  rankQcNote: string | null;
  vision: ProseBoolean;
  reasoning: ProseBoolean;
  parallelAgent: ProseBoolean;
  /** Capability / Balanced / Value composites from the CSV (precomputed external). */
  capabilityScore: number | null;
  capabilityRank: number | null;
  balancedScore: number | null;
  balancedRank: number | null;
  valueScore: number | null;
  valueRank: number | null;
};

export type ParsedProvider = {
  name: string;
};

export type ParsedPlan = {
  /** Raw Package cell value (may still contain " / " for known compounds). */
  packageName: string;
  /** Access provider name from the CSV Provider column (first seen). */
  providerName: string;
  subscriptionUsd: number | null;
  introPriceUsd: number | null;
  usageWindowHours: number | null;
};

export type ParsedAccessRoute = {
  modelName: string;
  providerName: string;
  /** Raw Package cell before route splitting. */
  packageName: string;
  /** One access route after compound split (or the whole known-compound name). */
  routeName: string;
  /** CSV Model ID — access-provider alias, not canonical_id. */
  providerModelId: string;
  avgRequestCost: number | null;
  providerRelativeUsageCost: number | null;
};

export type ParsedQuota = {
  modelName: string;
  providerName: string;
  packageName: string;
  usageWindowHours: number | null;
  fiveHourMin: number | null;
  fiveHourMax: number | null;
  weeklyRequests: number | null;
  monthlyRequests: number | null;
};

export type ParsedPricing = {
  modelName: string;
  providerName: string;
  packageName: string;
  inputPerM: number | null;
  cachedReadPerM: number | null;
  cacheWritePerM: number | null;
  outputPerM: number | null;
  longContextInputPerM: number | null;
  longContextCachedPerM: number | null;
  longContextCacheWritePerM: number | null;
  longContextOutputPerM: number | null;
};

export type ParsedBenchmarkResult = {
  modelName: string;
  /** Stable key matching the CSV header (e.g. "SWE-Bench Pro"). */
  benchmark: string;
  score: number | null;
  /** Shared per-model Benchmark Confidence cell (repeated on each result). */
  confidence: string | null;
};

export type ParsedSkillScore = {
  modelName: string;
  /** Internal skill key used by the migration (e.g. "coding"). */
  skillKey: string;
  /** Human label from SPEC §5.4. */
  skillLabel: string;
  externalScore: number | null;
  externalRank: number | null;
};

export type ParsedSource = {
  modelName: string;
  rosterSource: string | null;
  pricingSource: string | null;
  benchmarkSource: string | null;
  verifiedOn: string | null;
};

export type ParsedMaster = {
  models: ParsedModel[];
  providers: ParsedProvider[];
  plans: ParsedPlan[];
  accessRoutes: ParsedAccessRoute[];
  quotas: ParsedQuota[];
  pricing: ParsedPricing[];
  benchmarkResults: ParsedBenchmarkResult[];
  skillScores: ParsedSkillScore[];
  sources: ParsedSource[];
  warnings: string[];
};
