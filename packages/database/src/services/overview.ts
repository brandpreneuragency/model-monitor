import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  overviewRecentQuerySchema,
  overviewScatterQuerySchema,
  type OverviewAccessCard,
  type OverviewProviderDistributionItem,
  type OverviewQuotaItem,
  type OverviewRecentItem,
  type OverviewScatterPoint,
  type OverviewSkillCategory,
  type OverviewSummary,
} from "@model-monitor/schemas";
import * as schema from "../schema/index";
import type { Db } from "./audit";
import { asNumber, ModelServiceError } from "./audit";
import { getLeaderboard } from "./rankings";

// ── Constants ──────────────────────────────────────────────────

/** Overview skill-leader chips (labels match design mockup / SPEC). */
const SKILL_LEADER_CATEGORIES: Array<{
  key: string;
  label: string;
  /** skill slug; null → default ranking profile (Best Overall). */
  skillSlug: string | null;
}> = [
  { key: "best-overall", label: "Best Overall", skillSlug: null },
  { key: "coding", label: "Coding", skillSlug: "coding" },
  { key: "ui-frontend", label: "UI / Frontend", skillSlug: "ui-frontend" },
  { key: "architecture", label: "Architecture", skillSlug: "architecture" },
  { key: "review-debug", label: "Review / Debug", skillSlug: "review-debug" },
  { key: "agent-work", label: "Agent Work", skillSlug: "agent-tool-use" },
  { key: "speed", label: "Speed", skillSlug: "speed" },
  { key: "value", label: "Value", skillSlug: "value" },
];

const QUOTA_PERIOD_RANK: Record<string, number> = {
  five_hour_window: 10,
  hourly: 20,
  daily: 30,
  weekly: 40,
  monthly: 50,
  billing_cycle: 60,
  sliding_window: 70,
  one_time: 80,
  custom: 90,
};

// ── Helpers ────────────────────────────────────────────────────

function monthlyFromPlan(row: {
  regularPrice: string | null;
  actualPrice: string | null;
  billingPeriod: string | null;
  billingInterval: string | null;
}): number | null {
  const raw = asNumber(row.actualPrice) ?? asNumber(row.regularPrice);
  if (raw == null) return null;
  const period = (row.billingPeriod ?? row.billingInterval ?? "monthly").toLowerCase();
  if (period.includes("year") || period === "annual" || period === "yr") return raw / 12;
  if (period.includes("week")) return (raw * 52) / 12;
  if (period.includes("day")) return (raw * 365) / 12;
  if (period.includes("quarter")) return raw / 3;
  return raw;
}

function isPaidMonthly(cost: number | null): boolean {
  return cost != null && cost > 0;
}

function toDateString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Build a sparkline from real timestamps only.
 * Up to 12 month-end cumulative points from first event → now.
 * Leading empty months before the first real event are dropped.
 * Returns null when there is no history.
 */
export function buildCumulativeTrend(
  timestamps: Date[],
  now: Date = new Date(),
  maxPoints = 12,
): number[] | null {
  if (timestamps.length === 0) return null;

  const sorted = [...timestamps]
    .map((t) => (t instanceof Date ? t : new Date(t)))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (sorted.length === 0) return null;

  const first = sorted[0];
  if (!first) return null;
  // Month starts from the month of the first event (inclusive) through current month.
  const startYear = first.getUTCFullYear();
  const startMonth = first.getUTCMonth();
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth();

  const monthEnds: Date[] = [];
  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    // Last ms of month m
    monthEnds.push(new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)));
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  if (monthEnds.length === 0) return null;

  // Keep the most recent maxPoints months of real span (never fabricate earlier zeros).
  const window = monthEnds.slice(-maxPoints);
  const series = window.map((end) => sorted.filter((t) => t.getTime() <= end.getTime()).length);

  // If every point is identical and we only have one calendar month of data, still return it.
  return series.length > 0 ? series : null;
}

