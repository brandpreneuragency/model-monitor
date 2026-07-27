import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import type {
  accessProviderResponseSchema,
  planResponseSchema} from "@model-monitor/schemas";
import {
  accessProviderWriteSchema,
  planWriteSchema
} from "@model-monitor/schemas";
import * as schema from "../schema/index";
import type {
  Db,
  AuditContext} from "./audit";
import {
  writeAudit,
  ModelServiceError,
  jsonSafe,
  asNumber,
} from "./audit";

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
});

const planFilterSchema = z.object({
  accessProviderId: z.string().uuid().optional(),
  accessProviderSlug: z.string().optional(),
  search: z.string().optional(),
  archived: booleanQuery,
});

// ── Mappers ────────────────────────────────────────────────────

function mapAccessProviderRow(
  row: typeof schema.accessProviders.$inferSelect,
): z.infer<typeof accessProviderResponseSchema> {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    providerType: row.providerType ?? null,
    websiteUrl: row.websiteUrl ?? null,
    notes: row.notes ?? null,
    status: row.status as "active" | "archived",
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPlanRow(row: {
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
  createdAt: Date;
  updatedAt: Date;
  accessProviderName: string;
  accessProviderSlug: string;
}): z.infer<typeof planResponseSchema> {
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
    accessProvider: {
      id: row.accessProviderId,
      name: row.accessProviderName,
      slug: row.accessProviderSlug,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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

// ── Exports ────────────────────────────────────────────────────

export async function listAccessProviders(
  db: Db,
  raw?: unknown,
): Promise<z.infer<typeof accessProviderResponseSchema>[]> {
  const filter = providerFilterSchema.parse(raw ?? {});
  const conditions: ReturnType<typeof eq | typeof ilike>[] = [];

  if (!filter.archived) {
    conditions.push(eq(schema.accessProviders.status, "active"));
  }
  if (filter.search) {
    conditions.push(ilike(schema.accessProviders.name, `%${filter.search}%`));
  }

  const clause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(schema.accessProviders)
    .where(clause)
    .orderBy(schema.accessProviders.name);

  return rows.map(mapAccessProviderRow);
}

export async function getAccessProvider(
  db: Db,
  id: string,
): Promise<z.infer<typeof accessProviderResponseSchema>> {
  const [row] = await db
    .select()
    .from(schema.accessProviders)
    .where(eq(schema.accessProviders.id, id))
    .limit(1);

  if (!row) {
    throw new ModelServiceError("NOT_FOUND", "Access provider not found", 404);
  }

  return mapAccessProviderRow(row);
}

export async function listPlans(
  db: Db,
  raw?: unknown,
): Promise<z.infer<typeof planResponseSchema>[]> {
  const filter = planFilterSchema.parse(raw ?? {});
  const conditions: ReturnType<typeof eq | typeof ilike>[] = [];

  if (!filter.archived) {
    conditions.push(eq(schema.plans.status, "active"));
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

  const clause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select({
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
      createdAt: schema.plans.createdAt,
      updatedAt: schema.plans.updatedAt,
      accessProviderName: schema.accessProviders.name,
      accessProviderSlug: schema.accessProviders.slug,
    })
    .from(schema.plans)
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(clause)
    .orderBy(schema.plans.name);

  return rows.map(mapPlanRow);
}

export async function getPlan(
  db: Db,
  id: string,
): Promise<z.infer<typeof planResponseSchema>> {
  const [row] = await db
    .select({
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
      createdAt: schema.plans.createdAt,
      updatedAt: schema.plans.updatedAt,
      accessProviderName: schema.accessProviders.name,
      accessProviderSlug: schema.accessProviders.slug,
    })
    .from(schema.plans)
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(eq(schema.plans.id, id))
    .limit(1);

  if (!row) {
    throw new ModelServiceError("NOT_FOUND", "Plan not found", 404);
  }

  return mapPlanRow(row);
}

export async function createPlan(
  db: Db,
  raw: unknown,
  ctx: AuditContext,
): Promise<z.infer<typeof planResponseSchema>> {
  return await db.transaction(async (tx) => {
    const parsed = planWriteSchema.parse(raw);

    // Verify accessProviderId exists
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

    const insertData = {
      accessProviderId: parsed.accessProviderId,
      name: parsed.name,
      slug: parsed.slug,
      planType: parsed.planType ?? null,
      regularPrice: parsed.regularPrice !== undefined ? String(parsed.regularPrice) : null,
      introductoryPrice: parsed.introductoryPrice !== undefined ? String(parsed.introductoryPrice) : null,
      currency: parsed.currency ?? null,
      billingInterval: parsed.billingInterval ?? null,
      apiAccessType: parsed.apiAccessType,
      authenticationType: parsed.authenticationType,
      usageMeasurementType: parsed.usageMeasurementType ?? null,
      termsSummary: parsed.termsSummary ?? null,
    };

    let row: typeof schema.plans.$inferSelect;
    try {
      [row] = await tx.insert(schema.plans).values(insertData).returning();
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

    return mapPlanRow({
      ...row,
      accessProviderName: provider.name,
      accessProviderSlug: provider.slug,
    });
  });
}

export async function createAccessProvider(
  db: Db,
  raw: unknown,
  ctx: AuditContext,
): Promise<z.infer<typeof accessProviderResponseSchema>> {
  return await db.transaction(async (tx) => {
    const parsed = accessProviderWriteSchema.parse(raw);

    const insertData = {
      name: parsed.name,
      slug: parsed.slug,
      providerType: parsed.providerType ?? null,
      websiteUrl: parsed.websiteUrl ?? null,
      notes: parsed.notes ?? null,
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

    return mapAccessProviderRow(row);
  });
}
