/**
 * Tags + saved_views service (table-backed).
 * Tag usage counts are always derived via aggregate — never a stored counter.
 * Saved views read/write `saved_views`, not the legacy app_settings JSON blob.
 * Tag / saved-view mutations intentionally skip audit (high-frequency personal edits).
 */
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  createRankingSavedViewSchema,
  createTagSchema,
  mergeTagsSchema,
  setModelTagsSchema,
  slugifyModelName,
  updateRankingSavedViewSchema,
  updateTagSchema,
} from "@model-monitor/schemas";
import * as schema from "../schema/index";
import type { AuditContext, Db, DbOrTx } from "./audit";
import { ModelServiceError } from "./audit";

// ── Types ──────────────────────────────────────────────────────

export type TagResponse = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  category: (typeof schema.tagCategory.enumValues)[number];
  usageCount: number;
  createdAt: string;
};

export type ModelTagAssignment = {
  modelId: string;
  tagId: string;
  tag: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
    category: (typeof schema.tagCategory.enumValues)[number];
  };
  createdAt: string;
};

export type SavedViewResponse = {
  id: string;
  name: string;
  slug: string;
  filters: Record<string, unknown>;
  sort: Record<string, unknown> | unknown[];
  visibleColumns: string[];
  viewMode: (typeof schema.viewMode.enumValues)[number];
  density: (typeof schema.viewDensity.enumValues)[number];
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MergeTagsResult = {
  sourceTagId: string;
  targetTagId: string;
  moved: number;
  deduplicated: number;
  target: TagResponse;
};

// ── Helpers ────────────────────────────────────────────────────

function requireUuid(value: string, field: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new ModelServiceError("VALIDATION_ERROR", `Invalid ${field}`, 400, {
      [field]: ["Must be a valid UUID"],
    });
  }
  return parsed.data;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "23505") return true;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && (cause as { code?: string }).code === "23505") {
    return true;
  }
  const message =
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  return /duplicate key|unique constraint/i.test(message);
}

async function uniqueTagSlug(db: DbOrTx, base: string, excludeId?: string): Promise<string> {
  const root = slugifyModelName(base) || "tag";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt}`;
    const rows = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(
        excludeId
          ? and(eq(schema.tags.slug, candidate), ne(schema.tags.id, excludeId))
          : eq(schema.tags.slug, candidate),
      )
      .limit(1);
    if (rows.length === 0) return candidate;
  }
  return `${root}-${Date.now()}`;
}

async function uniqueViewSlug(db: DbOrTx, base: string, excludeId?: string): Promise<string> {
  const root = slugifyModelName(base) || "view";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt}`;
    const rows = await db
      .select({ id: schema.savedViews.id })
      .from(schema.savedViews)
      .where(
        excludeId
          ? and(eq(schema.savedViews.slug, candidate), ne(schema.savedViews.id, excludeId))
          : eq(schema.savedViews.slug, candidate),
      )
      .limit(1);
    if (rows.length === 0) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asSort(value: unknown): Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) out.push(item);
    return out;
  }
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function mapTag(
  row: typeof schema.tags.$inferSelect,
  usageCount: number,
): TagResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color ?? null,
    category: row.category,
    usageCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapSavedView(row: typeof schema.savedViews.$inferSelect): SavedViewResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    filters: asRecord(row.filters),
    sort: asSort(row.sort),
    visibleColumns: asStringArray(row.visibleColumns),
    viewMode: row.viewMode,
    density: row.density,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function usageCountFor(db: DbOrTx, tagId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.modelTags)
    .where(eq(schema.modelTags.tagId, tagId));
  return Number(row?.c ?? 0);
}

// ── Tags ───────────────────────────────────────────────────────

