import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  bigint,
  date,
  timestamp,
  jsonb,
  integer,
  char,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { developers, accessProviders } from "./core";
import { plans } from "./subscriptions";
import {
  recordStatus,
  lifecycleStatus,
  availabilityStatus,
  accessMethod,
  authenticationType,
  workflowStatus,
} from "./enums";

// ── Models ─────────────────────────────────────────────────────

export const models = pgTable("models", {
  id: uuid("id").primaryKey().defaultRandom(),
  developerId: uuid("developer_id").notNull().references(() => developers.id),
  canonicalId: text("canonical_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  family: text("family"),
  generation: text("generation"),
  lifecycle: lifecycleStatus("lifecycle").notNull().default("unknown"),
  lifecycleRaw: text("lifecycle_raw"),
  releaseDate: date("release_date"),
  knowledgeCutoff: text("knowledge_cutoff"),
  modelType: text("model_type"),
  description: text("description"),
  codingSpecialization: text("coding_specialization"),
  bestUse: text("best_use"),
  avoidFor: text("avoid_for"),
  contextTokens: bigint("context_tokens", { mode: "number" }),
  maxOutputTokens: bigint("max_output_tokens", { mode: "number" }),
  speedRating: text("speed_rating"),
  verifiedTps: numeric("verified_tps", { precision: 12, scale: 3 }),
  verificationStatus: text("verification_status"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  needsRecheck: boolean("needs_recheck").notNull().default(true),
  metadata: jsonb("metadata").notNull().default({}),
  status: recordStatus("status").notNull().default("active"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  mergedIntoModelId: uuid("merged_into_model_id").references((): AnyPgColumn => models.id),
  // SPEC §4.2 — redesign workflow fields (additive).
  isFavourite: boolean("is_favourite").notNull().default(false),
  needsReview: boolean("needs_review").notNull().default(false),
  workflowStatus: workflowStatus("workflow_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Model Aliases ──────────────────────────────────────────────

export const modelAliases = pgTable("model_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  normalizedAlias: text("normalized_alias").notNull().unique(),
  aliasType: text("alias_type").notNull(),
  accessProviderId: uuid("access_provider_id").references(() => accessProviders.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Model Capabilities ────────────────────────────────────────

export const modelCapabilities = pgTable("model_capabilities", {
  modelId: uuid("model_id").primaryKey().references(() => models.id, { onDelete: "cascade" }),
  vision: boolean("vision"),
  reasoning: boolean("reasoning"),
  toolUse: boolean("tool_use"),
  parallelAgents: boolean("parallel_agents"),
  computerUse: boolean("computer_use"),
  audioInput: boolean("audio_input"),
  videoInput: boolean("video_input"),
  imageInput: boolean("image_input"),
  structuredOutput: boolean("structured_output"),
  functionCalling: boolean("function_calling"),
  details: jsonb("details").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Model Access ───────────────────────────────────────────────

export const modelAccess = pgTable(
  "model_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id").notNull().references(() => models.id),
    planId: uuid("plan_id").notNull().references(() => plans.id),
    providerModelId: text("provider_model_id"),
    availability: availabilityStatus("availability").notNull().default("unconfirmed"),
    accessMethod: accessMethod("access_method").notNull(),
    authenticationType: authenticationType("authentication_type").notNull().default("other"),
    includedInPlan: boolean("included_in_plan"),
    apiCompatible: boolean("api_compatible"),
    cliOnly: boolean("cli_only").notNull().default(false),
    webOnly: boolean("web_only").notNull().default(false),
    oauthSupported: boolean("oauth_supported"),
    priority: integer("priority"),
    limitations: text("limitations"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    availableFrom: date("available_from"),
    availableUntil: date("available_until"),
    notes: text("notes"),
    status: recordStatus("status").notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // SPEC §4.2 — at most one preferred access route per model.
    isPreferred: boolean("is_preferred").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    preferredUidx: uniqueIndex("model_access_preferred_uidx")
      .on(t.modelId)
      .where(sql`${t.isPreferred}`),
  }),
);

// ── Model Access Pricing ───────────────────────────────────────

export const modelAccessPricing = pgTable("model_access_pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelAccessId: uuid("model_access_id").notNull().references(() => modelAccess.id, { onDelete: "cascade" }),
  currency: char("currency", { length: 3 }).notNull(),
  inputPerMillion: numeric("input_per_million", { precision: 14, scale: 6 }),
  cachedReadPerMillion: numeric("cached_read_per_million", { precision: 14, scale: 6 }),
  cacheWritePerMillion: numeric("cache_write_per_million", { precision: 14, scale: 6 }),
  outputPerMillion: numeric("output_per_million", { precision: 14, scale: 6 }),
  longInputPerMillion: numeric("long_input_per_million", { precision: 14, scale: 6 }),
  longCachedPerMillion: numeric("long_cached_per_million", { precision: 14, scale: 6 }),
  longCacheWritePerMillion: numeric("long_cache_write_per_million", { precision: 14, scale: 6 }),
  longOutputPerMillion: numeric("long_output_per_million", { precision: 14, scale: 6 }),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  sourceUrl: text("source_url"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
