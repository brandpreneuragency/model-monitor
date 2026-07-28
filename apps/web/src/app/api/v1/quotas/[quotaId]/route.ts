import { deletePlanQuota, updatePlanQuota } from "@model-monitor/database";
import { db } from "@/lib/db";
import {
  auditContext,
  getRequestId,
  jsonError,
  jsonOk,
  parseJsonBody,
  parsePathUuid,
  requireApiSession,
} from "@/lib/api";

interface RouteContext {
  params: Promise<{ quotaId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { quotaId } = await context.params;
    const body = await parseJsonBody(request);
    const quota = await updatePlanQuota(
      db,
      parsePathUuid(quotaId, "quotaId"),
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(quota, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { quotaId } = await context.params;
    const result = await deletePlanQuota(
      db,
      parsePathUuid(quotaId, "quotaId"),
      auditContext(request, session.userId),
    );
    return jsonOk(result, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
