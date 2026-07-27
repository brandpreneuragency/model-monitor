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

export const updatePlanQuotaSchema = createPlanQuotaSchema
  .omit({ planId: true })
  .partial();

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

// ── Model redesign fields ──────────────────────────────────────

export const modelWorkflowFieldsSchema = z.object({
  isFavourite: z.boolean(),
  needsReview: z.boolean(),
  workflowStatus: workflowStatusSchema.nullable(),
});
