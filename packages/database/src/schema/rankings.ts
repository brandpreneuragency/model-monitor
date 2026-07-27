import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  date,
  timestamp,
  jsonb,
  primaryKey,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { models } from "./models";
import {
  recordStatus,
  personalConfidence,
  tagCategory,
  viewMode,
  viewDensity,
} from "./enums";

// ── Skills ─────────────────────────────────────────────────────

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Model skill ratings ────────────────────────────────────────

export const modelSkillRatings = pgTable(
  "model_skill_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    // Nullable with no default — missing score is not zero.
    personalScore: numeric("personal_score", { precision: 4, scale: 2 }),
    personalConfidence: personalConfidence("personal_confidence"),
    externalScore: numeric("external_score", { precision: 6, scale: 2 }),
    externalRank: integer("external_rank"),
    externalConfidence: numeric("external_confidence"),
    rankOverride: integer("rank_override"),
    tested: boolean("tested").notNull().default(false),
    testedAt: date("tested_at"),
    notes: text("notes"),
    hidden: boolean("hidden").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    modelSkillUq: unique("model_skill_ratings_model_id_skill_id_key").on(t.modelId, t.skillId),
    skillExternalScoreIdx: index("model_skill_ratings_skill_external_score_idx").on(
      t.skillId,
      t.externalScore,
    ),
    skillPersonalScoreIdx: index("model_skill_ratings_skill_personal_score_idx").on(
      t.skillId,
      t.personalScore,
    ),
  }),
);

// ── Ranking profiles ───────────────────────────────────────────

export const rankingProfiles = pgTable("ranking_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rankingProfileSkills = pgTable(
  "ranking_profile_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => rankingProfiles.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    weight: numeric("weight").notNull().default("1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profileSkillUq: unique("ranking_profile_skills_profile_id_skill_id_key").on(
      t.profileId,
      t.skillId,
    ),
  }),
);

// ── Tags ───────────────────────────────────────────────────────

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  color: text("color"),
  category: tagCategory("category").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modelTags = pgTable(
  "model_tags",
  {
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.modelId, t.tagId], name: "model_tags_pkey" }),
  }),
);

// ── Saved views ────────────────────────────────────────────────

export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  filters: jsonb("filters").notNull().default({}),
  sort: jsonb("sort").notNull().default({}),
  visibleColumns: jsonb("visible_columns").notNull().default([]),
  viewMode: viewMode("view_mode").notNull().default("table"),
  density: viewDensity("density").notNull().default("standard"),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
