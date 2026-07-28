/**
 * Redesign api-models integration tests.
 * Covers name-only create, filter groups against 51 seeded models,
 * pagination stability, null-not-zero overall score, scoreBasis=external.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index";
import {
  archiveModel,
  createModel,
  listModels,
  restoreModel,
  type Db,
} from "./services/models";
import { computeWeightedOverall } from "@model-monitor/schemas";
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
const db = drizzle(client, { schema }) as Db;
const createdIds: string[] = [];

beforeAll(async () => {
  const [row] = await db
    .select({ c: schema.models.id })
    .from(schema.models)
    .where(eq(schema.models.status, "active"))
    .limit(1);
  if (!row) throw new Error("No active models — run seed first");
});

afterAll(async () => {
  for (const id of createdIds) {
    await client`DELETE FROM audit_events WHERE entity_type = 'model' AND entity_id = ${id}::uuid`;
    await client`DELETE FROM model_capabilities WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM model_aliases WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM models WHERE id = ${id}::uuid`;
  }
  await client.end({ timeout: 5 });
});

describe("api-models name-only creation", () => {
  it("creates with name alone and returns the model", async () => {
    const created = await createModel(
      db,
      { name: "Test" },
      { requestId: "api-models-name-only" },
    );
    createdIds.push(created.id);

    expect(created.name).toBe("Test");
    expect(created.id).toBeTruthy();
    expect(created.canonicalId).toMatch(/^local:/);
    expect(created.developerId).toBeTruthy();
    expect(created.status).toBe("active");
    expect(created.contextTokens).toBeNull();
  });
});

describe("api-models overall score rules", () => {
  it("returns null overallScore (never 0) and scoreBasis external for seeded models", async () => {
    const listed = await listModels(db, { limit: 51, sort: "name" });
    expect(listed.page.total).toBeGreaterThanOrEqual(51);

    let sawNonNull = 0;
    for (const m of listed.data) {
      expect(m).toHaveProperty("overallScore");
      expect(m).toHaveProperty("scoreBasis");
      // Never coerce missing → 0
      if (m.overallScore === null) {
        expect(m.scoreBasis).toBeNull();
      } else {
        expect(typeof m.overallScore).toBe("number");
        expect(m.overallScore).not.toBe(0); // seeded external scores produce non-zero overall
        expect(m.scoreBasis).toBe("external");
        sawNonNull += 1;
      }
      expect(m.creator).toBeTruthy();
      expect(m.creator?.name).toBeTruthy();
      expect(m).toHaveProperty("preferredAccess");
      expect(m).toHaveProperty("workflowStatus");
      expect(m).toHaveProperty("context");
      expect(m).toHaveProperty("speed");
      expect(m).toHaveProperty("bestSkill");
      expect(m).toHaveProperty("costOrQuota");
      expect(m).toHaveProperty("tags");
      expect(m).toHaveProperty("updatedAt");
    }
    expect(sawNonNull).toBeGreaterThan(0);
  });

  it("computeWeightedOverall returns null when no scores", () => {
    const empty = computeWeightedOverall([
      { weight: 1, personal: null, external: null, skillId: "a" },
    ]);
    expect(empty.overallScore).toBeNull();
    expect(empty.scoreBasis).toBeNull();
  });

  it("computeWeightedOverall prefers personal and labels mixed", () => {
    const mixed = computeWeightedOverall([
      { weight: 1, personal: 8, external: 90, skillId: "a", skillName: "A", skillSlug: "a" },
      { weight: 1, personal: null, external: 80, skillId: "b", skillName: "B", skillSlug: "b" },
    ]);
    expect(mixed.scoreBasis).toBe("mixed");
    expect(mixed.overallScore).toBeCloseTo((8 + 8) / 2, 5);
  });
});

describe("api-models filter groups against seed", () => {
  it("filters by creator (developer slug)", async () => {
    const all = await listModels(db, { creator: "anthropic", limit: 100 });
    expect(all.data.length).toBeGreaterThan(0);
    expect(all.data.every((m) => m.developerSlug === "anthropic")).toBe(true);
    expect(all.page.total).toBe(all.data.length);
  });

  it("filters by access provider", async () => {
    const listed = await listModels(db, { accessProvider: "opencode", limit: 100 });
    expect(listed.data.length).toBeGreaterThan(0);
    for (const m of listed.data) {
      expect(
        m.accessProviders.some((p) => /opencode/i.test(p)) ||
          m.preferredAccess?.providerSlug === "opencode" ||
          /opencode/i.test(m.preferredAccess?.providerName ?? ""),
      ).toBe(true);
    }
  });

  it("filters by plan", async () => {
    const listed = await listModels(db, { plan: "OpenCode Go", limit: 100 });
    expect(listed.data.length).toBeGreaterThan(0);
    // Filter is EXISTS on any active access route; preferred may differ.
    expect(listed.page.total).toBeGreaterThan(0);
  });

  it("filters by access type api", async () => {
    const listed = await listModels(db, { accessType: "api", limit: 100 });
    expect(listed.data.length).toBeGreaterThan(0);
    expect(listed.page.total).toBeGreaterThan(0);
  });

  it("filters by family", async () => {
    const sample = await listModels(db, { limit: 5 });
    const family = sample.data.find((m) => m.family)?.family;
    if (!family) return;
    const listed = await listModels(db, { family, limit: 100 });
    expect(listed.data.length).toBeGreaterThan(0);
    expect(listed.data.every((m) => m.family === family)).toBe(true);
  });

  it("filters by model type substring", async () => {
    const listed = await listModels(db, { modelType: "frontier", limit: 100 });
    expect(listed.data.length).toBeGreaterThan(0);
    expect(listed.data.every((m) => /frontier/i.test(m.modelType ?? ""))).toBe(true);
  });

  it("filters by workflow status", async () => {
    const listed = await listModels(db, { workflowStatus: "active", limit: 100 });
    expect(listed.data.length).toBeGreaterThan(0);
    expect(listed.data.every((m) => m.workflowStatus === "active")).toBe(true);
  });

  it("filters capabilities: vision / reasoning / toolUse / agent / multimodal / longContext / codingSpecialist", async () => {
    const vision = await listModels(db, { vision: true, limit: 100 });
    expect(vision.data.length).toBeGreaterThan(0);
    expect(vision.data.every((m) => m.capabilities?.vision === true)).toBe(true);

    const reasoning = await listModels(db, { reasoning: true, limit: 100 });
    expect(reasoning.data.length).toBeGreaterThan(0);
    expect(reasoning.data.every((m) => m.capabilities?.reasoning === true)).toBe(true);

    const tools = await listModels(db, { toolUse: true, limit: 100 });
    expect(tools.data.length).toBe(3);
    expect(tools.data.every((m) => m.capabilities?.toolUse === true)).toBe(true);

    const agent = await listModels(db, { agent: true, limit: 100 });
    expect(agent.data.length).toBeGreaterThan(0);
    expect(agent.data.every((m) => m.capabilities?.parallelAgents === true)).toBe(true);

    const multi = await listModels(db, { multimodal: true, limit: 100 });
    expect(multi.data.length).toBeGreaterThan(0);

    const longCtx = await listModels(db, { longContext: true, limit: 100 });
    expect(longCtx.page.total).toBe(39);
    expect(longCtx.data.every((m) => (m.contextTokens ?? 0) >= 128_000)).toBe(true);

    const coding = await listModels(db, { codingSpecialist: true, limit: 100 });
    expect(coding.data.length).toBeGreaterThan(0);
  });

  it("filters ratings: skill score range and tested=false", async () => {
    const high = await listModels(db, {
      skill: "coding",
      skillScoreMin: 95,
      limit: 100,
    });
    expect(high.data.length).toBeGreaterThan(0);

    const untested = await listModels(db, { tested: false, limit: 5 });
    expect(untested.page.total).toBeGreaterThanOrEqual(51);
  });

  it("filters cost/quota: api, subscriptionAccess, requestLimited, pricingKnown", async () => {
    const api = await listModels(db, { api: true, limit: 100 });
    expect(api.data.length).toBeGreaterThan(0);

    const sub = await listModels(db, { subscriptionAccess: true, limit: 100 });
    expect(sub.data.length).toBeGreaterThan(0);

    const reqLim = await listModels(db, { requestLimited: true, limit: 100 });
    expect(reqLim.data.length).toBeGreaterThan(0);

    const priced = await listModels(db, { pricingKnown: true, limit: 100 });
    expect(priced.data.length).toBeGreaterThan(0);
  });

  it("filters data maintenance: needsReview, missingQuota, outdated", async () => {
    const review = await listModels(db, { needsReview: true, limit: 100 });
    expect(review.page.total).toBe(21);
    expect(review.data.every((m) => m.needsReview === true)).toBe(true);

    const missingQuota = await listModels(db, { missingQuota: true, limit: 100 });
    // Many models lack plan_quotas on preferred plan
    expect(missingQuota.page.total).toBeGreaterThan(0);

    const outdated = await listModels(db, { outdated: true, limit: 100 });
    expect(outdated.page.total).toBeGreaterThan(0);
  });
});

describe("api-models pagination stability", () => {
  it("pages stably by name without overlap", async () => {
    const page1 = await listModels(db, { sort: "name", limit: 10, page: 1 });
    const page2 = await listModels(db, { sort: "name", limit: 10, page: 2 });
    expect(page1.data).toHaveLength(10);
    expect(page2.data.length).toBeGreaterThan(0);
    const ids1 = new Set(page1.data.map((m) => m.id));
    for (const m of page2.data) {
      expect(ids1.has(m.id)).toBe(false);
    }
    // Cursor path
    expect(page1.page.nextCursor).toBeTruthy();
    const viaCursor = await listModels(db, {
      sort: "name",
      limit: 10,
      cursor: page1.page.nextCursor!,
    });
    expect(viaCursor.data.map((m) => m.id)).toEqual(page2.data.map((m) => m.id));
  });
});

describe("api-models archive restore still works", () => {
  it("archives and restores a name-only model with audit trail", async () => {
    const created = await createModel(db, { name: "Archive Me API" });
    createdIds.push(created.id);
    const archived = await archiveModel(db, created.id, { requestId: "arch" });
    expect(archived.status).toBe("archived");
    const restored = await restoreModel(db, created.id, { requestId: "rest" });
    expect(restored.status).toBe("active");
  });
});
