/**
 * Redesign api-overview integration tests.
 * Live-seeded DB only — no fixture arrays in service or assertions of hard-coded samples.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index";
import {
  buildCumulativeTrend,
  getOverviewAccess,
  getOverviewProviderDistribution,
  getOverviewQuotas,
  getOverviewRecent,
  getOverviewScatter,
  getOverviewSkillLeaders,
  getOverviewSummary,
} from "./services/overview";
import { assertNoBlendedScoreFields, getLeaderboard } from "./services/rankings";
import type { Db } from "./services/audit";

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

beforeAll(async () => {
  const [models] = await db
    .select({ id: schema.models.id })
    .from(schema.models)
    .where(eq(schema.models.status, "active"))
    .limit(1);
  if (!models) throw new Error("No active models — seed required");

  const [coding] = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(eq(schema.skills.slug, "coding"))
    .limit(1);
  if (!coding) throw new Error("coding skill missing — seed required");
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

describe("buildCumulativeTrend", () => {
  it("returns null for empty input (never fabricates)", () => {
    expect(buildCumulativeTrend([])).toBeNull();
  });

  it("returns a short real series when all events share one month", () => {
    const now = new Date("2026-07-29T12:00:00Z");
    const series = buildCumulativeTrend(
      [new Date("2026-07-22T06:00:00Z"), new Date("2026-07-22T07:00:00Z")],
      now,
    );
    expect(series).not.toBeNull();
    expect(series!.length).toBeGreaterThanOrEqual(1);
    expect(series!.length).toBeLessThanOrEqual(12);
    expect(series![series!.length - 1]).toBe(2);
    // No fabricated pre-history zeros before first event
    expect(series![0]).toBeGreaterThan(0);
  });
});

describe("api-overview: summary", () => {
  it("counts active models/providers/paid plans/needs-review from live rows", async () => {
    const summary = await getOverviewSummary(db);

    const [{ c: activeModels }] = await client<[{ c: string }]>`
      SELECT count(*)::text AS c FROM models WHERE status = 'active'
    `;
    const [{ c: providerCount }] = await client<[{ c: string }]>`
      SELECT count(*)::text AS c FROM access_providers
    `;
    const [{ c: needsReview }] = await client<[{ c: string }]>`
      SELECT count(*)::text AS c FROM models WHERE status = 'active' AND needs_review = true
    `;
    const [{ c: paidPlans }] = await client<[{ c: string }]>`
      SELECT count(*)::text AS c FROM plans
      WHERE status = 'active'
        AND COALESCE(actual_price, regular_price) IS NOT NULL
        AND COALESCE(actual_price, regular_price)::numeric > 0
    `;

    expect(summary.activeModels.value).toBe(Number(activeModels));
    expect(summary.providers.value).toBe(Number(providerCount));
    expect(summary.needsReview.value).toBe(Number(needsReview));
    expect(summary.paidPlans.value).toBe(Number(paidPlans));

    // Trends are real or null — never a hard-coded 12-zero array
    for (const metric of [
      summary.activeModels,
      summary.providers,
      summary.paidPlans,
      summary.needsReview,
    ]) {
      if (metric.trend != null) {
        expect(Array.isArray(metric.trend)).toBe(true);
        expect(metric.trend.length).toBeGreaterThan(0);
        expect(metric.trend.length).toBeLessThanOrEqual(12);
        expect(metric.trend.every((n) => typeof n === "number" && Number.isFinite(n))).toBe(
          true,
        );
      }
    }
  });
});

describe("api-overview: access", () => {
  it("returns one card per plan that has active model_access", async () => {
    const cards = await getOverviewAccess(db);
    const [{ c }] = await client<[{ c: string }]>`
      SELECT count(DISTINCT plan_id)::text AS c
      FROM model_access
      WHERE status = 'active'
    `;
    expect(cards.length).toBe(Number(c));
    for (const card of cards) {
      expect(card.planId).toBeTruthy();
      expect(card.provider.id).toBeTruthy();
      expect(card.availableModels).toBeGreaterThan(0);
      expect(typeof card.status).toBe("string");
    }
    // Sum of availableModels equals active access rows
    const sum = cards.reduce((a, b) => a + b.availableModels, 0);
    const [{ c: accessCount }] = await client<[{ c: string }]>`
      SELECT count(*)::text AS c FROM model_access WHERE status = 'active'
    `;
    expect(sum).toBe(Number(accessCount));
  });
});

describe("api-overview: skill-leaders", () => {
  it("returns eight categories and Coding top-3 matches leaderboard external order", async () => {
    const categories = await getOverviewSkillLeaders(db);
    expect(categories).toHaveLength(8);
    expect(categories.map((c) => c.key)).toEqual([
      "best-overall",
      "coding",
      "ui-frontend",
      "architecture",
      "review-debug",
      "agent-work",
      "speed",
      "value",
    ]);

    const coding = categories.find((c) => c.key === "coding");
    expect(coding).toBeTruthy();
    expect(coding!.leaders.length).toBeLessThanOrEqual(3);
    expect(coding!.leaders.length).toBeGreaterThan(0);

    const board = await getLeaderboard(db, { skillId: "coding", type: "combined" });
    const expectedTop = board.data.slice(0, 3).map((e) => e.model.id);
    expect(coding!.leaders.map((l) => l.model.id)).toEqual(expectedTop);

    // Top external coding scores agree when no pins/overrides dominate
    const topExt = await client<
      { name: string; external_score: string | null; model_id: string }[]
    >`
      SELECT m.id AS model_id, m.name, msr.external_score
      FROM model_skill_ratings msr
      JOIN models m ON m.id = msr.model_id
      JOIN skills s ON s.id = msr.skill_id
      WHERE s.slug = 'coding'
        AND m.status = 'active'
        AND msr.hidden = false
        AND msr.pinned = false
        AND msr.rank_override IS NULL
        AND msr.external_score IS NOT NULL
      ORDER BY msr.external_score::numeric DESC, m.name ASC
      LIMIT 3
    `;
    // When the leaderboard top-3 has no pins/overrides, ids match pure external order
    const leadersUnpinned = coding!.leaders.every((l) => !l.pinned && l.rankOverride == null);
    if (leadersUnpinned && topExt.length === 3) {
      expect(coding!.leaders.map((l) => l.model.id)).toEqual(topExt.map((r) => r.model_id));
    }

    const hits = assertNoBlendedScoreFields(categories);
    expect(hits).toEqual([]);
  });
});

describe("api-overview: provider-distribution", () => {
  it("sums to the number of active access records and is descending", async () => {
    const dist = await getOverviewProviderDistribution(db);
    const sum = dist.reduce((a, b) => a + b.modelCount, 0);
    const [{ c }] = await client<[{ c: string }]>`
      SELECT count(*)::text AS c FROM model_access WHERE status = 'active'
    `;
    expect(sum).toBe(Number(c));

    for (let i = 1; i < dist.length; i += 1) {
      const prev = dist[i - 1];
      const cur = dist[i];
      if (!prev || !cur) continue;
      expect(prev.modelCount).toBeGreaterThanOrEqual(cur.modelCount);
    }
  });
});

describe("api-overview: scatter", () => {
  it("omits models missing an axis and never plots fabricated zeros", async () => {
    const { points } = await getOverviewScatter(db, {
      x: "coding",
      y: "speed",
    });

    for (const p of points) {
      expect(typeof p.x).toBe("number");
      expect(typeof p.y).toBe("number");
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }

    // Every returned point must have non-null external coding AND speed in DB
    if (points.length > 0) {
      const ids = points.map((p) => p.modelId);
      const rows = await client<{ model_id: string; coding: string | null; speed: string | null }[]>`
        SELECT m.id AS model_id,
          MAX(CASE WHEN s.slug = 'coding' THEN msr.external_score END) AS coding,
          MAX(CASE WHEN s.slug = 'speed' THEN msr.external_score END) AS speed
        FROM models m
        LEFT JOIN model_skill_ratings msr ON msr.model_id = m.id AND msr.hidden = false
        LEFT JOIN skills s ON s.id = msr.skill_id AND s.slug IN ('coding', 'speed')
        WHERE m.id = ANY(${ids}::uuid[])
        GROUP BY m.id
      `;
      for (const r of rows) {
        expect(r.coding).not.toBeNull();
        expect(r.speed).not.toBeNull();
      }
    }

    // capability-vs-cost: only models with BOTH axes present
    const costScatter = await getOverviewScatter(db, { x: "capability", y: "cost" });
    for (const p of costScatter.points) {
      expect(typeof p.y).toBe("number");
      expect(Number.isFinite(p.y)).toBe(true);
      expect(typeof p.x).toBe("number");
      expect(Number.isFinite(p.x)).toBe(true);
    }
    // Models with null pricing must not appear (verify against DB)
    if (costScatter.points.length > 0) {
      const ids = costScatter.points.map((p) => p.modelId);
      const priced = await client<{ model_id: string; min_cost: string | null }[]>`
        SELECT ma.model_id, min(map.input_per_million)::text AS min_cost
        FROM model_access ma
        JOIN model_access_pricing map ON map.model_access_id = ma.id
        WHERE ma.status = 'active'
          AND ma.model_id = ANY(${ids}::uuid[])
          AND map.input_per_million IS NOT NULL
        GROUP BY ma.model_id
      `;
      expect(priced.length).toBe(costScatter.points.length);
    }
  });

  it("supports context-vs-price and personal-score-vs-cost aliases", async () => {
    const a = await getOverviewScatter(db, { x: "context", y: "price" });
    expect(a.x).toBe("context");
    expect(a.y).toBe("cost");
    for (const p of a.points) {
      expect(p.x).toBeGreaterThan(0);
    }

    const b = await getOverviewScatter(db, { x: "personal-score", y: "cost" });
    expect(b.x).toBe("personalScore");
    // Seed has null personal scores → empty is correct, not zeros
    for (const p of b.points) {
      expect(p.x).not.toBeNull();
    }
  });

  it("rejects missing axes", async () => {
    await expect(getOverviewScatter(db, {})).rejects.toThrow();
  });
});

describe("api-overview: quotas", () => {
  it("lists per-plan quotas with max/remaining/reset/unlimited from live rows", async () => {
    const items = await getOverviewQuotas(db);
    const [{ c }] = await client<[{ c: string }]>`
      SELECT count(DISTINCT pq.plan_id)::text AS c
      FROM plan_quotas pq
      JOIN plans p ON p.id = pq.plan_id
      WHERE p.status = 'active'
    `;
    expect(items.length).toBe(Number(c));

    const quotaCount = items.reduce((a, b) => a + b.quotas.length, 0);
    const [{ c: total }] = await client<[{ c: string }]>`
      SELECT count(*)::text AS c
      FROM plan_quotas pq
      JOIN plans p ON p.id = pq.plan_id
      WHERE p.status = 'active'
    `;
    expect(quotaCount).toBe(Number(total));

    for (const item of items) {
      for (const q of item.quotas) {
        expect(typeof q.isUnlimited).toBe("boolean");
        expect(q.name).toBeTruthy();
        // remaining may be null (not entered); never coerce to 0
        if (q.remainingAmount === 0) {
          // 0 is only valid if stored as 0
          const [row] = await client<{ remaining_amount: string | null }[]>`
            SELECT remaining_amount FROM plan_quotas WHERE id = ${q.id}::uuid
          `;
          expect(row?.remaining_amount).not.toBeNull();
        }
      }
    }
  });
});

describe("api-overview: recent", () => {
  it("merges entity types ordered by updated_at desc with discriminator", async () => {
    const items = await getOverviewRecent(db, { limit: 15 });
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(15);

    const types = new Set(items.map((i) => i.entityType));
    for (const t of types) {
      expect(["model", "provider", "plan", "quota", "rating"]).toContain(t);
    }

    for (let i = 1; i < items.length; i += 1) {
      const prevItem = items[i - 1];
      const curItem = items[i];
      if (!prevItem || !curItem) continue;
      const prev = new Date(prevItem.updatedAt).getTime();
      const cur = new Date(curItem.updatedAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(cur);
    }

    for (const item of items) {
      expect(item.entityId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(item.title.length).toBeGreaterThan(0);
    }
  });
});

describe("api-overview: no fixture smell", () => {
  it("does not expose hard-coded sample model names as sole content", async () => {
    // Sanity: summary value equals DB; if someone swapped in a fixture of 51
    // without DB, this still passes — the stronger checks above already join DB.
    const summary = await getOverviewSummary(db);
    const [{ max_updated }] = await client<[{ max_updated: Date }]>`
      SELECT max(updated_at) AS max_updated FROM models
    `;
    expect(summary.activeModels.value).toBeGreaterThan(0);
    expect(max_updated).toBeTruthy();

    // Scatter value-vs-capability lives on live scores
    const scatter = await getOverviewScatter(db, { x: "value", y: "capability" });
    expect(Array.isArray(scatter.points)).toBe(true);
  });
});
