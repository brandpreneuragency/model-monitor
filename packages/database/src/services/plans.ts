import { and, asc, eq, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type {
  accessProviderResponseSchema,
  planQuotaSchema,
  planResponseSchema,
  renewalItemSchema,
} from "@model-monitor/schemas";
import {
  accessProviderWriteSchema,
  createPlanQuotaBodySchema,
  createPlanQuotaSchema,
  planWriteSchema,
  renewalsListQuerySchema,
  updatePlanQuotaSchema,
} from "@model-monitor/schemas";
import * as schema from "../schema/index";
import type { AuditContext, Db, DbOrTx } from "./audit";
import {
  writeAudit,
  ModelServiceError,
  jsonSafe,
  asNumber,
} from "./audit";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type ProviderResponse = z.infer<typeof accessProviderResponseSchema>;
type PlanResponse = z.infer<typeof planResponseSchema>;
type QuotaResponse = z.infer<typeof planQuotaSchema>;
type RenewalItem = z.infer<typeof renewalItemSchema>;

// ── List / filter query schemas ────────────────────────────────

const booleanQuery = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((v: boolean | "true" | "false" | undefined) => {
    if (v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    return v === "true";
  });

const providerFilterSchema = z.object({
  search: z.string().optional(),
  archived: booleanQuery,
  providerType: z.string().optional(),
});

const planFilterSchema = z.object({
  accessProviderId: z.string().uuid().optional(),
  accessProviderSlug: z.string().optional(),
  search: z.string().optional(),
  archived: booleanQuery,
  accessType: z.string().optional(),
  status: z.string().optional(),
});

// ── Helpers ────────────────────────────────────────────────────

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "23505") return true;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && (cause as { code?: string }).code === "23505") {
    return true;
  }
  const message =
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  return /duplicate key|unique constraint/i.test(message);
}

function requireUuid(value: string, field: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new ModelServiceError("VALIDATION_ERROR", `Invalid ${field}`, 400, {
      [field]: ["Must be a valid UUID"],
    });
  }
  return parsed.data;
}

function toDateString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    // date columns often come back as YYYY-MM-DD or ISO
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Normalize a plan price to approximate monthly USD. */
function monthlyFromPlan(row: {
  regularPrice: string | null;
  actualPrice: string | null;
  billingPeriod: string | null;
  billingInterval: string | null;
}): number | null {
  const raw = asNumber(row.actualPrice) ?? asNumber(row.regularPrice);
  if (raw == null) return null;
  const period = (row.billingPeriod ?? row.billingInterval ?? "monthly").toLowerCase();
  if (period.includes("year") || period === "annual" || period === "yr") return raw / 12;
  if (period.includes("week")) return (raw * 52) / 12;
  if (period.includes("day")) return (raw * 365) / 12;
  if (period.includes("quarter")) return raw / 3;
  return raw;
}

