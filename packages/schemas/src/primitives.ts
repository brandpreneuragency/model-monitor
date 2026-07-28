import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────

export const recordStatusSchema = z.enum(["active", "archived"]);
export const subscriptionStatusSchema = z.enum([
  "active",
  "paused",
  "cancelled",
  "expired",
  "trial",
  "archived",
]);
export const lifecycleStatusSchema = z.enum([
  "current",
  "ga",
  "preview",
  "beta",
  "legacy",
  "deprecated",
  "retired",
  "unavailable",
  "unknown",
]);
export const availabilityStatusSchema = z.enum([
  "confirmed",
  "unconfirmed",
  "unavailable",
  "removed",
]);
export const accessMethodSchema = z.enum([
  "oauth",
  "provider_api",
  "direct_api",
  "cli",
  "consumer_app",
  "web",
  "self_hosted",
  "other",
]);
export const authenticationTypeSchema = z.enum([
  "oauth_subscription",
  "api_key",
  "consumer_subscription",
  "cli_session",
  "none",
  "other",
]);
export const apiAccessTypeSchema = z.enum([
  "included",
  "separate_billing",
  "restricted_provider_api",
  "none_included",
  "none",
  "unknown",
]);
export const usageTrackingModeSchema = z.enum([
  "manual",
  "mock",
  "estimated",
  "provider_reported",
  "hybrid",
]);
export const sourceTypeSchema = z.enum([
  "official_docs",
  "official_model_card",
  "official_pricing",
  "benchmark_report",
  "vendor_blog",
  "third_party",
  "workbook",
  "manual",
  "other",
]);
export const auditActionSchema = z.enum([
  "create",
  "update",
  "archive",
  "restore",
  "merge",
  "import",
  "export",
  "token_create",
  "token_revoke",
  "settings_change",
  "delete",
]);
export const aliasTypeSchema = z.enum([
  "display",
  "short",
  "provider",
  "legacy",
  "other",
]);

/** Tri-state capability: true | false | null (unknown). Never coerce null → false. */
export const triStateBooleanSchema = z.boolean().nullable();

export const modelCapabilityKeys = [
  "vision",
  "reasoning",
  "toolUse",
  "parallelAgents",
  "computerUse",
  "audioInput",
  "videoInput",
  "imageInput",
  "structuredOutput",
  "functionCalling",
] as const;

export type ModelCapabilityKey = (typeof modelCapabilityKeys)[number];

// ── Shared primitives ──────────────────────────────────────────

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
};

/** Trim string; reject whitespace-only for required fields. */
export const requiredTrimmedString = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, { message: "Required" });

export const uuidSchema = z.string().uuid();

export const pathUuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

/**
 * HTTP(S) URLs only. Rejects javascript:, data:, and other schemes.
 * z.string().url() alone accepts those — do not use it for user-facing links.
 */
export const httpUrlSchema = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid URL" });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL must use http or https",
      });
    }
  });

export const optionalHttpUrlSchema = z.preprocess(
  emptyToNull,
  httpUrlSchema.nullable().optional(),
);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1, "Idempotency-Key is required")
  .max(128, "Idempotency-Key must be at most 128 characters");

export const modelCapabilitiesWriteSchema = z.object({
  vision: triStateBooleanSchema.optional(),
  reasoning: triStateBooleanSchema.optional(),
  toolUse: triStateBooleanSchema.optional(),
  parallelAgents: triStateBooleanSchema.optional(),
  computerUse: triStateBooleanSchema.optional(),
  audioInput: triStateBooleanSchema.optional(),
  videoInput: triStateBooleanSchema.optional(),
  imageInput: triStateBooleanSchema.optional(),
  structuredOutput: triStateBooleanSchema.optional(),
  functionCalling: triStateBooleanSchema.optional(),
  details: z.record(z.unknown()).optional(),
});