function pickMainQuota(
  quotas: (typeof schema.planQuotas.$inferSelect)[],
): (typeof schema.planQuotas.$inferSelect) | null {
  if (quotas.length === 0) return null;
  const ranked = [...quotas].sort((a, b) => {
    const ra = QUOTA_PERIOD_RANK[a.period] ?? 100;
    const rb = QUOTA_PERIOD_RANK[b.period] ?? 100;
    if (ra !== rb) return ra - rb;
    // Prefer rows with a documented amount.
    const aa = asNumber(a.amount) != null ? 0 : 1;
    const ba = asNumber(b.amount) != null ? 0 : 1;
    if (aa !== ba) return aa - ba;
    return a.name.localeCompare(b.name);
  });
  return ranked[0] ?? null;
}

function normalizeAxis(
  raw: string,
):
  | "capability"
  | "cost"
  | "personalScore"
  | "coding"
  | "speed"
  | "context"
  | "value" {
  if (raw === "price") return "cost";
  if (raw === "personal-score") return "personalScore";
  if (
    raw === "capability" ||
    raw === "cost" ||
    raw === "personalScore" ||
    raw === "coding" ||
    raw === "speed" ||
    raw === "context" ||
    raw === "value"
  ) {
    return raw;
  }
  throw new ModelServiceError("VALIDATION_ERROR", `Unsupported scatter axis: ${raw}`, 400, {
    axis: [`Unsupported: ${raw}`],
  });
}

// ── Summary ────────────────────────────────────────────────────

export async function getOverviewSummary(db: Db): Promise<OverviewSummary> {
  const [models, providers, plans] = await Promise.all([
    db
      .select({
        id: schema.models.id,
        createdAt: schema.models.createdAt,
        needsReview: schema.models.needsReview,
        status: schema.models.status,
      })
      .from(schema.models)
      .where(eq(schema.models.status, "active")),
    db
      .select({
        id: schema.accessProviders.id,
        createdAt: schema.accessProviders.createdAt,
        status: schema.accessProviders.status,
      })
      .from(schema.accessProviders),
    db
      .select({
        id: schema.plans.id,
        createdAt: schema.plans.createdAt,
        status: schema.plans.status,
        regularPrice: schema.plans.regularPrice,
        actualPrice: schema.plans.actualPrice,
        billingPeriod: schema.plans.billingPeriod,
        billingInterval: schema.plans.billingInterval,
        currency: schema.plans.currency,
      })
      .from(schema.plans)
      .where(eq(schema.plans.status, "active")),
  ]);

  const activeModels = models;
  const needsReviewModels = models.filter((m) => m.needsReview);
  const activeProviders = providers.filter((p) => p.status === "active");

  const paid = plans
    .map((p) => ({
      ...p,
      monthly: monthlyFromPlan(p),
    }))
    .filter((p) => isPaidMonthly(p.monthly));

  let monthlyTotal = 0;
  let currency: string | null = null;
  for (const p of paid) {
    monthlyTotal += p.monthly ?? 0;
    if (p.currency) currency = p.currency;
  }
  if (paid.length === 0) monthlyTotal = 0;

  return {
    activeModels: {
      value: activeModels.length,
      trend: buildCumulativeTrend(activeModels.map((m) => m.createdAt)),
    },
    providers: {
      value: providers.length,
      active: activeProviders.length,
      trend: buildCumulativeTrend(providers.map((p) => p.createdAt)),
    },
    paidPlans: {
      value: paid.length,
      monthlyTotal: paid.length > 0 ? monthlyTotal : null,
      currency,
      trend: buildCumulativeTrend(paid.map((p) => p.createdAt)),
      subtitle:
        paid.length > 0 && currency
          ? `${currency} ${monthlyTotal.toFixed(monthlyTotal % 1 === 0 ? 0 : 2)} / month`
          : paid.length > 0
            ? `${monthlyTotal.toFixed(monthlyTotal % 1 === 0 ? 0 : 2)} / month`
            : null,
    },
    needsReview: {
      value: needsReviewModels.length,
      trend: buildCumulativeTrend(needsReviewModels.map((m) => m.createdAt)),
      subtitle: "Models",
    },
  };
}

// ── Access cards ───────────────────────────────────────────────

