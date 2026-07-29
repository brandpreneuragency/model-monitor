import { inArray } from "drizzle-orm";
import { listExportAccess, listExportBenchmarks, listExportModels, listExportProvenance, listExportSources, listExportSevenTables, schema } from "@model-monitor/database";
import { exportRequestSchema } from "@model-monitor/schemas";
import { db } from "@/lib/db";
import { getRequestId, jsonError, requireApiSession } from "@/lib/api";
import { buildExportPayload, filename, mimeTypes, preparePayload, serializeBackupArchive, serializeExport } from "@/lib/export-pipeline";
import { applyExportScope } from "@/lib/export-scope";

function bool(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Invalid boolean query parameter");
}

export async function GET(request: Request, context: { params: Promise<{ scope: string }> }) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const { scope } = await context.params;
    const url = new URL(request.url);
    const parsed = exportRequestSchema.safeParse({
      scope,
      format: url.searchParams.get("format") ?? (scope === "backup" ? "json" : "csv"),
      includeArchived: bool(url.searchParams.get("includeArchived")),
      includeProvenance: bool(url.searchParams.get("includeProvenance")),
      neutralizeFormulas: bool(url.searchParams.get("neutralizeFormulas")),
      search: url.searchParams.get("search") || undefined,
      developerId: url.searchParams.get("developerId") || undefined,
      accessProviderId: url.searchParams.get("accessProviderId") || undefined,
      modelIds: url.searchParams.getAll("modelId"),
    });
    if (!parsed.success) throw parsed.error;
    const input = parsed.data;
    if (input.scope === "backup") {
      const tables = await listExportSevenTables(db);
      const bytes = serializeBackupArchive(tables);
      return new Response(new Uint8Array(bytes), { headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="model-monitor-backup.zip"', "content-length": String(bytes.byteLength), "x-request-id": requestId } });
    }
    const options = { includeArchived: input.includeArchived, neutralizeFormulas: input.neutralizeFormulas, developerId: input.developerId, accessProviderId: input.accessProviderId };
    const modelRows = await listExportModels(db, options);
    let selectedCanonicalIds: Set<string> | undefined;
    if (input.scope === "selected") {
      if (input.modelIds.length === 0) throw new Error("selected export requires at least one modelId");
      const selected = await db.select({ canonicalId: schema.models.canonicalId }).from(schema.models).where(inArray(schema.models.id, input.modelIds));
      if (selected.length !== new Set(input.modelIds).size) throw new Error("selected export requires valid existing model UUIDs");
      selectedCanonicalIds = new Set(selected.map((row) => row.canonicalId));
    }
    const access = await listExportAccess(db, options);
    const benchmarks = await listExportBenchmarks(db, options);
    const scoped = applyExportScope({
      scope: input.scope,
      models: modelRows,
      access,
      benchmarks,
      scores: [],
      subscriptions: [],
      sources: await listExportSources(db, options),
      provenance: input.includeProvenance ? await listExportProvenance(db) : [],
      search: input.search,
      selectedCanonicalIds,
    });
    const payload = preparePayload(buildExportPayload({
      format: input.format,
      scope: input.scope,
      formulasNeutralized: input.neutralizeFormulas,
      ...scoped,
    }));
    const bytes = await serializeExport(payload, input.format);
    return new Response(new Uint8Array(bytes), { headers: { "content-type": mimeTypes[input.format], "content-disposition": `attachment; filename="${filename(input.scope, input.format)}"`, "content-length": String(bytes.byteLength), "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof Error && (error.message === "Invalid boolean query parameter" || error.message.includes("requires"))) return new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: error.message, requestId } }), { status: 400, headers: { "content-type": "application/json", "x-request-id": requestId } });
    return jsonError(error, requestId);
  }
}
