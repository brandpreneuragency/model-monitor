import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  accessMergeKey,
  formatCapabilityDisplay,
  formatScoreDisplay,
  mergeCapabilities,
  modelAliasWriteSchema,
  modelMergeSchema,
  modelUpdateSchema,
  modelWriteSchema,
  normalizeAlias,
  pathUuidSchema,
  planAccessMerge,
  planAliasMerge,
  slugifyModelName,
} from "@model-monitor/schemas";
import * as schema from "../schema/index";
import { listModelsEnriched, parseModelListQuery, ModelListError } from "./models-list";

export type Db = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export class ModelServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ModelServiceError";
  }
}

function fieldErrorsFromZod(
  errors: Record<string, string[] | undefined>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(errors)) {
    if (value && value.length > 0) out[key] = value;
  }
  return out;
}

function requireUuid(value: string, field: string): string {
  const parsed = pathUuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ModelServiceError("VALIDATION_ERROR", `Invalid ${field}`, 400, {
      [field]: ["Must be a valid UUID"],
    });
  }
  return parsed.data;
}

export interface AuditContext {
  actorUserId?: string | null;
  requestId?: string | null;
}

type AuditAction = (typeof schema.auditAction.enumValues)[number];

function asNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? null : n;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
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

function uniqueFieldFromError(error: unknown): string | null {
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  const causeMsg =
    error &&
    typeof error === "object" &&
    (error as { cause?: { message?: string } }).cause &&
    typeof (error as { cause: { message?: string } }).cause.message === "string"
      ? (error as { cause: { message: string } }).cause.message
      : "";
  const text = `${message} ${causeMsg}`.toLowerCase();
  if (text.includes("canonical")) return "canonicalId";
  if (text.includes("slug")) return "slug";
  if (text.includes("normalized_alias") || text.includes("alias")) return "alias";
  return null;
}

async function writeAudit(
  db: DbOrTx,
  input: {
    entityType: string;
    entityId: string | null;
    action: AuditAction;
    beforeData?: unknown;
    afterData?: unknown;
    metadata?: unknown;
    ctx?: AuditContext;
  },
) {
  const [row] = await db
    .insert(schema.auditEvents)
    .values({
      actorUserId: input.ctx?.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeData: input.beforeData ?? null,
      afterData: input.afterData ?? null,
      metadata: input.metadata ?? null,
      requestId: input.ctx?.requestId ?? null,
    })
    .returning({ id: schema.auditEvents.id });
  return row;
}

async function ensureUniqueSlug(db: DbOrTx, base: string, excludeId?: string) {
  let slug = slugifyModelName(base) || "model";
  let attempt = 0;
  while (attempt < 50) {
    const existing = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.slug, slug))
      .limit(1);
    if (!existing[0] || existing[0].id === excludeId) return slug;
    attempt += 1;
    slug = `${slugifyModelName(base)}-${attempt}`;
  }
  return `${slug}-${crypto.randomUUID().slice(0, 8)}`;
}

function mapModelRow(
  row: typeof schema.models.$inferSelect,
  extras: {
    developerName?: string | null;
    developerSlug?: string | null;
    capabilities?: typeof schema.modelCapabilities.$inferSelect | null;
    scores?: Array<{
      scoreType: string;
      scoreValue: string | null;
      rankValue: number | null;
      methodologyVersion?: string | null;
      methodologyName?: string | null;
      calculatedAt?: Date | string | null;
    }>;
    accessProviders?: string[];
    aliases?: Array<{ id: string; alias: string; aliasType: string; accessProviderId?: string | null }>;
  } = {},
) {
  const scoreMap: Record<
    string,
    { value: number | null; display: string; rank: number | null; methodologyVersion: string | null }
  > = {};
  // Retain newest score per type. Callers should pass newest-first; never overwrite an existing pivot.
  for (const s of extras.scores ?? []) {
    if (scoreMap[s.scoreType]) continue;
    const value = asNumber(s.scoreValue);
    scoreMap[s.scoreType] = {
      value,
      display: formatScoreDisplay(value),
      rank: s.rankValue,
      methodologyVersion: s.methodologyVersion ?? null,
    };
  }

  const caps = extras.capabilities;
  return {
    id: row.id,
    canonicalId: row.canonicalId,
    name: row.name,
    slug: row.slug,
    developerId: row.developerId,
    developerName: extras.developerName ?? null,
    developerSlug: extras.developerSlug ?? null,
    family: row.family,
    generation: row.generation,
    lifecycle: row.lifecycle,
    lifecycleRaw: row.lifecycleRaw,
    releaseDate: row.releaseDate,
    knowledgeCutoff: row.knowledgeCutoff,
    modelType: row.modelType,
    description: row.description,
    codingSpecialization: row.codingSpecialization,
    bestUse: row.bestUse,
    avoidFor: row.avoidFor,
    contextTokens: row.contextTokens,
    maxOutputTokens: row.maxOutputTokens,
    speedRating: row.speedRating,
    verifiedTps: asNumber(row.verifiedTps),
    verificationStatus: row.verificationStatus,
    verifiedAt: toIso(row.verifiedAt),
    needsRecheck: row.needsRecheck,
    needsReview: row.needsReview,
    isFavourite: row.isFavourite,
    workflowStatus: row.workflowStatus,
    status: row.status,
    archivedAt: toIso(row.archivedAt),
    mergedIntoModelId: row.mergedIntoModelId,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    capabilities: caps
      ? {
          vision: caps.vision,
          reasoning: caps.reasoning,
          toolUse: caps.toolUse,
          parallelAgents: caps.parallelAgents,
          computerUse: caps.computerUse,
          audioInput: caps.audioInput,
          videoInput: caps.videoInput,
          imageInput: caps.imageInput,
          structuredOutput: caps.structuredOutput,
          functionCalling: caps.functionCalling,
          details: caps.details,
          display: {
            vision: formatCapabilityDisplay(caps.vision),
            reasoning: formatCapabilityDisplay(caps.reasoning),
            toolUse: formatCapabilityDisplay(caps.toolUse),
          },
        }
      : null,
    scores: scoreMap,
    accessProviders: extras.accessProviders ?? [],
    aliases: extras.aliases ?? [],
  };
}

/** Explicit sensitive keys only — do not substring-match domain fields like contextTokens. */
const SENSITIVE_AUDIT_KEYS = new Set([
  "password",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "apiToken",
  "apiKey",
  "authorization",
  "cookie",
  "cookies",
  "credential",
  "credentials",
  "clientSecret",
  "privateKey",
  "tokenHash",
  "tokenPrefix",
]);

function isSensitiveAuditKey(key: string): boolean {
  const compact = key.trim().toLowerCase().replace(/[_-]/g, "");
  // Domain capacity fields contain “tokens” but are not credentials.
  if (["contexttokens", "maxoutputtokens", "verifiedtps"].includes(compact)) return false;
  if (SENSITIVE_AUDIT_KEYS.has(key)) return true;
  return /^(password|passwd|secret|token|accesstoken|refreshtoken|idtoken|apitoken|apikey|authorization|cookie|cookies|credential|credentials|clientsecret|privatekey|tokenhash|tokenprefix)$/.test(compact)
    || /(password|passwd|secret|tokenhash|tokenprefix|apikey|clientsecret|privatekey)$/.test(compact);
}

function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((v) => jsonSafe(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveAuditKey(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = jsonSafe(v);
    }
    return out;
  }
  return value;
}

function sortById<T extends { id?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
}

