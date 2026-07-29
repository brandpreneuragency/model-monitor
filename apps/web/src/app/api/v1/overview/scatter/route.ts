import { getOverviewScatter } from "@model-monitor/database";
import { db } from "@/lib/db";
import { getRequestId, jsonError, jsonOk, requireApiSession } from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const url = new URL(request.url);
    const result = await getOverviewScatter(db, {
      x: url.searchParams.get("x") ?? undefined,
      y: url.searchParams.get("y") ?? undefined,
      provider: url.searchParams.get("provider") ?? undefined,
      providerId: url.searchParams.get("providerId") ?? undefined,
      plan: url.searchParams.get("plan") ?? undefined,
      planId: url.searchParams.get("planId") ?? undefined,
      modelType: url.searchParams.get("modelType") ?? undefined,
      accessType: url.searchParams.get("accessType") ?? undefined,
    });
    return jsonOk(
      {
        data: result.points,
        meta: { requestId, x: result.x, y: result.y },
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
