import { getLeaderboard } from "@model-monitor/database";
import { db } from "@/lib/db";
import { getRequestId, jsonError, jsonOk, requireApiSession } from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await requireApiSession(requestId);
    const url = new URL(request.url);
    const result = await getLeaderboard(db, {
      profileId: url.searchParams.get("profileId") ?? undefined,
      skillId: url.searchParams.get("skillId") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    });
    return jsonOk(
      {
        data: result.data,
        meta: {
          requestId,
          type: result.type,
          skill: result.skill,
          profile: result.profile,
        },
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