function sortKeyPart(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function snapshotSortedRows(rows: readonly unknown[]): unknown {
  const sorted = [...rows].sort((a, b) => {
    const ar = (a ?? {}) as Record<string, unknown>;
    const br = (b ?? {}) as Record<string, unknown>;
    const ai = sortKeyPart(ar.id ?? ar.entityId ?? ar.modelId);
    const bi = sortKeyPart(br.id ?? br.entityId ?? br.modelId);
    const c = ai.localeCompare(bi);
    if (c !== 0) return c;
    return JSON.stringify(ar).localeCompare(JSON.stringify(br));
  });
  return jsonSafe(sorted);
}

function snapshotCapabilities(
  capabilities: typeof schema.modelCapabilities.$inferSelect | null | undefined,
) {
  if (!capabilities) return null;
  return jsonSafe({
    modelId: capabilities.modelId,
    vision: capabilities.vision,
    reasoning: capabilities.reasoning,
    toolUse: capabilities.toolUse,
    parallelAgents: capabilities.parallelAgents,
    computerUse: capabilities.computerUse,
    audioInput: capabilities.audioInput,
    videoInput: capabilities.videoInput,
    imageInput: capabilities.imageInput,
    structuredOutput: capabilities.structuredOutput,
    functionCalling: capabilities.functionCalling,
    details: capabilities.details,
    updatedAt: capabilities.updatedAt,
  });
}

function snapshotAliases(
  aliases: Array<{
    id?: string;
    alias: string;
    aliasType: string;
    accessProviderId?: string | null;
    normalizedAlias?: string;
    createdAt?: Date | string | null;
  }>,
) {
  return [...aliases]
    .map((a) =>
      jsonSafe({
        id: a.id ?? null,
        alias: a.alias,
        aliasType: a.aliasType,
        accessProviderId: a.accessProviderId ?? null,
        normalizedAlias: a.normalizedAlias ?? normalizeAlias(a.alias),
        createdAt: a.createdAt ?? null,
      }),
    )
    .sort((a, b) => {
      const aa = String((a as { normalizedAlias?: string }).normalizedAlias ?? "");
      const bb = String((b as { normalizedAlias?: string }).normalizedAlias ?? "");
      return aa.localeCompare(bb);
    });
}

function snapshotAccessRows(
  rows: Array<typeof schema.modelAccess.$inferSelect>,
  pricingByAccessId: Map<string, Array<typeof schema.modelAccessPricing.$inferSelect>>,
) {
  return [...rows]
    .map((row) =>
      jsonSafe({
        id: row.id,
        modelId: row.modelId,
        planId: row.planId,
        providerModelId: row.providerModelId,
        availability: row.availability,
        accessMethod: row.accessMethod,
        authenticationType: row.authenticationType,
        includedInPlan: row.includedInPlan,
        apiCompatible: row.apiCompatible,
        cliOnly: row.cliOnly,
        webOnly: row.webOnly,
        oauthSupported: row.oauthSupported,
        priority: row.priority,
        limitations: row.limitations,
        verifiedAt: row.verifiedAt,
        availableFrom: row.availableFrom,
        availableUntil: row.availableUntil,
        notes: row.notes,
        status: row.status,
        archivedAt: row.archivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        pricing: sortById(pricingByAccessId.get(row.id) ?? []).map((p) =>
          jsonSafe({
            id: p.id,
            currency: p.currency,
            inputPerMillion: p.inputPerMillion,
            cachedReadPerMillion: p.cachedReadPerMillion,
            cacheWritePerMillion: p.cacheWritePerMillion,
            outputPerMillion: p.outputPerMillion,
            longInputPerMillion: p.longInputPerMillion,
            longCachedPerMillion: p.longCachedPerMillion,
            longCacheWritePerMillion: p.longCacheWritePerMillion,
            longOutputPerMillion: p.longOutputPerMillion,
            effectiveFrom: p.effectiveFrom,
            effectiveTo: p.effectiveTo,
            sourceUrl: p.sourceUrl,
            verifiedAt: p.verifiedAt,
            createdAt: p.createdAt,
          }),
        ),
      }),
    )
    .sort((a, b) => String((a as { id?: string }).id ?? "").localeCompare(String((b as { id?: string }).id ?? "")));
}

function snapshotModelState(
  model: typeof schema.models.$inferSelect,
  capabilities: typeof schema.modelCapabilities.$inferSelect | null | undefined,
  aliases: Array<{
    id?: string;
    alias: string;
    aliasType: string;
    accessProviderId?: string | null;
    normalizedAlias?: string;
    createdAt?: Date | string | null;
  }>,
  accessRows: Array<typeof schema.modelAccess.$inferSelect> = [],
  pricingByAccessId: Map<string, Array<typeof schema.modelAccessPricing.$inferSelect>> = new Map(),
) {
  return jsonSafe({
    id: model.id,
    canonicalId: model.canonicalId,
    name: model.name,
    slug: model.slug,
    developerId: model.developerId,
    family: model.family,
    generation: model.generation,
    lifecycle: model.lifecycle,
    lifecycleRaw: model.lifecycleRaw,
    releaseDate: model.releaseDate,
    knowledgeCutoff: model.knowledgeCutoff,
    modelType: model.modelType,
    description: model.description,
    codingSpecialization: model.codingSpecialization,
    bestUse: model.bestUse,
    avoidFor: model.avoidFor,
    contextTokens: model.contextTokens,
    maxOutputTokens: model.maxOutputTokens,
    speedRating: model.speedRating,
    verifiedTps: model.verifiedTps,
    verificationStatus: model.verificationStatus,
    verifiedAt: model.verifiedAt,
    needsRecheck: model.needsRecheck,
    metadata: model.metadata,
    status: model.status,
    archivedAt: model.archivedAt,
    mergedIntoModelId: model.mergedIntoModelId,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
    capabilities: snapshotCapabilities(capabilities),
    aliases: snapshotAliases(aliases),
    access: snapshotAccessRows(accessRows, pricingByAccessId),
  });
}

async function loadAccessSnapshot(tx: Tx, modelId: string) {
  const accessRows = await tx
    .select()
    .from(schema.modelAccess)
    .where(eq(schema.modelAccess.modelId, modelId));
  const accessIds = accessRows.map((r) => r.id);
  const pricingRows =
    accessIds.length === 0
      ? []
      : await tx
          .select()
          .from(schema.modelAccessPricing)
          .where(inArray(schema.modelAccessPricing.modelAccessId, accessIds));
  const pricingByAccessId = new Map<string, Array<typeof schema.modelAccessPricing.$inferSelect>>();
  for (const p of pricingRows) {
    const list = pricingByAccessId.get(p.modelAccessId) ?? [];
    list.push(p);
    pricingByAccessId.set(p.modelAccessId, list);
  }
  return { accessRows, pricingByAccessId };
}

/** Lock parent model and reject writes against merged tombstones. */
async function lockActiveWritableModel(tx: Tx, modelId: string) {
  const locked = await tx.execute(sql`
    SELECT *
    FROM models
    WHERE id = ${modelId}::uuid
    FOR UPDATE
  `);
  const rows = (Array.isArray(locked) ? locked : []) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    throw new ModelServiceError("NOT_FOUND", "Model not found", 404);
  }
  const row = rows[0];
  if (row.merged_into_model_id) {
    throw new ModelServiceError(
      "CONFLICT",
      "Merged models are immutable; open the surviving target model",
      409,
    );
  }
  return row;
}

