import { createRankingProfile, listRankingProfiles } from "@model-monitor/database";
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
    const data = await listRankingProfiles(db);
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
    const profile = await createRankingProfile(
      db,
      body,
      auditContext(request, session.userId),
    );
    return jsonOk(profile, { status: 201, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