function mapQuotaRow(row: typeof schema.planQuotas.$inferSelect): QuotaResponse {
  return {
    id: row.id,
    planId: row.planId,
    name: row.name,
    amount: asNumber(row.amount),
    amountMin: asNumber(row.amountMin),
    amountMax: asNumber(row.amountMax),
    unit: row.unit,
    customUnit: row.customUnit ?? null,
    period: row.period,
    resetBehaviour: row.resetBehaviour ?? null,
    remainingAmount: asNumber(row.remainingAmount),
    remainingUpdatedAt: toIso(row.remainingUpdatedAt),
    resetsAt: toDateString(row.resetsAt),
    isUnlimited: row.isUnlimited,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapAccessProviderBase(
  row: typeof schema.accessProviders.$inferSelect,
): Omit<
  ProviderResponse,
  "activePlansCount" | "accessibleModelsCount" | "monthlyTotal" | "capabilityTags"
> {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    providerType: row.providerType ?? null,
    websiteUrl: row.websiteUrl ?? null,
    logoUrl: row.logoUrl ?? null,
    colour: row.colour ?? null,
    notes: row.notes ?? null,
    status: row.status as "active" | "archived",
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type PlanJoinRow = {
  id: string;
  accessProviderId: string;
  name: string;
  slug: string;
  planType: string | null;
  regularPrice: string | null;
  introductoryPrice: string | null;
  currency: string | null;
  billingInterval: string | null;
  apiAccessType: (typeof schema.plans.$inferSelect)["apiAccessType"];
  authenticationType: (typeof schema.plans.$inferSelect)["authenticationType"];
  usageMeasurementType: string | null;
  termsSummary: string | null;
  status: string;
  archivedAt: Date | null;
  renewalDate: string | null;
  billingPeriod: string | null;
  autoRenews: boolean | null;
  actualPrice: string | null;
  notes: string | null;
  startedAt: string | null;
  cancelledAt: string | null;
  introPriceExpiresAt: string | null;
  accessType: (typeof schema.plans.$inferSelect)["accessType"];
  createdAt: Date;
  updatedAt: Date;
  accessProviderName: string;
  accessProviderSlug: string;
};

function mapPlanBase(row: PlanJoinRow): PlanResponse {
  return {
    id: row.id,
    accessProviderId: row.accessProviderId,
    name: row.name,
    slug: row.slug,
    planType: row.planType ?? null,
    regularPrice: asNumber(row.regularPrice),
    introductoryPrice: asNumber(row.introductoryPrice),
    currency: row.currency ?? null,
    billingInterval: row.billingInterval ?? null,
    apiAccessType: row.apiAccessType,
    authenticationType: row.authenticationType,
    usageMeasurementType: row.usageMeasurementType ?? null,
    termsSummary: row.termsSummary ?? null,
    renewalDate: toDateString(row.renewalDate),
    billingPeriod: row.billingPeriod ?? null,
    autoRenews: row.autoRenews ?? null,
    actualPrice: asNumber(row.actualPrice),
    notes: row.notes ?? null,
    startedAt: toDateString(row.startedAt),
    cancelledAt: toDateString(row.cancelledAt),
    introPriceExpiresAt: toDateString(row.introPriceExpiresAt),
    accessType: row.accessType ?? null,
    status: (row.status as "active" | "archived") ?? "active",
    archivedAt: row.archivedAt?.toISOString() ?? null,
    accessProvider: {
      id: row.accessProviderId,
      name: row.accessProviderName,
      slug: row.accessProviderSlug,
    },
    monthlyCost: monthlyFromPlan(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const planSelect = {
  id: schema.plans.id,
  accessProviderId: schema.plans.accessProviderId,
  name: schema.plans.name,
  slug: schema.plans.slug,
  planType: schema.plans.planType,
  regularPrice: schema.plans.regularPrice,
  introductoryPrice: schema.plans.introductoryPrice,
  currency: schema.plans.currency,
  billingInterval: schema.plans.billingInterval,
  apiAccessType: schema.plans.apiAccessType,
  authenticationType: schema.plans.authenticationType,
  usageMeasurementType: schema.plans.usageMeasurementType,
  termsSummary: schema.plans.termsSummary,
  status: schema.plans.status,
  archivedAt: schema.plans.archivedAt,
  renewalDate: schema.plans.renewalDate,
  billingPeriod: schema.plans.billingPeriod,
  autoRenews: schema.plans.autoRenews,
  actualPrice: schema.plans.actualPrice,
  notes: schema.plans.notes,
  startedAt: schema.plans.startedAt,
  cancelledAt: schema.plans.cancelledAt,
  introPriceExpiresAt: schema.plans.introPriceExpiresAt,
  accessType: schema.plans.accessType,
  createdAt: schema.plans.createdAt,
  updatedAt: schema.plans.updatedAt,
  accessProviderName: schema.accessProviders.name,
  accessProviderSlug: schema.accessProviders.slug,
} as const;

async function loadPlanExtras(
  db: DbOrTx,
  planIds: string[],
): Promise<{
  modelsByPlan: Map<string, { id: string; name: string; slug: string }[]>;
  quotasByPlan: Map<string, QuotaResponse[]>;
}> {
  const modelsByPlan = new Map<string, { id: string; name: string; slug: string }[]>();
  const quotasByPlan = new Map<string, QuotaResponse[]>();
  if (planIds.length === 0) return { modelsByPlan, quotasByPlan };

  const modelRows = await db
    .select({
      planId: schema.modelAccess.planId,
      id: schema.models.id,
      name: schema.models.name,
      slug: schema.models.slug,
    })
    .from(schema.modelAccess)
    .innerJoin(schema.models, eq(schema.modelAccess.modelId, schema.models.id))
    .where(
      and(
        inArray(schema.modelAccess.planId, planIds),
        eq(schema.modelAccess.status, "active"),
        eq(schema.models.status, "active"),
      ),
    )
    .orderBy(asc(schema.models.name));

  for (const r of modelRows) {
    const list = modelsByPlan.get(r.planId) ?? [];
    if (!list.some((m) => m.id === r.id)) {
      list.push({ id: r.id, name: r.name, slug: r.slug });
    }
    modelsByPlan.set(r.planId, list);
  }

  const quotaRows = await db
    .select()
    .from(schema.planQuotas)
    .where(inArray(schema.planQuotas.planId, planIds))
    .orderBy(asc(schema.planQuotas.name));

  for (const q of quotaRows) {
    const list = quotasByPlan.get(q.planId) ?? [];
    list.push(mapQuotaRow(q));
    quotasByPlan.set(q.planId, list);
  }

  return { modelsByPlan, quotasByPlan };
}

function attachPlanExtras(
  base: PlanResponse,
  modelsByPlan: Map<string, { id: string; name: string; slug: string }[]>,
  quotasByPlan: Map<string, QuotaResponse[]>,
): PlanResponse {
  const quotas = quotasByPlan.get(base.id) ?? [];
  return {
    ...base,
    includedModels: modelsByPlan.get(base.id) ?? [],
    quotaSummary: {
      count: quotas.length,
      items: quotas.map((q) => ({
        id: q.id,
        name: q.name,
        amount: q.amount,
        amountMin: q.amountMin,
        amountMax: q.amountMax,
        unit: q.unit,
        customUnit: q.customUnit,
        period: q.period,
        remainingAmount: q.remainingAmount,
        remainingUpdatedAt: q.remainingUpdatedAt,
        isUnlimited: q.isUnlimited,
      })),
    },
  };
}

async function loadProviderDerived(
  db: DbOrTx,
  providerIds: string[],
): Promise<
  Map<
    string,
    {
      activePlansCount: number;
      accessibleModelsCount: number;
      monthlyTotal: number | null;
      capabilityTags: string[];
    }
  >
> {
  const out = new Map<
    string,
    {
      activePlansCount: number;
      accessibleModelsCount: number;
      monthlyTotal: number | null;
      capabilityTags: string[];
    }
  >();
  for (const id of providerIds) {
    out.set(id, {
      activePlansCount: 0,
      accessibleModelsCount: 0,
      monthlyTotal: null,
      capabilityTags: [],
    });
  }
  if (providerIds.length === 0) return out;

  const planRows = await db
    .select({
      id: schema.plans.id,
      accessProviderId: schema.plans.accessProviderId,
      regularPrice: schema.plans.regularPrice,
      actualPrice: schema.plans.actualPrice,
      billingPeriod: schema.plans.billingPeriod,
      billingInterval: schema.plans.billingInterval,
      status: schema.plans.status,
    })
    .from(schema.plans)
    .where(
      and(
        inArray(schema.plans.accessProviderId, providerIds),
        eq(schema.plans.status, "active"),
      ),
    );

  const planIdsByProvider = new Map<string, string[]>();
  for (const p of planRows) {
    const entry = out.get(p.accessProviderId)!;
    entry.activePlansCount += 1;
    const m = monthlyFromPlan(p);
    if (m != null) {
      entry.monthlyTotal = (entry.monthlyTotal ?? 0) + m;
    }
    const list = planIdsByProvider.get(p.accessProviderId) ?? [];
    list.push(p.id);
    planIdsByProvider.set(p.accessProviderId, list);
  }

  const allPlanIds = planRows.map((p) => p.id);
  if (allPlanIds.length > 0) {
    const modelCounts = await db
      .select({
        planId: schema.modelAccess.planId,
        modelId: schema.modelAccess.modelId,
      })
      .from(schema.modelAccess)
      .innerJoin(schema.models, eq(schema.modelAccess.modelId, schema.models.id))
      .where(
        and(
          inArray(schema.modelAccess.planId, allPlanIds),
          eq(schema.modelAccess.status, "active"),
          eq(schema.models.status, "active"),
        ),
      );

    const modelsByProvider = new Map<string, Set<string>>();
    const planToProvider = new Map(planRows.map((p) => [p.id, p.accessProviderId]));
    for (const row of modelCounts) {
      const pid = planToProvider.get(row.planId);
      if (!pid) continue;
      const set = modelsByProvider.get(pid) ?? new Set();
      set.add(row.modelId);
      modelsByProvider.set(pid, set);
    }
    for (const [pid, set] of modelsByProvider) {
      const entry = out.get(pid);
      if (entry) entry.accessibleModelsCount = set.size;
    }

    const tagRows = await db
      .select({
        planId: schema.modelAccess.planId,
        tagName: schema.tags.name,
      })
      .from(schema.modelAccess)
      .innerJoin(schema.modelTags, eq(schema.modelAccess.modelId, schema.modelTags.modelId))
      .innerJoin(schema.tags, eq(schema.modelTags.tagId, schema.tags.id))
      .where(
        and(
          inArray(schema.modelAccess.planId, allPlanIds),
          eq(schema.modelAccess.status, "active"),
          eq(schema.tags.category, "capability"),
        ),
      );

    const tagsByProvider = new Map<string, Set<string>>();
    for (const row of tagRows) {
      const pid = planToProvider.get(row.planId);
      if (!pid) continue;
      const set = tagsByProvider.get(pid) ?? new Set();
      set.add(row.tagName);
      tagsByProvider.set(pid, set);
    }
    for (const [pid, set] of tagsByProvider) {
      const entry = out.get(pid);
      if (entry) entry.capabilityTags = [...set].sort((a, b) => a.localeCompare(b));
    }
  }

  return out;
}

// ── Access providers ───────────────────────────────────────────

export async function listAccessProviders(
  db: Db,
  raw?: unknown,
): Promise<ProviderResponse[]> {
  const filter = providerFilterSchema.parse(raw ?? {});
  const conditions: ReturnType<typeof eq | typeof ilike>[] = [];

  if (!filter.archived) {
    conditions.push(eq(schema.accessProviders.status, "active"));
  }
  if (filter.search) {
    conditions.push(ilike(schema.accessProviders.name, `%${filter.search}%`));
  }
  if (filter.providerType) {
    conditions.push(eq(schema.accessProviders.providerType, filter.providerType));
  }

  const clause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(schema.accessProviders)
    .where(clause)
    .orderBy(schema.accessProviders.name);

  const derived = await loadProviderDerived(
    db,
    rows.map((r) => r.id),
  );

  return rows.map((row) => {
    const d = derived.get(row.id)!;
    return {
      ...mapAccessProviderBase(row),
      activePlansCount: d.activePlansCount,
      accessibleModelsCount: d.accessibleModelsCount,
      monthlyTotal: d.monthlyTotal,
      capabilityTags: d.capabilityTags,
    };
  });
}

export async function getAccessProvider(
  db: Db,
  id: string,
): Promise<ProviderResponse> {
  const uuid = requireUuid(id, "id");
  const [row] = await db
    .select()
    .from(schema.accessProviders)
    .where(eq(schema.accessProviders.id, uuid))
    .limit(1);

  if (!row) {
    throw new ModelServiceError("NOT_FOUND", "Access provider not found", 404);
  }

  const derived = await loadProviderDerived(db, [row.id]);
  const d = derived.get(row.id)!;
  return {
    ...mapAccessProviderBase(row),
    activePlansCount: d.activePlansCount,
    accessibleModelsCount: d.accessibleModelsCount,
    monthlyTotal: d.monthlyTotal,
    capabilityTags: d.capabilityTags,
  };
}

export async function createAccessProvider(
  db: Db,
  raw: unknown,
  ctx: AuditContext,
): Promise<ProviderResponse> {
  return await db.transaction(async (tx) => {
    const parsed = accessProviderWriteSchema.parse(raw);

    const insertData = {
      name: parsed.name,
      slug: parsed.slug,
      providerType: parsed.providerType ?? null,
      websiteUrl: parsed.websiteUrl ?? null,
      logoUrl: parsed.logoUrl ?? null,
      colour: parsed.colour ?? null,
      notes: parsed.notes ?? null,
      status: parsed.status ?? "active",
    };

    let row: typeof schema.accessProviders.$inferSelect;
    try {
      [row] = await tx.insert(schema.accessProviders).values(insertData).returning();
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ModelServiceError(
          "CONFLICT",
          "An access provider with this slug already exists",
          409,
        );
      }
      throw err;
    }

    await writeAudit(tx, {
      entityType: "access_provider",
      entityId: row.id,
      action: "create",
      afterData: jsonSafe(row),
      ctx,
    });

    return {
      ...mapAccessProviderBase(row),
      activePlansCount: 0,
      accessibleModelsCount: 0,
      monthlyTotal: null,
      capabilityTags: [],
    };
  });
}

export async function updateAccessProvider(
  db: Db,
  id: string,
  raw: unknown,
  ctx: AuditContext,
): Promise<ProviderResponse> {
  const uuid = requireUuid(id, "id");
  const parsed = accessProviderWriteSchema.partial().parse(raw);

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.accessProviders)
      .where(eq(schema.accessProviders.id, uuid))
      .limit(1);
    if (!before) {
      throw new ModelServiceError("NOT_FOUND", "Access provider not found", 404);
    }

    const patch: Partial<typeof schema.accessProviders.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.name !== undefined) patch.name = parsed.name;
    if (parsed.slug !== undefined) patch.slug = parsed.slug;
    if (parsed.providerType !== undefined) patch.providerType = parsed.providerType;
    if (parsed.websiteUrl !== undefined) patch.websiteUrl = parsed.websiteUrl;
    if (parsed.logoUrl !== undefined) patch.logoUrl = parsed.logoUrl;
    if (parsed.colour !== undefined) patch.colour = parsed.colour;
    if (parsed.notes !== undefined) patch.notes = parsed.notes;
    if (parsed.status !== undefined) {
      patch.status = parsed.status;
      if (parsed.status === "archived" && !before.archivedAt) {
        patch.archivedAt = new Date();
      }
      if (parsed.status === "active") {
        patch.archivedAt = null;
      }
    }

    let after: typeof schema.accessProviders.$inferSelect;
    try {
      [after] = await tx
        .update(schema.accessProviders)
        .set(patch)
        .where(eq(schema.accessProviders.id, uuid))
        .returning();
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ModelServiceError(
          "CONFLICT",
          "An access provider with this slug already exists",
          409,
        );
      }
      throw err;
    }

    await writeAudit(tx, {
      entityType: "access_provider",
      entityId: uuid,
      action: "update",
      beforeData: jsonSafe(before),
      afterData: jsonSafe(after),
      ctx,
    });
  });

  return getAccessProvider(db, uuid);
}