/** Deterministic multi-model lock + relationship lock set for merge. */
async function lockModelsAndRelationships(tx: Tx, modelIds: string[]) {
  const ordered = [...new Set(modelIds)].sort();
  if (ordered.length === 0) return;
  const idList = sql.join(
    ordered.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  await tx.execute(sql`
    SELECT id FROM models
    WHERE id IN (${idList})
    ORDER BY id
    FOR UPDATE
  `);
  await tx.execute(sql`
    SELECT id FROM model_aliases
    WHERE model_id IN (${idList})
    ORDER BY id
    FOR UPDATE
  `);
  await tx.execute(sql`
    SELECT model_id FROM model_capabilities
    WHERE model_id IN (${idList})
    ORDER BY model_id
    FOR UPDATE
  `);
  await tx.execute(sql`
    SELECT id FROM model_access
    WHERE model_id IN (${idList})
    ORDER BY id
    FOR UPDATE
  `);
  await tx.execute(sql`
    SELECT p.id
    FROM model_access_pricing p
    JOIN model_access a ON a.id = p.model_access_id
    WHERE a.model_id IN (${idList})
    ORDER BY p.id
    FOR UPDATE
  `);
  await tx.execute(sql`
    SELECT id FROM model_scores
    WHERE model_id IN (${idList})
    ORDER BY id
    FOR UPDATE
  `);
  await tx.execute(sql`
    SELECT id FROM model_benchmark_results
    WHERE model_id IN (${idList})
    ORDER BY id
    FOR UPDATE
  `);
  // Model-level polymorphic relationships
  await tx.execute(sql`
    SELECT id FROM sources
    WHERE entity_type = 'model' AND entity_id IN (${idList})
    ORDER BY id
    FOR UPDATE
  `);
  await tx.execute(sql`
    SELECT id FROM import_provenance
    WHERE entity_type = 'model' AND entity_id IN (${idList})
    ORDER BY id
    FOR UPDATE
  `);
  // Access-level polymorphic relationships (entity_type='model_access')
  await tx.execute(sql`
    SELECT s.id FROM sources s
    JOIN model_access a ON a.id = s.entity_id
    WHERE s.entity_type = 'model_access'
      AND a.model_id IN (${idList})
    ORDER BY s.id
    FOR UPDATE
  `);
  await tx.execute(sql`
    SELECT p.id FROM import_provenance p
    JOIN model_access a ON a.id = p.entity_id
    WHERE p.entity_type = 'model_access'
      AND a.model_id IN (${idList})
    ORDER BY p.id
    FOR UPDATE
  `);
  await tx.execute(sql`
    SELECT id FROM usage_snapshots
    WHERE model_id IN (${idList})
    ORDER BY id
    FOR UPDATE
  `);
}

export { parseModelListQuery };

export async function listModels(db: Db, rawQuery: unknown) {
  try {
    return await listModelsEnriched(db, rawQuery);
  } catch (error) {
    if (error instanceof ModelListError) {
      throw new ModelServiceError(error.code, error.message, error.status, error.fieldErrors);
    }
    throw error;
  }
}

export async function getModelById(db: DbOrTx, modelId: string) {
  const id = requireUuid(modelId, "modelId");
  const rows = await db
    .select({
      model: schema.models,
      developerName: schema.developers.name,
      developerSlug: schema.developers.slug,
      capabilities: schema.modelCapabilities,
    })
    .from(schema.models)
    .innerJoin(schema.developers, eq(schema.models.developerId, schema.developers.id))
    .leftJoin(schema.modelCapabilities, eq(schema.modelCapabilities.modelId, schema.models.id))
    .where(eq(schema.models.id, id))
    .limit(1);

  if (!rows[0]) {
    throw new ModelServiceError("NOT_FOUND", "Model not found", 404);
  }

  const aliases = await db
    .select()
    .from(schema.modelAliases)
    .where(eq(schema.modelAliases.modelId, id));

  const scores = await db
    .select({
      id: schema.modelScores.id,
      scoreType: schema.modelScores.scoreType,
      scoreValue: schema.modelScores.scoreValue,
      rankValue: schema.modelScores.rankValue,
      eligibleCount: schema.modelScores.eligibleCount,
      confidence: schema.modelScores.confidence,
      isManualOverride: schema.modelScores.isManualOverride,
      overrideReason: schema.modelScores.overrideReason,
      calculatedAt: schema.modelScores.calculatedAt,
      methodologyId: schema.modelScores.methodologyId,
      methodologyName: schema.scoreMethodologies.name,
      methodologyVersion: schema.scoreMethodologies.version,
    })
    .from(schema.modelScores)
    .innerJoin(
      schema.scoreMethodologies,
      eq(schema.modelScores.methodologyId, schema.scoreMethodologies.id),
    )
    .where(eq(schema.modelScores.modelId, id))
    .orderBy(desc(schema.modelScores.calculatedAt), desc(schema.modelScores.id));

  const benchmarks = await db
    .select({
      id: schema.modelBenchmarkResults.id,
      score: schema.modelBenchmarkResults.score,
      scoreText: schema.modelBenchmarkResults.scoreText,
      setting: schema.modelBenchmarkResults.setting,
      harness: schema.modelBenchmarkResults.harness,
      resultDate: schema.modelBenchmarkResults.resultDate,
      sourceUrl: schema.modelBenchmarkResults.sourceUrl,
      sourceType: schema.modelBenchmarkResults.sourceType,
      verifiedAt: schema.modelBenchmarkResults.verifiedAt,
      notes: schema.modelBenchmarkResults.notes,
      benchmarkName: schema.benchmarks.name,
      category: schema.benchmarks.category,
      comparableGroup: schema.benchmarks.comparableGroup,
      scoreUnit: schema.benchmarks.scoreUnit,
      higherIsBetter: schema.benchmarks.higherIsBetter,
    })
    .from(schema.modelBenchmarkResults)
    .innerJoin(
      schema.benchmarks,
      eq(schema.modelBenchmarkResults.benchmarkId, schema.benchmarks.id),
    )
    .where(eq(schema.modelBenchmarkResults.modelId, id))
    .orderBy(asc(schema.benchmarks.category), asc(schema.benchmarks.name));

  const access = await db
    .select({
      id: schema.modelAccess.id,
      availability: schema.modelAccess.availability,
      accessMethod: schema.modelAccess.accessMethod,
      providerModelId: schema.modelAccess.providerModelId,
      cliOnly: schema.modelAccess.cliOnly,
      webOnly: schema.modelAccess.webOnly,
      apiCompatible: schema.modelAccess.apiCompatible,
      includedInPlan: schema.modelAccess.includedInPlan,
      limitations: schema.modelAccess.limitations,
      status: schema.modelAccess.status,
      planName: schema.plans.name,
      providerName: schema.accessProviders.name,
      providerSlug: schema.accessProviders.slug,
    })
    .from(schema.modelAccess)
    .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(eq(schema.modelAccess.modelId, id));

  const sources = await db
    .select()
    .from(schema.sources)
    .where(and(eq(schema.sources.entityType, "model"), eq(schema.sources.entityId, id)))
    .orderBy(desc(schema.sources.createdAt));

  const history = await db
    .select()
    .from(schema.auditEvents)
    .where(
      and(eq(schema.auditEvents.entityType, "model"), eq(schema.auditEvents.entityId, id)),
    )
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(100);

  const base = mapModelRow(rows[0].model, {
    developerName: rows[0].developerName,
    developerSlug: rows[0].developerSlug,
    capabilities: rows[0].capabilities,
    scores: scores.map((s) => ({
      scoreType: s.scoreType,
      scoreValue: s.scoreValue,
      rankValue: s.rankValue,
      methodologyVersion: s.methodologyVersion,
      methodologyName: s.methodologyName,
      calculatedAt: s.calculatedAt,
    })),
    accessProviders: [...new Set(access.map((a) => a.providerName))],
    aliases: aliases.map((a) => ({
      id: a.id,
      alias: a.alias,
      aliasType: a.aliasType,
      accessProviderId: a.accessProviderId,
    })),
  });

  return {
    ...base,
    aliases: aliases.map((a) => ({
      id: a.id,
      alias: a.alias,
      aliasType: a.aliasType,
      normalizedAlias: a.normalizedAlias,
      accessProviderId: a.accessProviderId,
    })),
    scoreRecords: scores.map((s) => {
      const value = asNumber(s.scoreValue);
      return {
        id: s.id,
        scoreType: s.scoreType,
        scoreValue: value,
        scoreDisplay: formatScoreDisplay(value),
        rankValue: s.rankValue,
        eligibleCount: s.eligibleCount,
        confidence: asNumber(s.confidence),
        isManualOverride: s.isManualOverride,
        overrideReason: s.overrideReason,
        calculatedAt: toIso(s.calculatedAt),
        methodologyId: s.methodologyId,
        methodologyName: s.methodologyName,
        methodologyVersion: s.methodologyVersion,
      };
    }),
    benchmarks: benchmarks.map((b) => {
      const score = asNumber(b.score);
      return {
        id: b.id,
        benchmarkName: b.benchmarkName,
        category: b.category,
        comparableGroup: b.comparableGroup,
        setting: b.setting,
        harness: b.harness,
        score,
        scoreDisplay: b.scoreText ?? formatScoreDisplay(score),
        scoreUnit: b.scoreUnit,
        higherIsBetter: b.higherIsBetter,
        resultDate: b.resultDate,
        sourceUrl: b.sourceUrl,
        sourceType: b.sourceType,
        verifiedAt: toIso(b.verifiedAt),
        notes: b.notes,
      };
    }),
    access: access.map((a) => ({
      id: a.id,
      availability: a.availability,
      accessMethod: a.accessMethod,
      providerModelId: a.providerModelId,
      cliOnly: a.cliOnly,
      webOnly: a.webOnly,
      apiCompatible: a.apiCompatible,
      includedInPlan: a.includedInPlan,
      limitations: a.limitations,
      status: a.status,
      planName: a.planName,
      providerName: a.providerName,
      providerSlug: a.providerSlug,
    })),
    sources: sources.map((s) => ({
      id: s.id,
      sourceType: s.sourceType,
      url: s.url,
      title: s.title,
      publisher: s.publisher,
      retrievedAt: toIso(s.retrievedAt),
      verifiedAt: toIso(s.verifiedAt),
      notes: s.notes,
    })),
    history: history.map((h) => ({
      id: h.id,
      action: h.action,
      beforeData: h.beforeData,
      afterData: h.afterData,
      metadata: h.metadata,
      requestId: h.requestId,
      createdAt: toIso(h.createdAt),
    })),
  };
}

export async function listDevelopers(db: Db) {
  return db
    .select({
      id: schema.developers.id,
      name: schema.developers.name,
      slug: schema.developers.slug,
    })
    .from(schema.developers)
    .where(eq(schema.developers.status, "active"))
    .orderBy(asc(schema.developers.name));
}

async function ensureUnknownDeveloper(db: DbOrTx): Promise<string> {
  const [existing] = await db
    .select({ id: schema.developers.id })
    .from(schema.developers)
    .where(eq(schema.developers.slug, "unknown"))
    .limit(1);
  if (existing) return existing.id;

  try {
    const [created] = await db
      .insert(schema.developers)
      .values({
        name: "Unknown",
        slug: "unknown",
        notes: "Placeholder creator for incomplete model records",
        status: "active",
      })
      .returning({ id: schema.developers.id });
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [again] = await db
        .select({ id: schema.developers.id })
        .from(schema.developers)
        .where(eq(schema.developers.slug, "unknown"))
        .limit(1);
      if (again) return again.id;
    }
    throw error;
  }
}

