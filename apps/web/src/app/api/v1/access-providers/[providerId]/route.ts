import {
  archiveAccessProvider,
  getAccessProvider,
  updateAccessProvider,
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
  params: Promise<{ providerId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const { providerId } = await context.params;
    const provider = await getAccessProvider(
      db,
      parsePathUuid(providerId, "providerId"),
    );
    return jsonOk(provider, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const { providerId } = await context.params;
    const body = await parseJsonBody(request);
    const provider = await updateAccessProvider(
      db,
      parsePathUuid(providerId, "providerId"),
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(provider, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

/** Soft-archive via DELETE. Prefer POST .../archive for clients that only POST. */
export async function DELETE(request: Request, context: RouteContext) {
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