export async function getOverviewAccess(db: Db): Promise<OverviewAccessCard[]> {
  const accessRows = await db
    .select({
      planId: schema.plans.id,
      planName: schema.plans.name,
      planSlug: schema.plans.slug,
      planStatus: schema.plans.status,
      regularPrice: schema.plans.regularPrice,
      actualPrice: schema.plans.actualPrice,
      billingPeriod: schema.plans.billingPeriod,
      billingInterval: schema.plans.billingInterval,
      currency: schema.plans.currency,
      accessType: schema.plans.accessType,
      providerId: schema.accessProviders.id,
      providerName: schema.accessProviders.name,
      providerSlug: schema.accessProviders.slug,
      logoUrl: schema.accessProviders.logoUrl,
      colour: schema.accessProviders.colour,
      accessId: schema.modelAccess.id,
    })
    .from(schema.modelAccess)
    .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(
      and(eq(schema.modelAccess.status, "active"), eq(schema.plans.status, "active")),
    );

  const byPlan = new Map<
    string,
    {
      planId: string;
      planName: string;
      planSlug: string;
      status: string;
      regularPrice: string | null;
      actualPrice: string | null;
      billingPeriod: string | null;
      billingInterval: string | null;
      currency: string | null;
      accessType: (typeof schema.plans.$inferSelect)["accessType"];
      providerId: string;
      providerName: string;
      providerSlug: string;
      logoUrl: string | null;
      colour: string | null;
      modelAccessCount: number;
    }
  >();

  for (const row of accessRows) {
    const existing = byPlan.get(row.planId);
    if (existing) {
      existing.modelAccessCount += 1;
    } else {
      byPlan.set(row.planId, {
        planId: row.planId,
        planName: row.planName,
        planSlug: row.planSlug,
        status: row.planStatus,
        regularPrice: row.regularPrice,
        actualPrice: row.actualPrice,
        billingPeriod: row.billingPeriod,
        billingInterval: row.billingInterval,
        currency: row.currency,
        accessType: row.accessType,
        providerId: row.providerId,
        providerName: row.providerName,
        providerSlug: row.providerSlug,
        logoUrl: row.logoUrl,
        colour: row.colour,
        modelAccessCount: 1,
      });
    }
  }

  const planIds = [...byPlan.keys()];
  const quotas =
    planIds.length === 0
      ? []
      : await db
          .select()
          .from(schema.planQuotas)
          .where(inArray(schema.planQuotas.planId, planIds));

  const quotasByPlan = new Map<string, (typeof schema.planQuotas.$inferSelect)[]>();
  for (const q of quotas) {
    const list = quotasByPlan.get(q.planId) ?? [];
    list.push(q);
    quotasByPlan.set(q.planId, list);
  }

  const cards: OverviewAccessCard[] = [...byPlan.values()]
    .map((p) => {
      const main = pickMainQuota(quotasByPlan.get(p.planId) ?? []);
      return {
        planId: p.planId,
        planName: p.planName,
        planSlug: p.planSlug,
        status: p.status,
        monthlyCost: monthlyFromPlan(p),
        currency: p.currency,
        availableModels: p.modelAccessCount,
        provider: {
          id: p.providerId,
          name: p.providerName,
          slug: p.providerSlug,
          logoUrl: p.logoUrl,
          colour: p.colour,
        },
        mainQuota: main
          ? {
              id: main.id,
              name: main.name,
              amount: asNumber(main.amount),
              remainingAmount: asNumber(main.remainingAmount),
              unit: main.unit,
              period: main.period,
              resetsAt: toDateString(main.resetsAt),
              resetBehaviour: main.resetBehaviour ?? null,
              isUnlimited: main.isUnlimited,
            }
          : null,
        accessType: p.accessType ?? null,
      } satisfies OverviewAccessCard;
    })
    .sort((a, b) => {
      // Paid first, then by model count desc, then name.
      const ap = isPaidMonthly(a.monthlyCost) ? 0 : 1;
      const bp = isPaidMonthly(b.monthlyCost) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (a.availableModels !== b.availableModels) return b.availableModels - a.availableModels;
      return a.planName.localeCompare(b.planName);
    });

  return cards;
}

// ── Skill leaders ──────────────────────────────────────────────