export const modelAliasWriteSchema = z.object({
  alias: requiredTrimmedString,
  aliasType: aliasTypeSchema.default("display"),
  accessProviderId: z.preprocess(
    emptyToNull,
    uuidSchema.nullable().optional(),
  ),
});

// ── Model write schema ─────────────────────────────────────────
// Only `name` is required to create a model (SPEC / AGENTS incomplete-record rule).

export const workflowStatusValueSchema = z.enum([
  "active",
  "preferred",
  "testing",
  "preview",
  "legacy",
  "deprecated",
  "archived",
]);

export const modelWriteSchema = z.object({
  name: requiredTrimmedString,
  canonicalId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    requiredTrimmedString.optional(),
  ),
  developerId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    uuidSchema.optional(),
  ),
  family: z.preprocess(emptyToNull, z.string().nullable().optional()),
  generation: z.preprocess(emptyToNull, z.string().nullable().optional()),
  lifecycle: lifecycleStatusSchema.default("unknown"),
  lifecycleRaw: z.preprocess(emptyToNull, z.string().nullable().optional()),
  releaseDate: z.preprocess(emptyToNull, z.string().date().nullable().optional()),
  knowledgeCutoff: z.preprocess(emptyToNull, z.string().nullable().optional()),
  modelType: z.preprocess(emptyToNull, z.string().nullable().optional()),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  codingSpecialization: z.preprocess(emptyToNull, z.string().nullable().optional()),
  bestUse: z.preprocess(emptyToNull, z.string().nullable().optional()),
  avoidFor: z.preprocess(emptyToNull, z.string().nullable().optional()),
  contextTokens: z.number().int().nonnegative().nullable().optional(),
  maxOutputTokens: z.number().int().nonnegative().nullable().optional(),
  speedRating: z.preprocess(emptyToNull, z.string().nullable().optional()),
  needsRecheck: z.boolean().default(true),
  isFavourite: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  workflowStatus: workflowStatusValueSchema.nullable().optional(),
  capabilities: modelCapabilitiesWriteSchema.optional(),
  aliases: z.array(modelAliasWriteSchema).optional(),
});

export const modelUpdateSchema = modelWriteSchema.partial().extend({
  canonicalId: requiredTrimmedString.optional(),
  name: requiredTrimmedString.optional(),
  developerId: uuidSchema.optional(),
});

export const modelResponseSchema = modelWriteSchema.extend({
  id: uuidSchema,
  slug: z.string(),
  status: recordStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── List / filter query ────────────────────────────────────────

const booleanQuery = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    return v === "true";
  });

const optionalTrimmed = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.string().optional(),
);

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().optional());

const optionalInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().int().optional());

/**
 * URL-addressable model list filters (brief §7.3 groups).
 * Every filter is a query parameter so filtered views can be linked.
 */
