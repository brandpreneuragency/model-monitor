/**
 * Redesign api-tags-views integration tests.
 * - merge moves + deduplicates model_tags, archives source
 * - usage counts derived (no stored counter)
 * - saved view round-trips filters/sort/visibleColumns/viewMode/density
 * - 15 seeded default views returned
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index";
import {
  createSavedView,
  createTag,
  deleteSavedView,
  deleteTag,
  listSavedViews,
  listTags,
  mergeTags,
  setModelTags,
  updateSavedView,
} from "./services/tags-views";
import { ModelServiceError, type Db } from "./services/audit";

function resolveUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  return [
    "postgresql://",
    "modelmonitor",
    ":",
    "modelmonitor",
    "@",
    "127.0.0.1",
    ":",
    "5433",
    "/",
    "modelmonitor_test",
  ].join("");
}

const client = postgres(resolveUrl(), { max: 5 });
const db = drizzle(client, { schema }) as unknown as Db;

const PREFIX = `mmtest-tags-api-${Date.now()}`;
const ctx = { requestId: "api-tags-views-test" };

const cleanup = {
  tagIds: [] as string[],
  viewIds: [] as string[],
  /** original tag ids per model, restored in afterAll */
  modelTagSnapshots: new Map<string, string[]>(),
};

async function snapshotModelTags(modelId: string) {
  if (cleanup.modelTagSnapshots.has(modelId)) return;
  const rows = await db
    .select({ tagId: schema.modelTags.tagId })
    .from(schema.modelTags)
    .where(eq(schema.modelTags.modelId, modelId));
  cleanup.modelTagSnapshots.set(
    modelId,
    rows.map((r) => r.tagId),
  );
}

beforeAll(async () => {
  const [model] = await db
    .select({ id: schema.models.id })
    .from(schema.models)
    .where(eq(schema.models.status, "active"))
    .limit(1);
  if (!model) throw new Error("No active models — seed required");

  const views = await db.select({ id: schema.savedViews.id }).from(schema.savedViews);
  if (views.length < 15) {
    throw new Error(`Expected >=15 seeded saved_views, got ${views.length}`);
  }
});

afterAll(async () => {
  // Restore model_tags for any seed models we touched
  for (const [modelId, tagIds] of cleanup.modelTagSnapshots) {
    await client`DELETE FROM model_tags WHERE model_id = ${modelId}::uuid`;
    for (const tagId of tagIds) {
      await client`
        INSERT INTO model_tags (model_id, tag_id)
        VALUES (${modelId}::uuid, ${tagId}::uuid)
        ON CONFLICT DO NOTHING
      `;
    }
  }

  for (const id of cleanup.viewIds) {
    await client`DELETE FROM saved_views WHERE id = ${id}::uuid`;
  }
  await client`DELETE FROM saved_views WHERE slug LIKE ${PREFIX + "%"}`;

  for (const id of cleanup.tagIds) {
    await client`DELETE FROM model_tags WHERE tag_id = ${id}::uuid`;
    await client`DELETE FROM tags WHERE id = ${id}::uuid`;
  }
  await client`DELETE FROM tags WHERE slug LIKE ${PREFIX + "%"}`;
  await client.end({ timeout: 5 });
});

