import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  computeWeightedOverall,
  createRankingProfileSchema,
  createSkillSchema,
  effectiveSkillScore,
  leaderboardQuerySchema,
  ratingsListQuerySchema,
  setRankingProfileWeightsSchema,
  skillsListQuerySchema,
  slugifyModelName,
  updateRankingProfileSchema,
  updateSkillSchema,
  upsertModelSkillRatingBodySchema,
} from "@model-monitor/schemas";
import * as schema from "../schema/index";
import type { AuditContext, Db, DbOrTx } from "./audit";
import { asNumber, ModelServiceError } from "./audit";

// ── Types ──────────────────────────────────────────────────────

export type SkillResponse = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  sortOrder: number;
  isDefault: boolean;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type RatingResponse = {
  id: string;
  modelId: string;
  skillId: string;
  personalScore: number | null;
  personalConfidence: "low" | "medium" | "high" | null;
  externalScore: number | null;
  externalRank: number | null;
  externalConfidence: number | null;
  rankOverride: number | null;
  tested: boolean;
  testedAt: string | null;
  notes: string | null;
  hidden: boolean;
  pinned: boolean;
  source: string | null;
  /** Discriminator only — never a blended average of personal + external. */
  scoreBasis: "personal" | "external" | null;
  model?: { id: string; name: string; slug: string };
  skill?: { id: string; name: string; slug: string };
  createdAt: string;
  updatedAt: string;
};

export type RankingProfileResponse = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  sortOrder: number;
  weights: Array<{
    id: string;
    skillId: string;
    weight: number;
    skill: { id: string; name: string; slug: string };
  }>;
  createdAt: string;
  updatedAt: string;
};

