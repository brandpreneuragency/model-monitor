import { setRankingProfileWeights } from "@model-monitor/database";
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
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const profile = await setRankingProfileWeights(
      db,
      parsePathUuid(id, "id"),
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(profile, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
