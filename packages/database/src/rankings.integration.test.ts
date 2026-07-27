/**
 * Integration tests for rankings / tags / views schema (migration 0007).
 * Runs against modelmonitor_test only (see vitest.integration.config.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "./schema/index";

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
const db = drizzle(client, { schema });

const PREFIX = "mmtest:rankings:";
let developerId: string | null = null;
const modelIds: string[] = [];
const skillIds: string[] = [];
const tagIds: string[] = [];
const ratingIds: string[] = [];

beforeAll(async () => {
  const [dev] = await db
    .select({ id: schema.developers.id })
    .from(schema.developers)
    .limit(1);
  if (!dev) throw new Error("No developers — seed required");
  developerId = dev.id;
});

afterAll(async () => {
  // Ratings / tags cascade from models; clean skills/tags explicitly.
  for (const id of modelIds) {
    await client`DELETE FROM models WHERE id = ${id}::uuid`;
  }
  for (const id of skillIds) {
    await client`DELETE FROM skills WHERE id = ${id}::uuid`;
  }
  for (const id of tagIds) {
    await client`DELETE FROM tags WHERE id = ${id}::uuid`;
  }
  await client`DELETE FROM skills WHERE slug LIKE ${PREFIX + "%"}`;
  await client`DELETE FROM tags WHERE slug LIKE ${PREFIX + "%"}`;
  await client`DELETE FROM models WHERE slug LIKE ${PREFIX + "%"}`;
  await client.end({ timeout: 5 });
});

async function createTempModel(slugSuffix: string) {
  if (!developerId) throw new Error("developerId missing");
  const slug = `${PREFIX}${slugSuffix}`;
  const [row] = await db
    .insert(schema.models)
    .values({
      developerId,
      canonicalId: slug,
      name: `Rankings test ${slugSuffix}`,
      slug,
      lifecycle: "unknown",
      status: "active",
    })
    .returning({ id: schema.models.id });
  modelIds.push(row.id);
  return row.id;
}

async function createTempSkill(slugSuffix: string) {
  const slug = `${PREFIX}${slugSuffix}`;
  const [row] = await db
    .insert(schema.skills)
    .values({
      name: `Skill ${slugSuffix}`,
      slug,
      category: "test",
      sortOrder: 0,
      isDefault: false,
      status: "active",
    })
    .returning({ id: schema.skills.id });
  skillIds.push(row.id);
  return row.id;
}

async function createTempTag(slugSuffix: string) {
  const slug = `${PREFIX}${slugSuffix}`;
  const [row] = await db
    .insert(schema.tags)
    .values({
      name: `Tag ${slugSuffix}`,
      slug,
      category: "preference",
      color: null,
    })
    .returning({ id: schema.tags.id });
  tagIds.push(row.id);
  return row.id;
}

describe("model_skill_ratings null personal score", () => {
  it("inserts a rating with null personal_score and personal_confidence", async () => {
    const modelId = await createTempModel("null-score-model");
    const skillId = await createTempSkill("null-score-skill");

    const [rating] = await db
      .insert(schema.modelSkillRatings)
      .values({
        modelId,
        skillId,
        personalScore: null,
        personalConfidence: null,
        externalScore: "72.50",
        externalRank: 3,
        tested: false,
      })
      .returning();

    ratingIds.push(rating.id);
    expect(rating.personalScore).toBeNull();
    expect(rating.personalConfidence).toBeNull();
    expect(rating.externalScore).toBe("72.50");
    expect(rating.tested).toBe(false);

    // Confirm DB-level defaults did not coerce personal fields to zero.
    const [raw] = await client<{
      personal_score: string | null;
      personal_confidence: string | null;
    }[]>`
      SELECT personal_score::text, personal_confidence::text
      FROM model_skill_ratings
      WHERE id = ${rating.id}::uuid
    `;
    expect(raw.personal_score).toBeNull();
    expect(raw.personal_confidence).toBeNull();
  });
});

describe("model_skill_ratings uniqueness", () => {
  it("rejects duplicate (model_id, skill_id)", async () => {
    const modelId = await createTempModel("dup-model");
    const skillId = await createTempSkill("dup-skill");

    const [first] = await db
      .insert(schema.modelSkillRatings)
      .values({
        modelId,
        skillId,
        personalScore: null,
        personalConfidence: null,
      })
      .returning({ id: schema.modelSkillRatings.id });
    ratingIds.push(first.id);

    let thrown: unknown;
    try {
      await db.insert(schema.modelSkillRatings).values({
        modelId,
        skillId,
        personalScore: "5.00",
        personalConfidence: "medium",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    const parts: string[] = [
      thrown instanceof Error ? thrown.message : String(thrown),
    ];
    if (thrown instanceof Error && thrown.cause instanceof Error) {
      parts.push(thrown.cause.message);
    }
    // postgres.js / drizzle may put SQLSTATE on the error or its cause
    if (typeof thrown === "object" && thrown !== null) {
      if ("code" in thrown) {
        parts.push(String(thrown.code));
      }
      if (
        "cause" in thrown &&
        typeof thrown.cause === "object" &&
        thrown.cause !== null &&
        "code" in thrown.cause
      ) {
        parts.push(String(thrown.cause.code));
      }
    }
    const text = parts.join(" ");
    expect(text).toMatch(/unique|duplicate|23505|model_skill_ratings_model_id_skill_id/i);
  });
});

describe("cascade deletes from models", () => {
  it("deleting a model cascades ratings and tags", async () => {
    const modelId = await createTempModel("cascade-model");
    const skillId = await createTempSkill("cascade-skill");
    const tagId = await createTempTag("cascade-tag");

    const [rating] = await db
      .insert(schema.modelSkillRatings)
      .values({
        modelId,
        skillId,
        personalScore: null,
        personalConfidence: null,
        externalScore: "10.00",
      })
      .returning({ id: schema.modelSkillRatings.id });

    await db.insert(schema.modelTags).values({ modelId, tagId });

    await db.delete(schema.models).where(eq(schema.models.id, modelId));
    // Remove from cleanup list so afterAll does not re-delete.
    const idx = modelIds.indexOf(modelId);
    if (idx >= 0) modelIds.splice(idx, 1);

    const remainingRatings = await db
      .select({ id: schema.modelSkillRatings.id })
      .from(schema.modelSkillRatings)
      .where(eq(schema.modelSkillRatings.id, rating.id));
    expect(remainingRatings).toHaveLength(0);

    const remainingTags = await db
      .select()
      .from(schema.modelTags)
      .where(
        and(eq(schema.modelTags.modelId, modelId), eq(schema.modelTags.tagId, tagId)),
      );
    expect(remainingTags).toHaveLength(0);

    // Parent skill/tag rows remain (only model_tags / ratings cascade).
    const [skillStill] = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(eq(schema.skills.id, skillId));
    expect(skillStill?.id).toBe(skillId);

    const [tagStill] = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(eq(schema.tags.id, tagId));
    expect(tagStill?.id).toBe(tagId);
  });
});
