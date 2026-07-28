/**
 * Model list filtering, pagination and list-item enrichment for the redesign API.
 * Kept separate from models.ts (merge/CRUD) to limit blast radius.
 */
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  computeWeightedOverall,
  modelListQuerySchema,
  parseSortParam,
  type ModelListQuery,
} from "@model-monitor/schemas";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index";

type Db = PostgresJsDatabase<typeof schema>;

export class ModelListError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ModelListError";
  }
}

function fieldErrorsFromZod(
  errors: Record<string, string[] | undefined>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(errors)) {
    if (value && value.length > 0) out[key] = value;
  }
  return out;
}

function asNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? null : n;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function latestScoreSql(scoreType: string): SQL {
  return sql`(
    SELECT ms.score_value::double precision
    FROM model_scores ms
    WHERE ms.model_id = ${schema.models.id}
      AND ms.score_type = ${scoreType}
    ORDER BY ms.calculated_at DESC, ms.id DESC
    LIMIT 1
  )`;
}

export function parseModelListQuery(input: unknown): ModelListQuery {
  const parsed = modelListQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new ModelListError(
      "VALIDATION_ERROR",
      "Invalid model list query",
      400,
      fieldErrorsFromZod(parsed.error.flatten().fieldErrors),
    );
  }
  return parsed.data;
}

async function resolveActiveProfile(
  db: Db,
  query: ModelListQuery,
): Promise<{ id: string; name: string; slug: string } | null> {
  const key = (query.profileId ?? query.profile)?.trim();
  if (key) {
    const rows = await db
      .select({
        id: schema.rankingProfiles.id,
        name: schema.rankingProfiles.name,
        slug: schema.rankingProfiles.slug,
      })
      .from(schema.rankingProfiles)
      .where(
        sql`${schema.rankingProfiles.id}::text = ${key}
          OR ${schema.rankingProfiles.slug} = ${key}`,
      )
      .limit(1);
    if (rows[0]) return rows[0];
  }
  const defaults = await db
    .select({
      id: schema.rankingProfiles.id,
      name: schema.rankingProfiles.name,
      slug: schema.rankingProfiles.slug,
    })
    .from(schema.rankingProfiles)
    .where(eq(schema.rankingProfiles.isDefault, true))
    .orderBy(asc(schema.rankingProfiles.sortOrder))
    .limit(1);
  if (defaults[0]) return defaults[0];
  const any = await db
    .select({
      id: schema.rankingProfiles.id,
      name: schema.rankingProfiles.name,
      slug: schema.rankingProfiles.slug,
    })
    .from(schema.rankingProfiles)
    .orderBy(asc(schema.rankingProfiles.sortOrder))
    .limit(1);
  return any[0] ?? null;
}

