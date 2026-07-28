/**
 * Redesign api-providers-plans integration tests.
 * - create plan with several quotas
 * - remaining-only quota patch stamps remaining_updated_at
 * - setting a second access route preferred clears the first
 * - renewals list ordering + four kinds
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "./schema/index";
import {
  createAccessProvider,
  createPlan,
  createPlanQuota,
  listRenewals,
  updatePlan,
  updatePlanQuota,
} from "./services/plans";
import {
  createModelAccess,
  listModelAccess,
  updateModelAccess,
} from "./services/access";
import { createModel, type Db } from "./services/models";

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

const ctx = { requestId: "api-providers-plans-test" };

const cleanup = {
  providerIds: [] as string[],
  planIds: [] as string[],
  quotaIds: [] as string[],
  modelIds: [] as string[],
  accessIds: [] as string[],
};

beforeAll(async () => {
  const [row] = await db
    .select({ c: schema.accessProviders.id })
    .from(schema.accessProviders)
    .where(eq(schema.accessProviders.status, "active"))
    .limit(1);
  if (!row) throw new Error("No active access providers — run seed first");
});

afterAll(async () => {
  for (const id of cleanup.accessIds) {
    await client`DELETE FROM audit_events WHERE entity_type = 'model_access' AND entity_id = ${id}::uuid`;
    await client`DELETE FROM model_access WHERE id = ${id}::uuid`;
  }
  for (const id of cleanup.quotaIds) {
    await client`DELETE FROM audit_events WHERE entity_type = 'plan_quota' AND entity_id = ${id}::uuid`;
    await client`DELETE FROM plan_quotas WHERE id = ${id}::uuid`;
  }
  for (const id of cleanup.planIds) {
    await client`DELETE FROM audit_events WHERE entity_type = 'plan' AND entity_id = ${id}::uuid`;
    await client`DELETE FROM plans WHERE id = ${id}::uuid`;
  }
  for (const id of cleanup.modelIds) {
    await client`DELETE FROM audit_events WHERE entity_type = 'model' AND entity_id = ${id}::uuid`;
    await client`DELETE FROM model_capabilities WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM model_aliases WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM models WHERE id = ${id}::uuid`;
  }
  for (const id of cleanup.providerIds) {
    await client`DELETE FROM audit_events WHERE entity_type = 'access_provider' AND entity_id = ${id}::uuid`;
    await client`DELETE FROM access_providers WHERE id = ${id}::uuid`;
  }
  await client.end({ timeout: 5 });
});

describe("api-providers-plans: plan with several quotas", () => {
  it("creates a plan and attaches multiple quotas (range + custom unit/period)", async () => {
    const provider = await createAccessProvider(
      db,
      {
        name: "mmtest:quota-provider",
        slug: `mmtest-quota-prov-${Date.now()}`,
        providerType: "subscription_platform",
        colour: "accent",
      },
      ctx,
    );
    cleanup.providerIds.push(provider.id);

    const plan = await createPlan(
      db,
      {
        accessProviderId: provider.id,
        name: "mmtest:multi-quota-plan",
        slug: `mmtest-mq-${Date.now()}`,
        accessType: "subscription",
        regularPrice: 25,
        currency: "USD",
        billingPeriod: "monthly",
        renewalDate: "2026-09-01",
      },
      ctx,
    );
    cleanup.planIds.push(plan.id);
    expect(plan.monthlyCost).toBe(25);
    expect(plan.quotaSummary?.count).toBe(0);

    const q1 = await createPlanQuota(
      db,
      plan.id,
      {
        name: "5-hour window",
        amountMin: 10,
        amountMax: 50,
        unit: "requests",
        period: "five_hour_window",
      },
      ctx,
    );
    cleanup.quotaIds.push(q1.id);

    const q2 = await createPlanQuota(
      db,
      plan.id,
      {
        name: "Weekly custom",
        amount: 1000,
        unit: "custom",
        customUnit: "agent-runs",
        period: "custom",
        resetBehaviour: "calendar Monday 00:00 UTC",
      },
      ctx,
    );
    cleanup.quotaIds.push(q2.id);

    const q3 = await createPlanQuota(
      db,
      plan.id,
      {
        name: "Monthly dollars",
        amount: 40,
        unit: "dollars",
        period: "monthly",
        isUnlimited: false,
      },
      ctx,
    );
    cleanup.quotaIds.push(q3.id);

    expect(q1.amountMin).toBe(10);
    expect(q1.amountMax).toBe(50);
    expect(q2.unit).toBe("custom");
    expect(q2.customUnit).toBe("agent-runs");
    expect(q2.period).toBe("custom");
    expect(q3.amount).toBe(40);

    const listed = await import("./services/plans").then((m) =>
      m.listPlanQuotas(db, plan.id),
    );
    expect(listed).toHaveLength(3);

    const detail = await import("./services/plans").then((m) => m.getPlan(db, plan.id));
    expect(detail.quotaSummary?.count).toBe(3);
    expect(detail.quotaSummary?.items.map((i) => i.name).sort()).toEqual(
      ["5-hour window", "Monthly dollars", "Weekly custom"].sort(),
    );
  });
});

describe("api-providers-plans: remaining-only quota patch", () => {
  it("PATCH {remainingAmount} stamps remaining_updated_at to now", async () => {
    const provider = await createAccessProvider(
      db,
      {
        name: "mmtest:remaining-provider",
        slug: `mmtest-rem-prov-${Date.now()}`,
        providerType: "api_provider",
      },
      ctx,
    );
    cleanup.providerIds.push(provider.id);

    const plan = await createPlan(
      db,
      {
        accessProviderId: provider.id,
        name: "mmtest:remaining-plan",
        slug: `mmtest-rem-${Date.now()}`,
      },
      ctx,
    );
    cleanup.planIds.push(plan.id);

    const quota = await createPlanQuota(
      db,
      plan.id,
      {
        name: "Monthly requests",
        amount: 500,
        unit: "requests",
        period: "monthly",
        remainingAmount: 500,
      },
      ctx,
    );
    cleanup.quotaIds.push(quota.id);
    expect(quota.remainingAmount).toBe(500);
    expect(quota.remainingUpdatedAt).toBeTruthy();
    const firstStamp = quota.remainingUpdatedAt!;

    // Ensure clock moves
    await new Promise((r) => setTimeout(r, 25));

    const beforeMs = Date.now();
    const patched = await updatePlanQuota(db, quota.id, { remainingAmount: 321 }, ctx);
    const afterMs = Date.now();

    expect(patched.remainingAmount).toBe(321);
    expect(patched.remainingUpdatedAt).toBeTruthy();
    expect(patched.remainingUpdatedAt).not.toBe(firstStamp);

    const stampMs = new Date(patched.remainingUpdatedAt!).getTime();
    expect(stampMs).toBeGreaterThanOrEqual(beforeMs - 1000);
    expect(stampMs).toBeLessThanOrEqual(afterMs + 1000);

    // Structural fields unchanged
    expect(patched.amount).toBe(500);
    expect(patched.name).toBe("Monthly requests");
    expect(patched.unit).toBe("requests");
  });
});

describe("api-providers-plans: preferred access route", () => {
  it("setting a second route preferred clears the first in one transaction", async () => {
    const provider = await createAccessProvider(
      db,
      {
        name: "mmtest:pref-provider",
        slug: `mmtest-pref-prov-${Date.now()}`,
        providerType: "aggregator",
      },
      ctx,
    );
    cleanup.providerIds.push(provider.id);

    const planA = await createPlan(
      db,
      {
        accessProviderId: provider.id,
        name: "mmtest:pref-plan-a",
        slug: `mmtest-pref-a-${Date.now()}`,
      },
      ctx,
    );
    cleanup.planIds.push(planA.id);

    const planB = await createPlan(
      db,
      {
        accessProviderId: provider.id,
        name: "mmtest:pref-plan-b",
        slug: `mmtest-pref-b-${Date.now()}`,
      },
      ctx,
    );
    cleanup.planIds.push(planB.id);

    const model = await createModel(
      db,
      { name: `mmtest-pref-model-${Date.now()}` },
      ctx,
    );
    cleanup.modelIds.push(model.id);

    const accessA = await createModelAccess(
      db,
      {
        modelId: model.id,
        planId: planA.id,
        accessMethod: "provider_api",
        isPreferred: true,
      },
      ctx,
    );
    cleanup.accessIds.push(accessA.id);
    expect(accessA.isPreferred).toBe(true);

    const accessB = await createModelAccess(
      db,
      {
        modelId: model.id,
        planId: planB.id,
        accessMethod: "cli",
        isPreferred: false,
      },
      ctx,
    );
    cleanup.accessIds.push(accessB.id);
    expect(accessB.isPreferred).toBe(false);

    // Promote B — must clear A without unique-index failure
    const promoted = await updateModelAccess(
      db,
      accessB.id,
      { isPreferred: true },
      ctx,
    );
    expect(promoted.isPreferred).toBe(true);

    const listed = await listModelAccess(db, { modelId: model.id });
    const byId = new Map(listed.data.map((r) => [r.id, r]));
    expect(byId.get(accessA.id)?.isPreferred).toBe(false);
    expect(byId.get(accessB.id)?.isPreferred).toBe(true);

    const preferredCount = listed.data.filter((r) => r.isPreferred).length;
    expect(preferredCount).toBe(1);

    // DB partial unique index still holds
    const dbPref = await db
      .select({ id: schema.modelAccess.id })
      .from(schema.modelAccess)
      .where(
        and(
          eq(schema.modelAccess.modelId, model.id),
          eq(schema.modelAccess.isPreferred, true),
        ),
      );
    expect(dbPref).toHaveLength(1);
    expect(dbPref[0].id).toBe(accessB.id);
  });
});

describe("api-providers-plans: renewals list", () => {
  it("returns four kinds sorted by date", async () => {
    const stamp = Date.now();
    const provider = await createAccessProvider(
      db,
      {
        name: "mmtest:renew-provider",
        slug: `mmtest-renew-prov-${stamp}`,
        providerType: "subscription_platform",
      },
      ctx,
    );
    cleanup.providerIds.push(provider.id);

    // subscription_renewal
    const subPlan = await createPlan(
      db,
      {
        accessProviderId: provider.id,
        name: "mmtest:renew-sub",
        slug: `mmtest-renew-sub-${stamp}`,
        accessType: "subscription",
        regularPrice: 20,
        currency: "USD",
        billingPeriod: "monthly",
        renewalDate: "2030-01-10",
      },
      ctx,
    );
    cleanup.planIds.push(subPlan.id);

    // trial_expiration (uses renewal_date when accessType=trial)
    const trialPlan = await createPlan(
      db,
      {
        accessProviderId: provider.id,
        name: "mmtest:renew-trial",
        slug: `mmtest-renew-trial-${stamp}`,
        accessType: "trial",
        renewalDate: "2030-01-05",
      },
      ctx,
    );
    cleanup.planIds.push(trialPlan.id);

    // promotional_price_expiration
    const promoPlan = await createPlan(
      db,
      {
        accessProviderId: provider.id,
        name: "mmtest:renew-promo",
        slug: `mmtest-renew-promo-${stamp}`,
        accessType: "subscription",
        introductoryPrice: 5,
        regularPrice: 30,
        currency: "USD",
        introPriceExpiresAt: "2030-01-20",
        renewalDate: "2030-02-01",
      },
      ctx,
    );
    cleanup.planIds.push(promoPlan.id);

    // manual_review
    const model = await createModel(
      db,
      { name: `mmtest-renew-model-${stamp}` },
      ctx,
    );
    cleanup.modelIds.push(model.id);
    await db
      .update(schema.models)
      .set({
        needsReview: true,
        verifiedAt: new Date("2030-01-15T12:00:00.000Z"),
        updatedAt: new Date(),
      })
      .where(eq(schema.models.id, model.id));

    const items = await listRenewals(db, {
      from: "2030-01-01",
      to: "2030-02-28",
      limit: 200,
    });

    const ours = items.filter(
      (i) =>
        i.entityId === subPlan.id ||
        i.entityId === trialPlan.id ||
        i.entityId === promoPlan.id ||
        i.entityId === model.id ||
        (i.entityId === promoPlan.id),
    );

    // promo plan contributes both promotional_price_expiration and subscription_renewal
    const kinds = new Set(ours.map((i) => i.kind));
    expect(kinds.has("subscription_renewal")).toBe(true);
    expect(kinds.has("trial_expiration")).toBe(true);
    expect(kinds.has("promotional_price_expiration")).toBe(true);
    expect(kinds.has("manual_review")).toBe(true);

    const trial = ours.find((i) => i.kind === "trial_expiration");
    expect(trial?.date).toBe("2030-01-05");
    expect(trial?.entityId).toBe(trialPlan.id);

    const sub = ours.find(
      (i) => i.kind === "subscription_renewal" && i.entityId === subPlan.id,
    );
    expect(sub?.date).toBe("2030-01-10");

    const review = ours.find((i) => i.kind === "manual_review");
    expect(review?.date).toBe("2030-01-15");
    expect(review?.entityType).toBe("model");

    const promo = ours.find((i) => i.kind === "promotional_price_expiration");
    expect(promo?.date).toBe("2030-01-20");

    // Ordering: ascending by date among our fixtures
    const ordered = ours
      .filter((i) =>
        [
          trialPlan.id,
          subPlan.id,
          model.id,
          promoPlan.id,
        ].includes(i.entityId) || i.kind === "promotional_price_expiration",
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

    // listRenewals already sorted — check relative order of our four primary kinds
    const primary = items.filter((i) =>
      [subPlan.id, trialPlan.id, promoPlan.id, model.id].includes(i.entityId),
    );
    for (let i = 1; i < primary.length; i++) {
      const prev = primary[i - 1];
      const cur = primary[i];
      expect(prev.date <= cur.date).toBe(true);
    }

    // trial before sub before review before promo expiry (and promo's later sub renewal)
    const idx = (kind: string, entityId?: string) =>
      primary.findIndex(
        (i) => i.kind === kind && (entityId ? i.entityId === entityId : true),
      );

    expect(idx("trial_expiration")).toBeGreaterThanOrEqual(0);
    expect(idx("subscription_renewal", subPlan.id)).toBeGreaterThan(
      idx("trial_expiration"),
    );
    expect(idx("manual_review")).toBeGreaterThan(idx("subscription_renewal", subPlan.id));
    expect(idx("promotional_price_expiration")).toBeGreaterThan(idx("manual_review"));

    // no side effects — updatePlan still works after list
    const touched = await updatePlan(db, subPlan.id, { notes: "listed" }, ctx);
    expect(touched.notes).toBe("listed");

    void ordered;
  });
});
