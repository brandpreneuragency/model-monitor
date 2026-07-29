/**
 * Redesign api-rankings integration tests.
 * - profile weights change leaderboard order
 * - pinned outranks higher score
 * - rank_override beats raw score
 * - hidden excluded
 * - type=personal returns 51 rows with null scores
 * - no blended-score field anywhere
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "./schema/index";
import {
  assertNoBlendedScoreFields,
  createRankingProfile,
  createSkill,
  deleteRankingProfile,
  getLeaderboard,
  listRatings,
  listSkills,
  setRankingProfileWeights,
  upsertModelSkillRating,
} from "./services/rankings";
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

const PREFIX = `mmtest-rank-api-${Date.now()}`;
const ctx = { requestId: "api-rankings-test" };

const cleanup = {
  skillIds: [] as string[],
  profileIds: [] as string[],
  ratingIds: [] as string[],
  /** model/skill pairs whose ratings we mutated and should restore */
  restored: [] as Array<{ modelId: string; skillId: string; snapshot: Record<string, unknown> }>,
};

beforeAll(async () => {
  const [skill] = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(eq(schema.skills.slug, "coding"))
    .limit(1);
  if (!skill) throw new Error("coding skill missing — seed required");

  const [models] = await db
    .select({ c: schema.models.id })
    .from(schema.models)
    .where(eq(schema.models.status, "active"))
    .limit(1);
  if (!models) throw new Error("No active models — seed required");
});

afterAll(async () => {
  // Restore mutated seed ratings
  for (const item of cleanup.restored) {
    const s = item.snapshot;
    await client`
      UPDATE model_skill_ratings SET
        personal_score = ${s.personalScore as string | null},
        personal_confidence = ${s.personalConfidence as string | null},
        external_score = ${s.externalScore as string | null},
        external_rank = ${s.externalRank as number | null},
        rank_override = ${s.rankOverride as number | null},
        tested = ${s.tested as boolean},
        hidden = ${s.hidden as boolean},
        pinned = ${s.pinned as boolean},
        notes = ${s.notes as string | null},
        updated_at = now()
      WHERE model_id = ${item.modelId}::uuid AND skill_id = ${item.skillId}::uuid
    `;
  }

  for (const id of cleanup.profileIds) {
    await client`DELETE FROM ranking_profile_skills WHERE profile_id = ${id}::uuid`;
    await client`DELETE FROM ranking_profiles WHERE id = ${id}::uuid`;
  }
  for (const id of cleanup.skillIds) {
    await client`DELETE FROM ranking_profile_skills WHERE skill_id = ${id}::uuid`;
    await client`DELETE FROM model_skill_ratings WHERE skill_id = ${id}::uuid`;
    await client`DELETE FROM skills WHERE id = ${id}::uuid`;
  }
  await client`DELETE FROM skills WHERE slug LIKE ${PREFIX + "%"}`;
  await client`DELETE FROM ranking_profiles WHERE slug LIKE ${PREFIX + "%"}`;
  await client.end({ timeout: 5 });
});

async function snapshotAndTrack(modelId: string, skillId: string) {
  const [row] = await db
    .select()
    .from(schema.modelSkillRatings)
    .where(
      and(
        eq(schema.modelSkillRatings.modelId, modelId),
        eq(schema.modelSkillRatings.skillId, skillId),
      ),
    )
    .limit(1);
  if (row) {
    cleanup.restored.push({
      modelId,
      skillId,
      snapshot: {
        personalScore: row.personalScore,
        personalConfidence: row.personalConfidence,
        externalScore: row.externalScore,
        externalRank: row.externalRank,
        rankOverride: row.rankOverride,
        tested: row.tested,
        hidden: row.hidden,
        pinned: row.pinned,
        notes: row.notes,
      },
    });
  }
}

describe("api-rankings: skills CRUD archive", () => {
  it("creates a custom skill and archives it without deleting ratings rows", async () => {
    const skill = await createSkill(
      db,
      { name: `${PREFIX} Custom Skill`, category: "test" },
      ctx,
    );
    cleanup.skillIds.push(skill.id);
    expect(skill.status).toBe("active");
    expect(skill.slug).toContain("mmtest-rank-api");

    const skills = await listSkills(db);
    expect(skills.some((s) => s.id === skill.id)).toBe(true);

    // Attach a rating then archive
    const [model] = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.status, "active"))
      .limit(1);
    await upsertModelSkillRating(
      db,
      model.id,
      skill.id,
      { personalScore: 7, personalConfidence: "medium", tested: true },
      ctx,
    );

    const { archiveSkill } = await import("./services/rankings");
    const archived = await archiveSkill(db, skill.id, ctx);
    expect(archived.status).toBe("archived");

    const [rating] = await db
      .select()
      .from(schema.modelSkillRatings)
      .where(
        and(
          eq(schema.modelSkillRatings.modelId, model.id),
          eq(schema.modelSkillRatings.skillId, skill.id),
        ),
      )
      .limit(1);
    expect(rating).toBeDefined();
    expect(rating.hidden).toBe(true);
    expect(rating.personalScore).toBe("7.00");

    const active = await listSkills(db);
    expect(active.some((s) => s.id === skill.id)).toBe(false);
  });
});

