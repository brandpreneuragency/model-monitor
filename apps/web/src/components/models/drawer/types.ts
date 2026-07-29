/** Shared shapes for the model details drawer (five tabs). */

export type DrawerTag = {
  id?: string;
  name: string;
  slug?: string;
  color?: string | null;
};

export type DrawerCapabilities = {
  vision?: boolean | null;
  reasoning?: boolean | null;
  toolUse?: boolean | null;
  parallelAgents?: boolean | null;
  computerUse?: boolean | null;
  audioInput?: boolean | null;
  videoInput?: boolean | null;
  imageInput?: boolean | null;
  structuredOutput?: boolean | null;
  functionCalling?: boolean | null;
  details?: unknown;
  display?: {
    vision?: string;
    reasoning?: string;
    toolUse?: string;
  };
} | null;

export type DrawerModel = {
  id: string;
  name: string;
  canonicalId?: string | null;
  slug?: string | null;
  isFavourite?: boolean | null;
  workflowStatus?: string | null;
  status?: string | null;
  lifecycle?: string | null;
  family?: string | null;
  generation?: string | null;
  releaseDate?: string | null;
  knowledgeCutoff?: string | null;
  modelType?: string | null;
  description?: string | null;
  bestUse?: string | null;
  avoidFor?: string | null;
  /** Personal notes when present; falls back to description in UI. */
  personalNotes?: string | null;
  contextTokens?: number | null;
  context?: number | null;
  maxOutputTokens?: number | null;
  speedRating?: string | null;
  speed?: string | null;
  overallScore?: number | null;
  scoreBasis?: string | null;
  verificationStatus?: string | null;
  needsRecheck?: boolean | null;
  needsReview?: boolean | null;
  developerName?: string | null;
  developerSlug?: string | null;
  creator?: {
    id?: string | null;
    name?: string | null;
    slug?: string | null;
  } | null;
  capabilities?: DrawerCapabilities;
  tags?: DrawerTag[];
  codingSpecialization?: string | null;
};

export type DrawerAccessRoute = {
  id: string;
  modelId?: string;
  planId?: string;
  providerModelId?: string | null;
  availability?: string | null;
  accessMethod?: string | null;
  accessType?: string | null;
  authenticationType?: string | null;
  includedInPlan?: boolean | null;
  apiCompatible?: boolean | null;
  cliOnly?: boolean | null;
  webOnly?: boolean | null;
  limitations?: string | null;
  notes?: string | null;
  isPreferred?: boolean | null;
  status?: string | null;
  providerName?: string | null;
  providerSlug?: string | null;
  planName?: string | null;
  planSlug?: string | null;
  /** Human pricing summary (token or plan). */
  pricingSummary?: string | null;
  /** Human quota summary from the plan. */
  quotaSummary?: string | null;
  plan?: {
    id?: string;
    name?: string | null;
    slug?: string | null;
    accessType?: string | null;
    accessProviderName?: string | null;
    accessProviderSlug?: string | null;
    monthlyCost?: number | null;
    regularPrice?: number | null;
    currency?: string | null;
    billingInterval?: string | null;
  } | null;
};

export type DrawerSkillRating = {
  id?: string | null;
  skillId: string;
  skillName: string;
  skillSlug?: string | null;
  personalScore: number | null;
  personalConfidence: "low" | "medium" | "high" | null;
  externalScore: number | null;
  externalRank: number | null;
  externalConfidence: number | null;
  rankOverride?: number | null;
  tested: boolean;
  /** Ranking position label, e.g. "7th" or null when unknown. */
  rankingPosition?: string | null;
  notes?: string | null;
};

export type DrawerBenchmark = {
  id: string;
  benchmarkName: string;
  category?: string | null;
  comparableGroup?: string | null;
  setting?: string | null;
  harness?: string | null;
  score?: number | null;
  scoreDisplay?: string | null;
  scoreUnit?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  verifiedAt?: string | null;
  notes?: string | null;
};

export type DrawerSource = {
  id: string;
  sourceType?: string | null;
  url?: string | null;
  title?: string | null;
  publisher?: string | null;
  verifiedAt?: string | null;
  notes?: string | null;
};

export type ModelDrawerData = {
  model: DrawerModel;
  accessRoutes: DrawerAccessRoute[];
  ratings: DrawerSkillRating[];
  benchmarks: DrawerBenchmark[];
  sources: DrawerSource[];
};

export const DRAWER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "access", label: "Access & Cost" },
  { id: "rankings", label: "Rankings" },
  { id: "specifications", label: "Specifications" },
  { id: "research", label: "Research" },
] as const;

export type DrawerTabId = (typeof DRAWER_TABS)[number]["id"];