export async function archiveAccessProvider(
  db: Db,
  id: string,
  ctx: AuditContext,
): Promise<ProviderResponse> {
  const uuid = requireUuid(id, "id");

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.accessProviders)
      .where(eq(schema.accessProviders.id, uuid))
      .limit(1);
    if (!before) {
      throw new ModelServiceError("NOT_FOUND", "Access provider not found", 404);
    }
    if (before.status === "archived") return;

    const [after] = await tx
      .update(schema.accessProviders)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.accessProviders.id, uuid))
      .returning();

    await writeAudit(tx, {
      entityType: "access_provider",
      entityId: uuid,
      action: "archive",
      beforeData: jsonSafe(before),
      afterData: jsonSafe(after),
      ctx,
    });
  });

  return getAccessProvider(db, uuid);
}

// ── Plans ──────────────────────────────────────────────────────

export async function listPlans(db: Db, raw?: unknown): Promise<PlanResponse[]> {
  const filter = planFilterSchema.parse(raw ?? {});
  const conditions: ReturnType<typeof eq | typeof ilike>[] = [];

  if (!filter.archived) {
    conditions.push(eq(schema.plans.status, "active"));
  }
  if (filter.status) {
    conditions.push(eq(schema.plans.status, filter.status));
  }
  if (filter.accessProviderId) {
    conditions.push(eq(schema.plans.accessProviderId, filter.accessProviderId));
  }
  if (filter.accessProviderSlug) {
    conditions.push(eq(schema.accessProviders.slug, filter.accessProviderSlug));
  }
  if (filter.search) {
    conditions.push(ilike(schema.plans.name, `%${filter.search}%`));
  }
  if (filter.accessType) {
    conditions.push(
      sql`${schema.plans.accessType} = ${filter.accessType}`,
    );
  }

  const clause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select(planSelect)
    .from(schema.plans)
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(clause)
    .orderBy(schema.plans.name);

  const { modelsByPlan, quotasByPlan } = await loadPlanExtras(
    db,
    rows.map((r) => r.id),
  );

  return rows.map((row) =>
    attachPlanExtras(mapPlanBase(row), modelsByPlan, quotasByPlan),
  );
}

