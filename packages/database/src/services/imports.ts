import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { slugifyModelName } from "@model-monitor/schemas";
import {
  importUploadSchema,
  importPreviewSummarySchema,
  importCommitSummarySchema,
  importErrorSummarySchema,
  importBatchResolutionSchema,
  neutralizeExportRow,
  pathUuidSchema,
  sheetSummarySchema,
  type ImportPreviewSummary,
  type ImportCommitSummary,
  type ImportErrorSummary,
  type ImportConflictDto,
  type ImportJobResponse,
  type ExportModelRow,
  type ExportSubscriptionRow,
  type ExportAccessRow,
  type ExportBenchmarkRow,
  type ExportScoreRow,
  type ExportSourceRow,
  type ImportProvenanceDto,
  type importPreviewResponseSchema,
} from "@model-monitor/schemas";
import { z } from "zod";
import type { ExportSection } from "@model-monitor/csv-import";
import * as schema from "../schema/index";
import {
  writeAudit,
  ModelServiceError,
  jsonSafe,
  type Db,
  type Tx,
  type DbOrTx,
  type AuditContext,
} from "./audit";

// ── Local Zod schemas ───────────────────────────────────────────

const importJobListQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(["createdAt", "updatedAt", "filename"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

/** Schema for creating an import job (extends upload schema with userId). */
const createImportJobSchema = importUploadSchema.extend({
  userId: pathUuidSchema,
  storedPath: z.string().min(1),
  parserVersion: z.string().min(1),
  sha256: z.string().length(64),
});

const updateImportJobStatusSchema = z.object({
  status: z.enum(schema.importStatus.enumValues),
  errorSummary: importErrorSummarySchema.optional(),
  previewSummary: importPreviewSummarySchema.optional(),
  commitSummary: importCommitSummarySchema.optional(),
  sheetSummary: z.array(sheetSummarySchema).optional(),
});

// ── Import Plan types (typed DTO for the commit flow) ──────────────

export type ImportPlanModelClassification =
  | "create"
  | "update"
  | "unchanged"
  | "duplicate"
  | "error"
  | "skip";

export interface ImportPlanModelRow {
  classification: ImportPlanModelClassification;
  canonicalId: string | null;
  developerName: string | null;
  name: string | null;
  family: string | null;
  generation: string | null;
  lifecycleRaw: string | null;
  releaseDate: string | null;
  modelType: string | null;
  contextTokens: number | null;
  maxOutputTokens: number | null;
  speedRating: string | null;
  codingSpecialization: string | null;
  bestUse: string | null;
  avoidFor: string | null;
  visionSupport: boolean | null;
  reasoningSupport: string | null;
  toolSupport: string | null;
  knowledgeCutoff: string | null;
  needsRecheck: boolean | null;
  /** Access provider name (resolved to ID at commit time). */
  accessProviderName: string | null;
  /** Plan name (resolved to ID at commit time). */
  planName: string | null;
  /** Provider-specific model ID for access mapping. */
  providerModelId: string | null;
  /** NEVER stored on model. */
  subscriptionUsdMo: number | null;
  /** Provenance metadata. */
  sourceSheet: string | null;
  sourceRow: number | null;
  verifiedOn: string | null;
}

export interface ImportPlanBenchmarkRow {
  modelCanonicalId: string;
  benchmarkName: string;
  category: string;
  version: string | null;
  comparableGroup: string | null;
  score: number | null;
  scoreText: string | null;
  setting: string | null;
  harness: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  resultDate: string | null;
  confidence: number | null;
}

export interface ImportPlan {
  modelRows: ImportPlanModelRow[];
  benchmarkRows: ImportPlanBenchmarkRow[];
}

const nullableString = z.string().nullable();
const nullableNumber = z.number().finite().nullable();
const nullableBoolean = z.boolean().nullable();
const importPlanModelRowSchema = z.object({
  classification: z.enum(["create", "update", "unchanged", "duplicate", "error", "skip"]),
  canonicalId: nullableString,
  developerName: nullableString, name: nullableString, family: nullableString,
  generation: nullableString, lifecycleRaw: nullableString, releaseDate: nullableString,
  modelType: nullableString, contextTokens: nullableNumber, maxOutputTokens: nullableNumber,
  speedRating: nullableString, codingSpecialization: nullableString, bestUse: nullableString,
  avoidFor: nullableString, visionSupport: nullableBoolean, reasoningSupport: nullableString,
  toolSupport: nullableString, knowledgeCutoff: nullableString, needsRecheck: nullableBoolean,
  accessProviderName: nullableString, planName: nullableString, providerModelId: nullableString,
  subscriptionUsdMo: nullableNumber, sourceSheet: nullableString, sourceRow: z.number().int().positive().nullable(),
  verifiedOn: nullableString,
}).strict();
const importPlanBenchmarkRowSchema = z.object({
  modelCanonicalId: z.string().min(1), benchmarkName: z.string().min(1), category: z.string().min(1),
  version: nullableString, comparableGroup: nullableString, score: nullableNumber, scoreText: nullableString,
  setting: nullableString, harness: nullableString, sourceType: nullableString, sourceUrl: nullableString,
  resultDate: nullableString, confidence: nullableNumber,
}).strict();
/** Runtime boundary for API-supplied plans; unknown, missing, and malformed fields fail closed. */
export const importPlanSchema = z.object({
  modelRows: z.array(importPlanModelRowSchema),
  benchmarkRows: z.array(importPlanBenchmarkRowSchema),
}).strict();

export function canonicalImportPlan(plan: ImportPlan): string {
  return JSON.stringify(plan);
}
export function importPlanDigest(plan: ImportPlan): string {
  return createHash("sha256").update(canonicalImportPlan(plan), "utf8").digest("hex");
}

// ── Commit result ───────────────────────────────────────────────

export interface ImportCommitResult {
  modelsCreated: number;
  modelsUpdated: number;
  accessCreated: number;
  accessUpdated: number;
  benchmarkRowsCreated: number;
  scoresCreated: number;
  sourcesCreated: number;
  aliasesCreated: number;
  conflictsResolved: number;
  rowsSkipped: number;
}

// ── Helpers ─────────────────────────────────────────────────────

function requireUuid(value: string, field: string): string {
  const parsed = pathUuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ModelServiceError("VALIDATION_ERROR", `Invalid ${field}`, 400, {
      [field]: ["Must be a valid UUID"],
    });
  }
  return parsed.data;
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

/** Stable status transition map for import jobs. */
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  uploaded: ["parsing", "failed", "cancelled"],
  parsing: ["preview_ready", "failed", "cancelled"],
  preview_ready: ["needs_resolution", "committing", "failed", "cancelled"],
  needs_resolution: ["preview_ready", "failed", "cancelled"],
  committing: ["committed", "failed", "cancelled"],
  committed: [],
  failed: [],
  cancelled: [],
};

function assertValidTransition(from: string, to: string): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      `Cannot transition import job from '${from}' to '${to}'`,
      400,
    );
  }
}

