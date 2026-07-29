import { z } from "zod";
import { recordStatusSchema } from "./primitives";

// ── Enums (SPEC §4.1) ──────────────────────────────────────────

export const personalConfidenceSchema = z.enum(["low", "medium", "high"]);
export const tagCategorySchema = z.enum([
  "status",
  "capability",
  "access",
  "usage",
  "cost",
  "preference",
]);
export const viewModeSchema = z.enum(["table", "cards", "compact"]);
export const viewDensitySchema = z.enum(["comfortable", "standard", "compact"]);

// ── Skills ─────────────────────────────────────────────────────

export const skillSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120).nullable(),
  description: z.string().max(4000).nullable(),
  sortOrder: z.number().int(),
  isDefault: z.boolean(),
  status: recordStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createSkillSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(120).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  status: recordStatusSchema.optional(),
});

export const updateSkillSchema = createSkillSchema.partial();

// ── Model skill ratings ────────────────────────────────────────
// personal_score / personal_confidence are nullable with no default.
// A missing score is not a score of zero.

export const modelSkillRatingSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().uuid(),
  skillId: z.string().uuid(),
  personalScore: z
    .number()
    .min(1)
    .max(10)
    .nullable(),
  personalConfidence: personalConfidenceSchema.nullable(),
  externalScore: z.number().min(0).max(100).nullable(),
  externalRank: z.number().int().nullable(),
  externalConfidence: z.number().nullable(),
  rankOverride: z.number().int().nullable(),
  tested: z.boolean(),
  testedAt: z.string().date().nullable(),
  notes: z.string().max(8000).nullable(),
  hidden: z.boolean(),
  pinned: z.boolean(),
  source: z.string().max(500).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const upsertModelSkillRatingSchema = z.object({
  modelId: z.string().uuid(),
  skillId: z.string().uuid(),
  personalScore: z.number().min(1).max(10).nullable().optional(),
  personalConfidence: personalConfidenceSchema.nullable().optional(),
  externalScore: z.number().min(0).max(100).nullable().optional(),
  externalRank: z.number().int().nullable().optional(),
  externalConfidence: z.number().nullable().optional(),
  rankOverride: z.number().int().nullable().optional(),
  tested: z.boolean().optional(),
  testedAt: z.string().date().nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  hidden: z.boolean().optional(),
  pinned: z.boolean().optional(),
  source: z.string().max(500).nullable().optional(),
});

/** Body for PUT /models/[modelId]/ratings/[skillId] — ids come from the path. */
export const upsertModelSkillRatingBodySchema = upsertModelSkillRatingSchema.omit({
  modelId: true,
  skillId: true,
});

export const ratingsListQuerySchema = z.object({
  skillId: z.string().min(1).optional(),
  modelId: z.string().uuid().optional(),
  includeHidden: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
});

export const leaderboardTypeSchema = z.enum(["personal", "external", "combined"]);

export const leaderboardQuerySchema = z.object({
  profileId: z.string().min(1).optional(),
  skillId: z.string().min(1).optional(),
  type: leaderboardTypeSchema.default("combined"),
});

// ── Ranking profiles ───────────────────────────────────────────

export const rankingProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120),
  description: z.string().max(4000).nullable(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createRankingProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(4000).nullable().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateRankingProfileSchema = createRankingProfileSchema.partial();

export const rankingProfileSkillSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  skillId: z.string().uuid(),
  weight: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const upsertRankingProfileSkillSchema = z.object({
  profileId: z.string().uuid(),
  skillId: z.string().uuid(),
  weight: z.number(),
});

/** PUT /ranking-profiles/[id]/weights — full replace of per-skill weights. */
export const setRankingProfileWeightsSchema = z.object({
  weights: z
    .array(
      z.object({
        skillId: z.string().uuid(),
        weight: z.number().min(0),
      }),
    )
    .max(64),
});

export const skillsListQuerySchema = z.object({
  search: z.string().optional(),
  archived: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  includeArchived: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
});

// ── Tags ───────────────────────────────────────────────────────

export const tagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
  color: z.string().trim().min(1).max(40).nullable(),
  category: tagCategorySchema,
  /** Derived aggregate — never a stored counter column. */
  usageCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
});

