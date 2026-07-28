import { archiveAccessProvider } from "@model-monitor/database";
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
  params: Promise<{ providerId: string }>;
}

/** Archive (soft-delete). Prefer this over DELETE for clients that only POST. */
export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { providerId } = await context.params;
    const provider = await archiveAccessProvider(
      db,
      parsePathUuid(providerId, "providerId"),
      auditContext(request, session.userId),
    );
    return jsonOk(provider, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