export async function getPlan(db: Db, id: string): Promise<PlanResponse> {
  const uuid = requireUuid(id, "id");
  const [row] = await db
    .select(planSelect)
    .from(schema.plans)
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(eq(schema.plans.id, uuid))
    .limit(1);

  if (!row) {
    throw new ModelServiceError("NOT_FOUND", "Plan not found", 404);
  }

  const { modelsByPlan, quotasByPlan } = await loadPlanExtras(db, [row.id]);
  return attachPlanExtras(mapPlanBase(row), modelsByPlan, quotasByPlan);
}

function planInsertFromParsed(parsed: z.infer<typeof planWriteSchema>) {
  return {
    accessProviderId: parsed.accessProviderId,
    name: parsed.name,
    slug: parsed.slug,
    planType: parsed.planType ?? null,
    regularPrice: parsed.regularPrice !== undefined && parsed.regularPrice !== null
      ? String(parsed.regularPrice)
      : null,
    introductoryPrice:
      parsed.introductoryPrice !== undefined && parsed.introductoryPrice !== null
        ? String(parsed.introductoryPrice)
        : null,
    currency: parsed.currency ?? null,
    billingInterval: parsed.billingInterval ?? null,
    apiAccessType: parsed.apiAccessType,
    authenticationType: parsed.authenticationType,
    usageMeasurementType: parsed.usageMeasurementType ?? null,
    termsSummary: parsed.termsSummary ?? null,
    renewalDate: parsed.renewalDate ?? null,
    billingPeriod: parsed.billingPeriod ?? null,
    autoRenews: parsed.autoRenews ?? null,
    actualPrice:
      parsed.actualPrice !== undefined && parsed.actualPrice !== null
        ? String(parsed.actualPrice)
        : null,
    notes: parsed.notes ?? null,
    startedAt: parsed.startedAt ?? null,
    cancelledAt: parsed.cancelledAt ?? null,
    introPriceExpiresAt: parsed.introPriceExpiresAt ?? null,
    accessType: parsed.accessType ?? null,
    status: parsed.status ?? "active",
  };
}