export type LeaderboardEntry = {
  rank: number;
  model: {
    id: string;
    name: string;
    slug: string;
    creator: { id: string; name: string; slug: string } | null;
  };
  personalScore: number | null;
  externalScore: number | null;
  /** Present for profile-weighted boards; never (personal+external)/2. */
  overallScore: number | null;
  scoreBasis: "personal" | "external" | "mixed" | null;
  personalConfidence: "low" | "medium" | "high" | null;
  externalRank: number | null;
  externalConfidence: number | null;
  rankOverride: number | null;
  pinned: boolean;
  tested: boolean;
  testedAt: string | null;
  notes: string | null;
  skillId: string | null;
  profileId: string | null;
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

function toDateString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function numOrNull(value: string | number | null | undefined): number | null {
  return asNumber(value);
}

async function uniqueSlug(
  db: DbOrTx,
  table: "skills" | "ranking_profiles",
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = slugifyModelName(base) || (table === "skills" ? "skill" : "profile");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt}`;
    if (table === "skills") {
      const rows = await db
        .select({ id: schema.skills.id })
        .from(schema.skills)
        .where(
          excludeId
            ? and(eq(schema.skills.slug, candidate), ne(schema.skills.id, excludeId))
            : eq(schema.skills.slug, candidate),
        )
        .limit(1);
      if (rows.length === 0) return candidate;
    } else {
      const rows = await db
        .select({ id: schema.rankingProfiles.id })
        .from(schema.rankingProfiles)
        .where(
          excludeId
            ? and(
                eq(schema.rankingProfiles.slug, candidate),
                ne(schema.rankingProfiles.id, excludeId),
              )
            : eq(schema.rankingProfiles.slug, candidate),
        )
        .limit(1);
      if (rows.length === 0) return candidate;
    }
  }
  return `${root}-${Date.now()}`;
}

function mapSkill(row: typeof schema.skills.$inferSelect): SkillResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category ?? null,
    description: row.description ?? null,
    sortOrder: row.sortOrder,
    isDefault: row.isDefault,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function ratingScoreBasis(
  personal: number | null,
  external: number | null,
): "personal" | "external" | null {
  if (personal !== null && personal !== undefined && !Number.isNaN(personal)) return "personal";
  if (external !== null && external !== undefined && !Number.isNaN(external)) return "external";
  return null;
}

function mapRating(
  row: typeof schema.modelSkillRatings.$inferSelect,
  extras?: {
    model?: { id: string; name: string; slug: string };
    skill?: { id: string; name: string; slug: string };
  },
): RatingResponse {
  const personalScore = numOrNull(row.personalScore);
  const externalScore = numOrNull(row.externalScore);
  return {
    id: row.id,
    modelId: row.modelId,
    skillId: row.skillId,
    personalScore,
    personalConfidence: row.personalConfidence ?? null,
    externalScore,
    externalRank: row.externalRank ?? null,
    externalConfidence: numOrNull(row.externalConfidence),
    rankOverride: row.rankOverride ?? null,
    tested: row.tested,
    testedAt: toDateString(row.testedAt),
    notes: row.notes ?? null,
    hidden: row.hidden,
    pinned: row.pinned,
    source: row.source ?? null,
    scoreBasis: ratingScoreBasis(personalScore, externalScore),
    model: extras?.model,
    skill: extras?.skill,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Skills ─────────────────────────────────────────────────────

export async function listSkills(db: Db, rawQuery: unknown = {}): Promise<SkillResponse[]> {
  const query = skillsListQuerySchema.parse(rawQuery ?? {});
  const conditions = [];
  if (query.archived === true) {
    conditions.push(eq(schema.skills.status, "archived"));
  } else if (query.archived === false || !query.includeArchived) {
    conditions.push(eq(schema.skills.status, "active"));
  }
  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    conditions.push(
      sql`(${schema.skills.name} ILIKE ${term} OR ${schema.skills.slug} ILIKE ${term})`,
    );
  }
  const rows = await db
    .select()
    .from(schema.skills)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(schema.skills.sortOrder), asc(schema.skills.name));
  return rows.map(mapSkill);
}

export async function getSkill(db: Db, skillId: string): Promise<SkillResponse> {
  const id = requireUuid(skillId, "skillId");
  const [row] = await db.select().from(schema.skills).where(eq(schema.skills.id, id)).limit(1);
  if (!row) throw new ModelServiceError("NOT_FOUND", "Skill not found", 404);
  return mapSkill(row);
}

export async function createSkill(
  db: Db,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<SkillResponse> {
  const input = createSkillSchema.parse(rawBody);
  const slug = input.slug?.trim()
    ? await uniqueSlug(db, "skills", input.slug)
    : await uniqueSlug(db, "skills", input.name);

  try {
    const [row] = await db
      .insert(schema.skills)
      .values({
        name: input.name.trim(),
        slug,
        category: input.category === undefined ? null : input.category,
        description: input.description === undefined ? null : input.description,
        sortOrder: input.sortOrder ?? 100,
        isDefault: input.isDefault ?? false,
        status: input.status ?? "active",
      })
      .returning();
    return mapSkill(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Skill slug already exists", 409, {
        slug: ["Must be unique"],
      });
    }
    throw error;
  }
}

export async function updateSkill(
  db: Db,
  skillId: string,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<SkillResponse> {
  const id = requireUuid(skillId, "skillId");
  const input = updateSkillSchema.parse(rawBody);
  const [existing] = await db.select().from(schema.skills).where(eq(schema.skills.id, id)).limit(1);
  if (!existing) throw new ModelServiceError("NOT_FOUND", "Skill not found", 404);

  const patch: Partial<typeof schema.skills.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.category !== undefined) patch.category = input.category;
  if (input.description !== undefined) patch.description = input.description;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
  if (input.status !== undefined) patch.status = input.status;
  if (input.slug !== undefined && input.slug.trim()) {
    patch.slug = await uniqueSlug(db, "skills", input.slug, id);
  }

  try {
    const [row] = await db
      .update(schema.skills)
      .set(patch)
      .where(eq(schema.skills.id, id))
      .returning();
    return mapSkill(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Skill slug already exists", 409, {
        slug: ["Must be unique"],
      });
    }
    throw error;
  }
}

/**
 * Archive a skill and mark its ratings hidden. Rows are retained (no DELETE).
 * Ratings stay in the table; leaderboards skip archived skills / hidden ratings.
 */
export async function archiveSkill(
  db: Db,
  skillId: string,
  _ctx: AuditContext = {},
): Promise<SkillResponse> {
  const id = requireUuid(skillId, "skillId");
  const [existing] = await db.select().from(schema.skills).where(eq(schema.skills.id, id)).limit(1);
  if (!existing) throw new ModelServiceError("NOT_FOUND", "Skill not found", 404);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.skills)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(schema.skills.id, id))
      .returning();

    await tx
      .update(schema.modelSkillRatings)
      .set({ hidden: true, updatedAt: new Date() })
      .where(eq(schema.modelSkillRatings.skillId, id));

    // Drop profile weights for archived skill (weights table has no status).
    await tx
      .delete(schema.rankingProfileSkills)
      .where(eq(schema.rankingProfileSkills.skillId, id));

    return mapSkill(row);
  });
}

// ── Ratings ────────────────────────────────────────────────────

async function resolveSkillRef(db: DbOrTx, skillRef: string) {
  const asUuid = z.string().uuid().safeParse(skillRef);
  if (asUuid.success) {
    const [row] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, asUuid.data))
      .limit(1);
    if (row) return row;
  }
  const [bySlug] = await db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.slug, skillRef))
    .limit(1);
  if (bySlug) return bySlug;
  throw new ModelServiceError("NOT_FOUND", "Skill not found", 404);
}

async function resolveProfileRef(db: DbOrTx, profileRef: string) {
  const asUuid = z.string().uuid().safeParse(profileRef);
  if (asUuid.success) {
    const [row] = await db
      .select()
      .from(schema.rankingProfiles)
      .where(eq(schema.rankingProfiles.id, asUuid.data))
      .limit(1);
    if (row) return row;
  }
  const [bySlug] = await db
    .select()
    .from(schema.rankingProfiles)
    .where(eq(schema.rankingProfiles.slug, profileRef))
    .limit(1);
  if (bySlug) return bySlug;
  throw new ModelServiceError("NOT_FOUND", "Ranking profile not found", 404);
}

export async function listRatings(db: Db, rawQuery: unknown = {}): Promise<RatingResponse[]> {
  const query = ratingsListQuerySchema.parse(rawQuery ?? {});
  const conditions = [];

  if (query.skillId) {
    const skill = await resolveSkillRef(db, query.skillId);
    conditions.push(eq(schema.modelSkillRatings.skillId, skill.id));
  }
  if (query.modelId) {
    conditions.push(eq(schema.modelSkillRatings.modelId, requireUuid(query.modelId, "modelId")));
  }
  if (!query.includeHidden) {
    conditions.push(eq(schema.modelSkillRatings.hidden, false));
  }
  // Only active skills by default
  conditions.push(eq(schema.skills.status, "active"));
  conditions.push(eq(schema.models.status, "active"));

  const rows = await db
    .select({
      rating: schema.modelSkillRatings,
      modelId: schema.models.id,
      modelName: schema.models.name,
      modelSlug: schema.models.slug,
      skillId: schema.skills.id,
      skillName: schema.skills.name,
      skillSlug: schema.skills.slug,
    })
    .from(schema.modelSkillRatings)
    .innerJoin(schema.models, eq(schema.modelSkillRatings.modelId, schema.models.id))
    .innerJoin(schema.skills, eq(schema.modelSkillRatings.skillId, schema.skills.id))
    .where(and(...conditions))
    .orderBy(asc(schema.models.name), asc(schema.skills.sortOrder));

  return rows.map((r) =>
    mapRating(r.rating, {
      model: { id: r.modelId, name: r.modelName, slug: r.modelSlug },
      skill: { id: r.skillId, name: r.skillName, slug: r.skillSlug },
    }),
  );
}

export async function upsertModelSkillRating(
  db: Db,
  modelIdRaw: string,
  skillIdRaw: string,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<RatingResponse> {
  const modelId = requireUuid(modelIdRaw, "modelId");
  const skillId = requireUuid(skillIdRaw, "skillId");
  const input = upsertModelSkillRatingBodySchema.parse(rawBody ?? {});

  const [model] = await db
    .select({ id: schema.models.id, name: schema.models.name, slug: schema.models.slug })
    .from(schema.models)
    .where(eq(schema.models.id, modelId))
    .limit(1);
  if (!model) throw new ModelServiceError("NOT_FOUND", "Model not found", 404);

  const [skill] = await db
    .select({ id: schema.skills.id, name: schema.skills.name, slug: schema.skills.slug })
    .from(schema.skills)
    .where(eq(schema.skills.id, skillId))
    .limit(1);
  if (!skill) throw new ModelServiceError("NOT_FOUND", "Skill not found", 404);

  const [existing] = await db
    .select()
    .from(schema.modelSkillRatings)
    .where(
      and(
        eq(schema.modelSkillRatings.modelId, modelId),
        eq(schema.modelSkillRatings.skillId, skillId),
      ),
    )
    .limit(1);

  const now = new Date();
  const values: Partial<typeof schema.modelSkillRatings.$inferInsert> = {
    updatedAt: now,
  };

  if (input.personalScore !== undefined) {
    values.personalScore =
      input.personalScore === null ? null : input.personalScore.toFixed(2);
  }
  if (input.personalConfidence !== undefined) {
    values.personalConfidence = input.personalConfidence;
  }
  if (input.externalScore !== undefined) {
    values.externalScore =
      input.externalScore === null ? null : input.externalScore.toFixed(2);
  }
  if (input.externalRank !== undefined) values.externalRank = input.externalRank;
  if (input.externalConfidence !== undefined) {
    values.externalConfidence =
      input.externalConfidence === null ? null : String(input.externalConfidence);
  }
  if (input.rankOverride !== undefined) values.rankOverride = input.rankOverride;
  if (input.tested !== undefined) values.tested = input.tested;
  if (input.testedAt !== undefined) values.testedAt = input.testedAt;
  if (input.notes !== undefined) values.notes = input.notes;
  if (input.hidden !== undefined) values.hidden = input.hidden;
  if (input.pinned !== undefined) values.pinned = input.pinned;
  if (input.source !== undefined) values.source = input.source;

  let row: typeof schema.modelSkillRatings.$inferSelect;
  if (existing) {
    const [updated] = await db
      .update(schema.modelSkillRatings)
      .set(values)
      .where(eq(schema.modelSkillRatings.id, existing.id))
      .returning();
    row = updated;
  } else {
    const [inserted] = await db
      .insert(schema.modelSkillRatings)
      .values({
        modelId,
        skillId,
        personalScore:
          input.personalScore === undefined || input.personalScore === null
            ? null
            : input.personalScore.toFixed(2),
        personalConfidence: input.personalConfidence ?? null,
        externalScore:
          input.externalScore === undefined || input.externalScore === null
            ? null
            : input.externalScore.toFixed(2),
        externalRank: input.externalRank ?? null,
        externalConfidence:
          input.externalConfidence === undefined || input.externalConfidence === null
            ? null
            : String(input.externalConfidence),
        rankOverride: input.rankOverride ?? null,
        tested: input.tested ?? false,
        testedAt: input.testedAt ?? null,
        notes: input.notes ?? null,
        hidden: input.hidden ?? false,
        pinned: input.pinned ?? false,
        source: input.source ?? null,
      })
      .returning();
    row = inserted;
  }

  return mapRating(row, { model, skill });
}

// ── Ranking profiles ───────────────────────────────────────────

async function loadProfileWeights(
  db: DbOrTx,
  profileIds: string[],
): Promise<Map<string, RankingProfileResponse["weights"]>> {
  const out = new Map<string, RankingProfileResponse["weights"]>();
  for (const id of profileIds) out.set(id, []);
  if (profileIds.length === 0) return out;

  const rows = await db
    .select({
      id: schema.rankingProfileSkills.id,
      profileId: schema.rankingProfileSkills.profileId,
      skillId: schema.rankingProfileSkills.skillId,
      weight: schema.rankingProfileSkills.weight,
      skillName: schema.skills.name,
      skillSlug: schema.skills.slug,
    })
    .from(schema.rankingProfileSkills)
    .innerJoin(schema.skills, eq(schema.rankingProfileSkills.skillId, schema.skills.id))
    .where(
      and(
        inArray(schema.rankingProfileSkills.profileId, profileIds),
        eq(schema.skills.status, "active"),
      ),
    )
    .orderBy(asc(schema.skills.sortOrder), asc(schema.skills.name));

  for (const r of rows) {
    const list = out.get(r.profileId) ?? [];
    list.push({
      id: r.id,
      skillId: r.skillId,
      weight: numOrNull(r.weight) ?? 0,
      skill: { id: r.skillId, name: r.skillName, slug: r.skillSlug },
    });
    out.set(r.profileId, list);
  }
  return out;
}

function mapProfile(
  row: typeof schema.rankingProfiles.$inferSelect,
  weights: RankingProfileResponse["weights"],
): RankingProfileResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    weights,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRankingProfiles(db: Db): Promise<RankingProfileResponse[]> {
  const rows = await db
    .select()
    .from(schema.rankingProfiles)
    .orderBy(asc(schema.rankingProfiles.sortOrder), asc(schema.rankingProfiles.name));
  const weights = await loadProfileWeights(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => mapProfile(r, weights.get(r.id) ?? []));
}

export async function getRankingProfile(
  db: Db,
  profileId: string,
): Promise<RankingProfileResponse> {
  const profile = await resolveProfileRef(db, profileId);
  const weights = await loadProfileWeights(db, [profile.id]);
  return mapProfile(profile, weights.get(profile.id) ?? []);
}

export async function createRankingProfile(
  db: Db,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<RankingProfileResponse> {
  const input = createRankingProfileSchema.parse(rawBody);
  const slug = input.slug?.trim()
    ? await uniqueSlug(db, "ranking_profiles", input.slug)
    : await uniqueSlug(db, "ranking_profiles", input.name);

  try {
    const profile = await db.transaction(async (tx) => {
      if (input.isDefault) {
        await tx
          .update(schema.rankingProfiles)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(schema.rankingProfiles.isDefault, true));
      }
      const [row] = await tx
        .insert(schema.rankingProfiles)
        .values({
          name: input.name.trim(),
          slug,
          description: input.description === undefined ? null : input.description,
          isDefault: input.isDefault ?? false,
          sortOrder: input.sortOrder ?? 100,
        })
        .returning();
      return row;
    });
    return mapProfile(profile, []);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Ranking profile slug already exists", 409, {
        slug: ["Must be unique"],
      });
    }
    throw error;
  }
}

export async function updateRankingProfile(
  db: Db,
  profileId: string,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<RankingProfileResponse> {
  const id = requireUuid(profileId, "profileId");
  const input = updateRankingProfileSchema.parse(rawBody);
  const [existing] = await db
    .select()
    .from(schema.rankingProfiles)
    .where(eq(schema.rankingProfiles.id, id))
    .limit(1);
  if (!existing) throw new ModelServiceError("NOT_FOUND", "Ranking profile not found", 404);

  const patch: Partial<typeof schema.rankingProfiles.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
  if (input.slug !== undefined && input.slug.trim()) {
    patch.slug = await uniqueSlug(db, "ranking_profiles", input.slug, id);
  }

  try {
    const profile = await db.transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx
          .update(schema.rankingProfiles)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(schema.rankingProfiles.isDefault, true),
              ne(schema.rankingProfiles.id, id),
            ),
          );
      }
      const [row] = await tx
        .update(schema.rankingProfiles)
        .set(patch)
        .where(eq(schema.rankingProfiles.id, id))
        .returning();
      return row;
    });
    const weights = await loadProfileWeights(db, [profile.id]);
    return mapProfile(profile, weights.get(profile.id) ?? []);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ModelServiceError("CONFLICT", "Ranking profile slug already exists", 409, {
        slug: ["Must be unique"],
      });
    }
    throw error;
  }
}

export async function deleteRankingProfile(
  db: Db,
  profileId: string,
  _ctx: AuditContext = {},
): Promise<{ id: string; deleted: true }> {
  const id = requireUuid(profileId, "profileId");
  const [existing] = await db
    .select({ id: schema.rankingProfiles.id, isDefault: schema.rankingProfiles.isDefault })
    .from(schema.rankingProfiles)
    .where(eq(schema.rankingProfiles.id, id))
    .limit(1);
  if (!existing) throw new ModelServiceError("NOT_FOUND", "Ranking profile not found", 404);
  if (existing.isDefault) {
    throw new ModelServiceError(
      "CONFLICT",
      "Cannot delete the default ranking profile",
      409,
    );
  }

  await db.delete(schema.rankingProfiles).where(eq(schema.rankingProfiles.id, id));
  return { id, deleted: true };
}

export async function setRankingProfileWeights(
  db: Db,
  profileId: string,
  rawBody: unknown,
  _ctx: AuditContext = {},
): Promise<RankingProfileResponse> {
  const id = requireUuid(profileId, "profileId");
  const input = setRankingProfileWeightsSchema.parse(rawBody);
  const [profile] = await db
    .select()
    .from(schema.rankingProfiles)
    .where(eq(schema.rankingProfiles.id, id))
    .limit(1);
  if (!profile) throw new ModelServiceError("NOT_FOUND", "Ranking profile not found", 404);

  const skillIds = input.weights.map((w) => w.skillId);
  if (skillIds.length > 0) {
    const found = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(and(inArray(schema.skills.id, skillIds), eq(schema.skills.status, "active")));
    if (found.length !== new Set(skillIds).size) {
      throw new ModelServiceError(
        "VALIDATION_ERROR",
        "One or more skillIds are invalid or archived",
        400,
        { skillId: ["Must reference active skills"] },
      );
    }
  }

  // Dedupe by skillId (last wins)
  const bySkill = new Map<string, number>();
  for (const w of input.weights) bySkill.set(w.skillId, w.weight);

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.rankingProfileSkills)
      .where(eq(schema.rankingProfileSkills.profileId, id));

    const now = new Date();
    const values = [...bySkill.entries()].map(([skillId, weight]) => ({
      profileId: id,
      skillId,
      weight: String(weight),
      createdAt: now,
      updatedAt: now,
    }));
    if (values.length > 0) {
      await tx.insert(schema.rankingProfileSkills).values(values);
    }
    await tx
      .update(schema.rankingProfiles)
      .set({ updatedAt: now })
      .where(eq(schema.rankingProfiles.id, id));
  });

  return getRankingProfile(db, id);
}

// ── Leaderboard ────────────────────────────────────────────────

type SortableRow = {
  modelId: string;
  name: string;
  slug: string;
  creatorId: string | null;
  creatorName: string | null;
  creatorSlug: string | null;
  personalScore: number | null;
  externalScore: number | null;
  overallScore: number | null;
  scoreBasis: "personal" | "external" | "mixed" | null;
  personalConfidence: RatingResponse["personalConfidence"];
  externalRank: number | null;
  externalConfidence: number | null;
  rankOverride: number | null;
  pinned: boolean;
  tested: boolean;
  testedAt: string | null;
  notes: string | null;
  skillId: string | null;
  profileId: string | null;
  /** Internal only — drives sort; never exposed as a blended average field. */
  _sortScore: number | null;
};

function compareLeaderboard(a: SortableRow, b: SortableRow): number {
  // pinned first
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  // rank_override ascending where set (nulls after set values)
  const ao = a.rankOverride;
  const bo = b.rankOverride;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  // score descending (nulls last)
  const as = a._sortScore;
  const bs = b._sortScore;
  if (as != null && bs != null && as !== bs) return bs - as;
  if (as != null && bs == null) return -1;
  if (as == null && bs != null) return 1;
  // name
  return a.name.localeCompare(b.name);
}

export async function getLeaderboard(
  db: Db,
  rawQuery: unknown = {},
): Promise<{
  type: "personal" | "external" | "combined";
  skill: SkillResponse | null;
  profile: Omit<RankingProfileResponse, "weights"> & { weightCount: number } | null;
  data: LeaderboardEntry[];
}> {
  const parsed = leaderboardQuerySchema.parse(rawQuery ?? {});
  const type = parsed.type;
  let profileId = parsed.profileId;
  const skillId = parsed.skillId;

  if (!skillId && !profileId) {
    // Default: default profile overall
    const [def] = await db
      .select()
      .from(schema.rankingProfiles)
      .where(eq(schema.rankingProfiles.isDefault, true))
      .limit(1);
    if (def) {
      profileId = def.id;
    } else {
      throw new ModelServiceError(
        "VALIDATION_ERROR",
        "Provide profileId or skillId",
        400,
        { profileId: ["Required when no default profile exists"] },
      );
    }
  }

  const skill = skillId ? await resolveSkillRef(db, skillId) : null;
  const profile = profileId ? await resolveProfileRef(db, profileId) : null;

  let rows: SortableRow[] = [];

  if (skill) {
    // Skill-scoped leaderboard. Profile id is metadata only when both set.
    const ratingRows = await db
      .select({
        rating: schema.modelSkillRatings,
        modelId: schema.models.id,
        name: schema.models.name,
        slug: schema.models.slug,
        creatorId: schema.developers.id,
        creatorName: schema.developers.name,
        creatorSlug: schema.developers.slug,
      })
      .from(schema.models)
      .innerJoin(schema.developers, eq(schema.models.developerId, schema.developers.id))
      .leftJoin(
        schema.modelSkillRatings,
        and(
          eq(schema.modelSkillRatings.modelId, schema.models.id),
          eq(schema.modelSkillRatings.skillId, skill.id),
        ),
      )
      .where(eq(schema.models.status, "active"));

    rows = [];
    for (const r of ratingRows) {
      const hidden = r.rating?.hidden ?? false;
      if (hidden) continue;

      const personalScore = numOrNull(r.rating?.personalScore ?? null);
      const externalScore = numOrNull(r.rating?.externalScore ?? null);
      const pinned = r.rating?.pinned ?? false;
      const rankOverride = r.rating?.rankOverride ?? null;

      let sortScore: number | null = null;
      let scoreBasis: SortableRow["scoreBasis"] = null;
      if (type === "personal") {
        sortScore = personalScore;
        scoreBasis = personalScore != null ? "personal" : null;
      } else if (type === "external") {
        sortScore = externalScore;
        scoreBasis = externalScore != null ? "external" : null;
      } else {
        const eff = effectiveSkillScore(personalScore, externalScore);
        sortScore = eff.score;
        scoreBasis = eff.basis;
      }

      rows.push({
        modelId: r.modelId,
        name: r.name,
        slug: r.slug,
        creatorId: r.creatorId,
        creatorName: r.creatorName,
        creatorSlug: r.creatorSlug,
        personalScore,
        externalScore,
        overallScore: null,
        scoreBasis,
        personalConfidence: r.rating?.personalConfidence ?? null,
        externalRank: r.rating?.externalRank ?? null,
        externalConfidence: numOrNull(r.rating?.externalConfidence ?? null),
        rankOverride,
        pinned,
        tested: r.rating?.tested ?? false,
        testedAt: toDateString(r.rating?.testedAt ?? null),
        notes: r.rating?.notes ?? null,
        skillId: skill.id,
        profileId: profile?.id ?? null,
        _sortScore: sortScore,
      });
    }
  } else if (profile) {
    const weights = await loadProfileWeights(db, [profile.id]);
    const profileWeights = weights.get(profile.id) ?? [];
    const skillIds = profileWeights.map((w) => w.skillId);

    const models = await db
      .select({
        id: schema.models.id,
        name: schema.models.name,
        slug: schema.models.slug,
        creatorId: schema.developers.id,
        creatorName: schema.developers.name,
        creatorSlug: schema.developers.slug,
      })
      .from(schema.models)
      .innerJoin(schema.developers, eq(schema.models.developerId, schema.developers.id))
      .where(eq(schema.models.status, "active"));

    const ratings =
      skillIds.length === 0
        ? []
        : await db
            .select()
            .from(schema.modelSkillRatings)
            .where(
              and(
                inArray(schema.modelSkillRatings.skillId, skillIds),
                eq(schema.modelSkillRatings.hidden, false),
              ),
            );

    const ratingsByModel = new Map<string, (typeof schema.modelSkillRatings.$inferSelect)[]>();
    for (const r of ratings) {
      const list = ratingsByModel.get(r.modelId) ?? [];
      list.push(r);
      ratingsByModel.set(r.modelId, list);
    }

    rows = models.map((m) => {
      const modelRatings = ratingsByModel.get(m.id) ?? [];
      const bySkill = new Map(modelRatings.map((r) => [r.skillId, r]));

      // Pin / override: prefer max signal across profile skills (any pin wins;
      // lowest rank_override among set values).
      let pinned = false;
      let rankOverride: number | null = null;
      let personalConfidence: RatingResponse["personalConfidence"] = null;
      let tested = false;
      let testedAt: string | null = null;
      let notes: string | null = null;
      let externalRank: number | null = null;
      let externalConfidence: number | null = null;

      const items = profileWeights.map((pw) => {
        const r = bySkill.get(pw.skillId);
        if (r?.pinned) pinned = true;
        if (r?.rankOverride != null) {
          rankOverride =
            rankOverride == null ? r.rankOverride : Math.min(rankOverride, r.rankOverride);
        }
        if (r?.tested) tested = true;
        if (r?.testedAt && !testedAt) testedAt = toDateString(r.testedAt);
        if (r?.notes && !notes) notes = r.notes;
        if (r?.personalConfidence && !personalConfidence) {
          personalConfidence = r.personalConfidence;
        }
        if (r?.externalRank != null && externalRank == null) externalRank = r.externalRank;
        if (r?.externalConfidence != null && externalConfidence == null) {
          externalConfidence = numOrNull(r.externalConfidence);
        }

        let personal = numOrNull(r?.personalScore ?? null);
        let external = numOrNull(r?.externalScore ?? null);
        if (type === "personal") external = null;
        if (type === "external") personal = null;

        return {
          weight: pw.weight,
          personal,
          external,
          skillId: pw.skillId,
          skillName: pw.skill.name,
          skillSlug: pw.skill.slug,
        };
      });

      const computed = computeWeightedOverall(items);

      // Surface raw personal/external aggregates as null averages — expose only
      // overall with basis. Per-skill personal/external remain available via ratings API.
      // For profile boards, personalScore/externalScore fields hold null (no blend);
      // overallScore is the weighted mean of the selected type inputs.
      return {
        modelId: m.id,
        name: m.name,
        slug: m.slug,
        creatorId: m.creatorId,
        creatorName: m.creatorName,
        creatorSlug: m.creatorSlug,
        personalScore: null,
        externalScore: null,
        overallScore: computed.overallScore,
        scoreBasis: computed.scoreBasis,
        personalConfidence,
        externalRank,
        externalConfidence,
        rankOverride,
        pinned,
        tested,
        testedAt,
        notes,
        skillId: null,
        profileId: profile.id,
        _sortScore: computed.overallScore,
      } satisfies SortableRow;
    });
  }

  rows.sort(compareLeaderboard);

  const data: LeaderboardEntry[] = rows.map((r, idx) => ({
    rank: idx + 1,
    model: {
      id: r.modelId,
      name: r.name,
      slug: r.slug,
      creator:
        r.creatorId && r.creatorName && r.creatorSlug
          ? { id: r.creatorId, name: r.creatorName, slug: r.creatorSlug }
          : null,
    },
    personalScore: r.personalScore,
    externalScore: r.externalScore,
    overallScore: r.overallScore,
    scoreBasis: r.scoreBasis,
    personalConfidence: r.personalConfidence,
    externalRank: r.externalRank,
    externalConfidence: r.externalConfidence,
    rankOverride: r.rankOverride,
    pinned: r.pinned,
    tested: r.tested,
    testedAt: r.testedAt,
    notes: r.notes,
    skillId: r.skillId,
    profileId: r.profileId,
  }));

  return {
    type,
    skill: skill ? mapSkill(skill) : null,
    profile: profile
      ? {
          id: profile.id,
          name: profile.name,
          slug: profile.slug,
          description: profile.description ?? null,
          isDefault: profile.isDefault,
          sortOrder: profile.sortOrder,
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
          weightCount: (await loadProfileWeights(db, [profile.id])).get(profile.id)?.length ?? 0,
        }
      : null,
    data,
  };
}

/** Forbidden blended-score field names for response hygiene tests. */
export const FORBIDDEN_BLENDED_SCORE_KEYS = [
  "blendedScore",
  "blended_score",
  "averageScore",
  "average_score",
  "avgScore",
  "avg_score",
  "mergedScore",
  "merged_score",
  "combinedScore",
  "combined_score",
  "mixedScore",
  "mixed_score",
  "personalExternalAverage",
  "personal_external_average",
  "scoreAverage",
  "score_average",
] as const;

export function assertNoBlendedScoreFields(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (value == null) return hits;
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...assertNoBlendedScoreFields(v, `${path}[${i}]`)));
    return hits;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((FORBIDDEN_BLENDED_SCORE_KEYS as readonly string[]).includes(k)) {
        hits.push(`${path}.${k}`);
      }
      hits.push(...assertNoBlendedScoreFields(v, `${path}.${k}`));
    }
  }
  return hits;
}