async function ensureUniqueSlug(tx: Tx, name: string, attempt = 0): Promise<string> {
  const base = slugifyModelName(name);
  const slug = attempt === 0 ? base : `${base}-${attempt}`;
  const [existing] = await tx
    .select({ id: schema.models.id })
    .from(schema.models)
    .where(eq(schema.models.slug, slug))
    .limit(1);
  if (existing) {
    return ensureUniqueSlug(tx, name, attempt + 1);
  }
  return slug;
}

function parseJsonField<T>(value: unknown, fieldSchema: z.ZodTypeAny): T | undefined {
  if (value == null) return undefined;
  const parsed = fieldSchema.safeParse(value);
  return parsed.success ? (parsed.data as T) : undefined;
}

function mapImportJobRow(row: typeof schema.importJobs.$inferSelect): ImportJobResponse {
  return {
    id: row.id,
    userId: row.userId,
    filename: row.filename,
    storedPath: row.storedPath,
    sha256: row.sha256,
    parserVersion: row.parserVersion,
    status: row.status,
    sheetSummary: parseJsonField<NonNullable<ImportJobResponse["sheetSummary"]>>(
      row.sheetSummary,
      z.array(sheetSummarySchema),
    ),
    previewSummary: parseJsonField<NonNullable<ImportJobResponse["previewSummary"]>>(
      row.previewSummary,
      importPreviewSummarySchema,
    ),
    commitSummary: parseJsonField<NonNullable<ImportJobResponse["commitSummary"]>>(
      row.commitSummary,
      importCommitSummarySchema,
    ),
    errorSummary: parseJsonField<NonNullable<ImportJobResponse["errorSummary"]>>(
      row.errorSummary,
      importErrorSummarySchema,
    ),
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    committedAt: row.committedAt ? row.committedAt.toISOString() : null,
  };
}

function mapConflictRow(row: typeof schema.importConflicts.$inferSelect): ImportConflictDto {
  return {
    id: row.id,
    importJobId: row.importJobId,
    conflictType: row.conflictType as ImportConflictDto["conflictType"],
    sourceSheet: row.sourceSheet ?? null,
    sourceRow: row.sourceRow ?? null,
    sourceColumn: row.sourceColumn ?? null,
    entityType: row.entityType ?? null,
    candidateEntityId: row.candidateEntityId ?? null,
    currentValue: row.currentValue ?? null,
    importedValue: row.importedValue ?? null,
    resolution: row.resolution ?? null,
    resolutionPayload: row.resolutionPayload ?? null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── 1a. Import Job CRUD ─────────────────────────────────────────

export async function createImportJob(
  db: Db,
  rawInput: unknown,
  ctx: AuditContext = {},
): Promise<ImportJobResponse> {
  const parsed = createImportJobSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid import job payload",
      400,
      fieldErrorsFromZod(parsed.error.flatten().fieldErrors),
    );
  }
  const input = parsed.data;
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId))
    .limit(1);
  if (!user) {
    throw new ModelServiceError("VALIDATION_ERROR", "User not found", 400, {
      userId: ["User not found"],
    });
  }
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.importJobs)
      .values({
        userId: input.userId,
        filename: input.filename,
        storedPath: input.storedPath,
        sha256: input.sha256,
        parserVersion: input.parserVersion,
        status: "uploaded",
        sheetSummary: null,
        previewSummary: null,
        commitSummary: null,
        errorSummary: null,
        idempotencyKey: null,
      })
      .returning();
    await writeAudit(tx, {
      entityType: "import_job",
      entityId: created.id,
      action: "create",
      afterData: { filename: input.filename, sha256: input.sha256, parserVersion: input.parserVersion },
      metadata: { source: "import_service" },
      ctx,
    });
    return mapImportJobRow(created);
  });
}

export async function getImportJob(
  db: DbOrTx,
  id: string,
): Promise<ImportJobResponse> {
  const uuid = requireUuid(id, "id");
  const [row] = await db
    .select()
    .from(schema.importJobs)
    .where(eq(schema.importJobs.id, uuid))
    .limit(1);
  if (!row) {
    throw new ModelServiceError("NOT_FOUND", "Import job not found", 404);
  }
  return mapImportJobRow(row);
}

/** Fetch an import job only when it belongs to the authenticated actor. */
export async function getOwnedImportJob(
  db: DbOrTx,
  id: string,
  userId: string,
): Promise<ImportJobResponse> {
  const uuid = requireUuid(id, "importJobId");
  const owner = requireUuid(userId, "userId");
  const [row] = await db
    .select()
    .from(schema.importJobs)
    .where(and(eq(schema.importJobs.id, uuid), eq(schema.importJobs.userId, owner)))
    .limit(1);
  if (!row) throw new ModelServiceError("NOT_FOUND", "Import job not found", 404);
  return mapImportJobRow(row);
}

export async function listImportJobs(
  db: Db,
  rawQuery: unknown,
): Promise<{ data: ImportJobResponse[]; page: { total: number; page: number; pageSize: number } }> {
  const parsed = importJobListQuerySchema.safeParse(rawQuery ?? {});
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid query parameters",
      400,
      fieldErrorsFromZod(parsed.error.flatten().fieldErrors),
    );
  }
  const query = parsed.data;
  const conditions: SQL[] = [];
  if (query.status) {
    conditions.push(eq(schema.importJobs.status, query.status as typeof schema.importJobs.$inferSelect["status"]));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const orderBy =
    query.order === "asc"
      ? asc(schema.importJobs[query.sort])
      : desc(schema.importJobs[query.sort]);
  const offset = (query.page - 1) * query.pageSize;
  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(schema.importJobs)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.importJobs)
      .where(where)
      .then((r) => Number(r[0].count)),
  ]);
  return {
    data: rows.map(mapImportJobRow),
    page: { total: countResult, page: query.page, pageSize: query.pageSize },
  };
}

export async function updateImportJobStatus(
  db: Db,
  id: string,
  rawInput: unknown,
  ctx: AuditContext = {},
): Promise<ImportJobResponse> {
  const uuid = requireUuid(id, "id");
  const parsed = updateImportJobStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid status update payload",
      400,
      fieldErrorsFromZod(parsed.error.flatten().fieldErrors),
    );
  }
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, uuid))
      .limit(1)
      .for("update");
    if (!before) {
      throw new ModelServiceError("NOT_FOUND", "Import job not found", 404);
    }
    assertValidTransition(before.status, input.status);
    const updateData: Record<string, unknown> = {
      status: input.status,
      updatedAt: new Date(),
    };
    if (input.status === "committed") {
      updateData.committedAt = new Date();
    }
    if (input.previewSummary) {
      updateData.previewSummary = input.previewSummary;
    }
    if (input.commitSummary) {
      updateData.commitSummary = input.commitSummary;
    }
    if (input.errorSummary) {
      updateData.errorSummary = input.errorSummary;
    }
    if (input.sheetSummary) {
      updateData.sheetSummary = input.sheetSummary;
    }
    const [updated] = await tx
      .update(schema.importJobs)
      .set(updateData)
      .where(eq(schema.importJobs.id, uuid))
      .returning();
    await writeAudit(tx, {
      entityType: "import_job",
      entityId: uuid,
      action: "update",
      beforeData: { status: before.status },
      afterData: { status: input.status },
      ctx,
    });
    return mapImportJobRow(updated);
  });
}

