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

// ── Tags ───────────────────────────────────────────────────────

export const tagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
  color: z.string().trim().min(1).max(40).nullable(),
  category: tagCategorySchema,
  createdAt: z.string().datetime(),
});

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).optional(),
  color: z.string().trim().min(1).max(40).nullable().optional(),
  category: tagCategorySchema,
});

export const updateTagSchema = createTagSchema.partial();

export const modelTagSchema = z.object({
  modelId: z.string().uuid(),
  tagId: z.string().uuid(),
  createdAt: z.string().datetime(),
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

export type PersonalConfidence = z.infer<typeof personalConfidenceSchema>;
export type TagCategory = z.infer<typeof tagCategorySchema>;
export type ViewMode = z.infer<typeof viewModeSchema>;
export type ViewDensity = z.infer<typeof viewDensitySchema>;
export type Skill = z.infer<typeof skillSchema>;
export type CreateSkill = z.infer<typeof createSkillSchema>;
export type UpdateSkill = z.infer<typeof updateSkillSchema>;
export type ModelSkillRating = z.infer<typeof modelSkillRatingSchema>;
export type UpsertModelSkillRating = z.infer<typeof upsertModelSkillRatingSchema>;
export type RankingProfile = z.infer<typeof rankingProfileSchema>;
export type CreateRankingProfile = z.infer<typeof createRankingProfileSchema>;
export type UpdateRankingProfile = z.infer<typeof updateRankingProfileSchema>;
export type RankingProfileSkill = z.infer<typeof rankingProfileSkillSchema>;
export type UpsertRankingProfileSkill = z.infer<typeof upsertRankingProfileSkillSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type CreateTag = z.infer<typeof createTagSchema>;
export type UpdateTag = z.infer<typeof updateTagSchema>;
export type ModelTag = z.infer<typeof modelTagSchema>;
export type RankingSavedView = z.infer<typeof rankingSavedViewSchema>;
export type CreateRankingSavedView = z.infer<typeof createRankingSavedViewSchema>;
export type UpdateRankingSavedView = z.infer<typeof updateRankingSavedViewSchema>;
