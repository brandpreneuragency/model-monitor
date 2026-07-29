import {
  deleteRankingProfile,
  getRankingProfile,
  updateRankingProfile,
} from "@model-monitor/database";
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

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const { id } = await context.params;
    // Allow slug or uuid
    const profile = await getRankingProfile(db, id);
    return jsonOk(profile, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const profile = await updateRankingProfile(
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

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { id } = await context.params;
    const result = await deleteRankingProfile(
      db,
      parsePathUuid(id, "id"),
      auditContext(request, session.userId),
    );
    return jsonOk(result, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
