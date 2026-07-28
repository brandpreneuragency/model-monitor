import { z } from "zod";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type {
  modelAccessDetailResponseSchema,
  accessMatrixRowSchema} from "@model-monitor/schemas";
import {
  modelAccessWriteSchema,
  modelAccessListQuerySchema,
} from "@model-monitor/schemas";
import * as schema from "../schema/index";
import type {
  Db,
  DbOrTx,
  AuditContext} from "./audit";
import {
  writeAudit,
  ModelServiceError,
  jsonSafe,
} from "./audit";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type Detail = z.infer<typeof modelAccessDetailResponseSchema>;
type AccessMatrixRow = z.infer<typeof accessMatrixRowSchema>;

const SORT_ALLOW_LIST = new Set(["modelName", "planName", "availability", "accessMethod", "priority"]);

function requireUuid(value: string, field: string): string {
  const parsed = z.string().uuid({ message: `Must be a valid ${field}` }).safeParse(value);
  if (!parsed.success) {
    throw new ModelServiceError("VALIDATION_ERROR", `Invalid ${field}`, 400, {
      [field]: ["Must be a valid UUID"],
    });
  }
  return parsed.data;
}

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

function mapModelDetailRow(
  row: {
    access: typeof schema.modelAccess.$inferSelect;
    modelName: string;
    modelCanonicalId: string;
    modelSlug: string;
    planId: string;
    planName: string;
    planSlug: string;
    planAccessProviderId: string;
    planAccessProviderName: string;
    planAccessProviderSlug: string;
  },
): Detail {
  return {
    id: row.access.id,
    modelId: row.access.modelId,
    planId: row.access.planId,
    providerModelId: row.access.providerModelId,
    availability: row.access.availability,
    accessMethod: row.access.accessMethod,
    authenticationType: row.access.authenticationType,
    includedInPlan: row.access.includedInPlan,
    apiCompatible: row.access.apiCompatible,
    cliOnly: row.access.cliOnly,
    webOnly: row.access.webOnly,
    oauthSupported: row.access.oauthSupported,
    priority: row.access.priority,
    limitations: row.access.limitations,
    isPreferred: row.access.isPreferred,
    model: {
      id: row.access.modelId,
      name: row.modelName,
      canonicalId: row.modelCanonicalId,
      slug: row.modelSlug,
    },
    plan: {
      id: row.planId,
      name: row.planName,
      slug: row.planSlug,
      accessProviderId: row.planAccessProviderId,
      accessProviderName: row.planAccessProviderName,
      accessProviderSlug: row.planAccessProviderSlug,
    },
  };
}

async function getModelDetailById(db: DbOrTx, id: string): Promise<Detail> {
  const [row] = await db
    .select({
      access: schema.modelAccess,
      modelName: schema.models.name,
      modelCanonicalId: schema.models.canonicalId,
      modelSlug: schema.models.slug,
      planId: schema.plans.id,
      planName: schema.plans.name,
      planSlug: schema.plans.slug,
      planAccessProviderId: schema.accessProviders.id,
      planAccessProviderName: schema.accessProviders.name,
      planAccessProviderSlug: schema.accessProviders.slug,
    })
    .from(schema.modelAccess)
    .innerJoin(schema.models, eq(schema.modelAccess.modelId, schema.models.id))
    .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(eq(schema.modelAccess.id, id))
    .limit(1);

  if (!row) {
    throw new ModelServiceError("NOT_FOUND", "Model access not found", 404);
  }

  return mapModelDetailRow(row);
}