async function ensureUniqueCanonicalId(db: DbOrTx, base: string): Promise<string> {
  let candidate = base.slice(0, 180) || `local:${crypto.randomUUID().slice(0, 8)}`;
  let attempt = 0;
  while (attempt < 50) {
    const [existing] = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.canonicalId, candidate))
      .limit(1);
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base.slice(0, 160)}-${attempt}`;
  }
  return `${base.slice(0, 140)}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createModel(
  db: Db,
  rawInput: unknown,
  ctx: AuditContext = {},
) {
  const parsed = modelWriteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid model payload",
      400,
      fieldErrorsFromZod(parsed.error.flatten().fieldErrors),
    );
  }
  const input = parsed.data;

  let developerId = input.developerId;
  if (developerId) {
    const [dev] = await db
      .select({ id: schema.developers.id })
      .from(schema.developers)
      .where(eq(schema.developers.id, developerId))
      .limit(1);
    if (!dev) {
      throw new ModelServiceError("VALIDATION_ERROR", "Developer not found", 400, {
        developerId: ["Developer not found"],
      });
    }
  } else {
    developerId = await ensureUnknownDeveloper(db);
  }

  let canonicalId = input.canonicalId?.trim();
  if (!canonicalId) {
    const base = slugifyModelName(input.name) || "model";
    canonicalId = await ensureUniqueCanonicalId(db, `local:${base}`);
  } else {
    const [existingCanonical] = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.canonicalId, canonicalId))
      .limit(1);
    if (existingCanonical) {
      throw new ModelServiceError(
        "CONFLICT",
        "A model with this canonical ID already exists",
        409,
        { canonicalId: ["Canonical ID must be unique"] },
      );
    }
  }

  try {
    const createdId = await db.transaction(async (tx) => {
      const slug = await ensureUniqueSlug(tx, input.name);
      const [created] = await tx
        .insert(schema.models)
        .values({
          developerId,
          canonicalId,
          name: input.name,
          slug,
          family: input.family ?? null,
          generation: input.generation ?? null,
          lifecycle: input.lifecycle,
          lifecycleRaw: input.lifecycleRaw ?? null,
          releaseDate: input.releaseDate ?? null,
          knowledgeCutoff: input.knowledgeCutoff ?? null,
          modelType: input.modelType ?? null,
          description: input.description ?? null,
          codingSpecialization: input.codingSpecialization ?? null,
          bestUse: input.bestUse ?? null,
          avoidFor: input.avoidFor ?? null,
          contextTokens: input.contextTokens ?? null,
          maxOutputTokens: input.maxOutputTokens ?? null,
          speedRating: input.speedRating ?? null,
          needsRecheck: input.needsRecheck,
          isFavourite: input.isFavourite ?? false,
          needsReview: input.needsReview ?? false,
          workflowStatus: input.workflowStatus ?? null,
          status: "active",
        })
        .returning();

      const caps = input.capabilities ?? {};
      await tx.insert(schema.modelCapabilities).values({
        modelId: created.id,
        vision: caps.vision ?? null,
        reasoning: caps.reasoning ?? null,
        toolUse: caps.toolUse ?? null,
        parallelAgents: caps.parallelAgents ?? null,
        computerUse: caps.computerUse ?? null,
        audioInput: caps.audioInput ?? null,
        videoInput: caps.videoInput ?? null,
        imageInput: caps.imageInput ?? null,
        structuredOutput: caps.structuredOutput ?? null,
        functionCalling: caps.functionCalling ?? null,
        details: caps.details ?? {},
      });

      if (input.aliases?.length) {
        for (const alias of input.aliases) {
          await tx.insert(schema.modelAliases).values({
            modelId: created.id,
            alias: alias.alias,
            normalizedAlias: normalizeAlias(alias.alias),
            aliasType: alias.aliasType,
            accessProviderId: alias.accessProviderId ?? null,
          });
        }
      }

      const [capRow] = await tx
        .select()
        .from(schema.modelCapabilities)
        .where(eq(schema.modelCapabilities.modelId, created.id))
        .limit(1);
      const aliasRows = await tx
        .select()
        .from(schema.modelAliases)
        .where(eq(schema.modelAliases.modelId, created.id));

      await writeAudit(tx, {
        entityType: "model",
        entityId: created.id,
        action: "create",
        afterData: snapshotModelState(created, capRow, aliasRows),
        ctx,
      });

      return created.id;
    });

    return getModelById(db, createdId);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const field = uniqueFieldFromError(error) ?? "canonicalId";
      throw new ModelServiceError("CONFLICT", "Unique constraint violation", 409, {
        [field]: ["Must be unique"],
      });
    }
    throw error;
  }
}

export async function updateModel(
  db: Db,
  modelId: string,
  rawInput: unknown,
  ctx: AuditContext = {},
) {
  modelId = requireUuid(modelId, "modelId");
  const parsed = modelUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid model payload",
      400,
      fieldErrorsFromZod(parsed.error.flatten().fieldErrors),
    );
  }
  const input = parsed.data;

  if (input.developerId !== undefined) {
    const [dev] = await db
      .select({ id: schema.developers.id })
      .from(schema.developers)
      .where(eq(schema.developers.id, input.developerId))
      .limit(1);
    if (!dev) {
      throw new ModelServiceError("VALIDATION_ERROR", "Developer not found", 400, {
        developerId: ["Developer not found"],
      });
    }
  }

  try {
    await db.transaction(async (tx) => {
      await lockActiveWritableModel(tx, modelId);
      const locked = await tx
        .select()
        .from(schema.models)
        .where(eq(schema.models.id, modelId))
        .for("update");
      const before = locked[0];
      if (!before) {
        throw new ModelServiceError("NOT_FOUND", "Model not found", 404);
      }
      if (before.mergedIntoModelId) {
        throw new ModelServiceError(
          "CONFLICT",
          "Merged models are immutable; open the surviving target model",
          409,
        );
      }

      if (input.canonicalId && input.canonicalId !== before.canonicalId) {
        const [clash] = await tx
          .select({ id: schema.models.id })
          .from(schema.models)
          .where(eq(schema.models.canonicalId, input.canonicalId))
          .limit(1);
        if (clash) {
          throw new ModelServiceError("CONFLICT", "Canonical ID already in use", 409, {
            canonicalId: ["Canonical ID must be unique"],
          });
        }
      }

      const [beforeCaps] = await tx
        .select()
        .from(schema.modelCapabilities)
        .where(eq(schema.modelCapabilities.modelId, modelId))
        .limit(1);
      const beforeAliases = await tx
        .select()
        .from(schema.modelAliases)
        .where(eq(schema.modelAliases.modelId, modelId));
      const beforeAccess = await loadAccessSnapshot(tx, modelId);

      const patch: Partial<typeof schema.models.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.canonicalId !== undefined) patch.canonicalId = input.canonicalId;
      if (input.name !== undefined) {
        patch.name = input.name;
        patch.slug = await ensureUniqueSlug(tx, input.name, modelId);
      }
      if (input.developerId !== undefined) patch.developerId = input.developerId;
      if (input.family !== undefined) patch.family = input.family;
      if (input.generation !== undefined) patch.generation = input.generation;
      if (input.lifecycle !== undefined) patch.lifecycle = input.lifecycle;
      if (input.lifecycleRaw !== undefined) patch.lifecycleRaw = input.lifecycleRaw;
      if (input.releaseDate !== undefined) patch.releaseDate = input.releaseDate;
      if (input.knowledgeCutoff !== undefined) patch.knowledgeCutoff = input.knowledgeCutoff;
      if (input.modelType !== undefined) patch.modelType = input.modelType;
      if (input.description !== undefined) patch.description = input.description;
      if (input.codingSpecialization !== undefined) {
        patch.codingSpecialization = input.codingSpecialization;
      }
      if (input.bestUse !== undefined) patch.bestUse = input.bestUse;
      if (input.avoidFor !== undefined) patch.avoidFor = input.avoidFor;
      if (input.contextTokens !== undefined) patch.contextTokens = input.contextTokens;
      if (input.maxOutputTokens !== undefined) patch.maxOutputTokens = input.maxOutputTokens;
      if (input.speedRating !== undefined) patch.speedRating = input.speedRating;
      if (input.needsRecheck !== undefined) patch.needsRecheck = input.needsRecheck;
      if (input.isFavourite !== undefined) patch.isFavourite = input.isFavourite;
      if (input.needsReview !== undefined) patch.needsReview = input.needsReview;
      if (input.workflowStatus !== undefined) patch.workflowStatus = input.workflowStatus;

      const [updated] = await tx
        .update(schema.models)
        .set(patch)
        .where(eq(schema.models.id, modelId))
        .returning();

      if (input.capabilities) {
        const caps = input.capabilities;
        await tx
          .insert(schema.modelCapabilities)
          .values({
            modelId,
            vision: caps.vision ?? null,
            reasoning: caps.reasoning ?? null,
            toolUse: caps.toolUse ?? null,
            parallelAgents: caps.parallelAgents ?? null,
            computerUse: caps.computerUse ?? null,
            audioInput: caps.audioInput ?? null,
            videoInput: caps.videoInput ?? null,
            imageInput: caps.imageInput ?? null,
            structuredOutput: caps.structuredOutput ?? null,
            functionCalling: caps.functionCalling ?? null,
            details: caps.details ?? {},
          })
          .onConflictDoUpdate({
            target: schema.modelCapabilities.modelId,
            set: {
              vision: caps.vision === undefined ? sql`${schema.modelCapabilities.vision}` : caps.vision,
              reasoning:
                caps.reasoning === undefined
                  ? sql`${schema.modelCapabilities.reasoning}`
                  : caps.reasoning,
              toolUse:
                caps.toolUse === undefined ? sql`${schema.modelCapabilities.toolUse}` : caps.toolUse,
              parallelAgents:
                caps.parallelAgents === undefined
                  ? sql`${schema.modelCapabilities.parallelAgents}`
                  : caps.parallelAgents,
              computerUse:
                caps.computerUse === undefined
                  ? sql`${schema.modelCapabilities.computerUse}`
                  : caps.computerUse,
              audioInput:
                caps.audioInput === undefined
                  ? sql`${schema.modelCapabilities.audioInput}`
                  : caps.audioInput,
              videoInput:
                caps.videoInput === undefined
                  ? sql`${schema.modelCapabilities.videoInput}`
                  : caps.videoInput,
              imageInput:
                caps.imageInput === undefined
                  ? sql`${schema.modelCapabilities.imageInput}`
                  : caps.imageInput,
              structuredOutput:
                caps.structuredOutput === undefined
                  ? sql`${schema.modelCapabilities.structuredOutput}`
                  : caps.structuredOutput,
              functionCalling:
                caps.functionCalling === undefined
                  ? sql`${schema.modelCapabilities.functionCalling}`
                  : caps.functionCalling,
              details: caps.details ?? sql`${schema.modelCapabilities.details}`,
              updatedAt: new Date(),
            },
          });
      }

      // Only replace aliases when explicitly provided — name-only edits preserve alias metadata.
      if (input.aliases) {
        await tx.delete(schema.modelAliases).where(eq(schema.modelAliases.modelId, modelId));
        for (const alias of input.aliases) {
          await tx.insert(schema.modelAliases).values({
            modelId,
            alias: alias.alias,
            normalizedAlias: normalizeAlias(alias.alias),
            aliasType: alias.aliasType,
            accessProviderId: alias.accessProviderId ?? null,
          });
        }
      }

      const [afterCaps] = await tx
        .select()
        .from(schema.modelCapabilities)
        .where(eq(schema.modelCapabilities.modelId, modelId))
        .limit(1);
      const afterAliases = await tx
        .select()
        .from(schema.modelAliases)
        .where(eq(schema.modelAliases.modelId, modelId));
      const afterAccess = await loadAccessSnapshot(tx, modelId);

      await writeAudit(tx, {
        entityType: "model",
        entityId: modelId,
        action: "update",
        beforeData: snapshotModelState(
          before,
          beforeCaps,
          beforeAliases,
          beforeAccess.accessRows,
          beforeAccess.pricingByAccessId,
        ),
        afterData: snapshotModelState(
          updated,
          afterCaps,
          afterAliases,
          afterAccess.accessRows,
          afterAccess.pricingByAccessId,
        ),
        ctx,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const field = uniqueFieldFromError(error) ?? "canonicalId";
      throw new ModelServiceError("CONFLICT", "Unique constraint violation", 409, {
        [field]: ["Must be unique"],
      });
    }
    throw error;
  }

  return getModelById(db, modelId);
}

export async function archiveModel(db: Db, modelId: string, ctx: AuditContext = {}) {
  modelId = requireUuid(modelId, "modelId");

  await db.transaction(async (tx) => {
    await lockActiveWritableModel(tx, modelId);
    const locked = await tx
      .select()
      .from(schema.models)
      .where(eq(schema.models.id, modelId))
      .for("update");
    const before = locked[0];
    if (!before) throw new ModelServiceError("NOT_FOUND", "Model not found", 404);
    if (before.mergedIntoModelId) {
      throw new ModelServiceError(
        "CONFLICT",
        "Merged models are immutable; open the surviving target model",
        409,
      );
    }
    if (before.status === "archived") {
      return;
    }

    const [beforeCaps] = await tx
      .select()
      .from(schema.modelCapabilities)
      .where(eq(schema.modelCapabilities.modelId, modelId))
      .limit(1);
    const beforeAliases = await tx
      .select()
      .from(schema.modelAliases)
      .where(eq(schema.modelAliases.modelId, modelId));
    const beforeAccess = await loadAccessSnapshot(tx, modelId);

    const [updated] = await tx
      .update(schema.models)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.models.id, modelId))
      .returning();
    await writeAudit(tx, {
      entityType: "model",
      entityId: modelId,
      action: "archive",
      beforeData: snapshotModelState(
        before,
        beforeCaps,
        beforeAliases,
        beforeAccess.accessRows,
        beforeAccess.pricingByAccessId,
      ),
      afterData: snapshotModelState(
        updated,
        beforeCaps,
        beforeAliases,
        beforeAccess.accessRows,
        beforeAccess.pricingByAccessId,
      ),
      ctx,
    });
  });

  return getModelById(db, modelId);
}

