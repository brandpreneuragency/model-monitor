import { archiveSkill, getSkill, updateSkill } from "@model-monitor/database";
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
    const skill = await getSkill(db, parsePathUuid(id, "id"));
    return jsonOk(skill, { requestId });
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
    const skill = await updateSkill(
      db,
      parsePathUuid(id, "id"),
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(skill, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

/** Archive skill + hide its ratings (rows retained). */
export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { id } = await context.params;
    const skill = await archiveSkill(
      db,
      parsePathUuid(id, "id"),
      auditContext(request, session.userId),
    );
    return jsonOk(skill, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