export async function listModelAccess(
  db: Db,
  raw: unknown,
): Promise<{
  data: Detail[];
  page: { page: number; pageSize: number; total: number; hasMore: boolean; nextCursor: null };
}> {
  const query = modelAccessListQuerySchema.parse(raw);
  const limit = query.limit ?? 100;
  const pageNum = 1;
  const offset = 0;

  const conditions: SQL[] = [];

  if (query.modelId) {
    conditions.push(eq(schema.modelAccess.modelId, query.modelId));
  }
  if (query.planId) {
    conditions.push(eq(schema.modelAccess.planId, query.planId));
  }
  if (query.accessProvider?.trim()) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM plans p2
        JOIN access_providers ap2 ON ap2.id = p2.access_provider_id
        WHERE p2.id = ${schema.modelAccess.planId}
          AND ap2.slug = ${query.accessProvider.trim()}
      )`,
    );
  }
  if (query.availability) {
    conditions.push(eq(schema.modelAccess.availability, query.availability));
  }
  if (query.accessMethod) {
    conditions.push(eq(schema.modelAccess.accessMethod, query.accessMethod));
  }
  if (query.cliOnly !== undefined) {
    conditions.push(eq(schema.modelAccess.cliOnly, query.cliOnly));
  }
  if (query.webOnly !== undefined) {
    conditions.push(eq(schema.modelAccess.webOnly, query.webOnly));
  }
  if (query.apiCompatible !== undefined) {
    conditions.push(eq(schema.modelAccess.apiCompatible, query.apiCompatible));
  }
  if (query.archived === true) {
    conditions.push(eq(schema.modelAccess.status, "archived"));
  } else if (query.archived === false || query.archived === undefined) {
    conditions.push(eq(schema.modelAccess.status, "active"));
  }

  const whereExpr = conditions.length ? and(...conditions) : undefined;

  // Sort
  const rawSort = (query.sort ?? "modelName").trim();
  const dir = rawSort.startsWith("-") ? "desc" : "asc";
  const sortField = rawSort.replace(/^-/, "");
  const validSort = SORT_ALLOW_LIST.has(sortField) ? sortField : "modelName";
  const dirFn = dir === "desc" ? desc : asc;

  let orderBy: SQL;
  switch (validSort) {
    case "planName":
      orderBy = dirFn(schema.plans.name);
      break;
    case "availability":
      orderBy = dirFn(schema.modelAccess.availability);
      break;
    case "accessMethod":
      orderBy = dirFn(schema.modelAccess.accessMethod);
      break;
    case "priority":
      orderBy = dirFn(schema.modelAccess.priority);
      break;
    case "modelName":
    default:
      orderBy = dirFn(schema.models.name);
      break;
  }

  const baseQuery = db
    .select({
      access: schema.modelAccess,
      modelName: schema.models.name,
      modelCanonicalId: schema.models.canonicalId,
      modelSlug: schema.models.slug,
      planId: schema.plans.id,
      planName: schema.plans.name,
      planSlug: schema.plans.slug,
      planAccessProviderId: schema.accessProviders.id,
      planAccessProviderName: schema.accessProviders.name,
      planAccessProviderSlug: schema.accessProviders.slug,
    })
    .from(schema.modelAccess)
    .innerJoin(schema.models, eq(schema.modelAccess.modelId, schema.models.id))
    .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(whereExpr);

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.modelAccess)
    .innerJoin(schema.models, eq(schema.modelAccess.modelId, schema.models.id))
    .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(whereExpr);

  const total = countResult[0]?.count ?? 0;

  const rows = await baseQuery
    .orderBy(orderBy, asc(schema.modelAccess.id))
    .limit(limit + 1)
    .offset(offset);

  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  return {
    data: pageRows.map(mapModelDetailRow),
    page: {
      page: pageNum,
      pageSize: limit,
      total,
      hasMore,
      nextCursor: null,
    },
  };
}

export async function getModelAccess(db: Db, id: string): Promise<Detail> {
  const uuid = requireUuid(id, "id");
  return getModelDetailById(db, uuid);
}

export async function createModelAccess(
  db: Db,
  raw: unknown,
  ctx: AuditContext = {},
): Promise<Detail> {
  const parsed = modelAccessWriteSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid model access payload",
      400,
      Object.fromEntries(
        Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v ?? []]),
      ),
    );
  }
  const input = parsed.data;

  try {
    const createdId = await db.transaction(async (tx: Tx) => {
      if (input.isPreferred === true) {
        // Clear other preferred routes for this model first (partial unique index).
        await tx
          .update(schema.modelAccess)
          .set({ isPreferred: false, updatedAt: new Date() })
          .where(
            and(
              eq(schema.modelAccess.modelId, input.modelId),
              eq(schema.modelAccess.isPreferred, true),
            ),
          );
      }

      const [created] = await tx
        .insert(schema.modelAccess)
        .values({
          modelId: input.modelId,
          planId: input.planId,
          providerModelId: input.providerModelId ?? null,
          availability: input.availability,
          accessMethod: input.accessMethod,
          authenticationType: input.authenticationType,
          includedInPlan: input.includedInPlan ?? null,
          apiCompatible: input.apiCompatible ?? null,
          cliOnly: input.cliOnly,
          webOnly: input.webOnly,
          oauthSupported: input.oauthSupported ?? null,
          priority: input.priority ?? null,
          limitations: input.limitations ?? null,
          isPreferred: input.isPreferred ?? false,
          status: "active",
        })
        .returning();

      await writeAudit(tx, {
        entityType: "model_access",
        entityId: created.id,
        action: "create",
        afterData: jsonSafe(created),
        ctx,
      });

      return created.id;
    });

    return getModelDetailById(db, createdId);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Duplicate access path", 409);
    }
    throw error;
  }
}

export async function updateModelAccess(
  db: Db,
  id: string,
  raw: unknown,
  ctx: AuditContext = {},
): Promise<Detail> {
  const uuid = requireUuid(id, "id");
  const parsed = modelAccessWriteSchema.partial().safeParse(raw);
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid model access payload",
      400,
      Object.fromEntries(
        Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v ?? []]),
      ),
    );
  }
  const input = parsed.data;

  try {
    await db.transaction(async (tx: Tx) => {
      const [before] = await tx
        .select()
        .from(schema.modelAccess)
        .where(eq(schema.modelAccess.id, uuid))
        .limit(1);

      if (!before) {
        throw new ModelServiceError("NOT_FOUND", "Model access not found", 404);
      }

      const modelId = input.modelId ?? before.modelId;

      if (input.isPreferred === true) {
        // Clear other preferred routes for this model in the same transaction.
        await tx
          .update(schema.modelAccess)
          .set({ isPreferred: false, updatedAt: new Date() })
          .where(
            and(
              eq(schema.modelAccess.modelId, modelId),
              eq(schema.modelAccess.isPreferred, true),
            ),
          );
      }

      const patch: Partial<typeof schema.modelAccess.$inferInsert> = { updatedAt: new Date() };
      if (input.modelId !== undefined) patch.modelId = input.modelId;
      if (input.planId !== undefined) patch.planId = input.planId;
      if (input.providerModelId !== undefined) patch.providerModelId = input.providerModelId;
      if (input.availability !== undefined) patch.availability = input.availability;
      if (input.accessMethod !== undefined) patch.accessMethod = input.accessMethod;
      if (input.authenticationType !== undefined) patch.authenticationType = input.authenticationType;
      if (input.includedInPlan !== undefined) patch.includedInPlan = input.includedInPlan;
      if (input.apiCompatible !== undefined) patch.apiCompatible = input.apiCompatible;
      if (input.cliOnly !== undefined) patch.cliOnly = input.cliOnly;
      if (input.webOnly !== undefined) patch.webOnly = input.webOnly;
      if (input.oauthSupported !== undefined) patch.oauthSupported = input.oauthSupported;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.limitations !== undefined) patch.limitations = input.limitations;
      if (input.isPreferred !== undefined) patch.isPreferred = input.isPreferred;

      const [after] = await tx
        .update(schema.modelAccess)
        .set(patch)
        .where(eq(schema.modelAccess.id, uuid))
        .returning();

      if (!after) {
        throw new ModelServiceError("NOT_FOUND", "Model access not found", 404);
      }

      await writeAudit(tx, {
        entityType: "model_access",
        entityId: uuid,
        action: "update",
        beforeData: jsonSafe(before),
        afterData: jsonSafe(after),
        ctx,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Preferred access conflict", 409);
    }
    throw error;
  }

  return getModelDetailById(db, uuid);
}

export async function archiveModelAccess(
  db: Db,
  id: string,
  ctx: AuditContext = {},
): Promise<Detail> {
  const uuid = requireUuid(id, "id");

  await db.transaction(async (tx: Tx) => {
    const [before] = await tx
      .select()
      .from(schema.modelAccess)
      .where(eq(schema.modelAccess.id, uuid))
      .limit(1);

    if (!before) {
      throw new ModelServiceError("NOT_FOUND", "Model access not found", 404);
    }

    if (before.status === "archived") return;

    const [after] = await tx
      .update(schema.modelAccess)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.modelAccess.id, uuid))
      .returning();

    await writeAudit(tx, {
      entityType: "model_access",
      entityId: uuid,
      action: "archive",
      beforeData: jsonSafe(before),
      afterData: jsonSafe(after),
      ctx,
    });
  });

  return getModelDetailById(db, uuid);
}

export async function getAccessMatrix(
  db: Db,
  raw: unknown,
): Promise<AccessMatrixRow[]> {
  const params = z
    .object({
      search: z.string().optional(),
      developer: z.string().optional(),
      accessProvider: z.string().optional(),
      availability: z.string().optional(),
      cliOnly: z
        .union([z.literal("true"), z.literal("false"), z.boolean()])
        .optional()
        .transform((v) => {
          if (v === undefined) return undefined;
          if (typeof v === "boolean") return v;
          return v === "true";
        }),
      limit: z.coerce.number().int().min(1).max(500).optional().default(200),
    })
    .parse(raw ?? {});
  const limit = params.limit ?? 200;

  // Build filters on the access+model join
  const accessConditions: SQL[] = [
    eq(schema.modelAccess.status, "active"),
  ];
  const modelConditions: SQL[] = [
    eq(schema.models.status, "active"),
  ];

  if (params.search?.trim()) {
    const term = `%${params.search.trim()}%`;
    modelConditions.push(
      sql`(${schema.models.name} ILIKE ${term} OR ${schema.models.canonicalId} ILIKE ${term})`,
    );
  }
  if (params.developer?.trim()) {
    modelConditions.push(eq(schema.developers.slug, params.developer.trim()));
  }
  if (params.accessProvider?.trim()) {
    accessConditions.push(eq(schema.accessProviders.slug, params.accessProvider.trim()));
  }
  if (params.availability?.trim()) {
    accessConditions.push(sql`${schema.modelAccess.availability} = ${params.availability.trim()}`);
  }
  if (params.cliOnly !== undefined) {
    accessConditions.push(eq(schema.modelAccess.cliOnly, params.cliOnly));
  }

  const accessWhere = and(...accessConditions);
  const modelWhere = and(...modelConditions);

  // Query all matching access rows joined to models, plans, providers
  const rows = await db
    .select({
      modelId: schema.models.id,
      modelName: schema.models.name,
      modelCanonicalId: schema.models.canonicalId,
      modelSlug: schema.models.slug,
      developerName: schema.developers.name,
      accessId: schema.modelAccess.id,
      planId: schema.plans.id,
      planName: schema.plans.name,
      accessProviderName: schema.accessProviders.name,
      accessProviderSlug: schema.accessProviders.slug,
      availability: schema.modelAccess.availability,
      accessMethod: schema.modelAccess.accessMethod,
      authenticationType: schema.modelAccess.authenticationType,
      apiAccessType: schema.plans.apiAccessType,
      cliOnly: schema.modelAccess.cliOnly,
      webOnly: schema.modelAccess.webOnly,
      apiCompatible: schema.modelAccess.apiCompatible,
      includedInPlan: schema.modelAccess.includedInPlan,
      providerModelId: schema.modelAccess.providerModelId,
      priority: schema.modelAccess.priority,
    })
    .from(schema.modelAccess)
    .innerJoin(schema.models, eq(schema.modelAccess.modelId, schema.models.id))
    .innerJoin(schema.developers, eq(schema.models.developerId, schema.developers.id))
    .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(and(accessWhere, modelWhere))
    .orderBy(asc(schema.models.name), asc(schema.modelAccess.priority));

  // Group by model
  const modelMap = new Map<string, AccessMatrixRow>();
  for (const r of rows) {
    let entry = modelMap.get(r.modelId);
    if (!entry) {
      entry = {
        modelId: r.modelId,
        modelName: r.modelName,
        canonicalId: r.modelCanonicalId,
        slug: r.modelSlug,
        developerName: r.developerName,
        access: [],
      };
      modelMap.set(r.modelId, entry);
    }
    entry.access.push({
      accessId: r.accessId,
      planId: r.planId,
      planName: r.planName,
      accessProviderName: r.accessProviderName,
      accessProviderSlug: r.accessProviderSlug,
      availability: r.availability,
      accessMethod: r.accessMethod,
      authenticationType: r.authenticationType,
      apiAccessType: r.apiAccessType,
      cliOnly: r.cliOnly,
      webOnly: r.webOnly,
      apiCompatible: r.apiCompatible,
      includedInPlan: r.includedInPlan,
      providerModelId: r.providerModelId,
      priority: r.priority,
    });
  }

  const result = Array.from(modelMap.values()).slice(0, limit);
  return result;
}
