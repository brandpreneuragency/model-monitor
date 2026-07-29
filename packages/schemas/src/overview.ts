import { z } from "zod";
import { accessTypeSchema, quotaPeriodSchema, quotaUnitSchema } from "./plans-models";

// ── Scatter axes ───────────────────────────────────────────────

export const overviewScatterAxisSchema = z.enum([
  "capability",
  "cost",
  "price",
  "personalScore",
  "personal-score",
  "coding",
  "speed",
  "context",
  "value",
]);

export const overviewScatterQuerySchema = z.object({
  x: overviewScatterAxisSchema,
  y: overviewScatterAxisSchema,
  provider: z.string().min(1).optional(),
  providerId: z.string().uuid().optional(),
  plan: z.string().min(1).optional(),
  planId: z.string().uuid().optional(),
  modelType: z.string().min(1).optional(),
  accessType: accessTypeSchema.optional(),
});

export const overviewRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ── Response fragments (documentation / client contracts) ──────

export const sparklineSeriesSchema = z.array(z.number()).nullable();

export const overviewSummaryMetricSchema = z.object({
  value: z.number().int(),
  trend: sparklineSeriesSchema,
  /** Optional human sub-label (e.g. monthly delta or monthly cost). */
  subtitle: z.string().nullable().optional(),
});

export const overviewSummarySchema = z.object({
  activeModels: overviewSummaryMetricSchema,
  providers: overviewSummaryMetricSchema.extend({
    active: z.number().int().optional(),
  }),
  paidPlans: overviewSummaryMetricSchema.extend({
    monthlyTotal: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
  }),
  needsReview: overviewSummaryMetricSchema,
});

export const overviewAccessCardSchema = z.object({
  planId: z.string().uuid(),
  planName: z.string(),
  planSlug: z.string(),
  status: z.string(),
  monthlyCost: z.number().nullable(),
  currency: z.string().nullable(),
  availableModels: z.number().int(),
  provider: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().nullable(),
    colour: z.string().nullable(),
  }),
  mainQuota: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      amount: z.number().nullable(),
      remainingAmount: z.number().nullable(),
      unit: quotaUnitSchema,
      period: quotaPeriodSchema,
      resetsAt: z.string().nullable(),
      resetBehaviour: z.string().nullable(),
      isUnlimited: z.boolean(),
    })
    .nullable(),
  accessType: accessTypeSchema.nullable(),
});

export const overviewSkillLeaderSchema = z.object({
  rank: z.number().int(),
  model: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    creator: z
      .object({
        id: z.string().uuid(),
        name: z.string(),
        slug: z.string(),
      })
      .nullable(),
  }),
  personalScore: z.number().nullable(),
  externalScore: z.number().nullable(),
  overallScore: z.number().nullable(),
  scoreBasis: z.enum(["personal", "external", "mixed"]).nullable(),
  pinned: z.boolean(),
  rankOverride: z.number().int().nullable(),
});

export const overviewSkillCategorySchema = z.object({
  key: z.string(),
  label: z.string(),
  skillId: z.string().uuid().nullable(),
  skillSlug: z.string().nullable(),
  profileId: z.string().uuid().nullable(),
  profileSlug: z.string().nullable(),
  leaders: z.array(overviewSkillLeaderSchema),
});

export const overviewProviderDistributionItemSchema = z.object({
  providerId: z.string().uuid(),
  providerName: z.string(),
  providerSlug: z.string(),
  logoUrl: z.string().nullable(),
  colour: z.string().nullable(),
  /** Active model_access rows for this provider (not distinct models). */
  modelCount: z.number().int(),
});

export const overviewScatterPointSchema = z.object({
  modelId: z.string().uuid(),
  modelName: z.string(),
  modelSlug: z.string(),
  x: z.number(),
  y: z.number(),
  provider: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable(),
  modelType: z.string().nullable(),
});

export const overviewQuotaItemSchema = z.object({
  planId: z.string().uuid(),
  planName: z.string(),
  planSlug: z.string(),
  provider: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().nullable(),
    colour: z.string().nullable(),
  }),
  quotas: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      /** Documented maximum. */
      amount: z.number().nullable(),
      amountMin: z.number().nullable(),
      amountMax: z.number().nullable(),
      remainingAmount: z.number().nullable(),
      remainingUpdatedAt: z.string().nullable(),
      unit: quotaUnitSchema,
      customUnit: z.string().nullable(),
      period: quotaPeriodSchema,
      resetsAt: z.string().nullable(),
      resetBehaviour: z.string().nullable(),
      isUnlimited: z.boolean(),
    }),
  ),
});

export const overviewRecentEntityTypeSchema = z.enum([
  "model",
  "provider",
  "plan",
  "quota",
  "rating",
]);

export const overviewRecentItemSchema = z.object({
  entityType: overviewRecentEntityTypeSchema,
  entityId: z.string().uuid(),
  title: z.string(),
  subtitle: z.string().nullable(),
  updatedAt: z.string().datetime(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type OverviewScatterQuery = z.infer<typeof overviewScatterQuerySchema>;
export type OverviewSummary = z.infer<typeof overviewSummarySchema>;
export type OverviewAccessCard = z.infer<typeof overviewAccessCardSchema>;
export type OverviewSkillCategory = z.infer<typeof overviewSkillCategorySchema>;
export type OverviewProviderDistributionItem = z.infer<
  typeof overviewProviderDistributionItemSchema
>;
export type OverviewScatterPoint = z.infer<typeof overviewScatterPointSchema>;
export type OverviewQuotaItem = z.infer<typeof overviewQuotaItemSchema>;
export type OverviewRecentItem = z.infer<typeof overviewRecentItemSchema>;
