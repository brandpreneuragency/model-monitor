import { z } from "zod";

// ── Enums (SPEC §4.1 / §4.2) ───────────────────────────────────

export const accessTypeSchema = z.enum([
  "subscription",
  "api",
  "free_tier",
  "trial",
  "open_weights",
  "local",
  "included",
]);

export const workflowStatusSchema = z.enum([
  "active",
  "preferred",
  "testing",
  "preview",
  "legacy",
  "deprecated",
  "archived",
]);

export const quotaUnitSchema = z.enum([
  "requests",
  "tokens",
  "credits",
  "dollars",
  "images",
  "videos",
  "compute_hours",
  "unlimited",
  "custom",
]);

export const quotaPeriodSchema = z.enum([
  "hourly",
  "five_hour_window",
  "daily",
  "weekly",
  "monthly",
  "billing_cycle",
  "one_time",
  "sliding_window",
  "custom",
]);

// ── Plan quotas ────────────────────────────────────────────────

export const planQuotaSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  amount: z.number().nullable(),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  unit: quotaUnitSchema,
  customUnit: z.string().max(120).nullable(),
  period: quotaPeriodSchema,
  resetBehaviour: z.string().max(500).nullable(),
  remainingAmount: z.number().nullable(),
  remainingUpdatedAt: z.string().datetime().nullable(),
  resetsAt: z.string().date().nullable(),
  isUnlimited: z.boolean(),
  notes: z.string().max(8000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createPlanQuotaSchema = z.object({
  planId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  amount: z.number().nullable().optional(),
  amountMin: z.number().nullable().optional(),
  amountMax: z.number().nullable().optional(),
  unit: quotaUnitSchema,
  customUnit: z.string().max(120).nullable().optional(),
  period: quotaPeriodSchema,
  resetBehaviour: z.string().max(500).nullable().optional(),
  remainingAmount: z.number().nullable().optional(),
  remainingUpdatedAt: z.string().datetime().nullable().optional(),
  resetsAt: z.string().date().nullable().optional(),
  isUnlimited: z.boolean().optional(),
  notes: z.string().max(8000).nullable().optional(),
});

/** Nested POST /plans/:planId/quotas — planId comes from the path. */
export const createPlanQuotaBodySchema = createPlanQuotaSchema.omit({ planId: true });

export const updatePlanQuotaSchema = createPlanQuotaSchema
  .omit({ planId: true })
  .partial();

/** High-frequency remaining-only write. */
export const patchQuotaRemainingSchema = z
  .object({
    remainingAmount: z.number().nullable(),
  })
  .strict();

// ── Plan billing fields (absorbed from subscriptions) ──────────

export const planBillingFieldsSchema = z.object({
  renewalDate: z.string().date().nullable(),
  billingPeriod: z.string().max(80).nullable(),
  autoRenews: z.boolean().nullable(),
  actualPrice: z.number().nullable(),
  notes: z.string().max(8000).nullable(),
  startedAt: z.string().date().nullable(),
  cancelledAt: z.string().date().nullable(),
  introPriceExpiresAt: z.string().date().nullable(),
  accessType: accessTypeSchema.nullable(),
});

// ── Renewals ───────────────────────────────────────────────────

export const renewalKindSchema = z.enum([
  "subscription_renewal",
  "trial_expiration",
  "promotional_price_expiration",
  "manual_review",
]);

export const renewalItemSchema = z.object({
  kind: renewalKindSchema,
  date: z.string().date(),
  entityType: z.enum(["plan", "model"]),
  entityId: z.string().uuid(),
  title: z.string(),
  subtitle: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  provider: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable(),
});

export const renewalsListQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  kind: renewalKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

// ── Model redesign fields ──────────────────────────────────────

export const modelWorkflowFieldsSchema = z.object({
  isFavourite: z.boolean(),
  needsReview: z.boolean(),
  workflowStatus: workflowStatusSchema.nullable(),
});