export const modelListQuerySchema = z.object({
  search: optionalTrimmed,
  // Identity / taxonomy
  creator: optionalTrimmed,
  developer: optionalTrimmed, // alias of creator (legacy)
  accessProvider: optionalTrimmed,
  plan: optionalTrimmed,
  subscription: optionalTrimmed, // legacy alias → plan
  accessType: optionalTrimmed,
  family: optionalTrimmed,
  modelType: optionalTrimmed,
  lifecycle: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    lifecycleStatusSchema.optional(),
  ),
  // Status / workflow
  status: optionalTrimmed, // workflow_status or record status convenience
  workflowStatus: optionalTrimmed,
  archived: booleanQuery,
  isFavourite: booleanQuery,
  favourite: booleanQuery, // alias
  // Capabilities
  accessible: booleanQuery,
  vision: booleanQuery,
  reasoning: booleanQuery,
  toolSupport: booleanQuery, // legacy
  toolUse: booleanQuery,
  agent: booleanQuery,
  multimodal: booleanQuery,
  codingSpecialist: booleanQuery,
  longContext: booleanQuery,
  longContextMin: optionalInt,
  // Ratings
  profileId: optionalTrimmed,
  profile: optionalTrimmed, // slug or id
  skillId: optionalTrimmed,
  skill: optionalTrimmed, // slug or id
  personalScoreMin: optionalNumber,
  personalScoreMax: optionalNumber,
  skillScoreMin: optionalNumber,
  skillScoreMax: optionalNumber,
  confidence: optionalTrimmed, // low|medium|high
  rankMin: optionalInt,
  rankMax: optionalInt,
  tested: booleanQuery,
  // Cost / quota convenience flags
  free: booleanQuery,
  subscriptionAccess: booleanQuery,
  api: booleanQuery,
  openWeights: booleanQuery,
  local: booleanQuery,
  unlimited: booleanQuery,
  requestLimited: booleanQuery,
  tokenLimited: booleanQuery,
  pricingKnown: booleanQuery,
  pricingMissing: booleanQuery,
  // Data maintenance
  needsRecheck: booleanQuery,
  needsReview: booleanQuery,
  missingRating: booleanQuery,
  missingCost: booleanQuery,
  missingQuota: booleanQuery,
  recentlyVerified: booleanQuery,
  outdated: booleanQuery,
  verifiedWithinDays: optionalInt,
  outdatedAfterDays: optionalInt,
  // Pagination / sort
  sort: z.string().optional().default("name"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  page: z.coerce.number().int().min(1).optional(),
});

export type ModelListQuery = z.infer<typeof modelListQuerySchema>;

/** Scalar model fields that merge resolutions may set on the target. */
export const modelMergeResolutionKeys = [
  "name",
  "canonicalId",
  "family",
  "generation",
  "lifecycle",
  "lifecycleRaw",
  "releaseDate",
  "knowledgeCutoff",
  "modelType",
  "description",
  "codingSpecialization",
  "bestUse",
  "avoidFor",
  "contextTokens",
  "maxOutputTokens",
  "speedRating",
  "developerId",
] as const;

export type ModelMergeResolutionKey = (typeof modelMergeResolutionKeys)[number];

/** Strict allow-list + value validation; unsupported keys are rejected. */
export const modelMergeResolutionsSchema = z
  .object({
    name: requiredTrimmedString.optional(),
    canonicalId: requiredTrimmedString.optional(),
    family: z.preprocess(emptyToNull, z.string().nullable().optional()),
    generation: z.preprocess(emptyToNull, z.string().nullable().optional()),
    lifecycle: lifecycleStatusSchema.optional(),
    lifecycleRaw: z.preprocess(emptyToNull, z.string().nullable().optional()),
    releaseDate: z.preprocess(emptyToNull, z.string().date().nullable().optional()),
    knowledgeCutoff: z.preprocess(emptyToNull, z.string().nullable().optional()),
    modelType: z.preprocess(emptyToNull, z.string().nullable().optional()),
    description: z.preprocess(emptyToNull, z.string().nullable().optional()),
    codingSpecialization: z.preprocess(emptyToNull, z.string().nullable().optional()),
    bestUse: z.preprocess(emptyToNull, z.string().nullable().optional()),
    avoidFor: z.preprocess(emptyToNull, z.string().nullable().optional()),
    contextTokens: z.number().int().nonnegative().nullable().optional(),
    maxOutputTokens: z.number().int().nonnegative().nullable().optional(),
    speedRating: z.preprocess(emptyToNull, z.string().nullable().optional()),
    developerId: uuidSchema.optional(),
  })
  .strict()
  .optional();

export const modelMergeSchema = z.object({
  sourceModelId: uuidSchema,
  targetModelId: uuidSchema,
  resolutions: modelMergeResolutionsSchema,
});