describe("api-rankings: ratings separation", () => {
  it("returns personal and external separately with scoreBasis — never a blend field", async () => {
    const [coding] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.slug, "coding"))
      .limit(1);
    const [model] = await db
      .select()
      .from(schema.models)
      .where(eq(schema.models.status, "active"))
      .limit(1);

    await snapshotAndTrack(model.id, coding.id);

    const rating = await upsertModelSkillRating(
      db,
      model.id,
      coding.id,
      {
        personalScore: 8,
        personalConfidence: "high",
        // leave external as seeded
        tested: true,
        testedAt: "2026-07-28",
        notes: "mmtest note",
      },
      ctx,
    );

    expect(rating.personalScore).toBe(8);
    expect(rating.externalScore).not.toBeNull();
    expect(rating.scoreBasis).toBe("personal");
    expect(rating).not.toHaveProperty("blendedScore");
    expect(rating).not.toHaveProperty("averageScore");
    expect(rating).not.toHaveProperty("combinedScore");

    // Explicit: scoreBasis is a discriminator, not (personal+external)/2
    const avg =
      rating.personalScore != null && rating.externalScore != null
        ? (rating.personalScore + rating.externalScore) / 2
        : null;
    expect(Object.values(rating).includes(avg)).toBe(false);

    const list = await listRatings(db, { skillId: coding.id, modelId: model.id });
    expect(list.length).toBeGreaterThanOrEqual(1);
    const hits = assertNoBlendedScoreFields(list);
    expect(hits).toEqual([]);

    // Restore immediately so seed-based leaderboard tests see null personal scores
    await upsertModelSkillRating(
      db,
      model.id,
      coding.id,
      {
        personalScore: null,
        personalConfidence: null,
        tested: false,
        testedAt: null,
        notes: null,
      },
      ctx,
    );
  });
});