describe("api-tags-views", () => {
  it("lists 15 seeded default saved views", async () => {
    const views = await listSavedViews(db);
    expect(views.length).toBeGreaterThanOrEqual(15);
    const seededSlugs = [
      "all-models",
      "favourites",
      "needs-review",
      "active",
      "testing-preview",
      "legacy",
      "coding-specialists",
      "vision-capable",
      "reasoning",
      "open-weights",
      "api-access",
      "subscription-access",
      "missing-personal-rating",
      "missing-cost",
      "card-gallery",
    ];
    expect(seededSlugs).toHaveLength(15);
    const bySlug = new Map(views.map((v) => [v.slug, v]));
    for (const slug of seededSlugs) {
      expect(bySlug.has(slug), `missing seeded view ${slug}`).toBe(true);
    }
    expect(views.some((v) => v.isDefault && v.slug === "all-models")).toBe(true);
  });

  it("round-trips all five stored aspects of a saved view", async () => {
    const created = await createSavedView(
      db,
      {
        name: `${PREFIX} Roundtrip`,
        slug: `${PREFIX}-roundtrip`,
        filters: { status: ["active"], favourite: true, q: "gpt" },
        sort: { field: "name", dir: "desc" },
        visibleColumns: ["name", "creator", "tags", "overallScore"],
        viewMode: "cards",
        density: "compact",
        isDefault: false,
        sortOrder: 900,
      },
      ctx,
    );
    cleanup.viewIds.push(created.id);

    expect(created.filters).toEqual({ status: ["active"], favourite: true, q: "gpt" });
    expect(created.sort).toEqual({ field: "name", dir: "desc" });
    expect(created.visibleColumns).toEqual(["name", "creator", "tags", "overallScore"]);
    expect(created.viewMode).toBe("cards");
    expect(created.density).toBe("compact");

    const patched = await updateSavedView(
      db,
      created.id,
      {
        filters: { needsReview: true },
        sort: [{ field: "updatedAt", dir: "asc" }],
        visibleColumns: ["name", "plan"],
        viewMode: "compact",
        density: "comfortable",
      },
      ctx,
    );

    expect(patched.filters).toEqual({ needsReview: true });
    expect(patched.sort).toEqual([{ field: "updatedAt", dir: "asc" }]);
    expect(patched.visibleColumns).toEqual(["name", "plan"]);
    expect(patched.viewMode).toBe("compact");
    expect(patched.density).toBe("comfortable");

    const listed = await listSavedViews(db);
    const found = listed.find((v) => v.id === created.id);
    expect(found).toBeDefined();
    expect(found!.filters).toEqual({ needsReview: true });
    expect(found!.sort).toEqual([{ field: "updatedAt", dir: "asc" }]);
    expect(found!.visibleColumns).toEqual(["name", "plan"]);
    expect(found!.viewMode).toBe("compact");
    expect(found!.density).toBe("comfortable");

    await deleteSavedView(db, created.id, ctx);
    cleanup.viewIds = cleanup.viewIds.filter((id) => id !== created.id);
  });

  it("derives usage counts from assignments without a stored counter", async () => {
    const cols = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tags'
    `;
    const colNames = cols.map((c) => String(c.column_name));
    expect(colNames).not.toContain("usage_count");
    expect(colNames).not.toContain("usageCount");

    const a = await createTag(
      db,
      {
        name: `${PREFIX} Usage A`,
        slug: `${PREFIX}-usage-a`,
        category: "preference",
        color: "#112233",
      },
      ctx,
    );
    const b = await createTag(
      db,
      {
        name: `${PREFIX} Usage B`,
        slug: `${PREFIX}-usage-b`,
        category: "preference",
        colour: "#abcdef",
      },
      ctx,
    );
    cleanup.tagIds.push(a.id, b.id);
    expect(a.color).toBe("#112233");
    expect(b.color).toBe("#abcdef");
    expect(a.usageCount).toBe(0);
    expect(b.usageCount).toBe(0);

    const models = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.status, "active"))
      .limit(3);
    expect(models.length).toBe(3);

    // Insert assignments directly so we don't wipe seed tags mid-test
    await client`
      INSERT INTO model_tags (model_id, tag_id) VALUES
        (${models[0].id}::uuid, ${a.id}::uuid),
        (${models[1].id}::uuid, ${a.id}::uuid),
        (${models[1].id}::uuid, ${b.id}::uuid)
      ON CONFLICT DO NOTHING
    `;
    // Track so afterAll can clean test tags (restore path deletes all then reinserts snapshot;
    // snapshot first so restore does not drop seed tags)
    await snapshotModelTags(models[0].id);
    await snapshotModelTags(models[1].id);
    // snapshots taken after insert include test tags — strip them for restore
    for (const mid of [models[0].id, models[1].id]) {
      const snap = cleanup.modelTagSnapshots.get(mid) ?? [];
      cleanup.modelTagSnapshots.set(
        mid,
        snap.filter((id) => id !== a.id && id !== b.id),
      );
    }

    const listed = await listTags(db);
    const la = listed.find((t) => t.id === a.id);
    const lb = listed.find((t) => t.id === b.id);
    expect(la?.usageCount).toBe(2);
    expect(lb?.usageCount).toBe(1);

    const [aggA] = await client`
      SELECT count(*)::int AS c FROM model_tags WHERE tag_id = ${a.id}::uuid
    `;
    expect(Number(aggA.c)).toBe(2);
  });

  it("merges two tags: moves assignments, deduplicates, archives source", async () => {
    const source = await createTag(
      db,
      { name: `${PREFIX} Merge Src`, slug: `${PREFIX}-merge-src`, category: "usage" },
      ctx,
    );
    const target = await createTag(
      db,
      { name: `${PREFIX} Merge Tgt`, slug: `${PREFIX}-merge-tgt`, category: "usage" },
      ctx,
    );
    cleanup.tagIds.push(source.id, target.id);

    const models = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.status, "active"))
      .limit(3);
    expect(models.length).toBe(3);
    const [mShared, mOnlySource, mOnlyTarget] = models;

    // Snapshot seed tags BEFORE we add test assignments
    for (const m of models) {
      await snapshotModelTags(m.id);
    }

    // Add test tags without removing seed tags
    await client`
      INSERT INTO model_tags (model_id, tag_id) VALUES
        (${mShared.id}::uuid, ${source.id}::uuid),
        (${mShared.id}::uuid, ${target.id}::uuid),
        (${mOnlySource.id}::uuid, ${source.id}::uuid),
        (${mOnlyTarget.id}::uuid, ${target.id}::uuid)
      ON CONFLICT DO NOTHING
    `;

    const result = await mergeTags(
      db,
      { sourceTagId: source.id, targetTagId: target.id },
      ctx,
    );

    expect(result.sourceTagId).toBe(source.id);
    expect(result.targetTagId).toBe(target.id);
    expect(result.moved).toBe(1);
    expect(result.deduplicated).toBe(1);
    expect(result.target.usageCount).toBe(3);

    const [srcGone] = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(eq(schema.tags.id, source.id))
      .limit(1);
    expect(srcGone).toBeUndefined();
    cleanup.tagIds = cleanup.tagIds.filter((id) => id !== source.id);

    const [srcAssignments] = await client`
      SELECT count(*)::int AS c FROM model_tags WHERE tag_id = ${source.id}::uuid
    `;
    expect(Number(srcAssignments.c)).toBe(0);

    for (const m of [mShared, mOnlySource, mOnlyTarget]) {
      const rows = await client`
        SELECT tag_id FROM model_tags
        WHERE model_id = ${m.id}::uuid
          AND tag_id = ${target.id}::uuid
      `;
      expect(rows).toHaveLength(1);
    }

    const listed = await listTags(db);
    expect(listed.find((t) => t.id === source.id)).toBeUndefined();
    expect(listed.find((t) => t.id === target.id)?.usageCount).toBe(3);

    // Remove target assignments so restore is clean; afterAll also deletes test tags
    await client`DELETE FROM model_tags WHERE tag_id = ${target.id}::uuid`;
  });

  it("rejects merge of identical ids and missing tags", async () => {
    const tag = await createTag(
      db,
      { name: `${PREFIX} Solo`, slug: `${PREFIX}-solo`, category: "cost" },
      ctx,
    );
    cleanup.tagIds.push(tag.id);

    await expect(
      mergeTags(db, { sourceTagId: tag.id, targetTagId: tag.id }, ctx),
    ).rejects.toBeTruthy();

    const fake = "00000000-0000-4000-8000-000000000099";
    await expect(
      mergeTags(db, { sourceTagId: tag.id, targetTagId: fake }, ctx),
    ).rejects.toBeInstanceOf(ModelServiceError);
  });

  it("replaces a model tag set via setModelTags", async () => {
    const t1 = await createTag(
      db,
      { name: `${PREFIX} Set1`, slug: `${PREFIX}-set-1`, category: "access" },
      ctx,
    );
    const t2 = await createTag(
      db,
      { name: `${PREFIX} Set2`, slug: `${PREFIX}-set-2`, category: "access" },
      ctx,
    );
    const t3 = await createTag(
      db,
      { name: `${PREFIX} Set3`, slug: `${PREFIX}-set-3`, category: "access" },
      ctx,
    );
    cleanup.tagIds.push(t1.id, t2.id, t3.id);

    const [model] = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.status, "active"))
      .limit(1);

    await snapshotModelTags(model.id);
    const original = cleanup.modelTagSnapshots.get(model.id) ?? [];

    const first = await setModelTags(db, model.id, { tagIds: [t1.id, t2.id] }, ctx);
    expect(first.tags.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());

    const second = await setModelTags(db, model.id, { tagIds: [t3.id] }, ctx);
    expect(second.tags).toHaveLength(1);
    expect(second.tags[0].id).toBe(t3.id);

    const rows = await client`
      SELECT tag_id FROM model_tags
      WHERE model_id = ${model.id}::uuid
        AND tag_id = ANY(${[t1.id, t2.id, t3.id]}::uuid[])
    `;
    expect(rows).toHaveLength(1);
    expect(String(rows[0].tag_id)).toBe(t3.id);

    // Restore original immediately so subsequent tests see seed state
    await setModelTags(db, model.id, { tagIds: original }, ctx);
  });

  it("deleteTag removes the tag and cascaded assignments", async () => {
    const tag = await createTag(
      db,
      { name: `${PREFIX} Del`, slug: `${PREFIX}-del`, category: "status" },
      ctx,
    );
    cleanup.tagIds.push(tag.id);
    const [model] = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.status, "active"))
      .limit(1);

    await snapshotModelTags(model.id);
    await client`
      INSERT INTO model_tags (model_id, tag_id)
      VALUES (${model.id}::uuid, ${tag.id}::uuid)
      ON CONFLICT DO NOTHING
    `;

    await deleteTag(db, tag.id, ctx);
    cleanup.tagIds = cleanup.tagIds.filter((id) => id !== tag.id);

    const [gone] = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(eq(schema.tags.id, tag.id))
      .limit(1);
    expect(gone).toBeUndefined();

    const [assign] = await client`
      SELECT count(*)::int AS c FROM model_tags WHERE tag_id = ${tag.id}::uuid
    `;
    expect(Number(assign.c)).toBe(0);
  });
});