export async function listTags(db: Db): Promise<TagResponse[]> {
  const rows = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      slug: schema.tags.slug,
      color: schema.tags.color,
      category: schema.tags.category,
      createdAt: schema.tags.createdAt,
      usageCount: sql<number>`coalesce(count(${schema.modelTags.modelId}), 0)::int`.as(
        "usage_count",
      ),
    })
    .from(schema.tags)
    .leftJoin(schema.modelTags, eq(schema.modelTags.tagId, schema.tags.id))
    .groupBy(
      schema.tags.id,
      schema.tags.name,
      schema.tags.slug,
      schema.tags.color,
      schema.tags.category,
      schema.tags.createdAt,
    )
    .orderBy(asc(schema.tags.category), asc(schema.tags.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color ?? null,
    category: row.category,
    usageCount: Number(row.usageCount ?? 0),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getTag(db: Db, tagId: string): Promise<TagResponse> {
  const id = requireUuid(tagId, "tagId");
  const [row] = await db.select().from(schema.tags).where(eq(schema.tags.id, id)).limit(1);
  if (!row) throw new ModelServiceError("NOT_FOUND", "Tag not found", 404);
  return mapTag(row, await usageCountFor(db, id));
}

export async function createTag(
  db: Db,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<TagResponse> {
  const input = createTagSchema.parse(rawBody);
  const slug = input.slug?.trim()
    ? await uniqueTagSlug(db, input.slug)
    : await uniqueTagSlug(db, input.name);

  try {
    const [row] = await db
      .insert(schema.tags)
      .values({
        name: input.name.trim(),
        slug,
        color: input.color === undefined ? null : input.color,
        category: input.category,
      })
      .returning();
    return mapTag(row, 0);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Tag slug already exists", 409, {
        slug: ["Must be unique"],
      });
    }
    throw error;
  }
}

export async function updateTag(
  db: Db,
  tagId: string,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<TagResponse> {
  const id = requireUuid(tagId, "tagId");
  const input = updateTagSchema.parse(rawBody);
  const [existing] = await db.select().from(schema.tags).where(eq(schema.tags.id, id)).limit(1);
  if (!existing) throw new ModelServiceError("NOT_FOUND", "Tag not found", 404);

  const patch: Partial<typeof schema.tags.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.category !== undefined) patch.category = input.category;
  if (input.color !== undefined) patch.color = input.color;
  if (input.slug !== undefined && input.slug.trim()) {
    patch.slug = await uniqueTagSlug(db, input.slug, id);
  }

  if (Object.keys(patch).length === 0) {
    return mapTag(existing, await usageCountFor(db, id));
  }

  try {
    const [row] = await db.update(schema.tags).set(patch).where(eq(schema.tags.id, id)).returning();
    return mapTag(row, await usageCountFor(db, id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Tag slug already exists", 409, {
        slug: ["Must be unique"],
      });
    }
    throw error;
  }
}

/**
 * Delete a tag. model_tags rows cascade via FK.
 * (Tags table has no status column — archive semantics for merge use delete-after-move.)
 */
export async function deleteTag(
  db: Db,
  tagId: string,
  _ctx: AuditContext = {},
): Promise<{ id: string }> {
  const id = requireUuid(tagId, "tagId");
  const [row] = await db.delete(schema.tags).where(eq(schema.tags.id, id)).returning({
    id: schema.tags.id,
  });
  if (!row) throw new ModelServiceError("NOT_FOUND", "Tag not found", 404);
  return { id: row.id };
}

/**
 * Move every model_tags assignment from source → target, deduplicating, then
 * archive (delete) the source tag — all in one transaction.
 */