// ── 1b. Preview Storage (read-only — no domain table mutations) ─

export interface StorePreviewInput {
  /** The exact server-bound plan is mandatory for a committable preview. */
  plan: ImportPlan;
  previewSummary: z.input<typeof importPreviewSummarySchema>;
  conflicts: Array<{
    conflictType: string;
    sourceSheet?: string | null;
    sourceRow?: number | null;
    sourceColumn?: string | null;
    entityType?: string | null;
    candidateEntityId?: string | null;
    currentValue?: unknown;
    importedValue?: unknown;
  }>;
  errorSummary?: ImportErrorSummary;
  sheetSummary?: ImportJobResponse["sheetSummary"];
}

export async function storePreview(
  db: Db,
  importJobId: string,
  input: StorePreviewInput,
  ctx: AuditContext = {},
): Promise<void> {
  const uuid = requireUuid(importJobId, "importJobId");
  const plan = importPlanSchema.parse(input.plan);
  const previewSummary = importPreviewSummarySchema.parse(input.previewSummary);
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, uuid))
      .limit(1)
      .for("update");
    if (!job) {
      throw new ModelServiceError("NOT_FOUND", "Import job not found", 404);
    }
    if (input.conflicts.length > 0) {
      await tx.insert(schema.importConflicts).values(
        input.conflicts.map((c) => ({
          importJobId: uuid,
          conflictType: c.conflictType,
          sourceSheet: c.sourceSheet ?? null,
          sourceRow: c.sourceRow ?? null,
          sourceColumn: c.sourceColumn ?? null,
          entityType: c.entityType ?? null,
          candidateEntityId: c.candidateEntityId ?? null,
          currentValue: c.currentValue ?? null,
          importedValue: c.importedValue ?? null,
        })),
      );
    }
    const status: "preview_ready" | "needs_resolution" =
      input.conflicts.length > 0 ? "needs_resolution" : "preview_ready";
    await tx
      .update(schema.importJobs)
      .set({
        status,
        previewSummary,
        idempotencyKey: importPlanDigest(plan),
        errorSummary: input.errorSummary ?? null,
        sheetSummary: input.sheetSummary ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.importJobs.id, uuid));
    await writeAudit(tx, {
      entityType: "import_job",
      entityId: uuid,
      action: "update",
      beforeData: { status: job.status },
      afterData: { status, conflictCount: input.conflicts.length },
      metadata: { operation: "store_preview" },
      ctx,
    });
  });
}

export async function getPreview(
  db: Db,
  importJobId: string,
): Promise<z.infer<typeof importPreviewResponseSchema>> {
  const uuid = requireUuid(importJobId, "importJobId");
  const [job] = await db
    .select()
    .from(schema.importJobs)
    .where(eq(schema.importJobs.id, uuid))
    .limit(1);
  if (!job) {
    throw new ModelServiceError("NOT_FOUND", "Import job not found", 404);
  }
  const conflicts = await db
    .select()
    .from(schema.importConflicts)
    .where(eq(schema.importConflicts.importJobId, uuid))
    .orderBy(asc(schema.importConflicts.createdAt));
  const summary: ImportPreviewSummary =
    (job.previewSummary as ImportPreviewSummary) ?? importPreviewSummarySchema.parse({});
  return {
    importJobId: uuid,
    summary,
    rows: [],
    conflicts: conflicts.map(mapConflictRow),
  };
}

export async function listConflicts(
  db: Db,
  importJobId: string,
): Promise<ImportConflictDto[]> {
  const uuid = requireUuid(importJobId, "importJobId");
  const rows = await db
    .select()
    .from(schema.importConflicts)
    .where(eq(schema.importConflicts.importJobId, uuid))
    .orderBy(asc(schema.importConflicts.createdAt));
  return rows.map(mapConflictRow);
}

// ── 1c. Conflict Resolution ─────────────────────────────────────

export async function resolveConflicts(
  db: Db,
  importJobId: string,
  rawInput: unknown,
  ctx: AuditContext = {},
): Promise<ImportConflictDto[]> {
  const uuid = requireUuid(importJobId, "importJobId");
  const parsed = importBatchResolutionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ModelServiceError(
      "VALIDATION_ERROR",
      "Invalid batch resolution payload",
      400,
      fieldErrorsFromZod(parsed.error.flatten().fieldErrors),
    );
  }
  const batch = parsed.data;
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(schema.importJobs)
      .where(
        and(eq(schema.importJobs.id, uuid), eq(schema.importJobs.id, batch.importJobId)),
      )
      .limit(1)
      .for("update");
    if (!job) {
      throw new ModelServiceError("NOT_FOUND", "Import job not found", 404);
    }
    const resolved: ImportConflictDto[] = [];
    for (const res of batch.resolutions) {
      const [conflict] = await tx
        .select()
        .from(schema.importConflicts)
        .where(
          and(
            eq(schema.importConflicts.id, res.conflictId),
            eq(schema.importConflicts.importJobId, uuid),
          ),
        )
        .limit(1);
      if (!conflict) {
        throw new ModelServiceError(
          "NOT_FOUND",
          `Conflict ${res.conflictId} not found for this job`,
          404,
        );
      }
      const [updated] = await tx
        .update(schema.importConflicts)
        .set({
          resolution: res.action,
          resolutionPayload: res.payload ?? null,
          resolvedAt: new Date(),
        })
        .where(eq(schema.importConflicts.id, res.conflictId))
        .returning();
      resolved.push(mapConflictRow(updated));
    }
    const [unresolvedCount] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(schema.importConflicts)
      .where(
        and(
          eq(schema.importConflicts.importJobId, uuid),
          isNull(schema.importConflicts.resolution),
        ),
      );
    const allResolved = Number(unresolvedCount.count) === 0;
    if (allResolved && job.status === "needs_resolution") {
      await tx
        .update(schema.importJobs)
        .set({ status: "preview_ready", updatedAt: new Date() })
        .where(eq(schema.importJobs.id, uuid));
    }
    await writeAudit(tx, {
      entityType: "import_job",
      entityId: uuid,
      action: "update",
      beforeData: { status: job.status, operation: "resolve_conflicts" },
      afterData: { resolvedCount: batch.resolutions.length, allResolved },
      ctx,
    });
    return resolved;
  });
}

// ── 1d. Commit (single-transaction apply) ──────────────────────

export interface ImportCommitResolution {
  sourceRow: number;
  action: "create-new" | "update-existing";
}