function buildListConditions(query: ModelListQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.archived === true) {
    conditions.push(eq(schema.models.status, "archived"));
  } else if (query.archived === false || query.archived === undefined) {
    conditions.push(eq(schema.models.status, "active"));
  }

  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    conditions.push(
      sql`(
        ${schema.models.name} ILIKE ${term}
        OR ${schema.models.canonicalId} ILIKE ${term}
        OR ${schema.models.family} ILIKE ${term}
        OR EXISTS (
          SELECT 1 FROM model_aliases ma
          WHERE ma.model_id = ${schema.models.id}
            AND (ma.alias ILIKE ${term} OR ma.normalized_alias ILIKE ${term})
        )
        OR EXISTS (
          SELECT 1 FROM developers d2
          WHERE d2.id = ${schema.models.developerId}
            AND (d2.name ILIKE ${term} OR d2.slug ILIKE ${term})
        )
        OR EXISTS (
          SELECT 1 FROM model_access mac
          JOIN plans p ON p.id = mac.plan_id
          JOIN access_providers ap ON ap.id = p.access_provider_id
          WHERE mac.model_id = ${schema.models.id}
            AND mac.status = 'active'
            AND (ap.name ILIKE ${term} OR ap.slug ILIKE ${term} OR p.name ILIKE ${term})
        )
      )`,
    );
  }

  const creator = (query.creator ?? query.developer)?.trim();
  if (creator) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM developers d
        WHERE d.id = ${schema.models.developerId}
          AND (d.slug = ${creator} OR d.name ILIKE ${`%${creator}%`} OR d.id::text = ${creator})
      )`,
    );
  }

  if (query.family?.trim()) {
    conditions.push(ilike(schema.models.family, query.family.trim()));
  }

  if (query.modelType?.trim()) {
    conditions.push(ilike(schema.models.modelType, `%${query.modelType.trim()}%`));
  }

  if (query.lifecycle?.trim()) {
    conditions.push(
      eq(
        schema.models.lifecycle,
        query.lifecycle.trim() as typeof schema.models.$inferSelect.lifecycle,
      ),
    );
  }

  const workflow = (query.workflowStatus ?? query.status)?.trim();
  if (workflow) {
    const wf = workflow.toLowerCase();
    if (wf === "archived" && query.archived === undefined) {
      // already handled if archived flag set; allow workflowStatus=archived
      conditions.push(
        sql`(${schema.models.workflowStatus} = ${wf} OR ${schema.models.status} = 'archived')`,
      );
    } else {
      conditions.push(sql`${schema.models.workflowStatus} = ${wf}`);
    }
  }

  if (query.needsRecheck !== undefined) {
    conditions.push(eq(schema.models.needsRecheck, query.needsRecheck));
  }
  if (query.needsReview !== undefined) {
    conditions.push(eq(schema.models.needsReview, query.needsReview));
  }

  const fav = query.isFavourite ?? query.favourite;
  if (fav !== undefined) {
    conditions.push(eq(schema.models.isFavourite, fav));
  }

  if (query.accessProvider?.trim()) {
    const ap = query.accessProvider.trim();
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plans p ON p.id = mac.plan_id
        JOIN access_providers prov ON prov.id = p.access_provider_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND (prov.slug = ${ap} OR prov.name ILIKE ${`%${ap}%`} OR prov.id::text = ${ap})
      )`,
    );
  }

  const planKey = (query.plan ?? query.subscription)?.trim();
  if (planKey) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plans p ON p.id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND (p.slug = ${planKey} OR p.name ILIKE ${`%${planKey}%`} OR p.id::text = ${planKey})
      )`,
    );
  }

  if (query.accessType?.trim()) {
    const at = query.accessType.trim().toLowerCase().replace(/-/g, "_");
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plans p ON p.id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND p.access_type::text = ${at}
      )`,
    );
  }

  if (query.accessible === true) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND mac.availability = 'confirmed'
      )`,
    );
  } else if (query.accessible === false) {
    conditions.push(
      sql`NOT EXISTS (
        SELECT 1 FROM model_access mac
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND mac.availability = 'confirmed'
      )`,
    );
  }

  // Capabilities
  if (query.vision !== undefined) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_capabilities mc
        WHERE mc.model_id = ${schema.models.id}
          AND mc.vision = ${query.vision}
      )`,
    );
  }
  if (query.reasoning !== undefined) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_capabilities mc
        WHERE mc.model_id = ${schema.models.id}
          AND mc.reasoning = ${query.reasoning}
      )`,
    );
  }
  const toolUse = query.toolUse ?? query.toolSupport;
  if (toolUse !== undefined) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_capabilities mc
        WHERE mc.model_id = ${schema.models.id}
          AND mc.tool_use = ${toolUse}
      )`,
    );
  }
  if (query.agent !== undefined) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_capabilities mc
        WHERE mc.model_id = ${schema.models.id}
          AND mc.parallel_agents = ${query.agent}
      )`,
    );
  }
  if (query.multimodal === true) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_capabilities mc
        WHERE mc.model_id = ${schema.models.id}
          AND (
            mc.vision IS TRUE
            OR mc.image_input IS TRUE
            OR mc.audio_input IS TRUE
            OR mc.video_input IS TRUE
          )
      )`,
    );
  } else if (query.multimodal === false) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_capabilities mc
        WHERE mc.model_id = ${schema.models.id}
          AND COALESCE(mc.vision, false) = false
          AND COALESCE(mc.image_input, false) = false
          AND COALESCE(mc.audio_input, false) = false
          AND COALESCE(mc.video_input, false) = false
      )`,
    );
  }
  if (query.codingSpecialist === true) {
    conditions.push(
      sql`(
        (${schema.models.codingSpecialization} IS NOT NULL AND btrim(${schema.models.codingSpecialization}) <> '')
        OR ${schema.models.modelType} ILIKE '%coding%'
      )`,
    );
  } else if (query.codingSpecialist === false) {
    conditions.push(
      sql`(
        (${schema.models.codingSpecialization} IS NULL OR btrim(${schema.models.codingSpecialization}) = '')
        AND (${schema.models.modelType} IS NULL OR ${schema.models.modelType} NOT ILIKE '%coding%')
      )`,
    );
  }

  const longMin =
    query.longContextMin ??
    (query.longContext === true ? 128_000 : query.longContext === false ? null : null);
  if (query.longContext === true || query.longContextMin !== undefined) {
    const min = longMin ?? 128_000;
    conditions.push(
      sql`${schema.models.contextTokens} IS NOT NULL AND ${schema.models.contextTokens} >= ${min}`,
    );
  } else if (query.longContext === false) {
    conditions.push(
      sql`(${schema.models.contextTokens} IS NULL OR ${schema.models.contextTokens} < 128000)`,
    );
  }

  // Ratings filters via model_skill_ratings
  const skillKey = (query.skillId ?? query.skill)?.trim();
  const hasRatingRange =
    query.personalScoreMin !== undefined ||
    query.personalScoreMax !== undefined ||
    query.skillScoreMin !== undefined ||
    query.skillScoreMax !== undefined ||
    query.rankMin !== undefined ||
    query.rankMax !== undefined ||
    query.confidence !== undefined ||
    query.tested !== undefined ||
    Boolean(skillKey);

  if (hasRatingRange) {
    const conf = query.confidence?.trim().toLowerCase();
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_skill_ratings msr
        LEFT JOIN skills sk ON sk.id = msr.skill_id
        WHERE msr.model_id = ${schema.models.id}
          AND msr.hidden = false
          ${
            skillKey
              ? sql`AND (sk.id::text = ${skillKey} OR sk.slug = ${skillKey} OR sk.name ILIKE ${`%${skillKey}%`})`
              : sql``
          }
          ${
            query.personalScoreMin !== undefined
              ? sql`AND msr.personal_score IS NOT NULL AND msr.personal_score::double precision >= ${query.personalScoreMin}`
              : sql``
          }
          ${
            query.personalScoreMax !== undefined
              ? sql`AND msr.personal_score IS NOT NULL AND msr.personal_score::double precision <= ${query.personalScoreMax}`
              : sql``
          }
          ${
            query.skillScoreMin !== undefined
              ? sql`AND msr.external_score IS NOT NULL AND msr.external_score::double precision >= ${query.skillScoreMin}`
              : sql``
          }
          ${
            query.skillScoreMax !== undefined
              ? sql`AND msr.external_score IS NOT NULL AND msr.external_score::double precision <= ${query.skillScoreMax}`
              : sql``
          }
          ${
            query.rankMin !== undefined
              ? sql`AND msr.external_rank IS NOT NULL AND msr.external_rank >= ${query.rankMin}`
              : sql``
          }
          ${
            query.rankMax !== undefined
              ? sql`AND msr.external_rank IS NOT NULL AND msr.external_rank <= ${query.rankMax}`
              : sql``
          }
          ${
            conf
              ? sql`AND msr.personal_confidence::text = ${conf}`
              : sql``
          }
          ${
            query.tested !== undefined
              ? sql`AND msr.tested = ${query.tested}`
              : sql``
          }
      )`,
    );
  }

  // Cost / quota flags
  if (query.free === true) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plans p ON p.id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND (
            p.access_type = 'free_tier'
            OR COALESCE(p.regular_price, p.actual_price, 0)::numeric = 0
          )
      )`,
    );
  }
  if (query.subscriptionAccess === true || query.accessType?.toLowerCase() === "subscription") {
    // accessType already applied when set; subscriptionAccess alone:
    if (query.subscriptionAccess === true && !query.accessType) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM model_access mac
          JOIN plans p ON p.id = mac.plan_id
          WHERE mac.model_id = ${schema.models.id}
            AND mac.status = 'active'
            AND p.access_type = 'subscription'
        )`,
      );
    }
  }
  if (query.api === true && !query.accessType) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plans p ON p.id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND p.access_type = 'api'
      )`,
    );
  }
  if (query.openWeights === true && !query.accessType) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plans p ON p.id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND p.access_type = 'open_weights'
      )`,
    );
  }
  if (query.local === true && !query.accessType) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plans p ON p.id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND p.access_type = 'local'
      )`,
    );
  }
  if (query.unlimited === true) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plan_quotas pq ON pq.plan_id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND (pq.is_unlimited = true OR pq.unit = 'unlimited')
      )`,
    );
  }
  if (query.requestLimited === true) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plan_quotas pq ON pq.plan_id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND pq.unit = 'requests'
          AND pq.is_unlimited = false
      )`,
    );
  }
  if (query.tokenLimited === true) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plan_quotas pq ON pq.plan_id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND pq.unit = 'tokens'
          AND pq.is_unlimited = false
      )`,
    );
  }
  if (query.pricingKnown === true) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM model_access mac
        JOIN model_access_pricing map ON map.model_access_id = mac.id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
      )`,
    );
  }
  if (query.pricingMissing === true) {
    conditions.push(
      sql`NOT EXISTS (
        SELECT 1 FROM model_access mac
        JOIN model_access_pricing map ON map.model_access_id = mac.id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
      )`,
    );
  }

  // Data maintenance
  if (query.missingRating === true) {
    conditions.push(
      sql`NOT EXISTS (
        SELECT 1 FROM model_skill_ratings msr
        WHERE msr.model_id = ${schema.models.id}
          AND (
            msr.personal_score IS NOT NULL
            OR msr.external_score IS NOT NULL
          )
      )`,
    );
  }
  if (query.missingCost === true) {
    conditions.push(
      sql`NOT EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plans p ON p.id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
          AND (
            p.regular_price IS NOT NULL
            OR p.actual_price IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM model_access_pricing map WHERE map.model_access_id = mac.id
            )
          )
      )`,
    );
  }
  if (query.missingQuota === true) {
    conditions.push(
      sql`NOT EXISTS (
        SELECT 1 FROM model_access mac
        JOIN plan_quotas pq ON pq.plan_id = mac.plan_id
        WHERE mac.model_id = ${schema.models.id}
          AND mac.status = 'active'
      )`,
    );
  }

  const recentDays = query.verifiedWithinDays ?? (query.recentlyVerified ? 30 : undefined);
  if (recentDays !== undefined) {
    conditions.push(
      sql`${schema.models.verifiedAt} IS NOT NULL
        AND ${schema.models.verifiedAt} >= (now() - (${recentDays}::text || ' days')::interval)`,
    );
  }
  const outdatedDays = query.outdatedAfterDays ?? (query.outdated ? 90 : undefined);
  if (outdatedDays !== undefined) {
    conditions.push(
      sql`(
        ${schema.models.verifiedAt} IS NULL
        OR ${schema.models.verifiedAt} < (now() - (${outdatedDays}::text || ' days')::interval)
      )`,
    );
  }

  return conditions;
}

function formatCostOrQuota(input: {
  accessType: string | null;
  regularPrice: string | null;
  actualPrice: string | null;
  currency: string | null;
  inputPerMillion: string | null;
  outputPerMillion: string | null;
  quotaSummaries: Array<{
    name: string;
    amount: string | null;
    unit: string;
    isUnlimited: boolean;
  }>;
}): string | null {
  const parts: string[] = [];
  const price = asNumber(input.actualPrice) ?? asNumber(input.regularPrice);
  if (price !== null) {
    const cur = (input.currency ?? "USD").toUpperCase();
    const symbol = cur === "USD" ? "$" : `${cur} `;
    if (input.accessType === "subscription" || input.accessType === "trial") {
      parts.push(`${symbol}${price} / mo`);
    } else if (price === 0) {
      parts.push("Free");
    } else {
      parts.push(`${symbol}${price}`);
    }
  }
  const inP = asNumber(input.inputPerMillion);
  const outP = asNumber(input.outputPerMillion);
  if (inP !== null || outP !== null) {
    const cur = (input.currency ?? "USD").toUpperCase();
    const symbol = cur === "USD" ? "$" : `${cur} `;
    if (inP !== null && outP !== null) {
      parts.push(`${symbol}${inP}/${outP} / 1M tok`);
    } else if (inP !== null) {
      parts.push(`${symbol}${inP} in / 1M tok`);
    } else if (outP !== null) {
      parts.push(`${symbol}${outP} out / 1M tok`);
    }
  }
  for (const q of input.quotaSummaries.slice(0, 2)) {
    if (q.isUnlimited || q.unit === "unlimited") {
      parts.push(`${q.name}: unlimited`);
    } else if (q.amount != null) {
      parts.push(`${q.name}: ${q.amount} ${q.unit}`);
    }
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export async function listModelsEnriched(db: Db, rawQuery: unknown) {
  const query = parseModelListQuery(rawQuery);
  const { field, direction } = parseSortParam(query.sort);
  const limit = query.limit ?? 50;
  const page = query.page ?? 1;
  const offset = query.cursor
    ? Number.parseInt(Buffer.from(query.cursor, "base64url").toString("utf8"), 10) || 0
    : (page - 1) * limit;

  const conditions = buildListConditions(query);
  const whereExpr = conditions.length ? and(...conditions) : undefined;
  const profile = await resolveActiveProfile(db, query);

  const dirFn = direction === "desc" ? desc : asc;
  let orderBy: SQL;
  const scoreSortFields = new Set(["capability", "balanced", "value"]);
  if (scoreSortFields.has(field)) {
    const scoreExpr = latestScoreSql(field);
    orderBy =
      direction === "desc"
        ? sql`${scoreExpr} DESC NULLS LAST`
        : sql`${scoreExpr} ASC NULLS LAST`;
  } else {
    switch (field) {
      case "developer":
      case "creator":
        orderBy = dirFn(schema.developers.name);
        break;
      case "family":
        orderBy = dirFn(schema.models.family);
        break;
      case "lifecycle":
        orderBy = dirFn(schema.models.lifecycle);
        break;
      case "context":
        orderBy = dirFn(schema.models.contextTokens);
        break;
      case "updatedAt":
        orderBy = dirFn(schema.models.updatedAt);
        break;
      case "verifiedAt":
        orderBy = dirFn(schema.models.verifiedAt);
        break;
      case "speed":
        orderBy = dirFn(schema.models.speedRating);
        break;
      case "workflowStatus":
        orderBy = dirFn(schema.models.workflowStatus);
        break;
      case "overallScore":
        // Deterministic fallback; overall score applied post-query when sorting by it.
        orderBy = dirFn(schema.models.name);
        break;
      case "name":
      default:
        orderBy = dirFn(schema.models.name);
        break;
    }
  }

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.models)
    .innerJoin(schema.developers, eq(schema.models.developerId, schema.developers.id))
    .where(whereExpr);
  const total = countRows[0]?.count ?? 0;

  // When sorting by overallScore we need all matching ids, score, then page.
  const fetchAllForScoreSort = field === "overallScore";
  const rows = await db
    .select({
      model: schema.models,
      developerName: schema.developers.name,
      developerSlug: schema.developers.slug,
      capabilities: schema.modelCapabilities,
    })
    .from(schema.models)
    .innerJoin(schema.developers, eq(schema.models.developerId, schema.developers.id))
    .leftJoin(schema.modelCapabilities, eq(schema.modelCapabilities.modelId, schema.models.id))
    .where(whereExpr)
    .orderBy(orderBy, asc(schema.models.id))
    .limit(fetchAllForScoreSort ? 10_000 : limit + 1)
    .offset(fetchAllForScoreSort ? 0 : offset);

  const candidateRows = fetchAllForScoreSort ? rows : rows.slice(0, limit);
  const hasMoreDefault = !fetchAllForScoreSort && rows.length > limit;
  const modelIds = candidateRows.map((r) => r.model.id);

  // Legacy scores (model_scores) for mapModelRow compatibility
  const scoreRows =
    modelIds.length === 0
      ? []
      : await db
          .select({
            modelId: schema.modelScores.modelId,
            scoreType: schema.modelScores.scoreType,
            scoreValue: schema.modelScores.scoreValue,
            rankValue: schema.modelScores.rankValue,
            calculatedAt: schema.modelScores.calculatedAt,
            methodologyVersion: schema.scoreMethodologies.version,
            methodologyName: schema.scoreMethodologies.name,
          })
          .from(schema.modelScores)
          .innerJoin(
            schema.scoreMethodologies,
            eq(schema.modelScores.methodologyId, schema.scoreMethodologies.id),
          )
          .where(inArray(schema.modelScores.modelId, modelIds))
          .orderBy(desc(schema.modelScores.calculatedAt), desc(schema.modelScores.id));

  const latestScores = new Map<string, typeof scoreRows>();
  for (const s of scoreRows) {
    const list = latestScores.get(s.modelId) ?? [];
    if (list.some((x) => x.scoreType === s.scoreType)) continue;
    list.push(s);
    latestScores.set(s.modelId, list);
  }

  // Preferred + all access providers
  const accessRows =
    modelIds.length === 0
      ? []
      : await db
          .select({
            modelId: schema.modelAccess.modelId,
            accessId: schema.modelAccess.id,
            isPreferred: schema.modelAccess.isPreferred,
            priority: schema.modelAccess.priority,
            planId: schema.plans.id,
            planName: schema.plans.name,
            planSlug: schema.plans.slug,
            accessType: schema.plans.accessType,
            regularPrice: schema.plans.regularPrice,
            actualPrice: schema.plans.actualPrice,
            currency: schema.plans.currency,
            providerId: schema.accessProviders.id,
            providerName: schema.accessProviders.name,
            providerSlug: schema.accessProviders.slug,
          })
          .from(schema.modelAccess)
          .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
          .innerJoin(
            schema.accessProviders,
            eq(schema.plans.accessProviderId, schema.accessProviders.id),
          )
          .where(
            and(
              inArray(schema.modelAccess.modelId, modelIds),
              eq(schema.modelAccess.status, "active"),
            ),
          )
          .orderBy(desc(schema.modelAccess.isPreferred), asc(schema.modelAccess.priority));

  const accessByModel = new Map<string, typeof accessRows>();
  for (const a of accessRows) {
    const list = accessByModel.get(a.modelId) ?? [];
    list.push(a);
    accessByModel.set(a.modelId, list);
  }

  const preferredAccessIds = accessRows
    .filter((a) => a.isPreferred)
    .map((a) => a.accessId);
  // fallback: first access per model
  for (const [, list] of accessByModel) {
    if (!list.some((a) => a.isPreferred) && list[0]) {
      preferredAccessIds.push(list[0].accessId);
    }
  }

  const pricingRows =
    preferredAccessIds.length === 0
      ? []
      : await db
          .select({
            modelAccessId: schema.modelAccessPricing.modelAccessId,
            inputPerMillion: schema.modelAccessPricing.inputPerMillion,
            outputPerMillion: schema.modelAccessPricing.outputPerMillion,
            currency: schema.modelAccessPricing.currency,
          })
          .from(schema.modelAccessPricing)
          .where(inArray(schema.modelAccessPricing.modelAccessId, preferredAccessIds));
  const pricingByAccess = new Map(pricingRows.map((p) => [p.modelAccessId, p]));

  const preferredPlanIds = [
    ...new Set(
      accessRows
        .filter((a) => preferredAccessIds.includes(a.accessId))
        .map((a) => a.planId),
    ),
  ];
  const quotaRows =
    preferredPlanIds.length === 0
      ? []
      : await db
          .select({
            planId: schema.planQuotas.planId,
            name: schema.planQuotas.name,
            amount: schema.planQuotas.amount,
            unit: schema.planQuotas.unit,
            isUnlimited: schema.planQuotas.isUnlimited,
          })
          .from(schema.planQuotas)
          .where(inArray(schema.planQuotas.planId, preferredPlanIds));
  const quotasByPlan = new Map<string, typeof quotaRows>();
  for (const q of quotaRows) {
    const list = quotasByPlan.get(q.planId) ?? [];
    list.push(q);
    quotasByPlan.set(q.planId, list);
  }

  const aliasRows =
    modelIds.length === 0
      ? []
      : await db
          .select({
            id: schema.modelAliases.id,
            modelId: schema.modelAliases.modelId,
            alias: schema.modelAliases.alias,
            aliasType: schema.modelAliases.aliasType,
            accessProviderId: schema.modelAliases.accessProviderId,
          })
          .from(schema.modelAliases)
          .where(inArray(schema.modelAliases.modelId, modelIds));
  const aliasMap = new Map<string, typeof aliasRows>();
  for (const a of aliasRows) {
    const list = aliasMap.get(a.modelId) ?? [];
    list.push(a);
    aliasMap.set(a.modelId, list);
  }

  const tagRows =
    modelIds.length === 0
      ? []
      : await db
          .select({
            modelId: schema.modelTags.modelId,
            id: schema.tags.id,
            name: schema.tags.name,
            slug: schema.tags.slug,
            color: schema.tags.color,
            category: schema.tags.category,
          })
          .from(schema.modelTags)
          .innerJoin(schema.tags, eq(schema.modelTags.tagId, schema.tags.id))
          .where(inArray(schema.modelTags.modelId, modelIds))
          .orderBy(asc(schema.tags.name));
  const tagsByModel = new Map<string, typeof tagRows>();
  for (const t of tagRows) {
    const list = tagsByModel.get(t.modelId) ?? [];
    list.push(t);
    tagsByModel.set(t.modelId, list);
  }

  // Profile skill weights + ratings for overall score
  type ProfileSkill = {
    skillId: string;
    weight: string;
    skillName: string;
    skillSlug: string;
  };
  let profileSkills: ProfileSkill[] = [];
  if (profile) {
    profileSkills = await db
      .select({
        skillId: schema.rankingProfileSkills.skillId,
        weight: schema.rankingProfileSkills.weight,
        skillName: schema.skills.name,
        skillSlug: schema.skills.slug,
      })
      .from(schema.rankingProfileSkills)
      .innerJoin(schema.skills, eq(schema.rankingProfileSkills.skillId, schema.skills.id))
      .where(eq(schema.rankingProfileSkills.profileId, profile.id));
  }

  const skillIds = profileSkills.map((s) => s.skillId);
  const ratingRows =
    modelIds.length === 0 || skillIds.length === 0
      ? []
      : await db
          .select({
            modelId: schema.modelSkillRatings.modelId,
            skillId: schema.modelSkillRatings.skillId,
            personalScore: schema.modelSkillRatings.personalScore,
            externalScore: schema.modelSkillRatings.externalScore,
          })
          .from(schema.modelSkillRatings)
          .where(
            and(
              inArray(schema.modelSkillRatings.modelId, modelIds),
              inArray(schema.modelSkillRatings.skillId, skillIds),
              eq(schema.modelSkillRatings.hidden, false),
            ),
          );

  const ratingsByModelSkill = new Map<string, { personal: string | null; external: string | null }>();
  for (const r of ratingRows) {
    ratingsByModelSkill.set(`${r.modelId}:${r.skillId}`, {
      personal: r.personalScore,
      external: r.externalScore,
    });
  }

  type ListItem = ReturnType<typeof buildListItem>;
  function buildListItem(r: (typeof candidateRows)[number]) {
    const model = r.model;
    const accessList = accessByModel.get(model.id) ?? [];
    const preferred =
      accessList.find((a) => a.isPreferred) ?? accessList[0] ?? null;
    const pricing = preferred ? pricingByAccess.get(preferred.accessId) : undefined;
    const quotas = preferred ? quotasByPlan.get(preferred.planId) ?? [] : [];

    const scoreInputs = profileSkills.map((ps) => {
      const rating = ratingsByModelSkill.get(`${model.id}:${ps.skillId}`);
      return {
        weight: ps.weight,
        personal: rating?.personal ?? null,
        external: rating?.external ?? null,
        skillId: ps.skillId,
        skillName: ps.skillName,
        skillSlug: ps.skillSlug,
      };
    });
    const computed = computeWeightedOverall(scoreInputs);

    // Legacy score map
    const scoreMap: Record<
      string,
      { value: number | null; display: string; rank: number | null; methodologyVersion: string | null }
    > = {};
    for (const s of latestScores.get(model.id) ?? []) {
      if (scoreMap[s.scoreType]) continue;
      const value = asNumber(s.scoreValue);
      scoreMap[s.scoreType] = {
        value,
        display: value === null ? "—" : String(value),
        rank: s.rankValue,
        methodologyVersion: s.methodologyVersion ?? null,
      };
    }

    const caps = r.capabilities;
    const tags = (tagsByModel.get(model.id) ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      color: t.color,
      category: t.category,
    }));

    const overallScore =
      computed.overallScore === null
        ? null
        : Math.round(computed.overallScore * 100) / 100;

    return {
      id: model.id,
      canonicalId: model.canonicalId,
      name: model.name,
      slug: model.slug,
      developerId: model.developerId,
      developerName: r.developerName ?? null,
      developerSlug: r.developerSlug ?? null,
      creator: {
        id: model.developerId,
        name: r.developerName ?? null,
        slug: r.developerSlug ?? null,
      },
      family: model.family,
      generation: model.generation,
      lifecycle: model.lifecycle,
      lifecycleRaw: model.lifecycleRaw,
      releaseDate: model.releaseDate,
      knowledgeCutoff: model.knowledgeCutoff,
      modelType: model.modelType,
      description: model.description,
      codingSpecialization: model.codingSpecialization,
      bestUse: model.bestUse,
      avoidFor: model.avoidFor,
      contextTokens: model.contextTokens,
      context: model.contextTokens,
      maxOutputTokens: model.maxOutputTokens,
      speedRating: model.speedRating,
      speed: model.speedRating,
      verifiedTps: asNumber(model.verifiedTps),
      verificationStatus: model.verificationStatus,
      verifiedAt: toIso(model.verifiedAt),
      needsRecheck: model.needsRecheck,
      needsReview: model.needsReview,
      isFavourite: model.isFavourite,
      workflowStatus: model.workflowStatus,
      status: model.status,
      archivedAt: toIso(model.archivedAt),
      mergedIntoModelId: model.mergedIntoModelId,
      createdAt: toIso(model.createdAt)!,
      updatedAt: toIso(model.updatedAt)!,
      preferredAccess: preferred
        ? {
            accessId: preferred.accessId,
            providerId: preferred.providerId,
            providerName: preferred.providerName,
            providerSlug: preferred.providerSlug,
            planId: preferred.planId,
            planName: preferred.planName,
            planSlug: preferred.planSlug,
            accessType: preferred.accessType,
          }
        : null,
      preferredAccessProvider: preferred
        ? {
            id: preferred.providerId,
            name: preferred.providerName,
            slug: preferred.providerSlug,
          }
        : null,
      preferredPlan: preferred
        ? {
            id: preferred.planId,
            name: preferred.planName,
            slug: preferred.planSlug,
            accessType: preferred.accessType,
          }
        : null,
      overallScore,
      scoreBasis: computed.scoreBasis,
      bestSkill: computed.bestSkill
        ? {
            id: computed.bestSkill.skillId,
            name: computed.bestSkill.name,
            slug: computed.bestSkill.slug,
            score: Math.round(computed.bestSkill.score * 100) / 100,
            basis: computed.bestSkill.basis,
          }
        : null,
      costOrQuota: preferred
        ? formatCostOrQuota({
            accessType: preferred.accessType,
            regularPrice: preferred.regularPrice,
            actualPrice: preferred.actualPrice,
            currency: preferred.currency ?? pricing?.currency ?? null,
            inputPerMillion: pricing?.inputPerMillion ?? null,
            outputPerMillion: pricing?.outputPerMillion ?? null,
            quotaSummaries: quotas.map((q) => ({
              name: q.name,
              amount: q.amount,
              unit: q.unit,
              isUnlimited: q.isUnlimited,
            })),
          })
        : null,
      tags,
      profile: profile
        ? { id: profile.id, name: profile.name, slug: profile.slug }
        : null,
      capabilities: caps
        ? {
            vision: caps.vision,
            reasoning: caps.reasoning,
            toolUse: caps.toolUse,
            parallelAgents: caps.parallelAgents,
            computerUse: caps.computerUse,
            audioInput: caps.audioInput,
            videoInput: caps.videoInput,
            imageInput: caps.imageInput,
            structuredOutput: caps.structuredOutput,
            functionCalling: caps.functionCalling,
            details: caps.details,
            display: {
              vision: caps.vision === true ? "yes" : caps.vision === false ? "no" : "unknown",
              reasoning:
                caps.reasoning === true ? "yes" : caps.reasoning === false ? "no" : "unknown",
              toolUse: caps.toolUse === true ? "yes" : caps.toolUse === false ? "no" : "unknown",
            },
          }
        : null,
      scores: scoreMap,
      accessProviders: [...new Set(accessList.map((a) => a.providerName))],
      aliases: (aliasMap.get(model.id) ?? []).map((a) => ({
        id: a.id,
        alias: a.alias,
        aliasType: a.aliasType,
        accessProviderId: a.accessProviderId,
      })),
    };
  }

  const data: ListItem[] = candidateRows.map(buildListItem);
  let pageRows = data;
  let hasMore = hasMoreDefault;
  let pageOffset = offset;

  if (fetchAllForScoreSort) {
    data.sort((a, b) => {
      const av = a.overallScore;
      const bv = b.overallScore;
      if (av === null && bv === null) return a.id.localeCompare(b.id);
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av - bv;
      const ordered = direction === "desc" ? -cmp : cmp;
      if (ordered !== 0) return ordered;
      return a.id.localeCompare(b.id);
    });
    pageRows = data.slice(offset, offset + limit);
    hasMore = offset + limit < data.length;
    pageOffset = offset;
  }

  const nextOffset = pageOffset + limit;
  const nextCursor = hasMore
    ? Buffer.from(String(nextOffset), "utf8").toString("base64url")
    : null;

  return {
    data: pageRows,
    page: {
      nextCursor,
      hasMore,
      total,
      page,
      pageSize: limit,
    },
    meta: {
      profile: profile
        ? { id: profile.id, name: profile.name, slug: profile.slug }
        : null,
    },
  };
}
