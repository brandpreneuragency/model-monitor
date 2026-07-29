/**
 * Integration coverage for model-forms service contracts:
 * - name-only model create
 * - personal rating upsert leaves external_score unchanged
 * - provider / plan / quota happy-path creates
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index";
import {
  createModel,
  createAccessProvider,
  createPlan,
  createPlanQuota,
  upsertModelSkillRating,
} from "./index";

function resolveUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  return "postgresql://modelmonitor:modelmonitor@127.0.0.1:5433/modelmonitor_test";
}

const client = postgres(resolveUrl(), { max: 5 });
const db = drizzle(client, { schema });

const PREFIX = "mmtest:forms:";
const createdModelIds: string[] = [];
const createdProviderIds: string[] = [];
const createdPlanIds: string[] = [];
const createdSkillIds: string[] = [];

beforeAll(async () => {
  // touch DB
  await client`SELECT 1`;
});

afterAll(async () => {
  for (const id of createdModelIds) {
    await client`DELETE FROM models WHERE id = ${id}::uuid`;
  }
  for (const id of createdPlanIds) {
    await client`DELETE FROM plans WHERE id = ${id}::uuid`;
  }
  for (const id of createdProviderIds) {
    await client`DELETE FROM access_providers WHERE id = ${id}::uuid`;
  }
  for (const id of createdSkillIds) {
    await client`DELETE FROM skills WHERE id = ${id}::uuid`;
  }
  await client`DELETE FROM models WHERE slug LIKE ${PREFIX + "%"}`;
  await client`DELETE FROM access_providers WHERE slug LIKE ${PREFIX + "%"}`;
  await client`DELETE FROM skills WHERE slug LIKE ${PREFIX + "%"}`;
  await client.end({ timeout: 5 });
});

describe("forms integration — name-only create", () => {
  it("createModel accepts only { name }", async () => {
    const model = await createModel(db, { name: `${PREFIX}name-only` }, {});
    createdModelIds.push(model.id);
    expect(model.name).toBe(`${PREFIX}name-only`);
    expect(model.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("forms integration — rate leaves external_score unchanged", () => {
  it("upsertModelSkillRating personal fields do not alter externalScore", async () => {
    const model = await createModel(db, { name: `${PREFIX}rate-model` }, {});
    createdModelIds.push(model.id);

    const slug = `${PREFIX}rate-skill`;
    const [skill] = await db
      .insert(schema.skills)
      .values({
        name: "Forms rate skill",
        slug,
        category: "test",
        sortOrder: 0,
        isDefault: false,
        status: "active",
      })
      .returning({ id: schema.skills.id });
    createdSkillIds.push(skill.id);

    // Seed external score only
    await db.insert(schema.modelSkillRatings).values({
      modelId: model.id,
      skillId: skill.id,
      personalScore: null,
      personalConfidence: null,
      externalScore: "88.25",
      externalRank: 2,
      tested: false,
    });

    const updated = await upsertModelSkillRating(
      db,
      model.id,
      skill.id,
      {
        personalScore: 9,
        personalConfidence: "high",
        testedAt: "2026-07-15",
        notes: "personal only",
        rankOverride: 1,
        tested: true,
        // deliberately omit externalScore
      },
      {},
    );

    expect(updated.personalScore).toBe(9);
    expect(updated.personalConfidence).toBe("high");
    expect(Number(updated.externalScore)).toBeCloseTo(88.25, 2);
    expect(updated.externalRank).toBe(2);

    const [raw] = await client<{ external_score: string | null }[]>`
      SELECT external_score::text AS external_score
      FROM model_skill_ratings
      WHERE model_id = ${model.id}::uuid AND skill_id = ${skill.id}::uuid
    `;
    expect(raw.external_score).toMatch(/^88\.25/);
  });
});

describe("forms integration — provider / plan / quota", () => {
  it("creates provider, plan, and multiple quotas", async () => {
    const provider = await createAccessProvider(
      db,
      {
        name: `${PREFIX}Provider`,
        slug: `${PREFIX}provider`,
        providerType: "api_provider",
        status: "active",
      },
      {},
    );
    createdProviderIds.push(provider.id);
    expect(provider.name).toContain("Provider");

    const plan = await createPlan(
      db,
      {
        accessProviderId: provider.id,
        name: `${PREFIX}Plan`,
        slug: `${PREFIX}plan`,
        accessType: "subscription",
        regularPrice: 20,
        billingPeriod: "monthly",
      },
      {},
    );
    createdPlanIds.push(plan.id);

    const q1 = await createPlanQuota(
      db,
      plan.id,
      {
        name: "Messages",
        unit: "requests",
        period: "weekly",
        amountMin: 50,
        amountMax: 500,
      },
      {},
    );
    const q2 = await createPlanQuota(
      db,
      plan.id,
      {
        name: "Custom credits",
        unit: "custom",
        customUnit: "spark_units",
        period: "custom",
        resetBehaviour: "manual top-up",
        amount: 1000,
      },
      {},
    );

    expect(q1.amountMin).toBe(50);
    expect(q1.amountMax).toBe(500);
    expect(q2.customUnit).toBe("spark_units");
    expect(q2.period).toBe("custom");

    const quotas = await db
      .select({ id: schema.planQuotas.id })
      .from(schema.planQuotas)
      .where(eq(schema.planQuotas.planId, plan.id));
    expect(quotas.length).toBeGreaterThanOrEqual(2);
  });
});