export async function commitImport(
  db: Db,
  importJobId: string,
  plan: ImportPlan,
  ctx: AuditContext = {},
  resolutions: ImportCommitResolution[] = [],
): Promise<ImportCommitResult> {
  const uuid = requireUuid(importJobId, "importJobId");
  const validatedPlan = importPlanSchema.parse(plan);
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, uuid))
      .limit(1)
      .for("update");
    if (!job) {
      throw new ModelServiceError("NOT_FOUND", "Import job not found", 404);
    }
    if (ctx.actorUserId && job.userId !== ctx.actorUserId) {
      throw new ModelServiceError("FORBIDDEN", "Import job does not belong to the authenticated user", 403);
    }
    if (job.status === "committed") {
      const summary =
        (job.commitSummary as ImportCommitSummary) ?? importCommitSummarySchema.parse({});
      return importCommitSummaryToResult(summary);
    }
    if (!job.idempotencyKey) {
      throw new ModelServiceError("PRECONDITION_FAILED", "Preview plan digest is required before commit", 400);
    }
    if (job.idempotencyKey !== importPlanDigest(validatedPlan)) {
      throw new ModelServiceError("PRECONDITION_FAILED", "Preview plan digest does not match the stored immutable preview", 400);
    }
    const conflictRowsForResolution = await tx
      .select()
      .from(schema.importConflicts)
      .where(eq(schema.importConflicts.importJobId, uuid));
    const expectedRows = new Set(conflictRowsForResolution.map((c) => c.sourceRow).filter((r): r is number => r !== null));
    const suppliedRows = new Set(resolutions.map((r) => r.sourceRow));
    if (suppliedRows.size !== resolutions.length || suppliedRows.size !== expectedRows.size || [...expectedRows].some((r) => !suppliedRows.has(r)) || [...suppliedRows].some((r) => !expectedRows.has(r))) {
      throw new ModelServiceError("PRECONDITION_FAILED", "Conflict choices must exactly match the preview conflicts", 400);
    }
    for (const choice of resolutions) {
      const conflict = conflictRowsForResolution.find((c) => c.sourceRow === choice.sourceRow);
      if (!conflict) throw new ModelServiceError("PRECONDITION_FAILED", "Conflict choice does not belong to this preview", 400);
      await tx.update(schema.importConflicts).set({
        resolution: choice.action === "create-new" ? "use_imported" : "keep_existing",
        resolutionPayload: { action: choice.action },
        resolvedAt: new Date(),
      }).where(and(eq(schema.importConflicts.id, conflict.id), eq(schema.importConflicts.importJobId, uuid)));
    }
    if (job.status !== "preview_ready" && job.status !== "needs_resolution") {
      throw new ModelServiceError(
        "VALIDATION_ERROR",
        `Import job is in '${job.status}' state; expected 'preview_ready' or 'needs_resolution'`,
        400,
      );
    }
    const conflictRows = await tx
      .select()
      .from(schema.importConflicts)
      .where(eq(schema.importConflicts.importJobId, uuid));
    if (conflictRows.some((conflict) => !conflict.resolution || !["keep_existing", "use_imported"].includes(conflict.resolution))) {
      throw new ModelServiceError("PRECONDITION_FAILED", "Every preview conflict requires a server-validated resolution", 400);
    }
    const effectiveRows = await Promise.all(validatedPlan.modelRows.map(async (row) => {
      const conflict = conflictRows.find((item) => item.sourceRow === row.sourceRow);
      if (!conflict) return row;
      if (!conflict.candidateEntityId) throw new ModelServiceError("PRECONDITION_FAILED", "Preview conflict has no candidate", 400);
      const [candidate] = await tx.select({ canonicalId: schema.models.canonicalId }).from(schema.models).where(eq(schema.models.id, conflict.candidateEntityId)).limit(1);
      if (!candidate) throw new ModelServiceError("PRECONDITION_FAILED", "Preview conflict candidate no longer exists", 400);
      if (conflict.resolution === "keep_existing") return { ...row, classification: "update" as const, canonicalId: candidate.canonicalId };
      const stable = `import:${createHash("sha256").update(`${job.sha256}:${row.sourceRow ?? 0}:${(row.name ?? "").trim().toLowerCase()}`, "utf8").digest("hex").slice(0, 40)}`;
      return { ...row, classification: "create" as const, canonicalId: stable };
    }));
    const effectivePlan: ImportPlan = { modelRows: effectiveRows, benchmarkRows: validatedPlan.benchmarkRows };
    const [unresolved] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(schema.importConflicts)
      .where(
        and(
          eq(schema.importConflicts.importJobId, uuid),
          isNull(schema.importConflicts.resolution),
        ),
      );
    if (Number(unresolved.count) > 0) {
      throw new ModelServiceError(
        "PRECONDITION_FAILED",
        `Cannot commit: ${unresolved.count} unresolved conflict(s) remain`,
        400,
      );
    }
    await tx
      .update(schema.importJobs)
      .set({ status: "committing", updatedAt: new Date() })
      .where(eq(schema.importJobs.id, uuid));

    const devMap = await resolveDeveloperNames(tx, effectivePlan);
    const apMap = await resolveAccessProviderNames(tx, effectivePlan);
    const planMap = await resolvePlanNames(tx, effectivePlan);

    let modelsCreated = 0;
    let modelsUpdated = 0;
    let accessCreated = 0;
    let aliasesCreated = 0;
    const accessUpdated = 0;
    let rowsSkipped = 0;

    const provenanceEntries: Array<{
      entityType: string;
      entityId: string;
      sourceSheet: string | null;
      sourceRow: number | null;
      rawValue: unknown;
    }> = [];

    for (const row of effectivePlan.modelRows) {
      if (
        row.classification === "skip" ||
        row.classification === "error" ||
        row.classification === "unchanged" ||
        row.classification === "duplicate"
      ) {
        rowsSkipped += 1;
        continue;
      }

      if (row.classification === "create") {
        const devId = row.developerName ? devMap.get(row.developerName) : null;
        if (!devId || !row.canonicalId || !row.name) {
          rowsSkipped += 1;
          continue;
        }
        const slug = await ensureUniqueSlug(tx, row.name);
        const lifecycleVal = parseLifecycle(row.lifecycleRaw);
        const [created] = await tx
          .insert(schema.models)
          .values({
            developerId: devId,
            canonicalId: row.canonicalId,
            name: row.name,
            slug,
            family: row.family ?? null,
            generation: row.generation ?? null,
            lifecycle: lifecycleVal,
            lifecycleRaw: row.lifecycleRaw ?? null,
            releaseDate: row.releaseDate ?? null,
            knowledgeCutoff: row.knowledgeCutoff ?? null,
            modelType: row.modelType ?? null,
            codingSpecialization: row.codingSpecialization ?? null,
            bestUse: row.bestUse ?? null,
            avoidFor: row.avoidFor ?? null,
            contextTokens: row.contextTokens ?? null,
            maxOutputTokens: row.maxOutputTokens ?? null,
            speedRating: row.speedRating ?? null,
            needsRecheck: row.needsRecheck ?? false,
            status: "active",
          })
          .returning();
        modelsCreated += 1;
        provenanceEntries.push({
          entityType: "model",
          entityId: created.id,
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
          rawValue: row,
        });
        await writeAudit(tx, {
          entityType: "model",
          entityId: created.id,
          action: "create",
          afterData: { canonicalId: row.canonicalId, name: row.name, importJobId: uuid },
          metadata: { importJobId: uuid },
          ctx,
        });
        await tx
          .insert(schema.modelCapabilities)
          .values({
            modelId: created.id,
            vision: row.visionSupport ?? null,
            reasoning: parseBoolean(row.reasoningSupport),
            toolUse: parseBoolean(row.toolSupport),
          })
          .onConflictDoNothing();
        const accessRows = createAccessRows(row, created.id, apMap, planMap);
        for (const acc of accessRows) {
          try {
            const [inserted] = await tx
              .insert(schema.modelAccess)
              .values(acc)
              .returning();
            accessCreated += 1;
            provenanceEntries.push({
              entityType: "model_access",
              entityId: inserted.id,
              sourceSheet: row.sourceSheet,
              sourceRow: row.sourceRow,
              rawValue: { providerModelId: row.providerModelId },
            });
          } catch (err: unknown) {
            if (isUniqueViolation(err)) continue;
            throw err;
          }
        }
        const aliasCreated = await createProviderAlias(tx, row, created.id, apMap);
        if (aliasCreated) aliasesCreated += 1;
      } else if (row.classification === "update") {
        if (!row.canonicalId) {
          rowsSkipped += 1;
          continue;
        }
        const [existing] = await tx
          .select()
          .from(schema.models)
          .where(eq(schema.models.canonicalId, row.canonicalId))
          .limit(1);
        if (!existing) {
          rowsSkipped += 1;
          continue;
        }
        const updateData: Record<string, unknown> = {};
        if (row.name !== null && row.name !== undefined && row.name !== existing.name) updateData.name = row.name;
        if (row.family !== null && row.family !== existing.family) updateData.family = row.family;
        if (row.generation !== null && row.generation !== existing.generation) updateData.generation = row.generation;
        if (row.lifecycleRaw !== null && row.lifecycleRaw !== existing.lifecycleRaw) {
          updateData.lifecycleRaw = row.lifecycleRaw;
          updateData.lifecycle = parseLifecycle(row.lifecycleRaw);
        }
        if (row.contextTokens !== null && row.contextTokens !== existing.contextTokens) updateData.contextTokens = row.contextTokens;
        if (row.maxOutputTokens !== null && row.maxOutputTokens !== existing.maxOutputTokens) updateData.maxOutputTokens = row.maxOutputTokens;
        if (row.speedRating !== null && row.speedRating !== existing.speedRating) updateData.speedRating = row.speedRating;
        if (row.modelType !== null && row.modelType !== existing.modelType) updateData.modelType = row.modelType;
        if (row.codingSpecialization !== null && row.codingSpecialization !== existing.codingSpecialization) updateData.codingSpecialization = row.codingSpecialization;
        if (row.bestUse !== null && row.bestUse !== existing.bestUse) updateData.bestUse = row.bestUse;
        if (row.avoidFor !== null && row.avoidFor !== existing.avoidFor) updateData.avoidFor = row.avoidFor;
        if (row.releaseDate !== null) updateData.releaseDate = row.releaseDate;
        if (row.knowledgeCutoff !== null) updateData.knowledgeCutoff = row.knowledgeCutoff;
        if (row.needsRecheck !== null) updateData.needsRecheck = row.needsRecheck;
        if (Object.keys(updateData).length > 0) {
          updateData.updatedAt = new Date();
          await tx
            .update(schema.models)
            .set(updateData)
            .where(eq(schema.models.id, existing.id));
          modelsUpdated += 1;
          await writeAudit(tx, {
            entityType: "model",
            entityId: existing.id,
            action: "update",
            beforeData: jsonSafe(existing),
            afterData: jsonSafe(updateData),
            metadata: { importJobId: uuid },
            ctx,
          });
        }
        provenanceEntries.push({
          entityType: "model",
          entityId: existing.id,
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
          rawValue: row,
        });
        const accessRows = createAccessRows(row, existing.id, apMap, planMap);
        for (const acc of accessRows) {
          try {
            const [inserted] = await tx
              .insert(schema.modelAccess)
              .values(acc)
              .returning();
            accessCreated += 1;
            provenanceEntries.push({
              entityType: "model_access",
              entityId: inserted.id,
              sourceSheet: row.sourceSheet,
              sourceRow: row.sourceRow,
              rawValue: { providerModelId: row.providerModelId },
            });
          } catch (err: unknown) {
            if (isUniqueViolation(err)) continue;
            throw err;
          }
        }
        const aliasCreated = await createProviderAlias(tx, row, existing.id, apMap);
        if (aliasCreated) aliasesCreated += 1;
      }
    }

    let benchmarkRowsCreated = 0;
    const scoresCreated = 0;
    const sourcesCreated = 0;
    for (const bRow of effectivePlan.benchmarkRows) {
      const [model] = await tx
        .select({ id: schema.models.id })
        .from(schema.models)
        .where(eq(schema.models.canonicalId, bRow.modelCanonicalId))
        .limit(1);
      if (!model) continue;
      let benchmarkId: string;
      const [existingBench] = await tx
        .select({ id: schema.benchmarks.id })
        .from(schema.benchmarks)
        .where(
          and(
            eq(schema.benchmarks.name, bRow.benchmarkName),
            bRow.version ? eq(schema.benchmarks.version, bRow.version) : isNull(schema.benchmarks.version),
            bRow.comparableGroup
              ? eq(schema.benchmarks.comparableGroup, bRow.comparableGroup)
              : isNull(schema.benchmarks.comparableGroup),
          ),
        )
        .limit(1);
      if (existingBench) {
        benchmarkId = existingBench.id;
      } else {
        const [created] = await tx
          .insert(schema.benchmarks)
          .values({
            name: bRow.benchmarkName,
            category: bRow.category,
            version: bRow.version ?? null,
            comparableGroup: bRow.comparableGroup ?? null,
            status: "active",
          })
          .returning();
        benchmarkId = created.id;
      }
      const sourceTypeVal = (bRow.sourceType ?? "third_party") as (typeof schema.sourceType.enumValues)[number];
      await tx
        .insert(schema.modelBenchmarkResults)
        .values({
          modelId: model.id,
          benchmarkId,
          setting: bRow.setting ?? null,
          harness: bRow.harness ?? null,
          score: bRow.score !== null ? String(bRow.score) : null,
          scoreText: bRow.scoreText ?? null,
          resultDate: bRow.resultDate ?? null,
          confidence: bRow.confidence !== null ? String(bRow.confidence) : null,
          sourceType: sourceTypeVal,
          sourceUrl: bRow.sourceUrl ?? null,
          importJobId: uuid,
        })
        .onConflictDoNothing();
      benchmarkRowsCreated += 1;
    }

    if (provenanceEntries.length > 0) {
      await tx.insert(schema.importProvenance).values(
        provenanceEntries.map((p) => ({
          importJobId: uuid,
          entityType: p.entityType,
          entityId: p.entityId,
          sourceSheet: p.sourceSheet ?? null,
          sourceRow: p.sourceRow ?? null,
          rawValue: p.rawValue ?? null,
        })),
      );
    }

    const conflictsResolved = effectivePlan.modelRows.filter(
      (r) => r.classification === "update" || r.classification === "create",
    ).length;
    const commitSummary: ImportCommitSummary = {
      modelsCreated,
      modelsUpdated,
      accessCreated,
      accessUpdated,
      benchmarkRowsCreated,
      scoresCreated,
      sourcesCreated,
      aliasesCreated,
      conflictsResolved,
      rowsSkipped,
      committedAt: new Date().toISOString(),
    };
    await tx
      .update(schema.importJobs)
      .set({
        status: "committed",
        commitSummary: commitSummary,
        committedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.importJobs.id, uuid));
    await writeAudit(tx, {
      entityType: "import_job",
      entityId: uuid,
      action: "import",
      afterData: commitSummary,
      metadata: { operation: "commit" },
      ctx,
    });
    return {
      modelsCreated,
      modelsUpdated,
      accessCreated,
      accessUpdated,
      benchmarkRowsCreated,
      scoresCreated,
      sourcesCreated,
      aliasesCreated,
      conflictsResolved,
      rowsSkipped,
    };
  });
}

