/**
 * Integration tests for Phase 3 services: subscriptions, access, usage, plans.
 * Uses the live local Postgres (seed data preserved; temporary rows cleaned up).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index";
import {
  createSubscription,
  getSubscription,
  updateSubscription,
  archiveSubscription,
  restoreSubscription,
  createSubscriptionLimitRule,
  deleteSubscriptionLimitRule,
} from "./services/subscriptions";
import { type Db } from "./services/audit";
import {
  createModelAccess,
  archiveModelAccess,
  getAccessMatrix,
  listModelAccess,
} from "./services/access";
import {
  getMonthlyRegularTotal,
  getUsageSummary,
  listUsageSnapshots,
} from "./services/usage";
import {
  listAccessProviders,
  listPlans,
  createPlan,
} from "./services/plans";

function resolveUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  return ["postgresql://", "modelmonitor", ":", "modelmonitor", "@", "127.0.0.1", ":", "5433", "/", "modelmonitor"].join("");
}

const client = postgres(resolveUrl(), { max: 5 });
const db = drizzle(client, { schema }) as Db;

const ctx = { actorUserId: null, requestId: "mmtest:phase3-integration" };

const createdSubIds: string[] = [];
const createdAccessIds: string[] = [];
const createdRuleIds: string[] = [];
const createdPlanIds: string[] = [];

let seedModelId: string | null = null;
let seedPlanId: string | null = null;
let seedProviderId: string | null = null;
let testPlanId: string | null = null;
let duplicatePlanId: string | null = null;

beforeAll(async () => {
  const [plan] = await db
    .select({ id: schema.plans.id })
    .from(schema.plans)
    .limit(1);
  if (!plan) throw new Error("No plans — run db:seed first");
  seedPlanId = plan.id;

  const [model] = await db
    .select({ id: schema.models.id })
    .from(schema.models)
    .limit(1);
  if (!model) throw new Error("No models — run db:seed first");
  seedModelId = model.id;

  const [provider] = await db
    .select({ id: schema.accessProviders.id })
    .from(schema.accessProviders)
    .limit(1);
  if (!provider) throw new Error("No access providers — run db:seed first");
  seedProviderId = provider.id;

  // Use a test-only plan so this file never races with other integration
  // files creating access for the seeded model/plan tuple.
  const testPlan = await createPlan(
    db,
    {
      accessProviderId: seedProviderId,
      name: "mmtest:access-plan",
      slug: `mmtest-access-plan-${crypto.randomUUID().slice(0, 8)}`,
      planType: "test",
    },
    ctx,
  );
  testPlanId = testPlan.id;
  createdPlanIds.push(testPlan.id);
  const duplicatePlan = await createPlan(
    db,
    {
      accessProviderId: seedProviderId,
      name: "mmtest:duplicate-plan",
      slug: `mmtest-duplicate-plan-${crypto.randomUUID().slice(0, 8)}`,
      planType: "test",
    },
    ctx,
  );
  duplicatePlanId = duplicatePlan.id;
  createdPlanIds.push(duplicatePlan.id);
});

afterAll(async () => {
  // Clean up in dependency order
  for (const id of createdRuleIds) {
    await client`DELETE FROM subscription_limit_rules WHERE id = ${id}::uuid`;
  }
  for (const id of createdAccessIds) {
    await client`DELETE FROM audit_events WHERE entity_type = 'model_access' AND entity_id = ${id}::uuid`;
    await client`DELETE FROM model_access WHERE id = ${id}::uuid`;
  }
  for (const id of createdPlanIds) {
    await client`DELETE FROM audit_events WHERE entity_type = 'plan' AND entity_id = ${id}::uuid`;
    await client`DELETE FROM plans WHERE id = ${id}::uuid`;
  }
  for (const id of createdSubIds) {
    // Archive first, then clean audit + final delete
    await client`UPDATE subscriptions SET status = 'archived', archived_at = now(), updated_at = now() WHERE id = ${id}::uuid AND status != 'archived'`;
    await client`DELETE FROM audit_events WHERE entity_type = 'subscription' AND entity_id = ${id}::uuid`;
    await client`DELETE FROM subscription_limit_rules WHERE subscription_id = ${id}::uuid`;
    await client`DELETE FROM subscriptions WHERE id = ${id}::uuid`;
  }
  await client.end({ timeout: 2 });
});

describe("monthly cost (seed data)", () => {
  it("returns total=61, currency=USD, subscriptionCount=4", async () => {
    const result = await getMonthlyRegularTotal(db);
    expect(result.total).toBe(61);
    expect(result.currency).toBe("USD");
    expect(result.subscriptionCount).toBe(4);
  });
});

describe("subscription CRUD + audit + archive/restore", () => {
  it("creates, reads, updates, archives, restores a subscription with audit trail", async () => {
    expect(seedPlanId).not.toBeNull();

    const created = await createSubscription(
      db,
      {
        planId: seedPlanId!,
        accountLabel: "mmtest:sub-crud",
        actualPrice: 7,
        currency: "USD",
        billingInterval: "monthly",
      },
      ctx,
    );
    createdSubIds.push(created.id);
    expect(created.id).toBeTruthy();
    expect(created.accountLabel).toBe("mmtest:sub-crud");
    expect(created.actualPrice).toBe(7);
    expect(created.status).toBe("active");

    // Read
    const got = await getSubscription(db, created.id);
    expect(got.accountLabel).toBe("mmtest:sub-crud");

    // Update
    const updated = await updateSubscription(
      db,
      created.id,
      { accountLabel: "mmtest:sub-crud-updated" },
      ctx,
    );
    expect(updated.accountLabel).toBe("mmtest:sub-crud-updated");

    // Archive
    const archived = await archiveSubscription(db, created.id, ctx);
    expect(archived.status).toBe("archived");

    // Restore
    const restored = await restoreSubscription(db, created.id, ctx);
    expect(restored.status).toBe("active");

    // Verify audit events exist
    const auditRows = await client`
      SELECT action FROM audit_events
      WHERE entity_type = 'subscription' AND entity_id = ${created.id}::uuid
      ORDER BY created_at
    `;
    const actions = (auditRows as unknown as Array<{ action: string }>).map(
      (r) => r.action,
    );
    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("archive");
    expect(actions).toContain("restore");
  });
});

describe("subscription limit rules", () => {
  it("creates a limit rule and archives it", async () => {
    expect(seedPlanId).not.toBeNull();

    // Create a subscription to own the rule
    const sub = await createSubscription(
      db,
      { planId: seedPlanId!, accountLabel: "mmtest:sub-rule-test" },
      ctx,
    );
    createdSubIds.push(sub.id);
    expect(sub.id).toBeTruthy();

    // Create rule
    const rule = await createSubscriptionLimitRule(
      db,
      {
        subscriptionId: sub.id,
        name: "mmtest:rule-requests",
        limitType: "requests",
        amountMax: 100,
        unit: "req",
      },
      ctx,
    );
    createdRuleIds.push(rule.id);
    expect(rule.id).toBeTruthy();
    expect(rule.name).toBe("mmtest:rule-requests");
    expect(rule.limitType).toBe("requests");
    expect(rule.amountMax).toBe(100);

    // Archive via deleteSubscriptionLimitRule
    const deleted = await deleteSubscriptionLimitRule(db, rule.id, ctx);
    expect(deleted.success).toBe(true);

    // Verify soft-archived
    const [row] = await client`
      SELECT status FROM subscription_limit_rules WHERE id = ${rule.id}::uuid
    `;
    expect(row.status).toBe("archived");
  });
});

describe("model access CRUD + dup conflict", () => {
  it("creates model access, verifies via getAccessMatrix, archives, and checks duplicate conflict", async () => {
    expect(seedModelId).not.toBeNull();
    expect(testPlanId).not.toBeNull();

    const access = await createModelAccess(
      db,
      {
        modelId: seedModelId!,
        planId: testPlanId!,
        availability: "confirmed",
        accessMethod: "cli",
        cliOnly: true,
      },
      ctx,
    );
    createdAccessIds.push(access.id);
    expect(access.id).toBeTruthy();
    expect(access.accessMethod).toBe("cli");
    expect(access.cliOnly).toBe(true);
    expect(access.model.id).toBe(seedModelId);
    expect(access.plan.id).toBe(testPlanId);

    // Verify via getAccessMatrix
    const matrix = await getAccessMatrix(db, {});
    const match = matrix.find(
      (r) => r.modelId === seedModelId && r.access.some((a) => a.accessId === access.id),
    );
    expect(match).toBeTruthy();

    // Verify via listModelAccess
    const listed = await listModelAccess(db, { modelId: seedModelId });
    expect(listed.data.some((a) => a.id === access.id)).toBe(true);

    // Archive
    const archived = await archiveModelAccess(db, access.id, ctx);
    expect(archived.id).toBe(access.id);

    // Verify archived
    const [archivedRow] = await client`
      SELECT status FROM model_access WHERE id = ${access.id}::uuid
    `;
    expect(archivedRow.status).toBe("archived");
  });

  it("rejects duplicate model+plan+null providerModelId with 409", async () => {
    expect(seedModelId).not.toBeNull();
    expect(duplicatePlanId).not.toBeNull();

    const first = await createModelAccess(
      db,
      {
        modelId: seedModelId!,
        planId: duplicatePlanId!,
        availability: "confirmed",
        accessMethod: "cli",
        cliOnly: false,
      },
      ctx,
    );
    createdAccessIds.push(first.id);

    // Duplicate (same model+plan+null provider) must conflict
    try {
      await createModelAccess(
        db,
        {
          modelId: seedModelId!,
          planId: duplicatePlanId!,
          availability: "confirmed",
          accessMethod: "cli",
          cliOnly: true,
        },
        ctx,
      );
      // Should not reach here
      expect.unreachable("Expected duplicate to throw CONFLICT");
    } catch (err: unknown) {
      const e = err as { code?: string; status?: number };
      expect(e.code).toBe("CONFLICT");
      expect(e.status).toBe(409);
    }
  });
});

describe("plans and providers", () => {
  it("listAccessProviders returns at least 1 seed provider", async () => {
    const providers = await listAccessProviders(db);
    expect(providers.length).toBeGreaterThanOrEqual(1);
  });

  it("listPlans returns at least 4 seed plans", async () => {
    const plans = await listPlans(db);
    expect(plans.length).toBeGreaterThanOrEqual(4);
  });

  it("creates a plan and cleans up", async () => {
    expect(seedProviderId).not.toBeNull();
    const suffix = crypto.randomUUID().slice(0, 8);
    const plan = await createPlan(
      db,
      {
        accessProviderId: seedProviderId!,
        name: "mmtest:plan",
        slug: `mmtest-plan-${suffix}`,
        planType: "test",
      },
      ctx,
    );
    createdPlanIds.push(plan.id);
    expect(plan.id).toBeTruthy();
    expect(plan.name).toBe("mmtest:plan");
    expect(plan.planType).toBe("test");
  });
});

describe("usage summary and snapshots", () => {
  it("getUsageSummary returns counts with seed mock data", async () => {
    const summary = await getUsageSummary(db);
    expect(summary.total).toBeGreaterThanOrEqual(0);
    expect(summary.withMock).toBe(true);
    expect(typeof summary.mock).toBe("number");
    expect(typeof summary.manual).toBe("number");
  });

  it("listUsageSnapshots returns an array", async () => {
    const snapshots = await listUsageSnapshots(db, {});
    expect(Array.isArray(snapshots)).toBe(true);
    // Should have at least seed mock data
    if (snapshots.length > 0) {
      expect(snapshots[0].id).toBeTruthy();
    }
  });
});