export async function mergeTags(
  db: Db,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<MergeTagsResult> {
  const input = mergeTagsSchema.parse(rawBody);

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.id, input.sourceTagId))
      .limit(1);
    if (!source) throw new ModelServiceError("NOT_FOUND", "Source tag not found", 404);

    const [target] = await tx
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.id, input.targetTagId))
      .limit(1);
    if (!target) throw new ModelServiceError("NOT_FOUND", "Target tag not found", 404);

    const sourceRows = await tx
      .select({ modelId: schema.modelTags.modelId })
      .from(schema.modelTags)
      .where(eq(schema.modelTags.tagId, input.sourceTagId));

    const targetRows = await tx
      .select({ modelId: schema.modelTags.modelId })
      .from(schema.modelTags)
      .where(eq(schema.modelTags.tagId, input.targetTagId));

    const targetSet = new Set(targetRows.map((r) => r.modelId));
    let moved = 0;
    let deduplicated = 0;

    for (const row of sourceRows) {
      if (targetSet.has(row.modelId)) {
        deduplicated += 1;
        await tx
          .delete(schema.modelTags)
          .where(
            and(
              eq(schema.modelTags.modelId, row.modelId),
              eq(schema.modelTags.tagId, input.sourceTagId),
            ),
          );
      } else {
        await tx
          .update(schema.modelTags)
          .set({ tagId: input.targetTagId })
          .where(
            and(
              eq(schema.modelTags.modelId, row.modelId),
              eq(schema.modelTags.tagId, input.sourceTagId),
            ),
          );
        targetSet.add(row.modelId);
        moved += 1;
      }
    }

    // Archive source: no status column on tags — remove after reassignment.
    await tx.delete(schema.tags).where(eq(schema.tags.id, input.sourceTagId));

    const usage = await usageCountFor(tx, input.targetTagId);
    return {
      sourceTagId: input.sourceTagId,
      targetTagId: input.targetTagId,
      moved,
      deduplicated,
      target: mapTag(target, usage),
    };
  });
}

/** Full-replace a model's tag set in one call. */
export async function setModelTags(
  db: Db,
  modelIdRaw: string,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<{ modelId: string; tags: TagResponse[] }> {
  const modelId = requireUuid(modelIdRaw, "modelId");
  const input = setModelTagsSchema.parse(rawBody);
  // Deduplicate while preserving order
  const tagIds = [...new Set(input.tagIds)];

  return db.transaction(async (tx) => {
    const [model] = await tx
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.id, modelId))
      .limit(1);
    if (!model) throw new ModelServiceError("NOT_FOUND", "Model not found", 404);

    if (tagIds.length > 0) {
      const found = await tx
        .select({ id: schema.tags.id })
        .from(schema.tags)
        .where(inArray(schema.tags.id, tagIds));
      if (found.length !== tagIds.length) {
        const foundSet = new Set(found.map((r) => r.id));
        const missing = tagIds.filter((id) => !foundSet.has(id));
        throw new ModelServiceError("NOT_FOUND", "One or more tags not found", 404, {
          tagIds: missing.map((id) => `Unknown tag ${id}`),
        });
      }
    }

    await tx.delete(schema.modelTags).where(eq(schema.modelTags.modelId, modelId));

    if (tagIds.length > 0) {
      await tx.insert(schema.modelTags).values(
        tagIds.map((tagId) => ({
          modelId,
          tagId,
        })),
      );
    }

    if (tagIds.length === 0) {
      return { modelId, tags: [] };
    }

    const tags = await tx
      .select()
      .from(schema.tags)
      .where(inArray(schema.tags.id, tagIds))
      .orderBy(asc(schema.tags.category), asc(schema.tags.name));

    // usage counts for response
    const usageRows = await tx
      .select({
        tagId: schema.modelTags.tagId,
        c: count(),
      })
      .from(schema.modelTags)
      .where(inArray(schema.modelTags.tagId, tagIds))
      .groupBy(schema.modelTags.tagId);
    const usageMap = new Map(usageRows.map((r) => [r.tagId, Number(r.c)]));

    return {
      modelId,
      tags: tags.map((t) => mapTag(t, usageMap.get(t.id) ?? 0)),
    };
  });
}

