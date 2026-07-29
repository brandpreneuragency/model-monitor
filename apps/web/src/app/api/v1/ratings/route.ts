import { listRatings } from "@model-monitor/database";
import { db } from "@/lib/db";
import { getRequestId, jsonError, jsonOk, requireApiSession } from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const url = new URL(request.url);
    const data = await listRatings(db, {
      skillId: url.searchParams.get("skillId") ?? undefined,
      modelId: url.searchParams.get("modelId") ?? undefined,
      includeHidden: url.searchParams.get("includeHidden") ?? undefined,
    });
    return jsonOk({ data, meta: { requestId } }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