export const modelScoreWriteSchema = z
  .object({
    methodologyId: uuidSchema,
    scoreType: requiredTrimmedString,
    /** null means unknown/blank — never coerce to 0 */
    scoreValue: z.number().nullable(),
    rankValue: z.number().int().positive().nullable().optional(),
    eligibleCount: z.number().int().positive().nullable().optional(),
    confidence: z.number().min(0).max(100).nullable().optional(),
    isManualOverride: z.boolean().default(false),
    overrideReason: z.string().nullable().optional(),
    calculatedAt: z.string().datetime().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.isManualOverride && (!val.overrideReason || val.overrideReason.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Manual override requires a reason",
        path: ["overrideReason"],
      });
    }
  });

export const sourceWriteSchema = z.object({
  sourceType: sourceTypeSchema,
  url: optionalHttpUrlSchema,
  title: z.preprocess(emptyToNull, z.string().nullable().optional()),
  publisher: z.preprocess(emptyToNull, z.string().nullable().optional()),
  notes: z.preprocess(emptyToNull, z.string().nullable().optional()),
  verifiedAt: z.preprocess(emptyToNull, z.string().datetime().nullable().optional()),
});

// ── Subscription write schema ──────────────────────────────────

export const subscriptionWriteSchema = z.object({
  planId: uuidSchema,
  accountLabel: requiredTrimmedString,
  status: subscriptionStatusSchema.default("active"),
  startedAt: z.string().date().nullable().optional(),
  nextBillingDate: z.string().date().nullable().optional(),
  autoRenews: z.boolean().nullable().optional(),
  actualPrice: z.number().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  billingInterval: z.string().nullable().optional(),
  usageTrackingMode: usageTrackingModeSchema.default("manual"),
  usageCheckUrl: optionalHttpUrlSchema,
  usageCheckInstructions: z.preprocess(emptyToNull, z.string().nullable().optional()),
  importance: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

export const subscriptionResponseSchema = subscriptionWriteSchema.extend({
  id: uuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Model access write schema ──────────────────────────────────

export const modelAccessWriteSchema = z.object({
  modelId: uuidSchema,
  planId: uuidSchema,
  providerModelId: z.string().nullable().optional(),
  availability: availabilityStatusSchema.default("unconfirmed"),
  accessMethod: accessMethodSchema,
  authenticationType: authenticationTypeSchema.default("other"),
  includedInPlan: z.boolean().nullable().optional(),
  apiCompatible: z.boolean().nullable().optional(),
  cliOnly: z.boolean().default(false),
  webOnly: z.boolean().default(false),
  oauthSupported: z.boolean().nullable().optional(),
  priority: z.number().int().nullable().optional(),
  limitations: z.string().nullable().optional(),
});

export const modelAccessResponseSchema = modelAccessWriteSchema.extend({
  id: uuidSchema,
});

// ── Developer write schema ─────────────────────────────────────

export const developerWriteSchema = z.object({
  name: requiredTrimmedString,
  slug: requiredTrimmedString,
  websiteUrl: optionalHttpUrlSchema,
  notes: z.string().nullable().optional(),
});

// ── Access provider write schema ───────────────────────────────

export const accessProviderWriteSchema = z.object({
  name: requiredTrimmedString,
  slug: requiredTrimmedString,
  providerType: z.string().nullable().optional(),
  websiteUrl: optionalHttpUrlSchema,
  notes: z.string().nullable().optional(),
});

// ── Plan write schema ──────────────────────────────────────────

export const planWriteSchema = z.object({
  accessProviderId: uuidSchema,
  name: requiredTrimmedString,
  slug: requiredTrimmedString,
  planType: z.string().nullable().optional(),
  regularPrice: z.number().nullable().optional(),
  introductoryPrice: z.number().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  billingInterval: z.string().nullable().optional(),
  apiAccessType: apiAccessTypeSchema.default("unknown"),
  authenticationType: authenticationTypeSchema.default("other"),
  usageMeasurementType: z.string().nullable().optional(),
  termsSummary: z.string().nullable().optional(),
});

// ── API error schema ───────────────────────────────────────────

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    fieldErrors: z.record(z.array(z.string())).optional(),
  }),
});