describe("api-rankings: leaderboard ordering rules", () => {
  it("type=personal returns 51 rows with null personal scores on seed", async () => {
    // Clear any residual personal scores on coding from prior tests / aborted runs
    const [coding] = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(eq(schema.skills.slug, "coding"))
      .limit(1);
    await client`
      UPDATE model_skill_ratings
      SET personal_score = NULL, personal_confidence = NULL, tested = false, tested_at = NULL
      WHERE skill_id = ${coding.id}::uuid
        AND personal_score IS NOT NULL
    `;

    const board = await getLeaderboard(db, {
      skillId: "coding",
      type: "personal",
    });
    expect(board.data.length).toBe(51);
    for (const row of board.data) {
      expect(row.personalScore).toBeNull();
    }
    expect(board.data.every((r) => r.personalScore == null)).toBe(true);
    const hits = assertNoBlendedScoreFields(board);
    expect(hits).toEqual([]);
  });

  it("pinned outranks a higher external score", async () => {
    const [coding] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.slug, "coding"))
      .limit(1);

    // Top by external
    const ordered = await getLeaderboard(db, { skillId: coding.id, type: "external" });
    expect(ordered.data.length).toBeGreaterThan(2);
    const top = ordered.data[0];
    const lower = ordered.data[ordered.data.length - 1];
    expect(top.externalScore).not.toBeNull();
    expect((top.externalScore ?? 0) >= (lower.externalScore ?? 0)).toBe(true);

    await snapshotAndTrack(lower.model.id, coding.id);
    await upsertModelSkillRating(
      db,
      lower.model.id,
      coding.id,
      { pinned: true },
      ctx,
    );

    const after = await getLeaderboard(db, { skillId: coding.id, type: "external" });
    expect(after.data[0].model.id).toBe(lower.model.id);
    expect(after.data[0].pinned).toBe(true);

    // unpin for other tests (restore handles it at end, but clear pin now for isolation)
    await upsertModelSkillRating(db, lower.model.id, coding.id, { pinned: false }, ctx);
  });

  it("rank_override beats raw external score", async () => {
    const [coding] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.slug, "coding"))
      .limit(1);

    const ordered = await getLeaderboard(db, { skillId: coding.id, type: "external" });
    const top = ordered.data[0];
    const second = ordered.data[1];
    expect(top.model.id).not.toBe(second.model.id);

    await snapshotAndTrack(second.model.id, coding.id);
    await upsertModelSkillRating(
      db,
      second.model.id,
      coding.id,
      { rankOverride: 1, pinned: false },
      ctx,
    );

    const after = await getLeaderboard(db, { skillId: coding.id, type: "external" });
    expect(after.data[0].model.id).toBe(second.model.id);
    expect(after.data[0].rankOverride).toBe(1);

    await upsertModelSkillRating(
      db,
      second.model.id,
      coding.id,
      { rankOverride: null },
      ctx,
    );
  });

  it("hidden models are excluded from the skill leaderboard", async () => {
    const [coding] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.slug, "coding"))
      .limit(1);

    const before = await getLeaderboard(db, { skillId: coding.id, type: "external" });
    const target = before.data[0];
    const beforeCount = before.data.length;

    await snapshotAndTrack(target.model.id, coding.id);
    await upsertModelSkillRating(
      db,
      target.model.id,
      coding.id,
      { hidden: true },
      ctx,
    );

    const after = await getLeaderboard(db, { skillId: coding.id, type: "external" });
    expect(after.data.length).toBe(beforeCount - 1);
    expect(after.data.some((r) => r.model.id === target.model.id)).toBe(false);

    await upsertModelSkillRating(
      db,
      target.model.id,
      coding.id,
      { hidden: false },
      ctx,
    );
  });

  it("profile weights changing leaderboard order", async () => {
    // Two temp profiles with opposite weights on coding vs value
    const [coding] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.slug, "coding"))
      .limit(1);
    const [value] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.slug, "value"))
      .limit(1);
    expect(coding && value).toBeTruthy();

    const pCoding = await createRankingProfile(
      db,
      { name: `${PREFIX} coding-heavy`, slug: `${PREFIX}-coding-heavy` },
      ctx,
    );
    cleanup.profileIds.push(pCoding.id);
    await setRankingProfileWeights(
      db,
      pCoding.id,
      {
        weights: [
          { skillId: coding.id, weight: 10 },
          { skillId: value.id, weight: 0.1 },
        ],
      },
      ctx,
    );

    const pValue = await createRankingProfile(
      db,
      { name: `${PREFIX} value-heavy`, slug: `${PREFIX}-value-heavy` },
      ctx,
    );
    cleanup.profileIds.push(pValue.id);
    await setRankingProfileWeights(
      db,
      pValue.id,
      {
        weights: [
          { skillId: coding.id, weight: 0.1 },
          { skillId: value.id, weight: 10 },
        ],
      },
      ctx,
    );

    const boardCoding = await getLeaderboard(db, {
      profileId: pCoding.id,
      type: "external",
    });
    const boardValue = await getLeaderboard(db, {
      profileId: pValue.id,
      type: "external",
    });

    expect(boardCoding.data.length).toBe(51);
    expect(boardValue.data.length).toBe(51);

    const topCoding = boardCoding.data.slice(0, 5).map((r) => r.model.name);
    const topValue = boardValue.data.slice(0, 5).map((r) => r.model.name);
    // With materially different weights, top-5 should differ
    expect(topCoding.join("|")).not.toBe(topValue.join("|"));

    // overallScore present for external profile boards; personal/external stay null
    // (no per-skill blend field). scoreBasis=external on seed.
    expect(boardCoding.data.some((r) => r.overallScore != null)).toBe(true);
    expect(boardCoding.data.find((r) => r.overallScore != null)?.scoreBasis).toBe("external");

    const hits = assertNoBlendedScoreFields({ boardCoding, boardValue });
    expect(hits).toEqual([]);

    await deleteRankingProfile(db, pCoding.id, ctx);
    cleanup.profileIds = cleanup.profileIds.filter((id) => id !== pCoding.id);
    await deleteRankingProfile(db, pValue.id, ctx);
    cleanup.profileIds = cleanup.profileIds.filter((id) => id !== pValue.id);
  });
});

describe("api-rankings: no blended score field anywhere", () => {
  it("scans skills, ratings, profiles, and leaderboard payloads", async () => {
    const skills = await listSkills(db);
    const ratings = await listRatings(db, { skillId: "coding" });
    const boardPersonal = await getLeaderboard(db, { skillId: "coding", type: "personal" });
    const boardExternal = await getLeaderboard(db, { skillId: "coding", type: "external" });
    const boardCombined = await getLeaderboard(db, { skillId: "coding", type: "combined" });
    const boardProfile = await getLeaderboard(db, {
      profileId: "best-everyday",
      type: "combined",
    });

    const payload = {
      skills,
      ratings,
      boardPersonal,
      boardExternal,
      boardCombined,
      boardProfile,
    };
    const hits = assertNoBlendedScoreFields(payload);
    expect(hits).toEqual([]);

    // Combined still carries both columns, never one average
    for (const row of boardCombined.data.slice(0, 10)) {
      expect(row).toHaveProperty("personalScore");
      expect(row).toHaveProperty("externalScore");
      expect(row).toHaveProperty("scoreBasis");
      expect(row).not.toHaveProperty("blendedScore");
      expect(row).not.toHaveProperty("averageScore");
    }
  });
});

describe("api-rankings: error paths", () => {
  it("rejects invalid skill uuid on get", async () => {
    const { getSkill } = await import("./services/rankings");
    await expect(getSkill(db, "not-a-uuid")).rejects.toBeInstanceOf(ModelServiceError);
  });
});