const tagColorField = z.string().trim().min(1).max(40).nullable().optional();

export const createTagSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(120).optional(),
    color: tagColorField,
    /** British alias accepted; normalised to `color`. */
    colour: tagColorField,
    category: tagCategorySchema,
  })
  .transform((v) => {
    const color = v.color !== undefined ? v.color : v.colour;
    return {
      name: v.name,
      slug: v.slug,
      category: v.category,
      color,
    };
  });

export const updateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(1).max(120).optional(),
    color: tagColorField,
    colour: tagColorField,
    category: tagCategorySchema.optional(),
  })
  .transform((v) => {
    const out: {
      name?: string;
      slug?: string;
      category?: z.infer<typeof tagCategorySchema>;
      color?: string | null;
    } = {};
    if (v.name !== undefined) out.name = v.name;
    if (v.slug !== undefined) out.slug = v.slug;
    if (v.category !== undefined) out.category = v.category;
    if (v.color !== undefined) out.color = v.color;
    else if (v.colour !== undefined) out.color = v.colour;
    return out;
  });

export const modelTagSchema = z.object({
  modelId: z.string().uuid(),
  tagId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export const mergeTagsSchema = z
  .object({
    sourceTagId: z.string().uuid(),
    targetTagId: z.string().uuid(),
  })
  .refine((v) => v.sourceTagId !== v.targetTagId, {
    message: "sourceTagId and targetTagId must differ",
    path: ["targetTagId"],
  });

/** PUT /models/[modelId]/tags — full replace of the model's tag set. */
export const setModelTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).max(200),
});

// ── Saved views (DB table — supersedes app_settings JSON blob) ─

export const rankingSavedViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
  filters: z.record(z.string(), z.unknown()),
  sort: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
  visibleColumns: z.array(z.string().trim().min(1).max(80)).max(100),
  viewMode: viewModeSchema,
  density: viewDensitySchema,
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createRankingSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  sort: z.record(z.string(), z.unknown()).or(z.array(z.unknown())).optional(),
  visibleColumns: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  viewMode: viewModeSchema.optional(),
  density: viewDensitySchema.optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateRankingSavedViewSchema = createRankingSavedViewSchema.partial();

/** Table-backed saved-view contracts (preferred names for API routes). */
export const tableSavedViewSchema = rankingSavedViewSchema;
export const createTableSavedViewSchema = createRankingSavedViewSchema;
export const updateTableSavedViewSchema = updateRankingSavedViewSchema;

export type PersonalConfidence = z.infer<typeof personalConfidenceSchema>;
export type TagCategory = z.infer<typeof tagCategorySchema>;
export type ViewMode = z.infer<typeof viewModeSchema>;
export type ViewDensity = z.infer<typeof viewDensitySchema>;
export type Skill = z.infer<typeof skillSchema>;
export type CreateSkill = z.infer<typeof createSkillSchema>;
export type UpdateSkill = z.infer<typeof updateSkillSchema>;
export type ModelSkillRating = z.infer<typeof modelSkillRatingSchema>;
export type UpsertModelSkillRating = z.infer<typeof upsertModelSkillRatingSchema>;
export type UpsertModelSkillRatingBody = z.infer<typeof upsertModelSkillRatingBodySchema>;
export type RatingsListQuery = z.infer<typeof ratingsListQuerySchema>;
export type LeaderboardType = z.infer<typeof leaderboardTypeSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type RankingProfile = z.infer<typeof rankingProfileSchema>;
export type CreateRankingProfile = z.infer<typeof createRankingProfileSchema>;
export type UpdateRankingProfile = z.infer<typeof updateRankingProfileSchema>;
export type RankingProfileSkill = z.infer<typeof rankingProfileSkillSchema>;
export type UpsertRankingProfileSkill = z.infer<typeof upsertRankingProfileSkillSchema>;
export type SetRankingProfileWeights = z.infer<typeof setRankingProfileWeightsSchema>;
export type SkillsListQuery = z.infer<typeof skillsListQuerySchema>;
export type Tag = z.infer<typeof tagSchema>;
export type CreateTag = z.infer<typeof createTagSchema>;
export type UpdateTag = z.infer<typeof updateTagSchema>;
export type ModelTag = z.infer<typeof modelTagSchema>;
export type MergeTags = z.infer<typeof mergeTagsSchema>;
export type SetModelTags = z.infer<typeof setModelTagsSchema>;
export type RankingSavedView = z.infer<typeof rankingSavedViewSchema>;
export type CreateRankingSavedView = z.infer<typeof createRankingSavedViewSchema>;
export type UpdateRankingSavedView = z.infer<typeof updateRankingSavedViewSchema>;
export type TableSavedView = RankingSavedView;
export type CreateTableSavedView = CreateRankingSavedView;
export type UpdateTableSavedView = UpdateRankingSavedView;