export async function getOverviewSkillLeaders(db: Db): Promise<OverviewSkillCategory[]> {
  const categories: OverviewSkillCategory[] = [];

  for (const cat of SKILL_LEADER_CATEGORIES) {
    if (cat.skillSlug == null) {
      const board = await getLeaderboard(db, { type: "combined" });
      categories.push({
        key: cat.key,
        label: cat.label,
        skillId: null,
        skillSlug: null,
        profileId: board.profile?.id ?? null,
        profileSlug: board.profile?.slug ?? null,
        leaders: board.data.slice(0, 3).map((e) => ({
          rank: e.rank,
          model: e.model,
          personalScore: e.personalScore,
          externalScore: e.externalScore,
          overallScore: e.overallScore,
          scoreBasis: e.scoreBasis,
          pinned: e.pinned,
          rankOverride: e.rankOverride,
        })),
      });
      continue;
    }

    const board = await getLeaderboard(db, {
      skillId: cat.skillSlug,
      type: "combined",
    });
    categories.push({
      key: cat.key,
      label: cat.label,
      skillId: board.skill?.id ?? null,
      skillSlug: board.skill?.slug ?? cat.skillSlug,
      profileId: null,
      profileSlug: null,
      leaders: board.data.slice(0, 3).map((e) => ({
        rank: e.rank,
        model: e.model,
        personalScore: e.personalScore,
        externalScore: e.externalScore,
        overallScore: e.overallScore,
        scoreBasis: e.scoreBasis,
        pinned: e.pinned,
        rankOverride: e.rankOverride,
      })),
    });
  }

  return categories;
}

// ── Provider distribution ──────────────────────────────────────

export async function getOverviewProviderDistribution(
  db: Db,
): Promise<OverviewProviderDistributionItem[]> {
  const rows = await db
    .select({
      providerId: schema.accessProviders.id,
      providerName: schema.accessProviders.name,
      providerSlug: schema.accessProviders.slug,
      logoUrl: schema.accessProviders.logoUrl,
      colour: schema.accessProviders.colour,
      modelCount: sql<number>`count(${schema.modelAccess.id})::int`,
    })
    .from(schema.modelAccess)
    .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(eq(schema.modelAccess.status, "active"))
    .groupBy(
      schema.accessProviders.id,
      schema.accessProviders.name,
      schema.accessProviders.slug,
      schema.accessProviders.logoUrl,
      schema.accessProviders.colour,
    )
    .orderBy(desc(sql`count(${schema.modelAccess.id})`), asc(schema.accessProviders.name));

  return rows.map((r) => ({
    providerId: r.providerId,
    providerName: r.providerName,
    providerSlug: r.providerSlug,
    logoUrl: r.logoUrl ?? null,
    colour: r.colour ?? null,
    modelCount: Number(r.modelCount) || 0,
  }));
}

// ── Scatter ────────────────────────────────────────────────────

