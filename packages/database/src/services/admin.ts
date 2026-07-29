import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, ilike, isNull, lte, or } from "drizzle-orm";
import {
  createApiTokenSchema,
  verificationSettingsSchema,
  type AuditQuery,
  type CreateApiToken,
  type VerificationSettings,
} from "@model-monitor/schemas";
import * as schema from "../schema";
import { ModelServiceError, writeAudit, jsonSafe, type DbOrTx } from "./audit";

const SETTINGS_VERIFICATION = "admin.verification";
/**
 * Legacy blob key prefix for per-user saved views in app_settings.
 * Table-backed `saved_views` supersedes this; the blob is left in place until
 * deploy-finalize (see progress.md ## Deferred drops). Do not write here.
 */
const _SETTINGS_VIEWS_LEGACY = "admin.savedViews";
void _SETTINGS_VIEWS_LEGACY;

const TOKEN_SCOPE = "catalog:read" as const;

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function isApiTokenUsable(
  row: { revokedAt: Date | null; expiresAt: Date | null; scopes: string[] },
  scope: string = TOKEN_SCOPE,
  now = new Date(),
): boolean {
  return (
    !row.revokedAt &&
    (!row.expiresAt || row.expiresAt > now) &&
    row.scopes.includes(scope)
  );
}
export function safeApiTokenResponse<T extends { tokenHash?: unknown; token?: string }>(
  row: T,
  token?: string,
) {
  const { tokenHash: _hash, ...safe } = row;
  return token ? { ...safe, token } : safe;
}
async function atomic<T>(db: DbOrTx, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  if ("transaction" in db && typeof db.transaction === "function") return db.transaction((tx) => fn(tx));
  return fn(db);
}

export async function createApiToken(
  db: DbOrTx,
  userId: string,
  input: CreateApiToken,
  ctx?: { requestId?: string | null },
) {
  return atomic(db, async (tx) => {
    const parsed = createApiTokenSchema.parse(input);
    const plaintext = `mm_${randomBytes(32).toString("base64url")}`;
    const prefix = plaintext.slice(0, 12);
    const [row] = await tx
      .insert(schema.apiTokens)
      .values({
        userId,
        name: parsed.name,
        tokenPrefix: prefix,
        tokenHash: hashApiToken(plaintext),
        scopes: [TOKEN_SCOPE],
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      })
      .returning({
        id: schema.apiTokens.id,
        name: schema.apiTokens.name,
        tokenPrefix: schema.apiTokens.tokenPrefix,
        expiresAt: schema.apiTokens.expiresAt,
        createdAt: schema.apiTokens.createdAt,
      });
    await writeAudit(tx, {
      entityType: "api_token",
      entityId: row.id,
      action: "token_create",
      afterData: { id: row.id, name: row.name, scopes: [TOKEN_SCOPE], expiresAt: row.expiresAt },
      ctx: { actorUserId: userId, requestId: ctx?.requestId },
    });
    return { ...row, token: plaintext, scopes: [TOKEN_SCOPE] as const };
  });
}
export async function listApiTokens(db: DbOrTx, userId: string) {
  return db
    .select({
      id: schema.apiTokens.id,
      name: schema.apiTokens.name,
      tokenPrefix: schema.apiTokens.tokenPrefix,
      scopes: schema.apiTokens.scopes,
      expiresAt: schema.apiTokens.expiresAt,
      lastUsedAt: schema.apiTokens.lastUsedAt,
      revokedAt: schema.apiTokens.revokedAt,
      createdAt: schema.apiTokens.createdAt,
    })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, userId))
    .orderBy(desc(schema.apiTokens.createdAt));
}
export async function revokeApiToken(
  db: DbOrTx,
  userId: string,
  id: string,
  requestId?: string | null,
) {
  return atomic(db, async (tx) => {
    const [row] = await tx
      .update(schema.apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, userId)))
      .returning({ id: schema.apiTokens.id });
    if (!row) throw new ModelServiceError("NOT_FOUND", "Token not found", 404);
    await writeAudit(tx, {
      entityType: "api_token",
      entityId: id,
      action: "token_revoke",
      ctx: { actorUserId: userId, requestId },
    });
    return { id };
  });
}
export async function verifyBearerToken(
  db: DbOrTx,
  plaintext: string,
  scope: typeof TOKEN_SCOPE = TOKEN_SCOPE,
) {
  const [row] = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.tokenHash, hashApiToken(plaintext)));
  if (
    !row ||
    row.revokedAt ||
    (row.expiresAt && row.expiresAt <= new Date()) ||
    !row.scopes.includes(scope)
  )
    return null;
  await db
    .update(schema.apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(schema.apiTokens.id, row.id), isNull(schema.apiTokens.revokedAt)));
  return { tokenId: row.id, userId: row.userId, scopes: row.scopes };
}

export async function getVerificationSettings(db: DbOrTx): Promise<VerificationSettings> {
  const [row] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, SETTINGS_VERIFICATION));
  return verificationSettingsSchema.parse(
    row?.value ?? { intervalDays: 30, thresholdDays: 30 },
  );
}
export async function setVerificationSettings(
  db: DbOrTx,
  userId: string,
  input: VerificationSettings,
  requestId?: string | null,
) {
  return atomic(db, async (tx) => {
    const value = verificationSettingsSchema.parse(input);
    await tx
      .insert(schema.appSettings)
      .values({ key: SETTINGS_VERIFICATION, value, updatedBy: userId })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: { value, updatedBy: userId, updatedAt: new Date() },
      });
    await writeAudit(tx, {
      entityType: "app_settings",
      entityId: null,
      action: "settings_change",
      afterData: value,
      ctx: { actorUserId: userId, requestId },
    });
    return value;
  });
}

// Saved-view CRUD moved to services/tags-views.ts (saved_views table).
// Legacy app_settings key admin.savedViews* left unread/unwritten here.

export async function listAuditEvents(db: DbOrTx, query: AuditQuery) {
  const filters = [];
  if (query.entityType) filters.push(eq(schema.auditEvents.entityType, query.entityType));
  if (query.action)
    filters.push(
      eq(schema.auditEvents.action, query.action as (typeof schema.auditAction.enumValues)[number]),
    );
  if (query.from) filters.push(gte(schema.auditEvents.createdAt, new Date(query.from)));
  if (query.to) filters.push(lte(schema.auditEvents.createdAt, new Date(query.to)));
  if (query.search)
    filters.push(
      or(
        ilike(schema.auditEvents.entityType, `%${query.search}%`),
        ilike(schema.auditEvents.action, `%${query.search}%`),
        ilike(schema.auditEvents.requestId, `%${query.search}%`),
      ),
    );
  const offset = (query.page - 1) * query.limit;
  const rows = await db
    .select()
    .from(schema.auditEvents)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(query.limit)
    .offset(offset);
  return {
    data: rows.map((r) => ({
      ...r,
      beforeData: jsonSafe(r.beforeData),
      afterData: jsonSafe(r.afterData),
      metadata: jsonSafe(r.metadata),
    })),
    page: { page: query.page, limit: query.limit, hasMore: rows.length === query.limit },
    meta: { pageBehavior: "offset", requestId: null },
  };
}
