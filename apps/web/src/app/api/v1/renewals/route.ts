import { listRenewals } from "@model-monitor/database";
import { db } from "@/lib/db";
import {
  getRequestId,
  jsonError,
  jsonOk,
  requireApiSession,
} from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const url = new URL(request.url);
    const filter = {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    };
    const data = await listRenewals(db, filter);
    return jsonOk({ data, meta: { requestId } }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