export async function getOverviewScatter(
  db: Db,
  rawQuery: unknown,
): Promise<{
  x: string;
  y: string;
  points: OverviewScatterPoint[];
}> {
  const parsed = overviewScatterQuerySchema.parse(rawQuery ?? {});
  const xAxis = normalizeAxis(parsed.x);
  const yAxis = normalizeAxis(parsed.y);

  const models = await db
    .select({
      id: schema.models.id,
      name: schema.models.name,
      slug: schema.models.slug,
      modelType: schema.models.modelType,
      contextTokens: schema.models.contextTokens,
      status: schema.models.status,
    })
    .from(schema.models)
    .where(eq(schema.models.status, "active"));

  const modelIds = models.map((m) => m.id);

  // Ratings we may need
  const skillSlugsNeeded = new Set<string>();
  for (const axis of [xAxis, yAxis]) {
    if (axis === "coding") skillSlugsNeeded.add("coding");
    if (axis === "speed") skillSlugsNeeded.add("speed");
    if (axis === "value") skillSlugsNeeded.add("value");
    if (axis === "capability") {
      skillSlugsNeeded.add("general-capability");
      skillSlugsNeeded.add("coding");
    }
  }

  const skills =
    skillSlugsNeeded.size === 0
      ? []
      : await db
          .select()
          .from(schema.skills)
          .where(inArray(schema.skills.slug, [...skillSlugsNeeded]));
  const skillBySlug = new Map(skills.map((s) => [s.slug, s]));

  const skillIds = skills.map((s) => s.id);
  const ratings =
    skillIds.length === 0 || modelIds.length === 0
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

  const ratingsByModelSkill = new Map<string, (typeof ratings)[number]>();
  for (const r of ratings) {
    ratingsByModelSkill.set(`${r.modelId}:${r.skillId}`, r);
  }

  // Access + pricing + filters
  const accessRows =
    modelIds.length === 0
      ? []
      : await db
          .select({
            modelId: schema.modelAccess.modelId,
            accessId: schema.modelAccess.id,
            planId: schema.plans.id,
            planSlug: schema.plans.slug,
            accessType: schema.plans.accessType,
            providerId: schema.accessProviders.id,
            providerName: schema.accessProviders.name,
            providerSlug: schema.accessProviders.slug,
            isPreferred: schema.modelAccess.isPreferred,
            inputPerMillion: schema.modelAccessPricing.inputPerMillion,
          })
          .from(schema.modelAccess)
          .innerJoin(schema.plans, eq(schema.modelAccess.planId, schema.plans.id))
          .innerJoin(
            schema.accessProviders,
            eq(schema.plans.accessProviderId, schema.accessProviders.id),
          )
          .leftJoin(
            schema.modelAccessPricing,
            eq(schema.modelAccessPricing.modelAccessId, schema.modelAccess.id),
          )
          .where(
            and(
              eq(schema.modelAccess.status, "active"),
              inArray(schema.modelAccess.modelId, modelIds),
            ),
          );

  type AccessInfo = {
    providerId: string;
    providerName: string;
    providerSlug: string;
    planId: string;
    planSlug: string;
    accessType: (typeof schema.plans.$inferSelect)["accessType"];
    cost: number | null;
  };

  const accessByModel = new Map<string, AccessInfo[]>();
  for (const row of accessRows) {
    const cost = asNumber(row.inputPerMillion);
    const list = accessByModel.get(row.modelId) ?? [];
    list.push({
      providerId: row.providerId,
      providerName: row.providerName,
      providerSlug: row.providerSlug,
      planId: row.planId,
      planSlug: row.planSlug,
      accessType: row.accessType,
      cost,
    });
    accessByModel.set(row.modelId, list);
  }

  // Personal scores (any skill) — use mean of non-null personal scores when axis is personalScore
  const personalRatings =
    (xAxis === "personalScore" || yAxis === "personalScore") && modelIds.length > 0
      ? await db
          .select({
            modelId: schema.modelSkillRatings.modelId,
            personalScore: schema.modelSkillRatings.personalScore,
          })
          .from(schema.modelSkillRatings)
          .where(
            and(
              eq(schema.modelSkillRatings.hidden, false),
              sql`${schema.modelSkillRatings.personalScore} IS NOT NULL`,
            ),
          )
      : [];

  const personalByModel = new Map<string, number[]>();
  for (const r of personalRatings) {
    const n = asNumber(r.personalScore);
    if (n == null) continue;
    const list = personalByModel.get(r.modelId) ?? [];
    list.push(n);
    personalByModel.set(r.modelId, list);
  }

  // Capability: prefer general-capability external, else coding external (never fabricate 0)
  function skillExternal(modelId: string, slug: string): number | null {
    const skill = skillBySlug.get(slug);
    if (!skill) return null;
    const r = ratingsByModelSkill.get(`${modelId}:${skill.id}`);
    return asNumber(r?.externalScore ?? null);
  }

  function axisValue(modelId: string, axis: ReturnType<typeof normalizeAxis>): number | null {
    switch (axis) {
      case "capability": {
        const g = skillExternal(modelId, "general-capability");
        if (g != null) return g;
        return skillExternal(modelId, "coding");
      }
      case "coding":
        return skillExternal(modelId, "coding");
      case "speed":
        return skillExternal(modelId, "speed");
      case "value":
        return skillExternal(modelId, "value");
      case "context": {
        const m = models.find((row) => row.id === modelId);
        return m?.contextTokens != null ? Number(m.contextTokens) : null;
      }
      case "personalScore": {
        const scores = personalByModel.get(modelId);
        if (!scores || scores.length === 0) return null;
        return scores.reduce((a, b) => a + b, 0) / scores.length;
      }
      case "cost": {
        const accesses = accessByModel.get(modelId) ?? [];
        const costs = accesses.map((a) => a.cost).filter((c): c is number => c != null);
        if (costs.length === 0) return null;
        return Math.min(...costs);
      }
      default:
        return null;
    }
  }

  function passesFilters(modelId: string, modelType: string | null): boolean {
    const accesses = accessByModel.get(modelId) ?? [];

    if (parsed.providerId) {
      if (!accesses.some((a) => a.providerId === parsed.providerId)) return false;
    } else if (parsed.provider) {
      const p = parsed.provider.toLowerCase();
      if (
        !accesses.some(
          (a) => a.providerSlug.toLowerCase() === p || a.providerName.toLowerCase() === p,
        )
      ) {
        return false;
      }
    }

    if (parsed.planId) {
      if (!accesses.some((a) => a.planId === parsed.planId)) return false;
    } else if (parsed.plan) {
      const p = parsed.plan.toLowerCase();
      if (!accesses.some((a) => a.planSlug.toLowerCase() === p)) return false;
    }

    if (parsed.accessType) {
      if (!accesses.some((a) => a.accessType === parsed.accessType)) return false;
    }

    if (parsed.modelType) {
      if (!modelType || modelType.toLowerCase() !== parsed.modelType.toLowerCase()) {
        return false;
      }
    }

    return true;
  }

  const points: OverviewScatterPoint[] = [];
  for (const m of models) {
    if (!passesFilters(m.id, m.modelType)) continue;
    const xv = axisValue(m.id, xAxis);
    const yv = axisValue(m.id, yAxis);
    // Missing either axis → omit (never plot at zero)
    if (xv == null || yv == null) continue;

    const accesses = accessByModel.get(m.id) ?? [];
    const primary = accesses[0] ?? null;

    points.push({
      modelId: m.id,
      modelName: m.name,
      modelSlug: m.slug,
      x: xv,
      y: yv,
      provider: primary
        ? {
            id: primary.providerId,
            name: primary.providerName,
            slug: primary.providerSlug,
          }
        : null,
      modelType: m.modelType ?? null,
    });
  }

  points.sort((a, b) => a.modelName.localeCompare(b.modelName));

  return {
    x: xAxis === "personalScore" ? "personalScore" : xAxis,
    y: yAxis === "personalScore" ? "personalScore" : yAxis,
    points,
  };
}

