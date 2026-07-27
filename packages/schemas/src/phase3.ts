import { z } from "zod";
import {
  uuidSchema,
  requiredTrimmedString,
  optionalHttpUrlSchema,
  collectionSchema,
  subscriptionStatusSchema,
  availabilityStatusSchema,
  accessMethodSchema,
  authenticationTypeSchema,
  apiAccessTypeSchema,
  recordStatusSchema,
  usageTrackingModeSchema,
} from "./primitives";

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
};

const booleanQuery = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    return v === "true";
  });

// Inline base schemas to avoid circular dependency via index.ts export * from "./phase3"
export const localSubscriptionWriteSchema = z.object({
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
  usageCheckInstructions: z.string().nullable().optional(),
  importance: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const localSubscriptionResponseSchema = localSubscriptionWriteSchema.extend({
  id: uuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable().optional(),
});

export const localModelAccessWriteSchema = z.object({
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
  isPreferred: z.boolean().optional(),
});

export const localModelAccessResponseSchema = localModelAccessWriteSchema.extend({
  id: uuidSchema,
});

export const localAccessProviderWriteSchema = z.object({
  name: requiredTrimmedString,
  slug: requiredTrimmedString,
  providerType: z.string().nullable().optional(),
  websiteUrl: optionalHttpUrlSchema,
  notes: z.string().nullable().optional(),
});

export const localPlanWriteSchema = z.object({
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
  renewalDate: z.string().date().nullable().optional(),
  billingPeriod: z.string().nullable().optional(),
  autoRenews: z.boolean().nullable().optional(),
  actualPrice: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  startedAt: z.string().date().nullable().optional(),
  cancelledAt: z.string().date().nullable().optional(),
  introPriceExpiresAt: z.string().date().nullable().optional(),
  accessType: z
    .enum([
      "subscription",
      "api",
      "free_tier",
      "trial",
      "open_weights",
      "local",
      "included",
    ])
    .nullable()
    .optional(),
});

export const usageSourceSchema = z.enum([
  "mock",
  "manual",
  "estimated",
  "provider_reported",
]);

// ── Plan summary ───────────────────────────────────────────────

export const planSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  accessProviderId: uuidSchema,
  accessProviderName: z.string(),
  accessProviderSlug: z.string(),
});

// ── Usage snapshots ────────────────────────────────────────────

export const usageSnapshotResponseSchema = z.object({
  id: uuidSchema,
  subscriptionId: uuidSchema,
  modelId: uuidSchema.nullable().optional(),
  modelName: z.string().nullable().optional(),
  source: usageSourceSchema,
  isMock: z.boolean(),
  periodLabel: z.string().nullable().optional(),
  periodStart: z.string().datetime().nullable().optional(),
  periodEnd: z.string().datetime().nullable().optional(),
  usedAmount: z.number().nullable().optional(),
  remainingAmount: z.number().nullable().optional(),
  totalAmount: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  usedPercent: z.number().nullable().optional(),
  confidence: z.number().nullable().optional(),
  capturedAt: z.string().datetime(),
});

// ── Subscription limit rules ───────────────────────────────────

export const subscriptionLimitRuleWriteSchema = z.object({
  subscriptionId: uuidSchema,
  name: requiredTrimmedString,
  limitType: requiredTrimmedString,
  amountMin: z.preprocess(emptyToNull, z.number().nullable().optional()),
  amountMax: z.preprocess(emptyToNull, z.number().nullable().optional()),
  unit: z.preprocess(emptyToNull, z.string().nullable().optional()),
  periodMinutes: z.preprocess(emptyToNull, z.number().int().nullable().optional()),
  resetStrategy: z.preprocess(emptyToNull, z.string().nullable().optional()),
  appliesTo: z.preprocess(emptyToNull, z.string().nullable().optional()),
  includedCredit: z.preprocess(emptyToNull, z.boolean().nullable().optional()),
  notes: z.preprocess(emptyToNull, z.string().nullable().optional()),
  rawText: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

export const subscriptionLimitRuleResponseSchema = subscriptionLimitRuleWriteSchema.extend({
  id: uuidSchema,
  status: z.string().default("active"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Subscription detail ────────────────────────────────────────

export const subscriptionDetailResponseSchema = localSubscriptionResponseSchema.extend({
  cancelledAt: z.string().date().nullable().optional(),
  privateNotes: z.string().nullable().optional(),
  plan: planSummarySchema,
  usageSnapshots: z.array(usageSnapshotResponseSchema).optional(),
  limitRules: z.array(subscriptionLimitRuleResponseSchema).optional(),
});

// ── Subscription list query ────────────────────────────────────

export const subscriptionListQuerySchema = z.object({
  search: z.string().optional(),
  status: subscriptionStatusSchema.optional(),
  accessProvider: z.string().optional(),
  plan: z.string().optional(),
  archived: booleanQuery,
  sort: z.string().optional().default("accountLabel"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  page: z.coerce.number().int().min(1).optional(),
});

// ── Access provider response ───────────────────────────────────

export const accessProviderResponseSchema = localAccessProviderWriteSchema.extend({
  id: uuidSchema,
  status: recordStatusSchema.default("active"),
  archivedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Plan response ──────────────────────────────────────────────

export const planResponseSchema = localPlanWriteSchema.extend({
  id: uuidSchema,
  accessProvider: z.object({
    id: uuidSchema,
    name: z.string(),
    slug: z.string(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Model access detail ────────────────────────────────────────

export const modelAccessDetailResponseSchema = localModelAccessResponseSchema.extend({
  model: z.object({
    id: uuidSchema,
    name: z.string(),
    canonicalId: z.string(),
    slug: z.string(),
  }),
  plan: planSummarySchema,
});

// ── Model access list query ────────────────────────────────────

export const modelAccessListQuerySchema = z.object({
  modelId: uuidSchema.optional(),
  planId: uuidSchema.optional(),
  accessProvider: z.string().optional(),
  availability: availabilityStatusSchema.optional(),
  accessMethod: accessMethodSchema.optional(),
  cliOnly: booleanQuery,
  webOnly: booleanQuery,
  apiCompatible: booleanQuery,
  archived: booleanQuery,
  sort: z.string().optional().default("modelName"),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

// ── Access matrix ──────────────────────────────────────────────

export const accessMatrixRowSchema = z.object({
  modelId: uuidSchema,
  modelName: z.string(),
  canonicalId: z.string(),
  slug: z.string(),
  developerName: z.string().nullable(),
  access: z.array(
    z.object({
      accessId: uuidSchema,
      planId: uuidSchema,
      planName: z.string(),
      accessProviderName: z.string(),
      accessProviderSlug: z.string(),
      availability: availabilityStatusSchema,
      accessMethod: accessMethodSchema,
      authenticationType: authenticationTypeSchema,
      apiAccessType: apiAccessTypeSchema,
      cliOnly: z.boolean(),
      webOnly: z.boolean(),
      apiCompatible: z.boolean().nullable(),
      includedInPlan: z.boolean().nullable(),
      providerModelId: z.string().nullable(),
      priority: z.number().int().nullable(),
    }),
  ),
});

export const accessMatrixCollectionSchema = collectionSchema(accessMatrixRowSchema);