// ── Collection response helper ─────────────────────────────────

export const collectionSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    page: z.object({
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
      total: z.number().int().optional(),
      page: z.number().int().optional(),
      pageSize: z.number().int().optional(),
    }),
    meta: z
      .object({
        requestId: z.string(),
      })
      .optional(),
  });

// ── Domain helpers (pure) ──────────────────────────────────────

/** Normalize alias for uniqueness / search matching. */
export function normalizeAlias(alias: string): string {
  return alias.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Slugify a model name for URL convenience fields. */
export function slugifyModelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Format a score for display. Blank/null never becomes "0".
 * Verified numeric zero remains "0".
 */
export function formatScoreDisplay(
  scoreValue: number | string | null | undefined,
): string {
  if (scoreValue === null || scoreValue === undefined || scoreValue === "") {
    return "—";
  }
  const n = typeof scoreValue === "number" ? scoreValue : Number(scoreValue);
  if (Number.isNaN(n)) return "—";
  return String(n);
}

/**
 * Format capability tri-state for UI.
 * unknown (null) is never shown as false/unsupported.
 */
export function formatCapabilityDisplay(
  value: boolean | null | undefined,
): "yes" | "no" | "unknown" {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

/** Parse loose capability labels from imports without coercing unknown → false. */
export function parseTriState(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") {
    if (raw === 1) return true;
    if (raw === 0) return false;
    return null;
  }
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "unknown" || v === "n/a" || v === "na" || v === "?") {
    return null;
  }
  if (["true", "yes", "y", "1", "supported", "full"].includes(v)) return true;
  if (["false", "no", "n", "0", "unsupported", "none"].includes(v)) return false;
  return null;
}

export type ModelSortField =
  | "name"
  | "developer"
  | "creator"
  | "family"
  | "lifecycle"
  | "context"
  | "updatedAt"
  | "verifiedAt"
  | "overallScore"
  | "speed"
  | "workflowStatus"
  | "capability"
  | "balanced"
  | "value";

export function parseSortParam(sort: string | undefined): {
  field: ModelSortField;
  direction: "asc" | "desc";
} {
  const raw = (sort ?? "name").trim();
  const direction: "asc" | "desc" = raw.startsWith("-") ? "desc" : "asc";
  const key = raw.replace(/^-/, "").replace(/^scores\./, "");
  const allowed: ModelSortField[] = [
    "name",
    "developer",
    "creator",
    "family",
    "lifecycle",
    "context",
    "updatedAt",
    "verifiedAt",
    "overallScore",
    "speed",
    "workflowStatus",
    "capability",
    "balanced",
    "value",
  ];
  const field = (allowed.includes(key as ModelSortField) ? key : "name") as ModelSortField;
  return { field, direction };
}

/**
 * Plan alias transfers for merge: drop source aliases that collide with target
 * after normalization.
 */
export function planAliasMerge(
  targetNormalized: string[],
  sourceAliases: Array<{ alias: string; normalizedAlias: string }>,
): {
  transfer: Array<{ alias: string; normalizedAlias: string }>;
  skippedDuplicates: string[];
} {
  const existing = new Set(targetNormalized.map((a) => a.toLowerCase()));
  const transfer: Array<{ alias: string; normalizedAlias: string }> = [];
  const skippedDuplicates: string[] = [];
  for (const row of sourceAliases) {
    const key = row.normalizedAlias.toLowerCase();
    if (existing.has(key)) {
      skippedDuplicates.push(row.alias);
      continue;
    }
    existing.add(key);
    transfer.push(row);
  }
  return { transfer, skippedDuplicates };
}

/**
 * Access merge key: model already on target plan+providerModelId should not
 * create a second row when source is merged in.
 */
