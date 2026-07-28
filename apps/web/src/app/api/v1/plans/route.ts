import { listPlans, createPlan } from "@model-monitor/database";
import { db } from "@/lib/db";
import {
  auditContext,
  getRequestId,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireApiSession,
} from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const url = new URL(request.url);
    const filter = {
      accessProviderId: url.searchParams.get("accessProviderId") ?? undefined,
      accessProviderSlug: url.searchParams.get("accessProviderSlug") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      archived: url.searchParams.get("archived") ?? undefined,
      accessType: url.searchParams.get("accessType") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    };
    const data = await listPlans(db, filter);
    return jsonOk({ data, meta: { requestId } }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const body = await parseJsonBody(request);
    const plan = await createPlan(db, body, auditContext(request, session.userId));
    return jsonOk(plan, { status: 201, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
