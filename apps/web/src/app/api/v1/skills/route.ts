import { createSkill, listSkills } from "@model-monitor/database";
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
    const data = await listSkills(db, {
      search: url.searchParams.get("search") ?? undefined,
      archived: url.searchParams.get("archived") ?? undefined,
      includeArchived: url.searchParams.get("includeArchived") ?? undefined,
    });
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
    const skill = await createSkill(db, body, auditContext(request, session.userId));
    return jsonOk(skill, { status: 201, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