export function accessMergeKey(row: {
  planId: string;
  providerModelId: string | null;
}): string {
  return `${row.planId}::${row.providerModelId ?? ""}`;
}

export function planAccessMerge(
  targetKeys: string[],
  sourceRows: Array<{ id: string; planId: string; providerModelId: string | null }>,
): { transferIds: string[]; skippedDuplicateIds: string[] } {
  const existing = new Set([...targetKeys].sort());
  const transferIds: string[] = [];
  const skippedDuplicateIds: string[] = [];
  // Stable ID tie-break: the first source row wins, including source-only
  // duplicate keys. The service promotes that winner into its target map.
  for (const row of [...sourceRows].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = accessMergeKey(row);
    if (existing.has(key)) {
      skippedDuplicateIds.push(row.id);
      continue;
    }
    existing.add(key);
    transferIds.push(row.id);
  }
  return { transferIds, skippedDuplicateIds };
}

/**
 * Capability merge policy:
 * - target non-null values win explicit conflicts
 * - source-known (non-null) values fill target unknowns
 * - details objects are shallow-merged with target keys winning on conflict
 */
export function mergeCapabilities(
  target: Record<string, unknown> | null | undefined,
  source: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const t = target ?? {};
  const s = source ?? {};
  const out: Record<string, unknown> = { ...t };
  for (const key of modelCapabilityKeys) {
    const tv = t[key];
    const sv = s[key];
    if ((tv === null || tv === undefined) && sv !== null && sv !== undefined) {
      out[key] = sv;
    } else if (tv !== undefined) {
      out[key] = tv;
    } else if (sv !== undefined) {
      out[key] = sv;
    }
  }
  const tDetails =
    t.details && typeof t.details === "object" && !Array.isArray(t.details)
      ? (t.details as Record<string, unknown>)
      : {};
  const sDetails =
    s.details && typeof s.details === "object" && !Array.isArray(s.details)
      ? (s.details as Record<string, unknown>)
      : {};
  out.details = { ...sDetails, ...tDetails };
  return out;
}

/**
 * Sensitive key matcher for log redaction (case-insensitive).
 * Covers required names and common separators/variants:
 * password, secret, token, authorization, cookie, apiKey, clientSecret, privateKey.
 */
const SENSITIVE_KEY_RE =
  /^(passwords?|passwd|secrets?|tokens?|authorizations?|cookies?|api[_-]?keys?|client[_-]?secrets?|private[_-]?keys?|access[_-]?tokens?|refresh[_-]?tokens?|id[_-]?tokens?|bearer)$/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key.trim());
}

/**
 * Recursively redact sensitive keys from arbitrary metadata.
 * Cycle-safe. Never includes raw Error.message (may embed DSN/token values).
 */
export function redactSensitive<T>(value: T, depth = 0, seen?: WeakSet<object>): T {
  if (depth > 20) return "[MaxDepth]" as T;
  if (value == null) return value;

  const tracker = seen ?? new WeakSet<object>();

  if (Array.isArray(value)) {
    if (tracker.has(value)) return "[Circular]" as T;
    tracker.add(value);
    const items: unknown[] = value;
    const next: unknown[] = items.map((item) => redactSensitive(item, depth + 1, tracker));
    return next as T;
  }

  if (value instanceof Error) {
    if (tracker.has(value)) return "[Circular]" as T;
    tracker.add(value);
    const maybeCode: unknown = Reflect.get(value, "code");
    // Categorical fields only — never raw message text.
    const safe: Record<string, unknown> = { name: value.name };
    if (typeof maybeCode === "string") safe.code = maybeCode;
    return safe as T;
  }

  if (typeof value === "object") {
    const obj: object = value;
    if (tracker.has(obj)) return "[Circular]" as T;
    tracker.add(obj);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactSensitive(v, depth + 1, tracker);
      }
    }
    return out as T;
  }
  return value;
}
