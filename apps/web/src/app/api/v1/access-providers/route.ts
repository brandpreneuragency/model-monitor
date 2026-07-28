import {
  listAccessProviders,
  createAccessProvider,
} from "@model-monitor/database";
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
      search: url.searchParams.get("search") ?? undefined,
      archived: url.searchParams.get("archived") ?? undefined,
      providerType: url.searchParams.get("providerType") ?? undefined,
    };
    const data = await listAccessProviders(db, filter);
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
    const provider = await createAccessProvider(
      db,
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(provider, { status: 201, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