export async function createPlan(
  db: Db,
  raw: unknown,
  ctx: AuditContext,
): Promise<PlanResponse> {
  return await db.transaction(async (tx) => {
    const parsed = planWriteSchema.parse(raw);

    const [provider] = await tx
      .select({
        id: schema.accessProviders.id,
        name: schema.accessProviders.name,
        slug: schema.accessProviders.slug,
      })
      .from(schema.accessProviders)
      .where(eq(schema.accessProviders.id, parsed.accessProviderId))
      .limit(1);

    if (!provider) {
      throw new ModelServiceError("NOT_FOUND", "Access provider not found", 404);
    }

    let row: typeof schema.plans.$inferSelect;
    try {
      [row] = await tx.insert(schema.plans).values(planInsertFromParsed(parsed)).returning();
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ModelServiceError(
          "CONFLICT",
          "A plan with this slug already exists for this provider",
          409,
        );
      }
      throw err;
    }

    await writeAudit(tx, {
      entityType: "plan",
      entityId: row.id,
      action: "create",
      afterData: jsonSafe(row),
      ctx,
    });

    const base = mapPlanBase({
      ...row,
      accessProviderName: provider.name,
      accessProviderSlug: provider.slug,
    });

    return {
      ...base,
      includedModels: [],
      quotaSummary: { count: 0, items: [] },
    };
  });
}

