import { listPlanQuotas, createPlanQuota } from "@model-monitor/database";
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
  params: Promise<{ planId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const { planId } = await context.params;
    const data = await listPlanQuotas(db, parsePathUuid(planId, "planId"));
    return jsonOk({ data, meta: { requestId } }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { planId } = await context.params;
    const body = await parseJsonBody(request);
    const quota = await createPlanQuota(
      db,
      parsePathUuid(planId, "planId"),
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(quota, { status: 201, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