// ── Quotas ─────────────────────────────────────────────────────

export async function getOverviewQuotas(db: Db): Promise<OverviewQuotaItem[]> {
  const rows = await db
    .select({
      quota: schema.planQuotas,
      planId: schema.plans.id,
      planName: schema.plans.name,
      planSlug: schema.plans.slug,
      planStatus: schema.plans.status,
      providerId: schema.accessProviders.id,
      providerName: schema.accessProviders.name,
      providerSlug: schema.accessProviders.slug,
      logoUrl: schema.accessProviders.logoUrl,
      colour: schema.accessProviders.colour,
    })
    .from(schema.planQuotas)
    .innerJoin(schema.plans, eq(schema.planQuotas.planId, schema.plans.id))
    .innerJoin(
      schema.accessProviders,
      eq(schema.plans.accessProviderId, schema.accessProviders.id),
    )
    .where(eq(schema.plans.status, "active"))
    .orderBy(asc(schema.accessProviders.name), asc(schema.plans.name), asc(schema.planQuotas.name));

  const byPlan = new Map<string, OverviewQuotaItem>();
  for (const row of rows) {
    const q = row.quota;
    let item = byPlan.get(row.planId);
    if (!item) {
      item = {
        planId: row.planId,
        planName: row.planName,
        planSlug: row.planSlug,
        provider: {
          id: row.providerId,
          name: row.providerName,
          slug: row.providerSlug,
          logoUrl: row.logoUrl ?? null,
          colour: row.colour ?? null,
        },
        quotas: [],
      };
      byPlan.set(row.planId, item);
    }
    item.quotas.push({
      id: q.id,
      name: q.name,
      amount: asNumber(q.amount),
      amountMin: asNumber(q.amountMin),
      amountMax: asNumber(q.amountMax),
      remainingAmount: asNumber(q.remainingAmount),
      remainingUpdatedAt: toIso(q.remainingUpdatedAt),
      unit: q.unit,
      customUnit: q.customUnit ?? null,
      period: q.period,
      resetsAt: toDateString(q.resetsAt),
      resetBehaviour: q.resetBehaviour ?? null,
      isUnlimited: q.isUnlimited,
    });
  }

  return [...byPlan.values()];
}

