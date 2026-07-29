import { commitImport, getOwnedImportJob, importPlanSchema, listConflicts, ModelServiceError } from "@model-monitor/database";
import { db } from "@/lib/db";
import { auditContext, getRequestId, jsonError, jsonOk, parseJsonBody, requireApiSession } from "@/lib/api";
import { z } from "zod";

const commitBodySchema = z.object({
  importJobId: z.string().uuid(),
  plan: importPlanSchema,
  resolutions: z.array(z.object({ row: z.number().int().positive(), action: z.enum(["create-new", "update-existing"]) })).default([]),
});

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    if (!session.userId) throw new ModelServiceError("UNAUTHORIZED", "Authenticated user identity is required for import commit", 401);
    const body = commitBodySchema.parse(await parseJsonBody(request));
    await getOwnedImportJob(db, body.importJobId, session.userId);
    const conflicts = await listConflicts(db, body.importJobId);
    const requiredRows = new Set(conflicts.map((conflict) => conflict.sourceRow).filter((row): row is number => row !== null));
    const suppliedRows = new Set(body.resolutions.map((resolution) => resolution.row));
    if (suppliedRows.size !== body.resolutions.length || suppliedRows.size !== requiredRows.size || [...requiredRows].some((row) => !suppliedRows.has(row)) || [...suppliedRows].some((row) => !requiredRows.has(row))) {
      throw new ModelServiceError("PRECONDITION_FAILED", "Conflict choices must exactly match the preview conflicts", 400);
    }
    const result = await commitImport(db, body.importJobId, body.plan, auditContext(request, session.userId), body.resolutions.map((resolution) => ({ sourceRow: resolution.row, action: resolution.action })));
    return jsonOk({ committed: true, transaction: "committed", result }, { requestId });
  } catch (error) { return jsonError(error, requestId); }
}
