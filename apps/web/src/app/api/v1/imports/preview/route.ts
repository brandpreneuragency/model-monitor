import { createHash } from "node:crypto";
import { detectDuplicates, parseMappedCsv, type ColumnMapping } from "@model-monitor/csv-import";
import { createImportJob, getOwnedImportJob, listConflicts, storePreview, schema, ModelServiceError, type ImportPlan, type ImportPlanModelRow } from "@model-monitor/database";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auditContext, getRequestId, jsonError, jsonOk, requireApiSession } from "@/lib/api";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const mappingSchema = z.record(z.string().min(1), z.string().min(1)).default({});

function canonicalId(name: string): string {
  return `import:${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function proseBoolean(value: string | null): boolean | null {
  if (!value) return null;
  if (["true", "yes", "1"].includes(value.toLowerCase())) return true;
  if (["false", "no", "0"].includes(value.toLowerCase())) return false;
  return null;
}

function planRow(row: { row: number; values: Record<string, string | null> }, classification: ImportPlanModelRow["classification"], modelId?: string): ImportPlanModelRow {
  const value = row.values;
  return {
    classification,
    // Conflict identity is resolved server-side from the candidate UUID; never bind a
    // database UUID into the canonical identity field sent to the client.
    canonicalId: modelId ? null : value.canonicalId ?? canonicalId(value.modelName ?? ""),
    developerName: value.developer ?? null,
    name: value.modelName,
    family: value.family ?? null,
    generation: value.generation ?? null,
    lifecycleRaw: value.lifecycle ?? null,
    releaseDate: value.releaseDate ?? null,
    modelType: value.modelType ?? null,
    contextTokens: value.contextTokens ? Number(value.contextTokens) : null,
    maxOutputTokens: value.maxOutputTokens ? Number(value.maxOutputTokens) : null,
    speedRating: value.speedRating ?? null,
    codingSpecialization: value.codingSpecialization ?? null,
    bestUse: value.bestUse ?? null,
    avoidFor: value.avoidFor ?? null,
    visionSupport: proseBoolean(value.visionSupport),
    reasoningSupport: value.reasoningSupport ?? null,
    toolSupport: value.toolSupport ?? null,
    knowledgeCutoff: value.knowledgeCutoff ?? null,
    needsRecheck: value.needsRecheck ? ["true", "yes", "1"].includes(value.needsRecheck.toLowerCase()) : null,
    accessProviderName: value.provider ?? null,
    planName: value.plan ?? null,
    providerModelId: value.providerAlias ?? null,
    subscriptionUsdMo: null,
    sourceSheet: "CSV",
    sourceRow: row.row,
    verifiedOn: null,
  };
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    if (!session.userId) throw new ModelServiceError("UNAUTHORIZED", "Authenticated user identity is required for import preview", 401);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ModelServiceError("VALIDATION_ERROR", "A CSV file is required", 400);
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new ModelServiceError("VALIDATION_ERROR", "CSV upload must be between 1 byte and 10 MiB", 400);
    if (!file.name.toLowerCase().endsWith(".csv") || (file.type && !["text/csv", "application/csv", "application/vnd.ms-excel"].includes(file.type))) {
      throw new ModelServiceError("VALIDATION_ERROR", "Only CSV uploads are accepted", 400);
    }
    const rawMapping = form.get("mapping");
    const mappingText = typeof rawMapping === "string" ? rawMapping : undefined;
    const mapping = mappingSchema.parse(mappingText ? JSON.parse(mappingText) : {}) as ColumnMapping;
    const text = await file.text();
    const parsed = parseMappedCsv(text, mapping);
    const modelRows = await db.select({ id: schema.models.id, name: schema.models.name }).from(schema.models);
    const aliasRows = await db.select({ modelId: schema.modelAliases.modelId, alias: schema.modelAliases.alias }).from(schema.modelAliases).where(eq(schema.modelAliases.aliasType, "provider"));
    const aliasesByModel = new Map<string, string[]>();
    for (const alias of aliasRows) aliasesByModel.set(alias.modelId, [...(aliasesByModel.get(alias.modelId) ?? []), alias.alias]);
    const identities = modelRows.map((model) => ({ id: model.id, name: model.name, aliases: aliasesByModel.get(model.id) ?? [] }));
    const detected = detectDuplicates(parsed.rows, identities);
    const plans: ImportPlan = { modelRows: parsed.rows.map((row) => {
      const conflict = detected.find((item) => item.row === row.row);
      return planRow(row, conflict ? "update" : "create", conflict?.modelId);
    }), benchmarkRows: [] };
    const job = await createImportJob(db, { userId: session.userId, filename: file.name, storedPath: `preview://${requestId}`, sha256: createHash("sha256").update(Buffer.from(text)).digest("hex"), parserVersion: "phase-26.2", expectedSizeBytes: file.size }, auditContext(request, session.userId));
    await storePreview(db, job.id, {
      plan: plans,
      previewSummary: { totalSourceRows: parsed.rows.length + parsed.errors.length, createCount: plans.modelRows.filter((row) => row.classification === "create").length, updateCount: detected.length, conflictCount: detected.length, errorCount: parsed.errors.length, skipCount: parsed.skipped },
      conflicts: detected.map((item) => ({ conflictType: "alias_collision", sourceSheet: "CSV", sourceRow: item.row, sourceColumn: item.alias ? "providerAlias" : "modelName", entityType: "model", candidateEntityId: item.modelId, currentValue: { name: item.existingName }, importedValue: parsed.rows.find((row) => row.row === item.row)?.values ?? null })),
      errorSummary: { totalErrors: parsed.errors.length, errors: parsed.errors.map((error) => ({ row: error.row, column: error.column, code: error.code, message: error.message })) },
    }, auditContext(request, session.userId));
    const conflicts = await listConflicts(db, job.id);
    const owned = await getOwnedImportJob(db, job.id, session.userId);
    return jsonOk({ importJobId: owned.id, job: owned, mapping: parsed.mapping, plan: plans, rows: parsed.rows.map((row) => { const conflict = detected.find((item) => item.row === row.row); return { classification: conflict ? "conflict" : "create", entityType: "model", sourceSheet: "CSV", sourceRow: row.row, label: row.values.modelName ?? "", proposedValues: row.values, ...(conflict ? { conflictId: conflicts.find((item) => item.sourceRow === row.row)?.id } : {}) }; }), conflicts, errors: parsed.errors.map((error) => ({ sheet: "CSV", row: error.row, message: `${error.column}: ${error.message}` })), readOnly: true }, { requestId });
  } catch (error) { return jsonError(error, requestId); }
}