export async function updatePlan(
  db: Db,
  id: string,
  raw: unknown,
  ctx: AuditContext,
): Promise<PlanResponse> {
  const uuid = requireUuid(id, "id");
  const parsed = planWriteSchema.partial().parse(raw);

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, uuid))
      .limit(1);
    if (!before) {
      throw new ModelServiceError("NOT_FOUND", "Plan not found", 404);
    }

    if (parsed.accessProviderId) {
      const [provider] = await tx
        .select({ id: schema.accessProviders.id })
        .from(schema.accessProviders)
        .where(eq(schema.accessProviders.id, parsed.accessProviderId))
        .limit(1);
      if (!provider) {
        throw new ModelServiceError("NOT_FOUND", "Access provider not found", 404);
      }
    }

    const patch: Partial<typeof schema.plans.$inferInsert> = { updatedAt: new Date() };
    if (parsed.accessProviderId !== undefined) patch.accessProviderId = parsed.accessProviderId;
    if (parsed.name !== undefined) patch.name = parsed.name;
    if (parsed.slug !== undefined) patch.slug = parsed.slug;
    if (parsed.planType !== undefined) patch.planType = parsed.planType;
    if (parsed.regularPrice !== undefined) {
      patch.regularPrice = parsed.regularPrice === null ? null : String(parsed.regularPrice);
    }
    if (parsed.introductoryPrice !== undefined) {
      patch.introductoryPrice =
        parsed.introductoryPrice === null ? null : String(parsed.introductoryPrice);
    }
    if (parsed.currency !== undefined) patch.currency = parsed.currency;
    if (parsed.billingInterval !== undefined) patch.billingInterval = parsed.billingInterval;
    if (parsed.apiAccessType !== undefined) patch.apiAccessType = parsed.apiAccessType;
    if (parsed.authenticationType !== undefined) {
      patch.authenticationType = parsed.authenticationType;
    }
    if (parsed.usageMeasurementType !== undefined) {
      patch.usageMeasurementType = parsed.usageMeasurementType;
    }
    if (parsed.termsSummary !== undefined) patch.termsSummary = parsed.termsSummary;
    if (parsed.renewalDate !== undefined) patch.renewalDate = parsed.renewalDate;
    if (parsed.billingPeriod !== undefined) patch.billingPeriod = parsed.billingPeriod;
    if (parsed.autoRenews !== undefined) patch.autoRenews = parsed.autoRenews;
    if (parsed.actualPrice !== undefined) {
      patch.actualPrice = parsed.actualPrice === null ? null : String(parsed.actualPrice);
    }
    if (parsed.notes !== undefined) patch.notes = parsed.notes;
    if (parsed.startedAt !== undefined) patch.startedAt = parsed.startedAt;
    if (parsed.cancelledAt !== undefined) patch.cancelledAt = parsed.cancelledAt;
    if (parsed.introPriceExpiresAt !== undefined) {
      patch.introPriceExpiresAt = parsed.introPriceExpiresAt;
    }
    if (parsed.accessType !== undefined) patch.accessType = parsed.accessType;
    if (parsed.status !== undefined) {
      patch.status = parsed.status;
      if (parsed.status === "archived" && !before.archivedAt) {
        patch.archivedAt = new Date();
      }
      if (parsed.status === "active") patch.archivedAt = null;
    }

    let after: typeof schema.plans.$inferSelect;
    try {
      [after] = await tx
        .update(schema.plans)
        .set(patch)
        .where(eq(schema.plans.id, uuid))
        .returning();
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ModelServiceError(
          "CONFLICT",
          "A plan with this slug already exists for this provider",
          409,
        );
      }
      throw err;
    }

    await writeAudit(tx, {
      entityType: "plan",
      entityId: uuid,
      action: "update",
      beforeData: jsonSafe(before),
      afterData: jsonSafe(after),
      ctx,
    });
  });

  return getPlan(db, uuid);
}

// ── Quotas ─────────────────────────────────────────────────────

export async function listPlanQuotas(db: Db, planId: string): Promise<QuotaResponse[]> {
  const uuid = requireUuid(planId, "planId");
  const [plan] = await db
    .select({ id: schema.plans.id })
    .from(schema.plans)
    .where(eq(schema.plans.id, uuid))
    .limit(1);
  if (!plan) {
    throw new ModelServiceError("NOT_FOUND", "Plan not found", 404);
  }

  const rows = await db
    .select()
    .from(schema.planQuotas)
    .where(eq(schema.planQuotas.planId, uuid))
    .orderBy(asc(schema.planQuotas.name));

  return rows.map(mapQuotaRow);
}