// ── Recent activity ────────────────────────────────────────────

export async function getOverviewRecent(
  db: Db,
  rawQuery: unknown = {},
): Promise<OverviewRecentItem[]> {
  const { limit } = overviewRecentQuerySchema.parse(rawQuery ?? {});
  // Fetch a bit more than limit from each source, then merge.
  const take = Math.min(Math.max(limit * 2, limit), 100);

  const [models, providers, plans, quotas, ratings] = await Promise.all([
    db
      .select({
        id: schema.models.id,
        name: schema.models.name,
        slug: schema.models.slug,
        updatedAt: schema.models.updatedAt,
      })
      .from(schema.models)
      .orderBy(desc(schema.models.updatedAt))
      .limit(take),
    db
      .select({
        id: schema.accessProviders.id,
        name: schema.accessProviders.name,
        slug: schema.accessProviders.slug,
        updatedAt: schema.accessProviders.updatedAt,
      })
      .from(schema.accessProviders)
      .orderBy(desc(schema.accessProviders.updatedAt))
      .limit(take),
    db
      .select({
        id: schema.plans.id,
        name: schema.plans.name,
        slug: schema.plans.slug,
        updatedAt: schema.plans.updatedAt,
      })
      .from(schema.plans)
      .orderBy(desc(schema.plans.updatedAt))
      .limit(take),
    db
      .select({
        id: schema.planQuotas.id,
        name: schema.planQuotas.name,
        planId: schema.planQuotas.planId,
        planName: schema.plans.name,
        updatedAt: schema.planQuotas.updatedAt,
      })
      .from(schema.planQuotas)
      .innerJoin(schema.plans, eq(schema.planQuotas.planId, schema.plans.id))
      .orderBy(desc(schema.planQuotas.updatedAt))
      .limit(take),
    db
      .select({
        id: schema.modelSkillRatings.id,
        modelId: schema.modelSkillRatings.modelId,
        modelName: schema.models.name,
        skillName: schema.skills.name,
        skillSlug: schema.skills.slug,
        updatedAt: schema.modelSkillRatings.updatedAt,
      })
      .from(schema.modelSkillRatings)
      .innerJoin(schema.models, eq(schema.modelSkillRatings.modelId, schema.models.id))
      .innerJoin(schema.skills, eq(schema.modelSkillRatings.skillId, schema.skills.id))
      .orderBy(desc(schema.modelSkillRatings.updatedAt))
      .limit(take),
  ]);

  const items: OverviewRecentItem[] = [];

  for (const m of models) {
    items.push({
      entityType: "model",
      entityId: m.id,
      title: m.name,
      subtitle: "Model updated",
      updatedAt: m.updatedAt.toISOString(),
      meta: { slug: m.slug },
    });
  }
  for (const p of providers) {
    items.push({
      entityType: "provider",
      entityId: p.id,
      title: p.name,
      subtitle: "Provider updated",
      updatedAt: p.updatedAt.toISOString(),
      meta: { slug: p.slug },
    });
  }
  for (const p of plans) {
    items.push({
      entityType: "plan",
      entityId: p.id,
      title: p.name,
      subtitle: "Plan updated",
      updatedAt: p.updatedAt.toISOString(),
      meta: { slug: p.slug },
    });
  }
  for (const q of quotas) {
    items.push({
      entityType: "quota",
      entityId: q.id,
      title: q.planName,
      subtitle: `Updated quota: ${q.name}`,
      updatedAt: q.updatedAt.toISOString(),
      meta: { planId: q.planId, quotaName: q.name },
    });
  }
  for (const r of ratings) {
    items.push({
      entityType: "rating",
      entityId: r.id,
      title: r.modelName,
      subtitle: `Updated rating: ${r.skillName}`,
      updatedAt: r.updatedAt.toISOString(),
      meta: { modelId: r.modelId, skillSlug: r.skillSlug },
    });
  }

  items.sort((a, b) => {
    const tb = new Date(b.updatedAt).getTime();
    const ta = new Date(a.updatedAt).getTime();
    if (tb !== ta) return tb - ta;
    return a.title.localeCompare(b.title);
  });

  return items.slice(0, limit);
}
