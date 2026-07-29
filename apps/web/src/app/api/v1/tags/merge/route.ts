import { mergeTags } from "@model-monitor/database";
import { db } from "@/lib/db";
import {
  auditContext,
  getRequestId,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireApiSession,
} from "@/lib/api";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireApiSession(requestId);
    const body = await parseJsonBody(request);
    const result = await mergeTags(db, body, auditContext(request, session.userId));
    return jsonOk(result, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