export async function createPlanQuota(
  db: Db,
  planId: string,
  raw: unknown,
  ctx: AuditContext = {},
): Promise<QuotaResponse> {
  const uuid = requireUuid(planId, "planId");
  const body = createPlanQuotaBodySchema.parse(raw);
  // Also accept full create schema with matching planId
  const full = createPlanQuotaSchema.safeParse({ ...body, planId: uuid });
  if (!full.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid plan quota payload",
      400,
      Object.fromEntries(
        Object.entries(full.error.flatten().fieldErrors).map(([k, v]) => [k, v ?? []]),
      ),
    );
  }
  const parsed = full.data;

  return await db.transaction(async (tx: Tx) => {
    const [plan] = await tx
      .select({ id: schema.plans.id })
      .from(schema.plans)
      .where(eq(schema.plans.id, uuid))
      .limit(1);
    if (!plan) {
      throw new ModelServiceError("NOT_FOUND", "Plan not found", 404);
    }

    const now = new Date();
    const remainingUpdatedAt =
      parsed.remainingAmount !== undefined && parsed.remainingAmount !== null
        ? parsed.remainingUpdatedAt
          ? new Date(parsed.remainingUpdatedAt)
          : now
        : parsed.remainingUpdatedAt
          ? new Date(parsed.remainingUpdatedAt)
          : null;

    const [row] = await tx
      .insert(schema.planQuotas)
      .values({
        planId: uuid,
        name: parsed.name,
        amount: parsed.amount != null ? String(parsed.amount) : null,
        amountMin: parsed.amountMin != null ? String(parsed.amountMin) : null,
        amountMax: parsed.amountMax != null ? String(parsed.amountMax) : null,
        unit: parsed.unit,
        customUnit: parsed.customUnit ?? null,
        period: parsed.period,
        resetBehaviour: parsed.resetBehaviour ?? null,
        remainingAmount:
          parsed.remainingAmount != null ? String(parsed.remainingAmount) : null,
        remainingUpdatedAt,
        resetsAt: parsed.resetsAt ?? null,
        isUnlimited: parsed.isUnlimited ?? false,
        notes: parsed.notes ?? null,
      })
      .returning();

    await writeAudit(tx, {
      entityType: "plan_quota",
      entityId: row.id,
      action: "create",
      afterData: jsonSafe(row),
      ctx,
    });

    return mapQuotaRow(row);
  });
}

export async function updatePlanQuota(
  db: Db,
  quotaId: string,
  raw: unknown,
  ctx: AuditContext = {},
): Promise<QuotaResponse> {
  const uuid = requireUuid(quotaId, "quotaId");
  const parsed = updatePlanQuotaSchema.parse(raw);
  const keys = Object.keys(parsed);
  const remainingOnly =
    keys.length === 1 && Object.prototype.hasOwnProperty.call(parsed, "remainingAmount");

  return await db.transaction(async (tx: Tx) => {
    const [before] = await tx
      .select()
      .from(schema.planQuotas)
      .where(eq(schema.planQuotas.id, uuid))
      .limit(1);
    if (!before) {
      throw new ModelServiceError("NOT_FOUND", "Plan quota not found", 404);
    }

    const now = new Date();
    const patch: Partial<typeof schema.planQuotas.$inferInsert> = {
      updatedAt: now,
    };

    if (parsed.name !== undefined) patch.name = parsed.name;
    if (parsed.amount !== undefined) {
      patch.amount = parsed.amount === null ? null : String(parsed.amount);
    }
    if (parsed.amountMin !== undefined) {
      patch.amountMin = parsed.amountMin === null ? null : String(parsed.amountMin);
    }
    if (parsed.amountMax !== undefined) {
      patch.amountMax = parsed.amountMax === null ? null : String(parsed.amountMax);
    }
    if (parsed.unit !== undefined) patch.unit = parsed.unit;
    if (parsed.customUnit !== undefined) patch.customUnit = parsed.customUnit;
    if (parsed.period !== undefined) patch.period = parsed.period;
    if (parsed.resetBehaviour !== undefined) patch.resetBehaviour = parsed.resetBehaviour;
    if (parsed.resetsAt !== undefined) patch.resetsAt = parsed.resetsAt;
    if (parsed.isUnlimited !== undefined) patch.isUnlimited = parsed.isUnlimited;
    if (parsed.notes !== undefined) patch.notes = parsed.notes;

    if (parsed.remainingAmount !== undefined) {
      patch.remainingAmount =
        parsed.remainingAmount === null ? null : String(parsed.remainingAmount);
      // Always stamp remaining_updated_at when remaining is written — high-frequency path.
      patch.remainingUpdatedAt =
        parsed.remainingUpdatedAt !== undefined && parsed.remainingUpdatedAt !== null
          ? new Date(parsed.remainingUpdatedAt)
          : now;
    } else if (remainingOnly) {
      // defensive — already covered above
      patch.remainingUpdatedAt = now;
    } else if (parsed.remainingUpdatedAt !== undefined) {
      patch.remainingUpdatedAt =
        parsed.remainingUpdatedAt === null ? null : new Date(parsed.remainingUpdatedAt);
    }

    const [after] = await tx
      .update(schema.planQuotas)
      .set(patch)
      .where(eq(schema.planQuotas.id, uuid))
      .returning();

    // remaining-only is high-frequency personal edit — no audit required by AGENTS.md
    // (ratings/tags/saved-views are the listed exceptions; quotas remaining is same class).
    // Still audit non-remaining structural quota edits.
    if (!remainingOnly) {
      await writeAudit(tx, {
        entityType: "plan_quota",
        entityId: uuid,
        action: "update",
        beforeData: jsonSafe(before),
        afterData: jsonSafe(after),
        ctx,
      });
    }

    return mapQuotaRow(after);
  });
}