// ── 1e. Export Data Readers ────────────────────────────────────

export async function listExportModels(
  db: Db,
  input?: { includeArchived?: boolean; neutralizeFormulas?: boolean; developerId?: string; accessProviderId?: string },
): Promise<ExportModelRow[]> {
  const includeArchived = input?.includeArchived ?? false;
  const neutralize = input?.neutralizeFormulas ?? true;
  const conditions: SQL[] = [];
  if (!includeArchived) {
    conditions.push(eq(schema.models.status, "active"));
  }
  if (input?.developerId) conditions.push(eq(schema.models.developerId, input.developerId));
  if (input?.accessProviderId) conditions.push(sql`exists (select 1 from model_access ma join plans p on p.id = ma.plan_id where ma.model_id = ${schema.models.id} and p.access_provider_id = ${input.accessProviderId})`);
  const rows = await db
    .select({
      model: schema.models,
      developer: schema.developers,
      capabilities: schema.modelCapabilities,
    })
    .from(schema.models)
    .leftJoin(schema.developers, eq(schema.models.developerId, schema.developers.id))
    .leftJoin(schema.modelCapabilities, eq(schema.models.id, schema.modelCapabilities.modelId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(schema.models.name));
  return rows.map((r) => {
    const row: ExportModelRow = {
      canonicalId: r.model.canonicalId,
      name: r.model.name,
      slug: r.model.slug,
      developer: r.developer?.name ?? null,
      family: r.model.family ?? null,
      generation: r.model.generation ?? null,
      lifecycle: r.model.lifecycle,
      modelType: r.model.modelType ?? null,
      description: r.model.description ?? null,
      codingSpecialization: r.model.codingSpecialization ?? null,
      bestUse: r.model.bestUse ?? null,
      contextTokens: r.model.contextTokens ?? null,
      maxOutputTokens: r.model.maxOutputTokens ?? null,
      speedRating: r.model.speedRating ?? null,
      releaseDate: r.model.releaseDate ?? null,
      knowledgeCutoff: r.model.knowledgeCutoff ?? null,
      capabilities: {
        vision: r.capabilities?.vision ?? null,
        reasoning: r.capabilities?.reasoning ?? null,
        toolUse: r.capabilities?.toolUse ?? null,
      },
    };
    return neutralize ? (neutralizeExportRow(row as unknown as Record<string, unknown>) as ExportModelRow) : row;
  });
}

export async function listExportSubscriptions(
  db: Db,
  input?: { neutralizeFormulas?: boolean },
): Promise<ExportSubscriptionRow[]> {
  const neutralize = input?.neutralizeFormulas ?? true;
  const rows = await db
    .select({
      sub: schema.subscriptions,
      plan: schema.plans,
      provider: schema.accessProviders,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(eq(schema.subscriptions.status, "active"))
    .orderBy(asc(schema.subscriptions.accountLabel));
  return rows.map((r) => {
    const actualPrice = r.sub.actualPrice !== null ? Number(r.sub.actualPrice) : null;
    const row: ExportSubscriptionRow = {
      accountLabel: r.sub.accountLabel,
      provider: r.provider.name,
      plan: r.plan.name,
      status: r.sub.status,
      billingInterval: r.sub.billingInterval ?? null,
      actualPrice,
      currency: r.sub.currency ?? null,
      usageTrackingMode: r.sub.usageTrackingMode,
    };
    return neutralize ? (neutralizeExportRow(row as unknown as Record<string, unknown>) as ExportSubscriptionRow) : row;
  });
}

export async function listExportAccess(
  db: Db,
  input?: { neutralizeFormulas?: boolean },
): Promise<ExportAccessRow[]> {
  const neutralize = input?.neutralizeFormulas ?? true;
  const rows = await db
    .select({
      access: schema.modelAccess,
      model: schema.models,
      plan: schema.plans,
      provider: schema.accessProviders,
    })
    .from(schema.modelAccess)
    .innerJoin(schema.models, eq(schema.modelAccess.modelId, schema.models.id))
    .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(eq(schema.modelAccess.status, "active"))
    .orderBy(asc(schema.models.name));
  return rows.map((r) => {
    const row: ExportAccessRow = {
      modelCanonicalId: r.model.canonicalId,
      modelName: r.model.name,
      provider: r.provider.name,
      plan: r.plan.name,
      providerModelId: r.access.providerModelId ?? null,
      availability: r.access.availability,
      accessMethod: r.access.accessMethod,
      cliOnly: r.access.cliOnly,
      webOnly: r.access.webOnly,
    };
    return neutralize ? (neutralizeExportRow(row as unknown as Record<string, unknown>) as ExportAccessRow) : row;
  });
}

export async function listExportBenchmarks(
  db: Db,
  input?: { neutralizeFormulas?: boolean },
): Promise<ExportBenchmarkRow[]> {
  const neutralize = input?.neutralizeFormulas ?? true;
  const rows = await db
    .select({
      result: schema.modelBenchmarkResults,
      model: schema.models,
      benchmark: schema.benchmarks,
    })
    .from(schema.modelBenchmarkResults)
    .innerJoin(schema.models, eq(schema.modelBenchmarkResults.modelId, schema.models.id))
    .innerJoin(
      schema.benchmarks,
      eq(schema.modelBenchmarkResults.benchmarkId, schema.benchmarks.id),
    )
    .orderBy(asc(schema.models.name));
  return rows.map((r) => {
    const scoreVal = r.result.score !== null ? Number(r.result.score) : null;
    const row: ExportBenchmarkRow = {
      modelCanonicalId: r.model.canonicalId,
      benchmark: r.benchmark.name,
      category: r.benchmark.category,
      score: scoreVal,
      scoreText: r.result.scoreText ?? null,
      setting: r.result.setting ?? null,
      harness: r.result.harness ?? null,
      comparableGroup: r.benchmark.comparableGroup ?? null,
      sourceUrl: r.result.sourceUrl ?? null,
      resultDate: r.result.resultDate ?? null,
    };
    return neutralize ? (neutralizeExportRow(row as unknown as Record<string, unknown>) as ExportBenchmarkRow) : row;
  });
}

export async function listExportScores(db: Db, input?: { neutralizeFormulas?: boolean }): Promise<ExportScoreRow[]> {
  const rows = await db.select({ score: schema.modelScores, model: schema.models, methodology: schema.scoreMethodologies }).from(schema.modelScores).innerJoin(schema.models, eq(schema.modelScores.modelId, schema.models.id)).innerJoin(schema.scoreMethodologies, eq(schema.modelScores.methodologyId, schema.scoreMethodologies.id)).orderBy(asc(schema.models.name), asc(schema.modelScores.scoreType), desc(schema.modelScores.calculatedAt));
  return rows.map(({ score, model, methodology }) => { const row: ExportScoreRow = { modelCanonicalId: model.canonicalId, modelName: model.name, methodology: methodology.name, methodologyVersion: methodology.version, scoreType: score.scoreType, scoreValue: score.scoreValue === null ? null : Number(score.scoreValue), rankValue: score.rankValue ?? null, eligibleCount: score.eligibleCount ?? null, confidence: score.confidence === null ? null : Number(score.confidence), isManualOverride: score.isManualOverride, overrideReason: score.overrideReason ?? null, calculatedAt: score.calculatedAt.toISOString() }; return input?.neutralizeFormulas === false ? row : neutralizeExportRow(row as unknown as Record<string, unknown>) as ExportScoreRow; });
}

export async function listExportSources(db: Db, input?: { neutralizeFormulas?: boolean }): Promise<ExportSourceRow[]> {
  const rows = await db.select().from(schema.sources).orderBy(asc(schema.sources.entityType), asc(schema.sources.entityId), asc(schema.sources.createdAt));
  return rows.map((source) => { const row: ExportSourceRow = { entityType: source.entityType, entityId: source.entityId, sourceType: source.sourceType, url: source.url ?? null, title: source.title ?? null, publisher: source.publisher ?? null, retrievedAt: source.retrievedAt?.toISOString() ?? null, verifiedAt: source.verifiedAt?.toISOString() ?? null, notes: source.notes ?? null }; return input?.neutralizeFormulas === false ? row : neutralizeExportRow(row as unknown as Record<string, unknown>) as ExportSourceRow; });
}

/** Read only safe provenance fields; filesystem paths and secrets are intentionally excluded. */
/** Complete raw rows for the seven-table phase backup/round-trip contract. */
export async function listExportSevenTables(db: Db): Promise<Record<string, Record<string, unknown>[]>> {
  const rows = await Promise.all([
    db.select().from(schema.models),
    db.select().from(schema.accessProviders),
    db.select().from(schema.plans),
    db.select().from(schema.modelAccess),
    db.select().from(schema.planQuotas),
    db.select().from(schema.modelSkillRatings),
    db.select().from(schema.tags),
  ]);
  return Object.fromEntries(["models", "access_providers", "plans", "model_access", "plan_quotas", "model_skill_ratings", "tags"].map((name, index) => [name, rows[index] as Record<string, unknown>[]]));
}

const SEVEN_TABLES = ["models", "access_providers", "plans", "model_access", "plan_quotas", "model_skill_ratings", "tags"] as const;
type RestoreClient = { unsafe: (query: string, values?: readonly unknown[]) => Promise<Array<Record<string, unknown>>> };
type RestoreColumn = { column_name: string; data_type: string; udt_name: string; is_nullable: string };

function restoreError(message: string): ModelServiceError {
  return new ModelServiceError("VALIDATION_ERROR", message, 400);
}

function validateRestoreValue(value: string | null, column: RestoreColumn, table: string): string | null {
  if (value === null) {
    if (column.is_nullable !== "YES" && column.is_nullable !== "NO") throw restoreError(`Malformed column metadata for ${table}.${column.column_name}`);
    if (column.is_nullable === "NO") throw restoreError(`Null value for non-null column ${table}.${column.column_name}`);
    return null;
  }
  const type = column.data_type.toLowerCase();
  const udt = column.udt_name.toLowerCase();
  const invalid = () => { throw restoreError(`Invalid ${type} value for ${table}.${column.column_name}`); };
  if (udt === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) invalid();
  if (type === "boolean" && !/^(true|false|t|f|1|0|yes|no)$/i.test(value)) invalid();
  if (["smallint", "integer", "bigint"].includes(type) || ["int2", "int4", "int8"].includes(udt)) {
    if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) invalid();
  }
  if (["numeric", "decimal", "real", "double precision"].includes(type) || ["numeric", "float4", "float8"].includes(udt)) {
    if (value.trim() === "" || !Number.isFinite(Number(value))) invalid();
  }
  if (["date", "timestamp without time zone", "timestamp with time zone"].includes(type) || ["date", "timestamp", "timestamptz"].includes(udt)) {
    if (Number.isNaN(Date.parse(value))) invalid();
  }
  if (type === "json" || type === "jsonb" || udt === "json" || udt === "jsonb") {
    try { JSON.parse(value); } catch { invalid(); }
  }
  return value;
}

/** Shared transaction-only backup restore boundary. It validates table and column names and never commits. */
export async function restoreSevenTableSections(tx: RestoreClient, sections: ExportSection[]): Promise<void> {
  const names = sections.map((section) => section.table);
  if (names.length !== SEVEN_TABLES.length || new Set(names).size !== names.length || names.some((name) => !SEVEN_TABLES.includes(name as typeof SEVEN_TABLES[number]))) throw restoreError("Backup must contain exactly the seven required table sections");
  const order = new Map<string, number>(SEVEN_TABLES.map((table, index) => [table, index]));
  for (const section of [...sections].sort((a, b) => order.get(a.table)! - order.get(b.table)!)) {
    if (section.headers.length === 0 || new Set(section.headers).size !== section.headers.length || section.headers.some((header) => !/^[a-z][a-z0-9_]*$/.test(header))) throw restoreError(`Malformed headers for ${section.table}`);
    const metadataRows = await tx.unsafe("SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [section.table]);
    if (metadataRows.length === 0 || metadataRows.some((row) => typeof row.column_name !== "string" || typeof row.data_type !== "string" || typeof row.udt_name !== "string" || (row.is_nullable !== "YES" && row.is_nullable !== "NO"))) throw restoreError(`Malformed column metadata for ${section.table}`);
    const metadata = new Map(metadataRows.map((row) => [row.column_name, row as unknown as RestoreColumn]));
    if (section.headers.length !== metadata.size || section.headers.some((header) => !metadata.has(header))) throw restoreError(`Backup columns do not exactly match ${section.table}`);
    for (const row of section.rows) {
      if (Object.keys(row).length !== section.headers.length || Object.keys(row).some((column) => !section.headers.includes(column))) throw restoreError(`Malformed row in ${section.table}`);
      const values = section.headers.map((column) => validateRestoreValue(row[column], metadata.get(column)!, section.table));
      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
      try {
        await tx.unsafe(`INSERT INTO "${section.table}" (${section.headers.map((header) => `"${header}"`).join(", ")}) VALUES (${placeholders})`, values);
      } catch (error) {
        if (error instanceof ModelServiceError) throw error;
        throw restoreError(`Backup row rejected by ${section.table}`);
      }
    }
  }
}

export async function listExportProvenance(db: Db): Promise<ImportProvenanceDto[]> {
  const rows = await db.select({
    id: schema.importProvenance.id,
    importJobId: schema.importProvenance.importJobId,
    entityType: schema.importProvenance.entityType,
    entityId: schema.importProvenance.entityId,
    sourceSheet: schema.importProvenance.sourceSheet,
    sourceRow: schema.importProvenance.sourceRow,
    sourceColumn: schema.importProvenance.sourceColumn,
    rawValue: schema.importProvenance.rawValue,
    createdAt: schema.importProvenance.createdAt,
  }).from(schema.importProvenance).orderBy(asc(schema.importProvenance.createdAt), asc(schema.importProvenance.id));
  return rows.map((row) => ({ ...row, sourceSheet: row.sourceSheet ?? null, sourceRow: row.sourceRow ?? null, sourceColumn: row.sourceColumn ?? null, rawValue: row.rawValue ?? null, createdAt: row.createdAt.toISOString() }));
}

// ── Internal helpers ────────────────────────────────────────────

/** Map lifecycle raw string to lifecycle_status enum. */
function parseLifecycle(raw: string | null | undefined): (typeof schema.lifecycleStatus.enumValues)[number] {
  if (!raw) return "current";
  const lower = raw.toLowerCase().trim();
  if (lower === "current" || lower === "ga") return "current";
  if (lower === "preview") return "preview";
  if (lower === "beta") return "beta";
  if (lower === "legacy") return "legacy";
  if (lower === "deprecated") return "deprecated";
  if (lower === "retired") return "retired";
  if (lower === "unavailable" || lower === "unavail") return "unavailable";
  return "unknown";
}

function parseBoolean(value: string | boolean | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  const lower = value.toLowerCase().trim();
  if (lower === "yes" || lower === "true" || lower === "1") return true;
  if (lower === "no" || lower === "false" || lower === "0") return false;
  return null;
}

async function resolveDeveloperNames(
  tx: Tx,
  plan: ImportPlan,
): Promise<Map<string, string>> {
  const names = new Set<string>();
  for (const row of plan.modelRows) {
    if (row.developerName) names.add(row.developerName);
  }
  if (names.size === 0) return new Map();
  const rows = await tx
    .select({ id: schema.developers.id, name: schema.developers.name })
    .from(schema.developers);
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.name.toLowerCase().trim(), r.id);
    map.set(r.name, r.id);
  }
  return map;
}

async function resolveAccessProviderNames(
  tx: Tx,
  plan: ImportPlan,
): Promise<Map<string, string>> {
  const names = new Set<string>();
  for (const row of plan.modelRows) {
    if (row.accessProviderName) names.add(row.accessProviderName);
  }
  if (names.size === 0) return new Map();
  const rows = await tx
    .select({ id: schema.accessProviders.id, name: schema.accessProviders.name, slug: schema.accessProviders.slug })
    .from(schema.accessProviders);
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.name.toLowerCase().trim(), r.id);
    map.set(r.name, r.id);
    map.set(r.slug, r.id);
  }
  return map;
}