export async function restoreModel(db: Db, modelId: string, ctx: AuditContext = {}) {
  modelId = requireUuid(modelId, "modelId");

  await db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(schema.models)
      .where(eq(schema.models.id, modelId))
      .for("update");
    const before = locked[0];
    if (!before) throw new ModelServiceError("NOT_FOUND", "Model not found", 404);
    if (before.mergedIntoModelId) {
      throw new ModelServiceError(
        "CONFLICT",
        "Merged models cannot be restored independently; open the surviving target model",
        409,
      );
    }

    const [beforeCaps] = await tx
      .select()
      .from(schema.modelCapabilities)
      .where(eq(schema.modelCapabilities.modelId, modelId))
      .limit(1);
    const beforeAliases = await tx
      .select()
      .from(schema.modelAliases)
      .where(eq(schema.modelAliases.modelId, modelId));
    const beforeAccess = await loadAccessSnapshot(tx, modelId);

    const [updated] = await tx
      .update(schema.models)
      .set({
        status: "active",
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.models.id, modelId))
      .returning();
    await writeAudit(tx, {
      entityType: "model",
      entityId: modelId,
      action: "restore",
      beforeData: snapshotModelState(
        before,
        beforeCaps,
        beforeAliases,
        beforeAccess.accessRows,
        beforeAccess.pricingByAccessId,
      ),
      afterData: snapshotModelState(
        updated,
        beforeCaps,
        beforeAliases,
        beforeAccess.accessRows,
        beforeAccess.pricingByAccessId,
      ),
      ctx,
    });
  });

  return getModelById(db, modelId);
}

export async function addModelAlias(
  db: Db,
  modelId: string,
  raw: unknown,
  ctx: AuditContext = {},
) {
  const id = requireUuid(modelId, "modelId");
  const parsed = modelAliasWriteSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid alias payload",
      400,
      fieldErrorsFromZod(parsed.error.flatten().fieldErrors),
    );
  }

  if (parsed.data.accessProviderId) {
    const [ap] = await db
      .select({ id: schema.accessProviders.id })
      .from(schema.accessProviders)
      .where(eq(schema.accessProviders.id, parsed.data.accessProviderId))
      .limit(1);
    if (!ap) {
      throw new ModelServiceError("VALIDATION_ERROR", "Access provider not found", 400, {
        accessProviderId: ["Access provider not found"],
      });
    }
  }

  const alias = parsed.data.alias;
  const normalized = normalizeAlias(alias);

  try {
    return await db.transaction(async (tx) => {
      await lockActiveWritableModel(tx, id);
      const [created] = await tx
        .insert(schema.modelAliases)
        .values({
          modelId: id,
          alias,
          normalizedAlias: normalized,
          aliasType: parsed.data.aliasType,
          accessProviderId: parsed.data.accessProviderId ?? null,
        })
        .returning();

      await writeAudit(tx, {
        entityType: "model",
        entityId: id,
        action: "update",
        afterData: {
          aliasAdded: {
            id: created.id,
            alias: created.alias,
            aliasType: created.aliasType,
            accessProviderId: created.accessProviderId,
            normalizedAlias: created.normalizedAlias,
          },
        },
        metadata: { aliasId: created.id },
        ctx,
      });
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Alias already exists", 409, {
        alias: ["Normalized alias must be unique"],
      });
    }
    throw error;
  }
}

const AVAILABILITY_RANK: Record<string, number> = {
  confirmed: 4,
  unconfirmed: 3,
  unavailable: 2,
  removed: 1,
};

function preferBool(a: boolean | null | undefined, b: boolean | null | undefined): boolean | null {
  if (a === true || b === true) return true;
  if (a === false || b === false) return false;
  return a ?? b ?? null;
}

function preferText(a: string | null | undefined, b: string | null | undefined): string | null {
  const at = a?.trim() ? a : null;
  const bt = b?.trim() ? b : null;
  if (at && bt) return at.length >= bt.length ? at : bt;
  return at ?? bt;
}

function preferAvailability(a: string, b: string): string {
  return (AVAILABILITY_RANK[a] ?? 0) >= (AVAILABILITY_RANK[b] ?? 0) ? a : b;
}

function preferStatus(a: string, b: string): string {
  if (a === "active" || b === "active") return "active";
  return a;
}


