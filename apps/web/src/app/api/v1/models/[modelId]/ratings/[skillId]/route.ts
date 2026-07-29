import { upsertModelSkillRating } from "@model-monitor/database";
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
  params: Promise<{ modelId: string; skillId: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { modelId, skillId } = await context.params;
    const body = await parseJsonBody(request);
    const rating = await upsertModelSkillRating(
      db,
      parsePathUuid(modelId, "modelId"),
      parsePathUuid(skillId, "skillId"),
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(rating, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