async function resolvePlanNames(
  tx: Tx,
  plan: ImportPlan,
): Promise<Map<string, string>> {
  const names = new Set<string>();
  for (const row of plan.modelRows) {
    if (row.planName) names.add(row.planName);
  }
  if (names.size === 0) return new Map();
  const rows = await tx
    .select({ id: schema.plans.id, name: schema.plans.name, slug: schema.plans.slug })
    .from(schema.plans);
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.name.toLowerCase().trim(), r.id);
    map.set(r.name, r.id);
    map.set(r.slug, r.id);
  }
  return map;
}

async function createProviderAlias(tx: Tx, row: ImportPlanModelRow, modelId: string, apMap: Map<string, string>): Promise<boolean> {
  if (!row.providerModelId) return false;
  const normalizedAlias = row.providerModelId.trim().toLowerCase();
  if (!normalizedAlias) return false;
  const inserted = await tx.insert(schema.modelAliases).values({
    modelId, alias: row.providerModelId, normalizedAlias, aliasType: "provider",
    accessProviderId: row.accessProviderName ? (apMap.get(row.accessProviderName.toLowerCase().trim()) ?? null) : null,
  }).onConflictDoNothing().returning({ id: schema.modelAliases.id });
  return inserted.length > 0;
}

function createAccessRows(
  row: ImportPlanModelRow,
  modelId: string,
  apMap: Map<string, string>,
  planMap: Map<string, string>,
): Array<typeof schema.modelAccess.$inferInsert> {
  if (!row.accessProviderName || !row.planName) return [];
  const planId = planMap.get(row.planName.toLowerCase().trim()) ?? planMap.get(row.planName);
  if (!planId) return [];
  return [
    {
      modelId,
      planId,
      providerModelId: row.providerModelId ?? null,
      availability: "unconfirmed",
      accessMethod: "other",
      authenticationType: "other",
      cliOnly: false,
      status: "active",
    },
  ];
}

function importCommitSummaryToResult(summary: ImportCommitSummary): ImportCommitResult {
  return {
    modelsCreated: summary.modelsCreated,
    modelsUpdated: summary.modelsUpdated,
    accessCreated: summary.accessCreated,
    accessUpdated: summary.accessUpdated,
    benchmarkRowsCreated: summary.benchmarkRowsCreated,
    scoresCreated: summary.scoresCreated,
    sourcesCreated: summary.sourcesCreated,
    aliasesCreated: summary.aliasesCreated,
    conflictsResolved: summary.conflictsResolved,
    rowsSkipped: summary.rowsSkipped,
  };
}
