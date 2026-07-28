import {
  archiveModel,
} from "@model-monitor/database";
import { db } from "@/lib/db";
import {
  auditContext,
  getRequestId,
  jsonError,
  jsonOk,
  parsePathUuid,
  requireApiSession,
} from "@/lib/api";

interface RouteContext {
  params: Promise<{ modelId: string }>;
}

/** Archive (soft-delete). Prefer this over DELETE for clients that only POST. */
export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { modelId } = await context.params;
    const model = await archiveModel(
      db,
      parsePathUuid(modelId, "modelId"),
      auditContext(request, session.userId),
    );
    return jsonOk(model, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
