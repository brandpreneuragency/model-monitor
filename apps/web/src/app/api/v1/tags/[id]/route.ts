import { deleteTag, getTag, updateTag } from "@model-monitor/database";
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
    const tag = await getTag(db, parsePathUuid(id, "id"));
    return jsonOk(tag, { requestId });
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
    const tag = await updateTag(
      db,
      parsePathUuid(id, "id"),
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(tag, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

/** Delete tag (model_tags cascade). */
export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { id } = await context.params;
    const result = await deleteTag(
      db,
      parsePathUuid(id, "id"),
      auditContext(request, session.userId),
    );
    return jsonOk({ data: result, meta: { requestId } }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
