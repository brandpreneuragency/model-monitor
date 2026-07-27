/**
 * Integration tests for plans/quotas/models schema (migration 0008).
 * Runs against modelmonitor_test only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index";

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
const db = drizzle(client, { schema });

const PREFIX = "mmtest:plans-models:";
let developerId: string | null = null;
let planId: string | null = null;
let providerId: string | null = null;
const modelIds: string[] = [];
const quotaIds: string[] = [];
const accessIds: string[] = [];

beforeAll(async () => {
  const [dev] = await db
    .select({ id: schema.developers.id })
    .from(schema.developers)
    .limit(1);
  if (!dev) throw new Error("No developers — seed required");
  developerId = dev.id;

  const [provider] = await db
    .select({ id: schema.accessProviders.id })
    .from(schema.accessProviders)
    .limit(1);
  if (!provider) throw new Error("No access_providers — seed required");
  providerId = provider.id;

  const [plan] = await db
    .insert(schema.plans)
    .values({
      accessProviderId: providerId,
      name: `${PREFIX}plan`,
      slug: `${PREFIX}plan`,
      billingPeriod: "monthly",
      autoRenews: true,
      actualPrice: "9.9900",
      accessType: "subscription",
    })
    .returning({ id: schema.plans.id });
  planId = plan.id;
});

afterAll(async () => {
  for (const id of accessIds) {
    await client`DELETE FROM model_access WHERE id = ${id}::uuid`;
  }
  for (const id of quotaIds) {
    await client`DELETE FROM plan_quotas WHERE id = ${id}::uuid`;
  }
  for (const id of modelIds) {
    await client`DELETE FROM models WHERE id = ${id}::uuid`;
  }
  if (planId) {
    await client`DELETE FROM plans WHERE id = ${planId}::uuid`;
  }
  await client`DELETE FROM models WHERE slug LIKE ${PREFIX + "%"}`;
  await client`DELETE FROM plans WHERE slug LIKE ${PREFIX + "%"}`;
  await client.end({ timeout: 5 });
});

async function createTempModel(slugSuffix: string) {
  if (!developerId) throw new Error("developerId missing");
  const slug = `${PREFIX}${slugSuffix}`;
  const [row] = await db
    .insert(schema.models)
    .values({
      developerId,
      canonicalId: slug,
      name: `Plans-models test ${slugSuffix}`,
      slug,
      lifecycle: "unknown",
      status: "active",
      isFavourite: false,
      needsReview: false,
      workflowStatus: "active",
    })
    .returning({ id: schema.models.id });
  modelIds.push(row.id);
  return row.id;
}

describe("schema 0008 plans quotas models", () => {
  it("inserts plan_quotas row with SPEC enums", async () => {
    if (!planId) throw new Error("planId missing");
    const [row] = await db
      .insert(schema.planQuotas)
      .values({
        planId,
        name: "5-hour requests",
        amountMin: "40",
        amountMax: "80",
        unit: "requests",
        period: "five_hour_window",
        isUnlimited: false,
      })
      .returning({ id: schema.planQuotas.id, unit: schema.planQuotas.unit });
    quotaIds.push(row.id);
    expect(row.unit).toBe("requests");

    const count = await db
      .select({ id: schema.planQuotas.id })
      .from(schema.planQuotas)
      .where(eq(schema.planQuotas.planId, planId));
    expect(count.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a second preferred model_access for the same model", async () => {
    if (!planId) throw new Error("planId missing");
    const modelId = await createTempModel("pref");

    const [first] = await db
      .insert(schema.modelAccess)
      .values({
        modelId,
        planId,
        accessMethod: "cli",
        isPreferred: true,
      })
      .returning({ id: schema.modelAccess.id });
    accessIds.push(first.id);

    let rejected = false;
    let thrown: unknown;
    try {
      const [second] = await db
        .insert(schema.modelAccess)
        .values({
          modelId,
          planId,
          providerModelId: "second-route",
          accessMethod: "web",
          isPreferred: true,
        })
        .returning({ id: schema.modelAccess.id });
      accessIds.push(second.id);
    } catch (error: unknown) {
      rejected = true;
      thrown = error;
    }
    expect(rejected).toBe(true);
    const parts: string[] = [
      thrown instanceof Error ? thrown.message : String(thrown),
    ];
    if (thrown instanceof Error && thrown.cause instanceof Error) {
      parts.push(thrown.cause.message);
    }
    if (typeof thrown === "object" && thrown !== null) {
      if ("code" in thrown) {
        parts.push(String(thrown.code));
      }
      if (
        "cause" in thrown &&
        typeof thrown.cause === "object" &&
        thrown.cause !== null &&
        "code" in thrown.cause
      ) {
        parts.push(String(thrown.cause.code));
      }
    }
    const text = parts.join(" ");
    expect(text).toMatch(/unique|duplicate|23505|model_access_preferred/i);
  });

  it("allows nullable workflow_status and boolean defaults", async () => {
    if (!developerId) throw new Error("developerId missing");
    const slug = `${PREFIX}null-ws`;
    const [row] = await db
      .insert(schema.models)
      .values({
        developerId,
        canonicalId: slug,
        name: "Null workflow",
        slug,
        lifecycle: "unknown",
        status: "active",
      })
      .returning({
        id: schema.models.id,
        isFavourite: schema.models.isFavourite,
        needsReview: schema.models.needsReview,
        workflowStatus: schema.models.workflowStatus,
      });
    modelIds.push(row.id);
    expect(row.isFavourite).toBe(false);
    expect(row.needsReview).toBe(false);
    expect(row.workflowStatus).toBeNull();
  });
});