// ── Computed overall score (never stored) ──────────────────────
// Personal 1–10 and external 0–100. External is scaled to 0–10 so the
// weighted mean stays on a single scale. Personal wins per skill when set.

export type ScoreBasis = "personal" | "external" | "mixed";

export function effectiveSkillScore(
  personal: number | null | undefined,
  external: number | null | undefined,
): { score: number | null; basis: "personal" | "external" | null } {
  if (personal !== null && personal !== undefined && !Number.isNaN(Number(personal))) {
    return { score: Number(personal), basis: "personal" };
  }
  if (external !== null && external !== undefined && !Number.isNaN(Number(external))) {
    return { score: Number(external) / 10, basis: "external" };
  }
  return { score: null, basis: null };
}

/**
 * Weighted mean of profile skills. Missing scores are skipped (not zero).
 * Returns null overallScore when no contributing skill scores exist.
 */
export function computeWeightedOverall(
  items: Array<{
    weight: number | string | null | undefined;
    personal: number | string | null | undefined;
    external: number | string | null | undefined;
    skillId?: string;
    skillName?: string | null;
    skillSlug?: string | null;
  }>,
): {
  overallScore: number | null;
  scoreBasis: ScoreBasis | null;
  bestSkill: {
    skillId: string | null;
    name: string | null;
    slug: string | null;
    score: number;
    basis: "personal" | "external";
  } | null;
} {
  let weightedSum = 0;
  let weightTotal = 0;
  let usedPersonal = 0;
  let usedExternal = 0;
  let best: {
    skillId: string | null;
    name: string | null;
    slug: string | null;
    score: number;
    basis: "personal" | "external";
  } | null = null;

  for (const item of items) {
    const w = item.weight === null || item.weight === undefined ? 0 : Number(item.weight);
    if (!(w > 0) || Number.isNaN(w)) continue;
    const personal =
      item.personal === null || item.personal === undefined || item.personal === ""
        ? null
        : Number(item.personal);
    const external =
      item.external === null || item.external === undefined || item.external === ""
        ? null
        : Number(item.external);
    const eff = effectiveSkillScore(
      personal !== null && !Number.isNaN(personal) ? personal : null,
      external !== null && !Number.isNaN(external) ? external : null,
    );
    if (eff.score === null || eff.basis === null) continue;
    weightedSum += eff.score * w;
    weightTotal += w;
    if (eff.basis === "personal") usedPersonal += 1;
    else usedExternal += 1;
    if (!best || eff.score > best.score) {
      best = {
        skillId: item.skillId ?? null,
        name: item.skillName ?? null,
        slug: item.skillSlug ?? null,
        score: eff.score,
        basis: eff.basis,
      };
    }
  }

  if (weightTotal === 0) {
    return { overallScore: null, scoreBasis: null, bestSkill: null };
  }

  const overallScore = weightedSum / weightTotal;
  let scoreBasis: ScoreBasis;
  if (usedPersonal > 0 && usedExternal > 0) scoreBasis = "mixed";
  else if (usedPersonal > 0) scoreBasis = "personal";
  else scoreBasis = "external";

  return { overallScore, scoreBasis, bestSkill: best };
}