export async function deletePlanQuota(
  db: Db,
  quotaId: string,
  ctx: AuditContext = {},
): Promise<{ id: string; deleted: true }> {
  const uuid = requireUuid(quotaId, "quotaId");

  await db.transaction(async (tx: Tx) => {
    const [before] = await tx
      .select()
      .from(schema.planQuotas)
      .where(eq(schema.planQuotas.id, uuid))
      .limit(1);
    if (!before) {
      throw new ModelServiceError("NOT_FOUND", "Plan quota not found", 404);
    }

    await tx.delete(schema.planQuotas).where(eq(schema.planQuotas.id, uuid));

    await writeAudit(tx, {
      entityType: "plan_quota",
      entityId: uuid,
      action: "delete",
      beforeData: jsonSafe(before),
      afterData: null,
      ctx,
    });
  });

  return { id: uuid, deleted: true };
}

// ── Renewals ───────────────────────────────────────────────────

export async function listRenewals(db: Db, raw?: unknown): Promise<RenewalItem[]> {
  const query = renewalsListQuerySchema.parse(raw ?? {});
  const items: RenewalItem[] = [];

  const planRows = await db
    .select({
      id: schema.plans.id,
      name: schema.plans.name,
      status: schema.plans.status,
      accessType: schema.plans.accessType,
      renewalDate: schema.plans.renewalDate,
      introPriceExpiresAt: schema.plans.introPriceExpiresAt,
      cancelledAt: schema.plans.cancelledAt,
      regularPrice: schema.plans.regularPrice,
      actualPrice: schema.plans.actualPrice,
      currency: schema.plans.currency,
      providerId: schema.accessProviders.id,
      providerName: schema.accessProviders.name,
      providerSlug: schema.accessProviders.slug,
    })
    .from(schema.plans)
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(eq(schema.plans.status, "active"));

  for (const p of planRows) {
    const provider = {
      id: p.providerId,
      name: p.providerName,
      slug: p.providerSlug,
    };
    const amount = asNumber(p.actualPrice) ?? asNumber(p.regularPrice);
    const currency = p.currency ?? null;

    // 1) Subscription renewals — renewal_date on non-trial plans
    const renewalDate = toDateString(p.renewalDate);
    if (renewalDate && p.accessType !== "trial") {
      items.push({
        kind: "subscription_renewal",
        date: renewalDate,
        entityType: "plan",
        entityId: p.id,
        title: p.name,
        subtitle: p.providerName,
        amount,
        currency,
        provider,
      });
    }

    // 2) Trial expirations — trial plans use renewal_date or cancelled_at as end
    if (p.accessType === "trial") {
      const trialEnd = renewalDate ?? toDateString(p.cancelledAt);
      if (trialEnd) {
        items.push({
          kind: "trial_expiration",
          date: trialEnd,
          entityType: "plan",
          entityId: p.id,
          title: p.name,
          subtitle: p.providerName,
          amount,
          currency,
          provider,
        });
      }
    }

    // 3) Promotional price expirations
    const promo = toDateString(p.introPriceExpiresAt);
    if (promo) {
      items.push({
        kind: "promotional_price_expiration",
        date: promo,
        entityType: "plan",
        entityId: p.id,
        title: p.name,
        subtitle: p.providerName,
        amount: asNumber(p.regularPrice) ?? amount,
        currency,
        provider,
      });
    }
  }

  // 4) Manual review dates — models flagged needs_review; date = verified_at::date or updated_at::date
  const reviewModels = await db
    .select({
      id: schema.models.id,
      name: schema.models.name,
      verifiedAt: schema.models.verifiedAt,
      updatedAt: schema.models.updatedAt,
      developerName: schema.developers.name,
    })
    .from(schema.models)
    .innerJoin(schema.developers, eq(schema.models.developerId, schema.developers.id))
    .where(
      and(eq(schema.models.status, "active"), eq(schema.models.needsReview, true), isNotNull(sql`1`)),
    );

  for (const m of reviewModels) {
    const date =
      toDateString(m.verifiedAt) ?? toDateString(m.updatedAt) ?? m.updatedAt.toISOString().slice(0, 10);
    items.push({
      kind: "manual_review",
      date,
      entityType: "model",
      entityId: m.id,
      title: m.name,
      subtitle: m.developerName,
      amount: null,
      currency: null,
      provider: null,
    });
  }

  let filtered = items;
  if (query.kind) {
    filtered = filtered.filter((i) => i.kind === query.kind);
  }
  if (query.from) {
    filtered = filtered.filter((i) => i.date >= query.from!);
  }
  if (query.to) {
    filtered = filtered.filter((i) => i.date <= query.to!);
  }

  filtered.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    const k = a.kind.localeCompare(b.kind);
    if (k !== 0) return k;
    return a.title.localeCompare(b.title);
  });

  const limit = query.limit ?? 100;
  return filtered.slice(0, limit);
}
