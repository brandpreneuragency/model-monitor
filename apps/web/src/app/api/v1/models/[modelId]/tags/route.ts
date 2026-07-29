import { listModelTags, setModelTags } from "@model-monitor/database";
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
  params: Promise<{ modelId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const { modelId } = await context.params;
    const data = await listModelTags(db, parsePathUuid(modelId, "modelId"));
    return jsonOk({ data, meta: { requestId } }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

/** Replace a model's entire tag set in one call. */
export async function PUT(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { modelId } = await context.params;
    const body = await parseJsonBody(request);
    const result = await setModelTags(
      db,
      parsePathUuid(modelId, "modelId"),
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(result, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