export async function listModelTags(db: Db, modelIdRaw: string): Promise<TagResponse[]> {
  const modelId = requireUuid(modelIdRaw, "modelId");
  const rows = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      slug: schema.tags.slug,
      color: schema.tags.color,
      category: schema.tags.category,
      createdAt: schema.tags.createdAt,
    })
    .from(schema.modelTags)
    .innerJoin(schema.tags, eq(schema.modelTags.tagId, schema.tags.id))
    .where(eq(schema.modelTags.modelId, modelId))
    .orderBy(asc(schema.tags.category), asc(schema.tags.name));

  // Batch usage
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const usageRows = await db
    .select({ tagId: schema.modelTags.tagId, c: count() })
    .from(schema.modelTags)
    .where(inArray(schema.modelTags.tagId, ids))
    .groupBy(schema.modelTags.tagId);
  const usageMap = new Map(usageRows.map((r) => [r.tagId, Number(r.c)]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    color: r.color ?? null,
    category: r.category,
    usageCount: usageMap.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ── Saved views (saved_views table) ────────────────────────────

export async function listSavedViews(db: Db): Promise<SavedViewResponse[]> {
  const rows = await db
    .select()
    .from(schema.savedViews)
    .orderBy(asc(schema.savedViews.sortOrder), asc(schema.savedViews.name));
  return rows.map(mapSavedView);
}

export async function getSavedView(db: Db, viewId: string): Promise<SavedViewResponse> {
  const id = requireUuid(viewId, "viewId");
  const [row] = await db
    .select()
    .from(schema.savedViews)
    .where(eq(schema.savedViews.id, id))
    .limit(1);
  if (!row) throw new ModelServiceError("NOT_FOUND", "Saved view not found", 404);
  return mapSavedView(row);
}

export async function createSavedView(
  db: Db,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<SavedViewResponse> {
  const input = createRankingSavedViewSchema.parse(rawBody);
  const slug = input.slug?.trim()
    ? await uniqueViewSlug(db, input.slug)
    : await uniqueViewSlug(db, input.name);

  try {
    const [row] = await db
      .insert(schema.savedViews)
      .values({
        name: input.name.trim(),
        slug,
        filters: input.filters ?? {},
        sort: input.sort ?? {},
        visibleColumns: input.visibleColumns ?? [],
        viewMode: input.viewMode ?? "table",
        density: input.density ?? "standard",
        isDefault: input.isDefault ?? false,
        sortOrder: input.sortOrder ?? 100,
      })
      .returning();
    return mapSavedView(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Saved view slug already exists", 409, {
        slug: ["Must be unique"],
      });
    }
    throw error;
  }
}

export async function updateSavedView(
  db: Db,
  viewId: string,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<SavedViewResponse> {
  const id = requireUuid(viewId, "viewId");
  const input = updateRankingSavedViewSchema.parse(rawBody);
  const [existing] = await db
    .select()
    .from(schema.savedViews)
    .where(eq(schema.savedViews.id, id))
    .limit(1);
  if (!existing) throw new ModelServiceError("NOT_FOUND", "Saved view not found", 404);

  const patch: Partial<typeof schema.savedViews.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.filters !== undefined) patch.filters = input.filters;
  if (input.sort !== undefined) patch.sort = input.sort;
  if (input.visibleColumns !== undefined) patch.visibleColumns = input.visibleColumns;
  if (input.viewMode !== undefined) patch.viewMode = input.viewMode;
  if (input.density !== undefined) patch.density = input.density;
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.slug !== undefined && input.slug.trim()) {
    patch.slug = await uniqueViewSlug(db, input.slug, id);
  }

  try {
    const [row] = await db
      .update(schema.savedViews)
      .set(patch)
      .where(eq(schema.savedViews.id, id))
      .returning();
    return mapSavedView(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Saved view slug already exists", 409, {
        slug: ["Must be unique"],
      });
    }
    throw error;
  }
}

export async function deleteSavedView(
  db: Db,
  viewId: string,
  _ctx: AuditContext = {},
): Promise<{ id: string }> {
  const id = requireUuid(viewId, "viewId");
  const [row] = await db
    .delete(schema.savedViews)
    .where(eq(schema.savedViews.id, id))
    .returning({ id: schema.savedViews.id });
  if (!row) throw new ModelServiceError("NOT_FOUND", "Saved view not found", 404);
  return { id: row.id };
}