function asTri(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function asDetails(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function preferDate(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): Date | null {
  if (!a && !b) return null;
  if (!a) return b instanceof Date ? b : b ? new Date(b) : null;
  if (!b) return a instanceof Date ? a : new Date(a);
  const ad = a instanceof Date ? a : new Date(a);
  const bd = b instanceof Date ? b : new Date(b);
  return ad >= bd ? ad : bd;
}

/** Core merge body that runs inside an existing transaction (idempotency-safe). */
export async function mergeModelsInTransaction(
  tx: Tx,
  rawInput: unknown,
  ctx: AuditContext = {},
) {
  const parsed = modelMergeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid merge payload",
      400,
      fieldErrorsFromZod(parsed.error.flatten().fieldErrors),
    );
  }
  const { sourceModelId, targetModelId, resolutions } = parsed.data;
  if (sourceModelId === targetModelId) {
    throw new ModelServiceError("VALIDATION_ERROR", "Source and target must differ", 400);
  }

  await lockModelsAndRelationships(tx, [sourceModelId, targetModelId]);

  const [targetModel] = await tx
    .select()
    .from(schema.models)
    .where(eq(schema.models.id, targetModelId))
    .limit(1);
  const [sourceModel] = await tx
    .select()
    .from(schema.models)
    .where(eq(schema.models.id, sourceModelId))
    .limit(1);
  if (!sourceModel || !targetModel) {
    throw new ModelServiceError("NOT_FOUND", "Source or target model not found", 404);
  }
  if (targetModel.status !== "active") {
    throw new ModelServiceError("CONFLICT", "Target model must be active", 409);
  }
  if (sourceModel.mergedIntoModelId) {
    throw new ModelServiceError("CONFLICT", "Source model was already merged", 409);
  }
  if (targetModel.mergedIntoModelId) {
    throw new ModelServiceError("CONFLICT", "Target model was already merged", 409);
  }

  // Capture exact pre-merge relationship state (including pricing ownership) BEFORE any moves.
  const [sourceCapsBefore] = await tx
    .select()
    .from(schema.modelCapabilities)
    .where(eq(schema.modelCapabilities.modelId, sourceModelId))
    .limit(1);
  const [targetCapsBefore] = await tx
    .select()
    .from(schema.modelCapabilities)
    .where(eq(schema.modelCapabilities.modelId, targetModelId))
    .limit(1);
  const sourceAliasesBefore = await tx
    .select()
    .from(schema.modelAliases)
    .where(eq(schema.modelAliases.modelId, sourceModelId));
  const targetAliasesBefore = await tx
    .select()
    .from(schema.modelAliases)
    .where(eq(schema.modelAliases.modelId, targetModelId));
  const sourceAccessBeforeSnap = await loadAccessSnapshot(tx, sourceModelId);
  const targetAccessBeforeSnap = await loadAccessSnapshot(tx, targetModelId);
  const sourceScoresBefore = await tx
    .select()
    .from(schema.modelScores)
    .where(eq(schema.modelScores.modelId, sourceModelId));
  const targetScoresBefore = await tx
    .select()
    .from(schema.modelScores)
    .where(eq(schema.modelScores.modelId, targetModelId));
  const sourceBenchBefore = await tx
    .select()
    .from(schema.modelBenchmarkResults)
    .where(eq(schema.modelBenchmarkResults.modelId, sourceModelId));
  const targetBenchBefore = await tx
    .select()
    .from(schema.modelBenchmarkResults)
    .where(eq(schema.modelBenchmarkResults.modelId, targetModelId));
  const sourceModelSourcesBefore = await tx
    .select()
    .from(schema.sources)
    .where(and(eq(schema.sources.entityType, "model"), eq(schema.sources.entityId, sourceModelId)));
  const targetModelSourcesBefore = await tx
    .select()
    .from(schema.sources)
    .where(and(eq(schema.sources.entityType, "model"), eq(schema.sources.entityId, targetModelId)));
  const sourceAccessIdsBefore = sourceAccessBeforeSnap.accessRows.map((r) => r.id);
  const targetAccessIdsBefore = targetAccessBeforeSnap.accessRows.map((r) => r.id);
  const sourceAccessSourcesBefore =
    sourceAccessIdsBefore.length === 0
      ? []
      : await tx
          .select()
          .from(schema.sources)
          .where(
            and(
              eq(schema.sources.entityType, "model_access"),
              inArray(schema.sources.entityId, sourceAccessIdsBefore),
            ),
          );
  const targetAccessSourcesBefore =
    targetAccessIdsBefore.length === 0
      ? []
      : await tx
          .select()
          .from(schema.sources)
          .where(
            and(
              eq(schema.sources.entityType, "model_access"),
              inArray(schema.sources.entityId, targetAccessIdsBefore),
            ),
          );
  const sourceProvBefore = await tx
    .select()
    .from(schema.importProvenance)
    .where(
      and(
        eq(schema.importProvenance.entityType, "model"),
        eq(schema.importProvenance.entityId, sourceModelId),
      ),
    );
  const targetProvBefore = await tx
    .select()
    .from(schema.importProvenance)
    .where(
      and(
        eq(schema.importProvenance.entityType, "model"),
        eq(schema.importProvenance.entityId, targetModelId),
      ),
    );
  const sourceAccessProvBefore =
    sourceAccessIdsBefore.length === 0
      ? []
      : await tx
          .select()
          .from(schema.importProvenance)
          .where(
            and(
              eq(schema.importProvenance.entityType, "model_access"),
              inArray(schema.importProvenance.entityId, sourceAccessIdsBefore),
            ),
          );
  const targetAccessProvBefore =
    targetAccessIdsBefore.length === 0
      ? []
      : await tx
          .select()
          .from(schema.importProvenance)
          .where(
            and(
              eq(schema.importProvenance.entityType, "model_access"),
              inArray(schema.importProvenance.entityId, targetAccessIdsBefore),
            ),
          );
  const sourceUsageBefore = await tx
    .select()
    .from(schema.usageSnapshots)
    .where(eq(schema.usageSnapshots.modelId, sourceModelId));
  const targetUsageBefore = await tx
    .select()
    .from(schema.usageSnapshots)
    .where(eq(schema.usageSnapshots.modelId, targetModelId));

  const safeSourceBefore = snapshotModelState(
    sourceModel,
    sourceCapsBefore,
    sourceAliasesBefore,
    sourceAccessBeforeSnap.accessRows,
    sourceAccessBeforeSnap.pricingByAccessId,
  );
  const safeTargetBefore = snapshotModelState(
    targetModel,
    targetCapsBefore,
    targetAliasesBefore,
    targetAccessBeforeSnap.accessRows,
    targetAccessBeforeSnap.pricingByAccessId,
  );
  const relationshipBefore = {
    sourceAliases: snapshotAliases(sourceAliasesBefore),
    targetAliases: snapshotAliases(targetAliasesBefore),
    sourceAccess: snapshotAccessRows(
      sourceAccessBeforeSnap.accessRows,
      sourceAccessBeforeSnap.pricingByAccessId,
    ),
    targetAccess: snapshotAccessRows(
      targetAccessBeforeSnap.accessRows,
      targetAccessBeforeSnap.pricingByAccessId,
    ),
    sourceScores: snapshotSortedRows(sourceScoresBefore),
    targetScores: snapshotSortedRows(targetScoresBefore),
    sourceBenchmarks: snapshotSortedRows(sourceBenchBefore),
    targetBenchmarks: snapshotSortedRows(targetBenchBefore),
    sourceSources: snapshotSortedRows([
      ...sourceModelSourcesBefore,
      ...sourceAccessSourcesBefore,
    ]),
    targetSources: snapshotSortedRows([
      ...targetModelSourcesBefore,
      ...targetAccessSourcesBefore,
    ]),
    sourceProvenance: snapshotSortedRows([...sourceProvBefore, ...sourceAccessProvBefore]),
    targetProvenance: snapshotSortedRows([...targetProvBefore, ...targetAccessProvBefore]),
    sourceUsage: snapshotSortedRows(sourceUsageBefore),
    targetUsage: snapshotSortedRows(targetUsageBefore),
  };

  const appliedResolutions: Record<string, unknown> = {};
  if (resolutions) {
    const patch: Partial<typeof schema.models.$inferInsert> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(resolutions)) {
      if (value === undefined) continue;
      appliedResolutions[key] = value;
      switch (key) {
        case "name":
          patch.name = value as string;
          patch.slug = await ensureUniqueSlug(tx, value as string, targetModelId);
          break;
        case "canonicalId":
          patch.canonicalId = value as string;
          break;
        case "family":
          patch.family = value as string | null;
          break;
        case "generation":
          patch.generation = value as string | null;
          break;
        case "lifecycle":
          patch.lifecycle = value as typeof schema.models.$inferSelect.lifecycle;
          break;
        case "lifecycleRaw":
          patch.lifecycleRaw = value as string | null;
          break;
        case "releaseDate":
          patch.releaseDate = value as string | null;
          break;
        case "knowledgeCutoff":
          patch.knowledgeCutoff = value as string | null;
          break;
        case "modelType":
          patch.modelType = value as string | null;
          break;
        case "description":
          patch.description = value as string | null;
          break;
        case "codingSpecialization":
          patch.codingSpecialization = value as string | null;
          break;
        case "bestUse":
          patch.bestUse = value as string | null;
          break;
        case "avoidFor":
          patch.avoidFor = value as string | null;
          break;
        case "contextTokens":
          patch.contextTokens = value as number | null;
          break;
        case "maxOutputTokens":
          patch.maxOutputTokens = value as number | null;
          break;
        case "speedRating":
          patch.speedRating = value as string | null;
          break;
        case "developerId": {
          const [dev] = await tx
            .select({ id: schema.developers.id })
            .from(schema.developers)
            .where(eq(schema.developers.id, value as string))
            .limit(1);
          if (!dev) {
            throw new ModelServiceError("VALIDATION_ERROR", "Developer not found", 400, {
              developerId: ["Developer not found"],
            });
          }
          patch.developerId = value as string;
          break;
        }
        default:
          break;
      }
    }
    if (Object.keys(appliedResolutions).length > 0) {
      try {
        await tx.update(schema.models).set(patch).where(eq(schema.models.id, targetModelId));
      } catch (error) {
        if (isUniqueViolation(error)) {
          const field = uniqueFieldFromError(error) ?? "canonicalId";
          throw new ModelServiceError("CONFLICT", "Resolution caused a unique conflict", 409, {
            [field]: ["Must be unique"],
          });
        }
        throw error;
      }
    }
  }

  const targetAliases = await tx
    .select()
    .from(schema.modelAliases)
    .where(eq(schema.modelAliases.modelId, targetModelId));
  const sourceAliases = await tx
    .select()
    .from(schema.modelAliases)
    .where(eq(schema.modelAliases.modelId, sourceModelId));

  const aliasPlan = planAliasMerge(
    targetAliases.map((a) => a.normalizedAlias),
    sourceAliases.map((a) => ({ alias: a.alias, normalizedAlias: a.normalizedAlias })),
  );

  let aliasesTransferred = 0;
  let aliasesSkipped = 0;
  for (const a of sourceAliases) {
    if (aliasPlan.skippedDuplicates.includes(a.alias)) {
      await tx.delete(schema.modelAliases).where(eq(schema.modelAliases.id, a.id));
      aliasesSkipped += 1;
    } else {
      await tx
        .update(schema.modelAliases)
        .set({ modelId: targetModelId })
        .where(eq(schema.modelAliases.id, a.id));
      aliasesTransferred += 1;
    }
  }

  const targetAccess = await tx
    .select()
    .from(schema.modelAccess)
    .where(eq(schema.modelAccess.modelId, targetModelId))
    .orderBy(schema.modelAccess.id);
  const sourceAccess = await tx
    .select()
    .from(schema.modelAccess)
    .where(eq(schema.modelAccess.modelId, sourceModelId))
    .orderBy(schema.modelAccess.id);

  const accessPlan = planAccessMerge(
    targetAccess.map((a) => accessMergeKey(a)),
    sourceAccess.map((a) => ({
      id: a.id,
      planId: a.planId,
      providerModelId: a.providerModelId,
    })),
  );

  const targetByKey = new Map(targetAccess.map((a) => [accessMergeKey(a), a]));
  let accessTransferred = 0;
  let accessDeduped = 0;
  let pricingMoved = 0;
  const accessPolicy: Array<Record<string, unknown>> = [];

  for (const id of accessPlan.transferIds) {
    const sourceRow = sourceAccess.find((a) => a.id === id);
    if (!sourceRow) continue;
    await tx
      .update(schema.modelAccess)
      .set({ modelId: targetModelId, updatedAt: new Date() })
      .where(eq(schema.modelAccess.id, id));
    accessTransferred += 1;
    targetByKey.set(accessMergeKey(sourceRow), { ...sourceRow, modelId: targetModelId });
  }

  for (const sourceId of accessPlan.skippedDuplicateIds) {
    const sourceRow = sourceAccess.find((a) => a.id === sourceId);
    if (!sourceRow) continue;
    const targetRow = targetByKey.get(accessMergeKey(sourceRow));
    if (!targetRow) continue;

    // Move pricing + polymorphic refs to the surviving target access before removing the duplicate.
    const moved = await tx
      .update(schema.modelAccessPricing)
      .set({ modelAccessId: targetRow.id })
      .where(eq(schema.modelAccessPricing.modelAccessId, sourceId))
      .returning({ id: schema.modelAccessPricing.id });
    pricingMoved += moved.length;

    const accessSourcesMoved = await tx
      .update(schema.sources)
      .set({ entityId: targetRow.id })
      .where(and(eq(schema.sources.entityType, "model_access"), eq(schema.sources.entityId, sourceId)))
      .returning({ id: schema.sources.id });
    const accessProvMoved = await tx
      .update(schema.importProvenance)
      .set({ entityId: targetRow.id })
      .where(
        and(
          eq(schema.importProvenance.entityType, "model_access"),
          eq(schema.importProvenance.entityId, sourceId),
        ),
      )
      .returning({ id: schema.importProvenance.id });

    const mergedAvailability = preferAvailability(targetRow.availability, sourceRow.availability);
    const mergedStatus = preferStatus(targetRow.status, sourceRow.status);
    const mergedAuth =
      targetRow.authenticationType !== "other"
        ? targetRow.authenticationType
        : sourceRow.authenticationType;
    const mergedMethod =
      targetRow.accessMethod !== "other"
        ? targetRow.accessMethod
        : sourceRow.accessMethod;
    const mergedArchivedAt =
      mergedStatus === "active"
        ? null
        : preferDate(targetRow.archivedAt, sourceRow.archivedAt);
    await tx
      .update(schema.modelAccess)
      .set({
        availability: mergedAvailability as typeof targetRow.availability,
        status: mergedStatus as typeof targetRow.status,
        authenticationType: mergedAuth,
        accessMethod: mergedMethod,
        includedInPlan: preferBool(targetRow.includedInPlan, sourceRow.includedInPlan),
        apiCompatible: preferBool(targetRow.apiCompatible, sourceRow.apiCompatible),
        cliOnly: Boolean(targetRow.cliOnly || sourceRow.cliOnly),
        webOnly: Boolean(targetRow.webOnly || sourceRow.webOnly),
        oauthSupported: preferBool(targetRow.oauthSupported, sourceRow.oauthSupported),
        providerModelId: preferText(targetRow.providerModelId, sourceRow.providerModelId),
        limitations: preferText(targetRow.limitations, sourceRow.limitations),
        notes: preferText(targetRow.notes, sourceRow.notes),
        priority: targetRow.priority ?? sourceRow.priority ?? null,
        verifiedAt: preferDate(targetRow.verifiedAt, sourceRow.verifiedAt),
        availableFrom: preferText(targetRow.availableFrom, sourceRow.availableFrom),
        availableUntil: preferText(targetRow.availableUntil, sourceRow.availableUntil),
        archivedAt: mergedArchivedAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.modelAccess.id, targetRow.id));

    await tx.delete(schema.modelAccess).where(eq(schema.modelAccess.id, sourceId));
    accessDeduped += 1;
    accessPolicy.push({
      sourceAccessId: sourceId,
      targetAccessId: targetRow.id,
      pricingRowsMoved: moved.length,
      sourcesRepointed: accessSourcesMoved.length,
      provenanceRepointed: accessProvMoved.length,
      availability: mergedAvailability,
      status: mergedStatus,
      authenticationType: mergedAuth,
      accessMethod: mergedMethod,
      policy: "target_key_wins_with_non_degrading_metadata_merge",
    });
  }

  const benchMoved = await tx
    .update(schema.modelBenchmarkResults)
    .set({ modelId: targetModelId })
    .where(eq(schema.modelBenchmarkResults.modelId, sourceModelId))
    .returning({ id: schema.modelBenchmarkResults.id });

  const scoresMoved = await tx
    .update(schema.modelScores)
    .set({ modelId: targetModelId })
    .where(eq(schema.modelScores.modelId, sourceModelId))
    .returning({ id: schema.modelScores.id });

  const sourcesMoved = await tx
    .update(schema.sources)
    .set({ entityId: targetModelId })
    .where(and(eq(schema.sources.entityType, "model"), eq(schema.sources.entityId, sourceModelId)))
    .returning({ id: schema.sources.id });

  const provMoved = await tx
    .update(schema.importProvenance)
    .set({ entityId: targetModelId })
    .where(
      and(
        eq(schema.importProvenance.entityType, "model"),
        eq(schema.importProvenance.entityId, sourceModelId),
      ),
    )
    .returning({ id: schema.importProvenance.id });

  const usageMoved = await tx
    .update(schema.usageSnapshots)
    .set({ modelId: targetModelId })
    .where(eq(schema.usageSnapshots.modelId, sourceModelId))
    .returning({ id: schema.usageSnapshots.id });

  // Capabilities: target explicit wins; source known fills target null; details merge deterministically.
  const [targetCaps] = await tx
    .select()
    .from(schema.modelCapabilities)
    .where(eq(schema.modelCapabilities.modelId, targetModelId))
    .limit(1);
  const [sourceCaps] = await tx
    .select()
    .from(schema.modelCapabilities)
    .where(eq(schema.modelCapabilities.modelId, sourceModelId))
    .limit(1);

  const mergedCaps = mergeCapabilities(
    targetCaps
      ? {
          vision: targetCaps.vision,
          reasoning: targetCaps.reasoning,
          toolUse: targetCaps.toolUse,
          parallelAgents: targetCaps.parallelAgents,
          computerUse: targetCaps.computerUse,
          audioInput: targetCaps.audioInput,
          videoInput: targetCaps.videoInput,
          imageInput: targetCaps.imageInput,
          structuredOutput: targetCaps.structuredOutput,
          functionCalling: targetCaps.functionCalling,
          details: targetCaps.details as Record<string, unknown>,
        }
      : null,
    sourceCaps
      ? {
          vision: sourceCaps.vision,
          reasoning: sourceCaps.reasoning,
          toolUse: sourceCaps.toolUse,
          parallelAgents: sourceCaps.parallelAgents,
          computerUse: sourceCaps.computerUse,
          audioInput: sourceCaps.audioInput,
          videoInput: sourceCaps.videoInput,
          imageInput: sourceCaps.imageInput,
          structuredOutput: sourceCaps.structuredOutput,
          functionCalling: sourceCaps.functionCalling,
          details: sourceCaps.details as Record<string, unknown>,
        }
      : null,
  );

  await tx
    .insert(schema.modelCapabilities)
    .values({
      modelId: targetModelId,
      vision: asTri(mergedCaps.vision),
      reasoning: asTri(mergedCaps.reasoning),
      toolUse: asTri(mergedCaps.toolUse),
      parallelAgents: asTri(mergedCaps.parallelAgents),
      computerUse: asTri(mergedCaps.computerUse),
      audioInput: asTri(mergedCaps.audioInput),
      videoInput: asTri(mergedCaps.videoInput),
      imageInput: asTri(mergedCaps.imageInput),
      structuredOutput: asTri(mergedCaps.structuredOutput),
      functionCalling: asTri(mergedCaps.functionCalling),
      details: asDetails(mergedCaps.details),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.modelCapabilities.modelId,
      set: {
        vision: asTri(mergedCaps.vision),
        reasoning: asTri(mergedCaps.reasoning),
        toolUse: asTri(mergedCaps.toolUse),
        parallelAgents: asTri(mergedCaps.parallelAgents),
        computerUse: asTri(mergedCaps.computerUse),
        audioInput: asTri(mergedCaps.audioInput),
        videoInput: asTri(mergedCaps.videoInput),
        imageInput: asTri(mergedCaps.imageInput),
        structuredOutput: asTri(mergedCaps.structuredOutput),
        functionCalling: asTri(mergedCaps.functionCalling),
        details: asDetails(mergedCaps.details),
        updatedAt: new Date(),
      },
    });

  await tx
    .delete(schema.modelCapabilities)
    .where(eq(schema.modelCapabilities.modelId, sourceModelId));

  // Immutable audit history stays on the source entity — do not rewrite/delete old events.
  await tx
    .update(schema.models)
    .set({
      status: "archived",
      archivedAt: new Date(),
      mergedIntoModelId: targetModelId,
      updatedAt: new Date(),
    })
    .where(eq(schema.models.id, sourceModelId));

  const transferred = {
    aliases: aliasesTransferred,
    aliasesSkipped,
    access: accessTransferred,
    accessDeduped,
    pricingMoved,
    benchmarks: benchMoved.length,
    scores: scoresMoved.length,
    sources: sourcesMoved.length,
    provenance: provMoved.length,
    usageSnapshots: usageMoved.length,
  };

  const policy = {
    access: accessPolicy,
    capabilities: "target_non_null_wins_source_fills_unknown_details_source_then_target",
    auditHistory: "immutable_left_on_original_entity",
    sourceDisposition: "archived_with_mergedIntoModelId",
  };

  const [sourceAfter] = await tx
    .select()
    .from(schema.models)
    .where(eq(schema.models.id, sourceModelId))
    .limit(1);
  const [targetAfter] = await tx
    .select()
    .from(schema.models)
    .where(eq(schema.models.id, targetModelId))
    .limit(1);
  const [targetCapsAfter] = await tx
    .select()
    .from(schema.modelCapabilities)
    .where(eq(schema.modelCapabilities.modelId, targetModelId))
    .limit(1);
  const targetAliasesAfter = await tx
    .select()
    .from(schema.modelAliases)
    .where(eq(schema.modelAliases.modelId, targetModelId));
  const targetAccessAfter = await loadAccessSnapshot(tx, targetModelId);
  const sourceAccessAfter = await loadAccessSnapshot(tx, sourceModelId);
  const sourceAliasesAfter = await tx
    .select()
    .from(schema.modelAliases)
    .where(eq(schema.modelAliases.modelId, sourceModelId));

  const safeSourceAfter = snapshotModelState(
    sourceAfter,
    null,
    sourceAliasesAfter,
    sourceAccessAfter.accessRows,
    sourceAccessAfter.pricingByAccessId,
  );
  const safeTargetAfter = snapshotModelState(
    targetAfter,
    targetCapsAfter,
    targetAliasesAfter,
    targetAccessAfter.accessRows,
    targetAccessAfter.pricingByAccessId,
  );

  const sourceScoresAfter = await tx
    .select()
    .from(schema.modelScores)
    .where(eq(schema.modelScores.modelId, sourceModelId));
  const targetScoresAfter = await tx
    .select()
    .from(schema.modelScores)
    .where(eq(schema.modelScores.modelId, targetModelId));
  const sourceBenchAfter = await tx
    .select()
    .from(schema.modelBenchmarkResults)
    .where(eq(schema.modelBenchmarkResults.modelId, sourceModelId));
  const targetBenchAfter = await tx
    .select()
    .from(schema.modelBenchmarkResults)
    .where(eq(schema.modelBenchmarkResults.modelId, targetModelId));
  const sourceModelSourcesAfter = await tx
    .select()
    .from(schema.sources)
    .where(and(eq(schema.sources.entityType, "model"), eq(schema.sources.entityId, sourceModelId)));
  const targetModelSourcesAfter = await tx
    .select()
    .from(schema.sources)
    .where(and(eq(schema.sources.entityType, "model"), eq(schema.sources.entityId, targetModelId)));
  const targetAccessIdsAfter = targetAccessAfter.accessRows.map((r) => r.id);
  const sourceAccessIdsAfter = sourceAccessAfter.accessRows.map((r) => r.id);
  const targetAccessSourcesAfter =
    targetAccessIdsAfter.length === 0
      ? []
      : await tx
          .select()
          .from(schema.sources)
          .where(
            and(
              eq(schema.sources.entityType, "model_access"),
              inArray(schema.sources.entityId, targetAccessIdsAfter),
            ),
          );
  const sourceAccessSourcesAfter =
    sourceAccessIdsAfter.length === 0
      ? []
      : await tx
          .select()
          .from(schema.sources)
          .where(
            and(
              eq(schema.sources.entityType, "model_access"),
              inArray(schema.sources.entityId, sourceAccessIdsAfter),
            ),
          );
  const sourceProvAfter = await tx
    .select()
    .from(schema.importProvenance)
    .where(
      and(
        eq(schema.importProvenance.entityType, "model"),
        eq(schema.importProvenance.entityId, sourceModelId),
      ),
    );
  const targetProvAfter = await tx
    .select()
    .from(schema.importProvenance)
    .where(
      and(
        eq(schema.importProvenance.entityType, "model"),
        eq(schema.importProvenance.entityId, targetModelId),
      ),
    );
  const targetAccessProvAfter =
    targetAccessIdsAfter.length === 0
      ? []
      : await tx
          .select()
          .from(schema.importProvenance)
          .where(
            and(
              eq(schema.importProvenance.entityType, "model_access"),
              inArray(schema.importProvenance.entityId, targetAccessIdsAfter),
            ),
          );
  const sourceAccessProvAfter =
    sourceAccessIdsAfter.length === 0
      ? []
      : await tx
          .select()
          .from(schema.importProvenance)
          .where(
            and(
              eq(schema.importProvenance.entityType, "model_access"),
              inArray(schema.importProvenance.entityId, sourceAccessIdsAfter),
            ),
          );
  const sourceUsageAfter = await tx
    .select()
    .from(schema.usageSnapshots)
    .where(eq(schema.usageSnapshots.modelId, sourceModelId));
  const targetUsageAfter = await tx
    .select()
    .from(schema.usageSnapshots)
    .where(eq(schema.usageSnapshots.modelId, targetModelId));

  const relationshipAfter = {
    sourceAliases: snapshotAliases(sourceAliasesAfter),
    targetAliases: snapshotAliases(targetAliasesAfter),
    sourceAccess: snapshotAccessRows(
      sourceAccessAfter.accessRows,
      sourceAccessAfter.pricingByAccessId,
    ),
    targetAccess: snapshotAccessRows(
      targetAccessAfter.accessRows,
      targetAccessAfter.pricingByAccessId,
    ),
    sourceScores: snapshotSortedRows(sourceScoresAfter),
    targetScores: snapshotSortedRows(targetScoresAfter),
    sourceBenchmarks: snapshotSortedRows(sourceBenchAfter),
    targetBenchmarks: snapshotSortedRows(targetBenchAfter),
    sourceSources: snapshotSortedRows([
      ...sourceModelSourcesAfter,
      ...sourceAccessSourcesAfter,
    ]),
    targetSources: snapshotSortedRows([
      ...targetModelSourcesAfter,
      ...targetAccessSourcesAfter,
    ]),
    sourceProvenance: snapshotSortedRows([...sourceProvAfter, ...sourceAccessProvAfter]),
    targetProvenance: snapshotSortedRows([...targetProvAfter, ...targetAccessProvAfter]),
    sourceUsage: snapshotSortedRows(sourceUsageAfter),
    targetUsage: snapshotSortedRows(targetUsageAfter),
    accessReconciliation: jsonSafe({
      transferred: accessTransferred,
      deduped: accessDeduped,
      pricingMoved,
      policy: accessPolicy,
    }),
  };

  const audit = await writeAudit(tx, {
    entityType: "model",
    entityId: targetModelId,
    action: "merge",
    beforeData: {
      source: safeSourceBefore,
      target: safeTargetBefore,
      relationships: relationshipBefore,
    },
    afterData: {
      source: safeSourceAfter,
      target: safeTargetAfter,
      targetModelId,
      sourceModelId,
      sourceArchived: true,
      sourceMergedIntoModelId: targetModelId,
      appliedResolutions,
      transferred,
      capabilities: mergedCaps,
      accessTransferDedupPolicy: accessPolicy,
      relationships: relationshipAfter,
    },
    metadata: {
      transferred,
      policy,
      sourceModelId,
      appliedResolutions,
      relationshipCounts: transferred,
    },
    ctx,
  });

  await writeAudit(tx, {
    entityType: "model",
    entityId: sourceModelId,
    action: "merge",
    beforeData: {
      source: safeSourceBefore,
      target: safeTargetBefore,
      relationships: relationshipBefore,
    },
    afterData: {
      source: safeSourceAfter,
      target: safeTargetAfter,
      mergedIntoModelId: targetModelId,
      status: "archived",
      transferred,
      relationships: relationshipAfter,
    },
    metadata: { transferred, policy, appliedResolutions, targetModelId },
    ctx,
  });

  return {
    targetModelId,
    sourceModelId,
    transferred,
    policy,
    appliedResolutions,
    auditEventId: audit.id,
  };
}

export async function mergeModels(db: DbOrTx, rawInput: unknown, ctx: AuditContext = {}) {
  // When already inside a transaction (idempotent merge), run directly.
  if (typeof (db as Db).transaction === "function") {
    // Nested transaction becomes a savepoint when db is already a tx in drizzle.
    return (db as Db).transaction(async (tx) => mergeModelsInTransaction(tx, rawInput, ctx));
  }
  return mergeModelsInTransaction(db as Tx, rawInput, ctx);
}

/** Used by unit tests for pure filter parsing without DB. */
export {
  formatScoreDisplay,
  formatCapabilityDisplay,
  normalizeAlias,
  planAliasMerge,
  planAccessMerge,
  mapModelRow,
};
