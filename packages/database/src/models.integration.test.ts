/**
 * Integration tests for model registry CRUD, archive/restore, aliases, audit, merge.
 * Uses the live local Postgres (seed data preserved; temporary rows cleaned up).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index";
import {
  addModelAlias,
  archiveModel,
  createModel,
  getModelById,
  listModels,
  mapModelRow,
  mergeModels,
  mergeModelsInTransaction,
  restoreModel,
  updateModel,
  type Db,
} from "./services/models";
import { hashIdempotencyPayload, withIdempotency } from "./services/idempotency";

function resolveUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  return ["postgresql://", "modelmonitor", ":", "modelmonitor", "@", "127.0.0.1", ":", "5433", "/", "modelmonitor"].join("");
}

const client = postgres(resolveUrl(), { max: 5 });
const db = drizzle(client, { schema }) as Db;

const createdIds: string[] = [];
const createdAccessIds: string[] = [];
const createdScoreIds: string[] = [];
const createdBenchIds: string[] = [];
const createdSourceIds: string[] = [];
const createdUsageIds: string[] = [];
const createdProvIds: string[] = [];
const createdPricingIds: string[] = [];
const idemKeys: string[] = [];
let methodologyId: string | null = null;
let planId: string | null = null;
let subscriptionId: string | null = null;
let benchmarkId: string | null = null;

beforeAll(async () => {
  const [row] = await db
    .select({ c: schema.models.id })
    .from(schema.models)
    .where(eq(schema.models.status, "active"))
    .limit(1);
  if (!row) throw new Error("No active models — run db:seed first");

  const existingMeth = await db.select({ id: schema.scoreMethodologies.id }).from(schema.scoreMethodologies).limit(1);
  if (existingMeth[0]) {
    methodologyId = existingMeth[0].id;
  } else {
    const [createdMeth] = await db
      .insert(schema.scoreMethodologies)
      .values({
        name: "mmtest:methodology",
        version: "mmtest:1",
        description: "Created for integration tests",
        factors: { test: true },
        isActive: true,
      })
      .returning({ id: schema.scoreMethodologies.id });
    methodologyId = createdMeth.id;
  }

  const [plan] = await db.select({ id: schema.plans.id }).from(schema.plans).limit(1);
  planId = plan?.id ?? null;

  const [sub] = await db.select({ id: schema.subscriptions.id }).from(schema.subscriptions).limit(1);
  subscriptionId = sub?.id ?? null;

  const [bench] = await db.select({ id: schema.benchmarks.id }).from(schema.benchmarks).limit(1);
  benchmarkId = bench?.id ?? null;
});

afterAll(async () => {
  await client`DELETE FROM model_scores WHERE methodology_id IN (SELECT id FROM score_methodologies WHERE name = 'mmtest:maud-method')`;
  await client`DELETE FROM score_methodologies WHERE name = 'mmtest:maud-method'`;
  await client`DELETE FROM usage_snapshots WHERE period_label LIKE 'mmtest:maud-%'`;
  await client`DELETE FROM import_provenance WHERE import_job_id IN (SELECT id FROM import_jobs WHERE filename = 'mmtest:maud-import')`;
  await client`DELETE FROM import_jobs WHERE filename = 'mmtest:maud-import'`;
  // Drop any test methodology created for score fixtures.
  await client`DELETE FROM model_scores WHERE methodology_id IN (SELECT id FROM score_methodologies WHERE name = 'mmtest:methodology' AND version = 'mmtest:1')`;
  await client`DELETE FROM score_methodologies WHERE name = 'mmtest:methodology' AND version = 'mmtest:1'`;
  await client`DELETE FROM import_provenance WHERE import_job_id IN (SELECT id FROM import_jobs WHERE filename LIKE 'mmtest:merge-%')`;
  await client`DELETE FROM import_jobs WHERE filename LIKE 'mmtest:merge-%'`;

  // Drop any test triggers we may have installed.
  await client.unsafe(`
    DROP TRIGGER IF EXISTS trg_fail_alias_audit ON audit_events;
    DROP FUNCTION IF EXISTS fail_test_alias_audit();
    DROP TRIGGER IF EXISTS trg_fail_merge_midway ON models;
    DROP FUNCTION IF EXISTS fail_test_merge_midway();
  `);

  for (const id of createdPricingIds) {
    await client`DELETE FROM model_access_pricing WHERE id = ${id}::uuid`;
  }
  for (const id of createdUsageIds) {
    await client`DELETE FROM usage_snapshots WHERE id = ${id}::uuid`;
  }
  for (const id of createdProvIds) {
    await client`DELETE FROM import_provenance WHERE id = ${id}::uuid`;
  }
  for (const id of createdSourceIds) {
    await client`DELETE FROM sources WHERE id = ${id}::uuid`;
  }
  for (const id of createdBenchIds) {
    await client`DELETE FROM model_benchmark_results WHERE id = ${id}::uuid`;
  }
  for (const id of createdScoreIds) {
    await client`DELETE FROM model_scores WHERE id = ${id}::uuid`;
  }
  for (const id of createdAccessIds) {
    await client`DELETE FROM model_access_pricing WHERE model_access_id = ${id}::uuid`;
    await client`DELETE FROM model_access WHERE id = ${id}::uuid`;
  }
  for (const key of idemKeys) {
    await client`DELETE FROM idempotency_keys WHERE key = ${key}`;
  }

  for (const id of createdIds) {
    await client`UPDATE models SET merged_into_model_id = NULL WHERE merged_into_model_id = ${id}::uuid`;
    await client`DELETE FROM audit_events WHERE entity_id = ${id}::uuid`;
    await client`DELETE FROM model_aliases WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM model_capabilities WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM model_access_pricing WHERE model_access_id IN (SELECT id FROM model_access WHERE model_id = ${id}::uuid)`;
    await client`DELETE FROM model_access WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM model_scores WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM model_benchmark_results WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM sources WHERE entity_id = ${id}::uuid`;
    await client`DELETE FROM import_provenance WHERE entity_id = ${id}::uuid`;
    await client`DELETE FROM usage_snapshots WHERE model_id = ${id}::uuid`;
  }
  for (const id of [...createdIds].reverse()) {
    await client`DELETE FROM models WHERE id = ${id}::uuid AND canonical_id LIKE 'mmtest:%'`;
  }
  await client.end({ timeout: 2 });
});

async function developerId(): Promise<string> {
  const [d] = await db.select({ id: schema.developers.id }).from(schema.developers).limit(1);
  return d.id;
}

describe("model list filters", () => {
  it("searches by canonical name and keeps seed count stable for unfiltered active list", async () => {
    const all = await listModels(db, { limit: 200 });
    expect(all.page.total).toBeGreaterThanOrEqual(51);

    const sample = all.data[0];
    const byName = await listModels(db, { search: sample.name, limit: 50 });
    expect(byName.data.some((m) => m.id === sample.id)).toBe(true);

    const byCanonical = await listModels(db, { search: sample.canonicalId, limit: 50 });
    expect(byCanonical.data.some((m) => m.id === sample.id)).toBe(true);
  });

  it("defaults to excluding archived models", async () => {
    const active = await listModels(db, { limit: 5 });
    expect(active.data.every((m) => m.status === "active")).toBe(true);
  });
});

describe("model CRUD + audit + aliases", () => {
  it("creates, updates, archives, restores with audit events and null-safe capabilities", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const created = await createModel(
      db,
      {
        canonicalId: `mmtest:phase2-${suffix}`,
        name: `Phase2 Test ${suffix}`,
        developerId: devId,
        family: "test-family",
        lifecycle: "preview",
        contextTokens: null,
        capabilities: {
          vision: null,
          reasoning: true,
          toolUse: false,
        },
        aliases: [{ alias: `alias-${suffix}`, aliasType: "display" }],
      },
      { requestId: `req-create-${suffix}` },
    );
    createdIds.push(created.id);

    expect(created.contextTokens).toBeNull();
    expect(created.capabilities?.vision).toBeNull();
    expect(created.capabilities?.display.vision).toBe("unknown");
    expect(created.capabilities?.reasoning).toBe(true);
    expect(created.capabilities?.toolUse).toBe(false);
    expect(created.aliases.some((a) => a.alias === `alias-${suffix}`)).toBe(true);

    const updated = await updateModel(
      db,
      created.id,
      { bestUse: "integration testing", needsRecheck: false },
      { requestId: `req-update-${suffix}` },
    );
    expect(updated.bestUse).toBe("integration testing");
    expect(updated.needsRecheck).toBe(false);

    await addModelAlias(
      db,
      created.id,
      { alias: `extra-${suffix}`, aliasType: "short" },
      { requestId: `req-alias-${suffix}` },
    );

    const archived = await archiveModel(db, created.id, { requestId: `req-arch-${suffix}` });
    expect(archived.status).toBe("archived");

    const activeList = await listModels(db, { search: created.canonicalId, limit: 10 });
    expect(activeList.data.find((m) => m.id === created.id)).toBeUndefined();

    const archivedList = await listModels(db, {
      search: created.canonicalId,
      archived: true,
      limit: 10,
    });
    expect(archivedList.data.some((m) => m.id === created.id)).toBe(true);

    const restored = await restoreModel(db, created.id, { requestId: `req-rest-${suffix}` });
    expect(restored.status).toBe("active");

    const detail = await getModelById(db, created.id);
    const actions = detail.history.map((h) => h.action);
    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("archive");
    expect(actions).toContain("restore");

    for (const s of detail.scoreRecords) {
      if (s.scoreValue === null) {
        expect(s.scoreDisplay).toBe("—");
        expect(s.scoreDisplay).not.toBe("0");
      }
    }
  });

  it("name-only edit preserves alias type and accessProviderId", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const [provider] = await db
      .select({ id: schema.accessProviders.id })
      .from(schema.accessProviders)
      .limit(1);

    const created = await createModel(
      db,
      {
        canonicalId: `mmtest:alias-preserve-${suffix}`,
        name: `Alias Preserve ${suffix}`,
        developerId: devId,
        aliases: [
          {
            alias: `prov-alias-${suffix}`,
            aliasType: "provider",
            accessProviderId: provider.id,
          },
        ],
      },
      { requestId: `req-ap-${suffix}` },
    );
    createdIds.push(created.id);

    const renamed = await updateModel(
      db,
      created.id,
      { name: `Alias Preserve Renamed ${suffix}` },
      { requestId: `req-ap-name-${suffix}` },
    );

    const beforeAliases = created.aliases
      .map((a) => ({
        alias: a.alias,
        aliasType: a.aliasType,
        accessProviderId: a.accessProviderId ?? null,
        normalizedAlias: a.normalizedAlias,
      }))
      .sort((a, b) => a.alias.localeCompare(b.alias));
    const afterAliases = renamed.aliases
      .map((a) => ({
        alias: a.alias,
        aliasType: a.aliasType,
        accessProviderId: a.accessProviderId ?? null,
        normalizedAlias: a.normalizedAlias,
      }))
      .sort((a, b) => a.alias.localeCompare(b.alias));
    expect(afterAliases).toEqual(beforeAliases);
    expect(afterAliases).toHaveLength(1);
    expect(afterAliases[0]).toMatchObject({
      alias: `prov-alias-${suffix}`,
      aliasType: "provider",
      accessProviderId: provider.id,
    });
    expect(typeof afterAliases[0].normalizedAlias).toBe("string");

    const updateEvent = renamed.history.find(
      (h) => h.action === "update" && h.requestId === `req-ap-name-${suffix}`,
    );
    expect(updateEvent).toBeTruthy();
    const before = updateEvent?.beforeData as { aliases?: unknown[]; name?: string };
    const after = updateEvent?.afterData as { aliases?: unknown[]; name?: string };
    expect(before?.aliases).toEqual(after?.aliases);
    expect(after?.name).toContain("Renamed");
  });

  it("rolls back alias insert when audit fails (no orphan alias)", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const created = await createModel(
      db,
      {
        canonicalId: `mmtest:alias-rb-${suffix}`,
        name: `Alias RB ${suffix}`,
        developerId: devId,
      },
      { requestId: `req-alias-rb-create-${suffix}` },
    );
    createdIds.push(created.id);

    try {
      await client.unsafe(`
        CREATE OR REPLACE FUNCTION fail_test_alias_audit() RETURNS trigger AS $$
        BEGIN
          IF NEW.request_id IS NOT NULL AND NEW.request_id LIKE 'req-alias-fail-%' THEN
            RAISE EXCEPTION 'forced audit failure for alias rollback test';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_fail_alias_audit ON audit_events;
        CREATE TRIGGER trg_fail_alias_audit
          BEFORE INSERT ON audit_events
          FOR EACH ROW EXECUTE FUNCTION fail_test_alias_audit();
      `);

      await expect(
        addModelAlias(
          db,
          created.id,
          { alias: `should-not-persist-${suffix}`, aliasType: "short" },
          { requestId: `req-alias-fail-${suffix}` },
        ),
      ).rejects.toBeTruthy();

      const aliases = await db
        .select()
        .from(schema.modelAliases)
        .where(eq(schema.modelAliases.modelId, created.id));
      expect(aliases.some((a) => a.alias === `should-not-persist-${suffix}`)).toBe(false);
    } finally {
      await client.unsafe(`
        DROP TRIGGER IF EXISTS trg_fail_alias_audit ON audit_events;
        DROP FUNCTION IF EXISTS fail_test_alias_audit();
      `);
    }
  });
});

describe("score pivot and global score pagination", () => {
  it("mapModelRow keeps newest score per type while history retains both", async () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000001",
      developerId: "00000000-0000-4000-8000-000000000002",
      canonicalId: "mmtest:map",
      name: "Map",
      slug: "map",
      family: null,
      generation: null,
      lifecycle: "unknown" as const,
      lifecycleRaw: null,
      releaseDate: null,
      knowledgeCutoff: null,
      modelType: null,
      description: null,
      codingSpecialization: null,
      bestUse: null,
      avoidFor: null,
      contextTokens: null,
      maxOutputTokens: null,
      speedRating: null,
      verifiedTps: null,
      verificationStatus: null,
      verifiedAt: null,
      needsRecheck: true,
      metadata: {},
      status: "active" as const,
      archivedAt: null,
      mergedIntoModelId: null,
      isFavourite: false,
      needsReview: false,
      workflowStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mapped = mapModelRow(row, {
      scores: [
        { scoreType: "capability", scoreValue: "99", rankValue: 1 },
        { scoreType: "capability", scoreValue: "10", rankValue: 9 },
      ],
    });
    expect(mapped.scores.capability?.value).toBe(99);
    expect(mapped.scores.capability?.value).not.toBe(10);
  });

  it("capability sort is global DB-side order across pages", async () => {
    if (!methodologyId) throw new Error("methodologyId missing");
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const scores = [10, 90, 40, 70, 20, 60, 30, 80, 50, 15, 95, 5];
    const ids: string[] = [];

    for (let i = 0; i < scores.length; i += 1) {
      const m = await createModel(
        db,
        {
          canonicalId: `mmtest:score-page-${suffix}-${i}`,
          name: `ScorePage ${suffix} ${String(i).padStart(2, "0")}`,
          developerId: devId,
          family: `score-page-${suffix}`,
        },
        { requestId: `req-sp-${suffix}-${i}` },
      );
      createdIds.push(m.id);
      ids.push(m.id);
      const [score] = await db
        .insert(schema.modelScores)
        .values({
          modelId: m.id,
          methodologyId,
          scoreType: "capability",
          scoreValue: String(scores[i]),
          rankValue: null,
          calculatedAt: new Date(Date.now() - i * 1000),
        })
        .returning({ id: schema.modelScores.id });
      createdScoreIds.push(score.id);
    }

    // Also insert an older lower score on the top model to prove newest-wins in list pivot.
    const topIdx = scores.indexOf(95);
    const topId = ids[topIdx];
    if (!topId) throw new Error("missing top model");
    const [oldScore] = await db
      .insert(schema.modelScores)
      .values({
        modelId: topId,
        methodologyId,
        scoreType: "capability",
        scoreValue: "1",
        calculatedAt: new Date(Date.now() - 86_400_000),
      })
      .returning({ id: schema.modelScores.id });
    createdScoreIds.push(oldScore.id);

    const page1 = await listModels(db, {
      family: `score-page-${suffix}`,
      sort: "-capability",
      limit: 5,
      page: 1,
    });
    expect(page1.data).toHaveLength(5);
    const page1Values = page1.data.map((m) => m.scores.capability?.value);
    expect(page1Values).toEqual([95, 90, 80, 70, 60]);

    const page2 = await listModels(db, {
      family: `score-page-${suffix}`,
      sort: "-capability",
      limit: 5,
      page: 2,
    });
    const page2Values = page2.data.map((m) => m.scores.capability?.value);
    expect(page2Values[0]).toBe(50);

    const detail = await getModelById(db, topId);
    expect(detail.scores.capability?.value).toBe(95);
    expect(detail.scoreRecords.some((s) => s.scoreValue === 1)).toBe(true);
    expect(detail.scoreRecords.some((s) => s.scoreValue === 95)).toBe(true);
  });
});

describe("transactional relationship-preserving merge", () => {
  it("transfers relationships, pricing, capabilities, usage, provenance; honors resolutions; idempotent replay", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    if (!planId || !methodologyId || !benchmarkId || !subscriptionId) {
      throw new Error("missing seed plan/methodology/benchmark/subscription");
    }

    const target = await createModel(
      db,
      {
        canonicalId: `mmtest:merge-target-${suffix}`,
        name: `Merge Target ${suffix}`,
        developerId: devId,
        capabilities: { vision: true, reasoning: null, toolUse: false, details: { a: 1 } },
        aliases: [{ alias: `target-keep-${suffix}`, aliasType: "display" }],
      },
      { requestId: `req-t-${suffix}` },
    );
    createdIds.push(target.id);

    const source = await createModel(
      db,
      {
        canonicalId: `mmtest:merge-source-${suffix}`,
        name: `Merge Source ${suffix}`,
        developerId: devId,
        capabilities: {
          vision: false,
          reasoning: true,
          toolUse: true,
          details: { a: 2, b: 3 },
        },
        aliases: [
          { alias: `only-source-${suffix}`, aliasType: "short" },
          { alias: `target-keep-${suffix}-x`, aliasType: "display" },
        ],
      },
      { requestId: `req-s-${suffix}` },
    );
    createdIds.push(source.id);

    // Note: normalized aliases are globally unique, so collision cases are
    // covered by planAliasMerge unit tests; here we transfer distinct aliases.

    // Duplicate access path + unique access path
    const [targetAccess] = await db
      .insert(schema.modelAccess)
      .values({
        modelId: target.id,
        planId,
        providerModelId: `dup-${suffix}`,
        availability: "unconfirmed",
        accessMethod: "other",
        authenticationType: "other",
        status: "active",
        apiCompatible: null,
      })
      .returning();
    createdAccessIds.push(targetAccess.id);

    const [sourceDupAccess] = await db
      .insert(schema.modelAccess)
      .values({
        modelId: source.id,
        planId,
        providerModelId: `dup-${suffix}`,
        availability: "confirmed",
        accessMethod: "provider_api",
        authenticationType: "api_key",
        status: "active",
        apiCompatible: true,
        notes: "source-stronger",
      })
      .returning();
    createdAccessIds.push(sourceDupAccess.id);

    const [sourceOnlyAccess] = await db
      .insert(schema.modelAccess)
      .values({
        modelId: source.id,
        planId,
        providerModelId: `only-${suffix}`,
        availability: "confirmed",
        accessMethod: "provider_api",
        status: "active",
      })
      .returning();
    createdAccessIds.push(sourceOnlyAccess.id);

    const [pricing] = await db
      .insert(schema.modelAccessPricing)
      .values({
        modelAccessId: sourceDupAccess.id,
        currency: "USD",
        inputPerMillion: "1.5",
        outputPerMillion: "2.5",
      })
      .returning();
    createdPricingIds.push(pricing.id);

    const [score] = await db
      .insert(schema.modelScores)
      .values({
        modelId: source.id,
        methodologyId,
        scoreType: "balanced",
        scoreValue: "77.7",
        calculatedAt: new Date(),
      })
      .returning();
    createdScoreIds.push(score.id);

    const [bench] = await db
      .insert(schema.modelBenchmarkResults)
      .values({
        modelId: source.id,
        benchmarkId,
        score: "88.8",
        sourceUrl: "https://example.com/bench",
      })
      .returning();
    createdBenchIds.push(bench.id);

    const [src] = await db
      .insert(schema.sources)
      .values({
        entityType: "model",
        entityId: source.id,
        sourceType: "manual",
        title: `source-${suffix}`,
        url: "https://example.com/source",
        verifiedAt: new Date(),
      })
      .returning();
    createdSourceIds.push(src.id);

    // Provenance fixture is mandatory — create a scoped import job + model and model_access provenance.
    const [owner] = await client<{ id: string }[]>`SELECT id FROM users ORDER BY created_at LIMIT 1`;
    if (!owner?.id) throw new Error("owner user missing for provenance fixture");
    const ownerId = String(owner.id);
    const [importJob] = await client<{ id: string }[]>`
      INSERT INTO import_jobs (user_id, filename, stored_path, sha256, parser_version, status)
      VALUES (
        ${ownerId}::uuid,
        ${`mmtest:merge-${suffix}.xlsx`},
        ${`/tmp/mmtest:merge-${suffix}.xlsx`},
        ${`sha-${suffix}`},
        'test-1',
        'committed'
      )
      RETURNING id
    `;
    const importJobId = String(importJob.id);
    const [provModel] = await db
      .insert(schema.importProvenance)
      .values({
        importJobId,
        entityType: "model",
        entityId: source.id,
        sourceSheet: "test",
        sourceRow: 1,
      })
      .returning();
    createdProvIds.push(provModel.id);

    const [accessSrc] = await db
      .insert(schema.sources)
      .values({
        entityType: "model_access",
        entityId: sourceDupAccess.id,
        sourceType: "manual",
        title: `access-source-${suffix}`,
        url: "https://example.com/access-source",
      })
      .returning();
    createdSourceIds.push(accessSrc.id);

    const [provAccess] = await db
      .insert(schema.importProvenance)
      .values({
        importJobId,
        entityType: "model_access",
        entityId: sourceDupAccess.id,
        sourceSheet: "access",
        sourceRow: 2,
      })
      .returning();
    createdProvIds.push(provAccess.id);

    const [usage] = await db
      .insert(schema.usageSnapshots)
      .values({
        subscriptionId,
        modelId: source.id,
        source: "manual",
        isMock: true,
        capturedAt: new Date(),
        usedAmount: "12",
      })
      .returning();
    createdUsageIds.push(usage.id);

    // Pre-existing audit on source must remain after merge
    const beforeHistory = await getModelById(db, source.id);
    const priorAuditCount = beforeHistory.history.length;

    const mergeBody = {
      sourceModelId: source.id,
      targetModelId: target.id,
      resolutions: {
        name: `Merged Name ${suffix}`,
        description: "resolved description",
      },
    };

    const idemKey = `mmtest:merge-idem-${suffix}`;
    idemKeys.push(idemKey);
    const hash = hashIdempotencyPayload(mergeBody);

    const first = await withIdempotency(
      db,
      { key: idemKey, operation: "models.merge", requestHash: hash },
      (tx) => mergeModelsInTransaction(tx, mergeBody, { requestId: `req-merge-${suffix}` }),
    );
    expect(first.replay).toBe(false);
    const result = first.body as {
      targetModelId: string;
      auditEventId: string;
      transferred: Record<string, number>;
      appliedResolutions: Record<string, unknown>;
    };
    expect(result.targetModelId).toBe(target.id);
    expect(result.transferred.aliases).toBeGreaterThanOrEqual(2);
    expect(result.transferred.access).toBe(1);
    expect(result.transferred.accessDeduped).toBe(1);
    expect(result.transferred.pricingMoved).toBe(1);
    expect(result.transferred.benchmarks).toBe(1);
    expect(result.transferred.scores).toBe(1);
    expect(result.transferred.sources).toBe(1);
    expect(result.transferred.provenance).toBe(1);
    expect(result.transferred.usageSnapshots).toBe(1);
    expect(result.appliedResolutions.name).toBe(`Merged Name ${suffix}`);
    expect(result.auditEventId).toBeTruthy();

    const second = await withIdempotency(
      db,
      { key: idemKey, operation: "models.merge", requestHash: hash },
      (tx) => mergeModelsInTransaction(tx, mergeBody, { requestId: `req-merge-replay-${suffix}` }),
    );
    expect(second.replay).toBe(true);
    expect((second.body as { auditEventId: string }).auditEventId).toBe(result.auditEventId);

    const sourceAfter = await getModelById(db, source.id);
    expect(sourceAfter.status).toBe("archived");
    expect(sourceAfter.mergedIntoModelId).toBe(target.id);
    // Prior audit events still present (immutable, not deleted/re-parented away)
    expect(sourceAfter.history.length).toBeGreaterThanOrEqual(priorAuditCount);

    const targetAfter = await getModelById(db, target.id);
    expect(targetAfter.name).toBe(`Merged Name ${suffix}`);
    expect(targetAfter.description).toBe("resolved description");
    expect(targetAfter.aliases.some((a) => a.alias === `only-source-${suffix}`)).toBe(true);
    expect(targetAfter.aliases.some((a) => a.aliasType === "short")).toBe(true);
    expect(targetAfter.capabilities?.vision).toBe(true); // target wins
    expect(targetAfter.capabilities?.reasoning).toBe(true); // source fills null
    expect(targetAfter.capabilities?.toolUse).toBe(false); // target explicit false wins
    expect((targetAfter.capabilities?.details as { a: number; b: number }).a).toBe(1);
    expect((targetAfter.capabilities?.details as { a: number; b: number }).b).toBe(3);
    expect(targetAfter.sources.some((s) => s.title === `source-${suffix}`)).toBe(true);
    expect(targetAfter.scoreRecords.some((s) => s.scoreValue === 77.7)).toBe(true);
    expect(targetAfter.benchmarks.some((b) => b.score === 88.8)).toBe(true);
    expect(targetAfter.history.some((h) => h.action === "merge")).toBe(true);

    // Pricing survived on target access
    const pricingRows = await client`
      SELECT p.id, p.model_access_id, p.input_per_million
      FROM model_access_pricing p
      JOIN model_access a ON a.id = p.model_access_id
      WHERE a.model_id = ${target.id}::uuid
    `;
    expect(pricingRows.length).toBeGreaterThanOrEqual(1);
    expect(Number(pricingRows[0].input_per_million)).toBeCloseTo(1.5);

    // Duplicate access metadata not degraded
    const [dupAccess] = await client`
      SELECT availability, api_compatible, notes, status, access_method, authentication_type
      FROM model_access
      WHERE model_id = ${target.id}::uuid AND provider_model_id = ${`dup-${suffix}`}
    `;
    expect(dupAccess.availability).toBe("confirmed");
    expect(dupAccess.api_compatible).toBe(true);
    expect(dupAccess.notes).toBe("source-stronger");
    expect(dupAccess.status).toBe("active");
    expect(dupAccess.access_method).toBe("provider_api");
    expect(dupAccess.authentication_type).toBe("api_key");

    // Access-level sources/provenance must repoint to surviving access UUID (no dangling)
    const [survivingAccess] = await client`
      SELECT id FROM model_access
      WHERE model_id = ${target.id}::uuid AND provider_model_id = ${`dup-${suffix}`}
    `;
    expect(survivingAccess?.id).toBeTruthy();

    const accessSrcRows = await client`
      SELECT entity_id FROM sources
      WHERE entity_type = 'model_access' AND title = ${`access-source-${suffix}`}
    `;
    expect(accessSrcRows.length).toBe(1);
    expect(accessSrcRows[0].entity_id).toBe(survivingAccess.id);

    const accessProvRows = await client`
      SELECT entity_id FROM import_provenance
      WHERE entity_type = 'model_access' AND source_sheet = 'access' AND source_row = 2
        AND import_job_id = ${importJobId}::uuid
    `;
    expect(accessProvRows.length).toBe(1);
    expect(accessProvRows[0].entity_id).toBe(survivingAccess.id);

    const modelProvRows = await client`
      SELECT entity_id FROM import_provenance
      WHERE entity_type = 'model' AND entity_id = ${target.id}::uuid AND source_sheet = 'test'
    `;
    expect(modelProvRows.length).toBe(1);

    const usageRows = await client`
      SELECT id FROM usage_snapshots WHERE model_id = ${target.id}::uuid
    `;
    expect(usageRows.length).toBeGreaterThanOrEqual(1);
  });

  it("rolls back merge after mutations have begun via controlled DB failure", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);

    const target = await createModel(
      db,
      {
        canonicalId: `mmtest:merge-fail-target-${suffix}`,
        name: `Merge Fail Target ${suffix}`,
        developerId: devId,
        aliases: [{ alias: `fail-target-alias-${suffix}`, aliasType: "display" }],
      },
      { requestId: `req-ft-${suffix}` },
    );
    createdIds.push(target.id);

    const source = await createModel(
      db,
      {
        canonicalId: `mmtest:merge-fail-source-${suffix}`,
        name: `Merge Fail Source ${suffix}`,
        developerId: devId,
        aliases: [{ alias: `fail-source-alias-${suffix}`, aliasType: "short" }],
      },
      { requestId: `req-fs-${suffix}` },
    );
    createdIds.push(source.id);

    await db.insert(schema.sources).values({
      entityType: "model",
      entityId: source.id,
      sourceType: "manual",
      title: `fail-source-${suffix}`,
      url: "https://example.com/fail-source",
    });

    try {
      await client.unsafe(`
        CREATE OR REPLACE FUNCTION fail_test_merge_midway() RETURNS trigger AS $$
        BEGIN
          IF NEW.merged_into_model_id IS NOT NULL AND NEW.canonical_id LIKE 'mmtest:merge-fail-source-%' THEN
            RAISE EXCEPTION 'forced merge failure after mutations';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_fail_merge_midway ON models;
        CREATE TRIGGER trg_fail_merge_midway
          BEFORE UPDATE ON models
          FOR EACH ROW EXECUTE FUNCTION fail_test_merge_midway();
      `);

      await expect(
        mergeModels(
          db,
          { sourceModelId: source.id, targetModelId: target.id },
          { requestId: `req-merge-fail-${suffix}` },
        ),
      ).rejects.toBeTruthy();
    } finally {
      await client.unsafe(`
        DROP TRIGGER IF EXISTS trg_fail_merge_midway ON models;
        DROP FUNCTION IF EXISTS fail_test_merge_midway();
      `);
    }

    const sourceAfter = await getModelById(db, source.id);
    expect(sourceAfter.status).toBe("active");
    expect(sourceAfter.mergedIntoModelId).toBeNull();
    expect(sourceAfter.aliases.some((a) => a.alias === `fail-source-alias-${suffix}`)).toBe(true);
    expect(sourceAfter.sources.some((s) => s.title === `fail-source-${suffix}`)).toBe(true);

    const targetAfter = await getModelById(db, target.id);
    expect(targetAfter.aliases.some((a) => a.alias === `fail-source-alias-${suffix}`)).toBe(false);
    expect(targetAfter.sources.some((s) => s.title === `fail-source-${suffix}`)).toBe(false);
  });

  it("rolls back merge when target is missing", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const source = await createModel(
      db,
      {
        canonicalId: `mmtest:merge-rb-${suffix}`,
        name: `Merge RB ${suffix}`,
        developerId: devId,
      },
      { requestId: `req-rb-${suffix}` },
    );
    createdIds.push(source.id);

    await expect(
      mergeModels(db, {
        sourceModelId: source.id,
        targetModelId: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const still = await getModelById(db, source.id);
    expect(still.status).toBe("active");
    expect(still.mergedIntoModelId).toBeNull();
  });

  it("rejects unsupported resolution keys", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const target = await createModel(
      db,
      {
        canonicalId: `mmtest:res-t-${suffix}`,
        name: `Res T ${suffix}`,
        developerId: devId,
      },
      { requestId: `req-rt-${suffix}` },
    );
    createdIds.push(target.id);
    const source = await createModel(
      db,
      {
        canonicalId: `mmtest:res-s-${suffix}`,
        name: `Res S ${suffix}`,
        developerId: devId,
      },
      { requestId: `req-rs-${suffix}` },
    );
    createdIds.push(source.id);

    await expect(
      mergeModels(db, {
        sourceModelId: source.id,
        targetModelId: target.id,
        resolutions: { notAField: "x" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("seed integrity remains", () => {
  it("keeps 51 active seed models after temporary test rows", async () => {
    const [counts] = await client`
      SELECT
        (SELECT COUNT(*)::int FROM models WHERE status = 'active' AND canonical_id NOT LIKE 'mmtest:%' AND canonical_id NOT LIKE 'mme2e:%') as models,
        (SELECT COUNT(*)::int FROM subscriptions WHERE status = 'active') as subscriptions,
        (SELECT COUNT(*)::int FROM model_access WHERE status = 'active' AND model_id IN (SELECT id FROM models WHERE canonical_id NOT LIKE 'mmtest:%' AND canonical_id NOT LIKE 'mme2e:%')) as model_access,
        (SELECT COUNT(*)::int FROM model_benchmark_results WHERE seed_key LIKE 'mm-baseline:bench:%') as benchmarks
    `;
    expect(Number(counts.models)).toBe(51);
    expect(Number(counts.subscriptions)).toBe(4);
    expect(Number(counts.model_access)).toBe(19);
    expect(Number(counts.benchmarks)).toBe(276);
  });
});

describe("repair F — tombstone, audit, concurrency, provider filter", () => {
  type JsonObj = Record<string, unknown>;
  function asObj(v: unknown): JsonObj {
    return (v ?? {}) as JsonObj;
  }

  it("rejects updateModel and addModelAlias on merged tombstones with 409", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const target = await createModel(db, {
      canonicalId: `mmtest:tomb-t-${suffix}`,
      name: `Tomb T ${suffix}`,
      developerId: devId,
    }, { requestId: `req-tt-${suffix}` });
    createdIds.push(target.id);
    const source = await createModel(db, {
      canonicalId: `mmtest:tomb-s-${suffix}`,
      name: `Tomb S ${suffix}`,
      developerId: devId,
    }, { requestId: `req-ts-${suffix}` });
    createdIds.push(source.id);
    await mergeModels(db, { sourceModelId: source.id, targetModelId: target.id }, { requestId: `req-tm-${suffix}` });

    await expect(updateModel(db, source.id, { name: "nope" })).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
    await expect(
      addModelAlias(db, source.id, { alias: `blocked-${suffix}`, aliasType: "display" }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("records complete audit snapshots for update/archive/restore including timestamps", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const model = await createModel(db, {
      canonicalId: `mmtest:audit-${suffix}`,
      name: `Audit ${suffix}`,
      developerId: devId,
      family: "audit-family",
    }, { requestId: `req-a0-${suffix}` });
    createdIds.push(model.id);

    await updateModel(db, model.id, { description: "after-update" }, { requestId: `req-a1-${suffix}` });
    const [upd] = await client`
      SELECT before_data, after_data FROM audit_events
      WHERE entity_id = ${model.id}::uuid AND action = 'update'
      ORDER BY created_at DESC LIMIT 1
    `;
    const updAfter = asObj(upd.after_data);
    const updBefore = asObj(upd.before_data);
    expect(updAfter.updatedAt).toBeTruthy();
    expect(updAfter.description).toBe("after-update");
    expect(updBefore.canonicalId).toBe(`mmtest:audit-${suffix}`);
    expect(updAfter).toHaveProperty("archivedAt");
    expect(updAfter).toHaveProperty("capabilities");
    expect(updAfter).toHaveProperty("aliases");

    await archiveModel(db, model.id, { requestId: `req-a2-${suffix}` });
    const [arch] = await client`
      SELECT before_data, after_data FROM audit_events
      WHERE entity_id = ${model.id}::uuid AND action = 'archive'
      ORDER BY created_at DESC LIMIT 1
    `;
    const archBefore = asObj(arch.before_data);
    const archAfter = asObj(arch.after_data);
    expect(archBefore.status).toBe("active");
    expect(archAfter.status).toBe("archived");
    expect(archAfter.archivedAt).toBeTruthy();
    expect(archAfter.updatedAt).toBeTruthy();

    await restoreModel(db, model.id, { requestId: `req-a3-${suffix}` });
    const [rest] = await client`
      SELECT before_data, after_data FROM audit_events
      WHERE entity_id = ${model.id}::uuid AND action = 'restore'
      ORDER BY created_at DESC LIMIT 1
    `;
    const restBefore = asObj(rest.before_data);
    const restAfter = asObj(rest.after_data);
    expect(restBefore.status).toBe("archived");
    expect(restAfter.status).toBe("active");
    expect(restAfter.archivedAt).toBeNull();
  });

  it("merge audit contains full source/target snapshots including pricing ownership", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const target = await createModel(db, {
      canonicalId: `mmtest:maud-t-${suffix}`,
      name: `MAud T ${suffix}`,
      developerId: devId,
      aliases: [{ alias: `maud-t-${suffix}`, aliasType: "display" }],
      capabilities: { vision: true, reasoning: null, toolUse: false },
    }, { requestId: `req-mat-${suffix}` });
    createdIds.push(target.id);
    const source = await createModel(db, {
      canonicalId: `mmtest:maud-s-${suffix}`,
      name: `MAud S ${suffix}`,
      developerId: devId,
      aliases: [{ alias: `maud-s-${suffix}`, aliasType: "short" }],
      capabilities: { vision: null, reasoning: true, toolUse: null },
    }, { requestId: `req-mas-${suffix}` });
    createdIds.push(source.id);
    await client`
      UPDATE models
      SET metadata = '{"access_token":"a","refresh-token":"b","apiToken":"c","PRIVATE_KEY":"d","password":"e","secret":"f","contextTokens":8192,"maxOutputTokens":1024,"verifiedTps":12.5}'::jsonb
      WHERE id IN (${source.id}::uuid, ${target.id}::uuid)
    `;

    const [plan] = await client<{ id: string }[]>`SELECT id FROM plans LIMIT 1`;
    const [srcAccess] = await client<{ id: string }[]>`
      INSERT INTO model_access (model_id, plan_id, availability, access_method, status)
      VALUES (${source.id}::uuid, ${plan.id}::uuid, 'confirmed', 'provider_api', 'active')
      RETURNING id
    `;
    createdAccessIds.push(String(srcAccess.id));
    const [targetAccess] = await client<{ id: string }[]>`
      INSERT INTO model_access (model_id, plan_id, provider_model_id, availability, access_method, status)
      VALUES (${target.id}::uuid, ${plan.id}::uuid, 'maud-provider-model', 'unconfirmed', 'web', 'active')
      RETURNING id
    `;
    createdAccessIds.push(String(targetAccess.id));
    await client`
      UPDATE model_access SET provider_model_id = 'maud-provider-model'
      WHERE id = ${srcAccess.id}::uuid
    `;
    const [pricing] = await client<{ id: string }[]>`
      INSERT INTO model_access_pricing (model_access_id, currency, input_per_million, output_per_million)
      VALUES (${srcAccess.id}::uuid, 'USD', 1.25, 2.5)
      RETURNING id
    `;
    createdPricingIds.push(String(pricing.id));
    const [srcSource] = await client<{ id: string }[]>`
      INSERT INTO sources (entity_type, entity_id, source_type, title, url)
      VALUES ('model', ${source.id}::uuid, 'manual', 'mmtest:maud-src', 'https://example.com/maud-s')
      RETURNING id
    `;
    createdSourceIds.push(String(srcSource.id));
    const [accessSource] = await client<{ id: string }[]>`
      INSERT INTO sources (entity_type, entity_id, source_type, title, url)
      VALUES ('model_access', ${srcAccess.id}::uuid, 'manual', 'mmtest:maud-access', 'https://example.com/maud-a')
      RETURNING id
    `;
    createdSourceIds.push(String(accessSource.id));
    const [bench] = await client<{ id: string }[]>`SELECT id FROM benchmarks LIMIT 1`;
    const [br] = await client<{ id: string }[]>`
      INSERT INTO model_benchmark_results (model_id, benchmark_id, setting, score_text, source_type)
      VALUES (${source.id}::uuid, ${bench.id}::uuid, 'mmtest:maud-setting', '55', 'manual')
      RETURNING id
    `;
    createdBenchIds.push(String(br.id));
    const [methodology] = await client<{ id: string }[]>`
      INSERT INTO score_methodologies (name, version, factors)
      VALUES ('mmtest:maud-method', '1', '{}'::jsonb) RETURNING id
    `;
    for (const [modelId, value] of [[source.id, '82.5'], [target.id, '77.25']] as const) {
      await client`
        INSERT INTO model_scores (model_id, methodology_id, score_type, score_value, calculated_at)
        VALUES (${modelId}::uuid, ${methodology.id}::uuid, 'balanced', ${value}, '2024-01-02T00:00:00Z'::timestamptz)
      `;
    }
    const [sub] = await client<{ id: string }[]>`SELECT id FROM subscriptions ORDER BY id LIMIT 1`;
    for (const modelId of [source.id, target.id]) {
      await client`
        INSERT INTO usage_snapshots (subscription_id, model_id, source, is_mock, period_label, used_percent, captured_at, raw_payload)
        VALUES (${sub.id}::uuid, ${modelId}::uuid, 'mock', true, ${`mmtest:maud-${modelId}`}, 12.5, '2024-01-03T00:00:00Z'::timestamptz, '{"contextTokens": 8, "access_token": "secret"}'::jsonb)
      `;
    }
    const [user] = await client<{ id: string }[]>`SELECT id FROM users ORDER BY id LIMIT 1`;
    const [job] = await client<{ id: string }[]>`
      INSERT INTO import_jobs (user_id, filename, stored_path, sha256, parser_version)
      VALUES (${user.id}::uuid, 'mmtest:maud-import', 'mmtest:path', 'mmtest:sha', 'test') RETURNING id
    `;
    for (const modelId of [source.id, target.id]) {
      await client`
        INSERT INTO import_provenance (import_job_id, entity_type, entity_id, source_sheet, source_row, raw_value)
        VALUES (${job.id}::uuid, 'model', ${modelId}::uuid, 'mmtest:models', 1, '{"PRIVATE_KEY":"secret", "verifiedTps": 4}'::jsonb)
      `;
    }

    await mergeModels(db, { sourceModelId: source.id, targetModelId: target.id }, { requestId: `req-mam-${suffix}` });
    const [ev] = await client`
      SELECT before_data, after_data, metadata FROM audit_events
      WHERE entity_id = ${target.id}::uuid AND action = 'merge'
      ORDER BY created_at DESC LIMIT 1
    `;
    const before = asObj(ev.before_data);
    const after = asObj(ev.after_data);
    const meta = asObj(ev.metadata);
    const beforeSource = asObj(before.source);
    const beforeTarget = asObj(before.target);
    const beforeRels = asObj(before.relationships);
    const afterSource = asObj(after.source);
    const afterTarget = asObj(after.target);
    const afterRels = asObj(after.relationships);
    const counts = asObj(meta.relationshipCounts);

    expect(beforeSource.canonicalId).toBe(`mmtest:maud-s-${suffix}`);
    expect(beforeTarget.canonicalId).toBe(`mmtest:maud-t-${suffix}`);
    expect(beforeSource.contextTokens).not.toBe("[REDACTED]");
    expect(beforeTarget.contextTokens).not.toBe("[REDACTED]");
    const { updatedAt: _sourceCapsUpdatedAt, ...sourceCapsStable } = beforeSource.capabilities as Record<string, unknown>;
    const { updatedAt: _targetCapsUpdatedAt, ...targetCapsStable } = beforeTarget.capabilities as Record<string, unknown>;
    expect(sourceCapsStable).toEqual({
      modelId: source.id, vision: null, reasoning: true, toolUse: null,
      parallelAgents: null, computerUse: null, audioInput: null, videoInput: null,
      imageInput: null, structuredOutput: null, functionCalling: null, details: {},
    });
    expect(targetCapsStable).toEqual({
      modelId: target.id, vision: true, reasoning: null, toolUse: false,
      parallelAgents: null, computerUse: null, audioInput: null, videoInput: null,
      imageInput: null, structuredOutput: null, functionCalling: null, details: {},
    });

    // Exact deterministic relationship pre-images
    expect((beforeRels.sourceAliases as Array<Record<string, unknown>>).map((x) => ({ alias: x.alias, aliasType: x.aliasType }))).toEqual([
      { alias: `maud-s-${suffix}`, aliasType: "short" },
    ]);
    expect((beforeRels.targetAliases as Array<Record<string, unknown>>).map((x) => ({ alias: x.alias, aliasType: x.aliasType }))).toEqual([
      { alias: `maud-t-${suffix}`, aliasType: "display" },
    ]);
    expect(beforeRels.sourceAccess).toHaveLength(1);
    const srcAccessBefore = (beforeRels.sourceAccess as Array<Record<string, unknown>>)[0];
    expect(srcAccessBefore.pricing).toHaveLength(1);
    expect(String((srcAccessBefore.pricing as Array<Record<string, unknown>>)[0].currency)).toBe("USD");
    expect(Number((srcAccessBefore.pricing as Array<Record<string, unknown>>)[0].inputPerMillion)).toBeCloseTo(1.25);
    expect(Number((srcAccessBefore.pricing as Array<Record<string, unknown>>)[0].outputPerMillion)).toBeCloseTo(2.5);
    expect((beforeRels.sourceBenchmarks as Array<Record<string, unknown>>).map((x) => ({ id: x.id, setting: x.setting, scoreText: x.scoreText }))).toEqual([
      { id: String(br.id), setting: "mmtest:maud-setting", scoreText: "55" },
    ]);
    expect((beforeRels.sourceSources as Array<Record<string, unknown>>).map((x) => ({ id: x.id, title: x.title })).sort((a, b) => String(a.id).localeCompare(String(b.id)))).toEqual([
      { id: String(srcSource.id), title: "mmtest:maud-src" },
      { id: String(accessSource.id), title: "mmtest:maud-access" },
    ].sort((a, b) => String(a.id).localeCompare(String(b.id))));
    expect((beforeRels.sourceScores as unknown[]).length).toBe(1);
    expect((beforeRels.sourceUsage as unknown[]).length).toBe(1);
    expect((beforeRels.sourceProvenance as unknown[]).length).toBe(1);
    const sourceMetadata = beforeSource.metadata as Record<string, unknown>;
    expect(sourceMetadata.access_token).toBe("[REDACTED]");
    expect(sourceMetadata["refresh-token"]).toBe("[REDACTED]");
    expect(sourceMetadata.apiToken).toBe("[REDACTED]");
    expect(sourceMetadata.PRIVATE_KEY).toBe("[REDACTED]");
    expect(sourceMetadata.password).toBe("[REDACTED]");
    expect(sourceMetadata.secret).toBe("[REDACTED]");
    expect(sourceMetadata.contextTokens).toBe(8192);
    expect(sourceMetadata.maxOutputTokens).toBe(1024);
    expect(sourceMetadata.verifiedTps).toBe(12.5);

    expect(afterSource.mergedIntoModelId).toBe(target.id);
    expect(afterSource.status).toBe("archived");
    expect((afterTarget.aliases as unknown[]).length).toBe(2);
    expect((afterRels.targetBenchmarks as Array<Record<string, unknown>>).map((x) => String(x.id))).toEqual([String(br.id)]);
    expect(afterRels.sourceBenchmarks).toEqual([]);
    expect(Number(counts.aliases)).toBe(1);
    expect(Number(counts.benchmarks)).toBe(1);
    expect(Number(counts.access)).toBe(0);
    expect(Number(counts.sources)).toBe(1);
    expect(Number(counts.pricingMoved)).toBe(1);
    const tgtAccessAfter = afterRels.targetAccess as Array<Record<string, unknown>>;
    expect(tgtAccessAfter).toHaveLength(1);
    expect(tgtAccessAfter[0].pricing).toHaveLength(1);
    expect(String((tgtAccessAfter[0].pricing as Array<Record<string, unknown>>)[0].id)).toBe(String(pricing.id));
    expect(Number((tgtAccessAfter[0].pricing as Array<Record<string, unknown>>)[0].inputPerMillion)).toBeCloseTo(1.25);
    const reconciliation = afterRels.accessReconciliation as { transferred: number; deduped: number; pricingMoved: number; policy: unknown[] };
    expect(reconciliation.transferred).toBe(0);
    expect(reconciliation.deduped).toBe(1);
    expect(reconciliation.pricingMoved).toBe(1);
    expect(reconciliation.policy).toHaveLength(1);
    expect(reconciliation.policy[0]).toEqual({
      sourceAccessId: String(srcAccess.id),
      targetAccessId: String(targetAccess.id),
      pricingRowsMoved: 1,
      sourcesRepointed: 1,
      provenanceRepointed: 0,
      availability: "confirmed",
      status: "active",
      authenticationType: "other",
      accessMethod: "web",
      policy: "target_key_wins_with_non_degrading_metadata_merge",
    });
  });

  it("blocks concurrent alias writer while merge locks are held and leaves no orphan", async () => {
    const devId = await developerId();
    const suffix = crypto.randomUUID().slice(0, 8);
    const target = await createModel(db, {
      canonicalId: `mmtest:conc-t-${suffix}`,
      name: `Conc T ${suffix}`,
      developerId: devId,
    }, { requestId: `req-ct-${suffix}` });
    createdIds.push(target.id);
    const source = await createModel(db, {
      canonicalId: `mmtest:conc-s-${suffix}`,
      name: `Conc S ${suffix}`,
      developerId: devId,
    }, { requestId: `req-cs-${suffix}` });
    createdIds.push(source.id);

    const { sql } = await import("drizzle-orm");
    const goKey = 871001;
    const controller = postgres(resolveUrl(), { max: 1 });
    const mergeClient = postgres(resolveUrl(), { max: 1 });
    const mergeDb = drizzle(mergeClient, { schema }) as Db;
    const writerClient = postgres(resolveUrl(), { max: 1 });
    const writerDb = drizzle(writerClient, { schema }) as Db;

    try {
      await controller`SELECT pg_advisory_lock(${goKey})`;

      const mergePromise = mergeDb.transaction(async (tx) => {
        await tx.execute(sql`
          SELECT id FROM models
          WHERE id IN (${source.id}::uuid, ${target.id}::uuid)
          ORDER BY id
          FOR UPDATE
        `);
        await tx.execute(sql`SELECT pg_advisory_lock(${goKey})`);
        await tx.execute(sql`SELECT pg_advisory_unlock(${goKey})`);
        return mergeModelsInTransaction(
          tx,
          { sourceModelId: source.id, targetModelId: target.id },
          { requestId: `req-cm-${suffix}` },
        );
      });

      // Wait until merge session is waiting on goKey (blocked) — proves model locks are held.
      let mergeWaiting = false;
      for (let i = 0; i < 100; i += 1) {
        const [row] = await client<{ c: number }[]>`
          SELECT count(*)::int AS c
          FROM pg_locks
          WHERE locktype = 'advisory'
            AND classid = 0
            AND objid = ${goKey}
            AND granted = false
        `;
        if (Number(row.c) > 0) {
          mergeWaiting = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(mergeWaiting).toBe(true);

      const [{ pid: writerPid }] = await writerClient<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      let writerStarted = false;
      let writerDone = false;
      let writerErr: unknown = null;
      const writerPromise = (async () => {
        try {
          writerStarted = true;
          await addModelAlias(writerDb, source.id, {
            alias: `race-${suffix}`,
            aliasType: "display",
          });
        } catch (err) {
          writerErr = err;
        } finally {
          writerDone = true;
        }
      })();

      expect(writerStarted).toBe(true);
      // Observe this exact backend waiting on the row lock held by merge. PostgreSQL
      // exposes a row-lock wait as an ungranted transactionid/tuple lock; the PID
      // filter prevents unrelated activity from satisfying the proof.
      let writerBlockedOnModelRow = false;
      for (let i = 0; i < 100; i += 1) {
        const [row] = await client<{ c: number }[]>`
          SELECT count(*)::int AS c
          FROM pg_locks l
          JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE l.pid = ${Number(writerPid)}
            AND l.granted = false
            AND l.locktype IN ('transactionid', 'tuple')
            AND a.wait_event IS NOT NULL
            AND a.query ILIKE '%model%'
        `;
        if (Number(row.c) > 0) {
          writerBlockedOnModelRow = true;
          break;
        }
        if (writerDone) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(writerDone).toBe(false);
      expect(writerBlockedOnModelRow).toBe(true);

      await controller`SELECT pg_advisory_unlock(${goKey})`;
      await mergePromise;
      await writerPromise;
      expect(writerDone).toBe(true);

      const sourceAfter = await getModelById(db, source.id);
      const targetAfter = await getModelById(db, target.id);
      expect(sourceAfter.mergedIntoModelId).toBe(target.id);
      // Writer must fail with tombstone conflict after merge commits.
      expect(writerErr).toMatchObject({ code: "CONFLICT" });
      // Alias neither orphaned on source nor silently lost without conflict.
      expect(sourceAfter.aliases.some((a) => a.alias === `race-${suffix}`)).toBe(false);
      expect(targetAfter.aliases.some((a) => a.alias === `race-${suffix}`)).toBe(false);
      const [aliasOrphans] = await client<{ c: number }[]>`
        SELECT count(*)::int AS c FROM model_aliases
        WHERE alias = ${`race-${suffix}`}
      `;
      expect(Number(aliasOrphans.c)).toBe(0);
    } finally {
      await controller`SELECT pg_advisory_unlock_all()`.catch(() => undefined);
      await controller.end({ timeout: 1 }).catch(() => undefined);
      await mergeClient.end({ timeout: 1 }).catch(() => undefined);
      await writerClient.end({ timeout: 1 }).catch(() => undefined);
    }
  });

  it("provider filter returns only models with that access provider", async () => {
    const listed = await listModels(db, { accessProvider: "OpenCode", limit: 50 });
    expect(listed.data.length).toBeGreaterThan(0);
    for (const row of listed.data) {
      const detail = await getModelById(db, row.id);
      const providers = detail.access.map((a) => a.providerName);
      expect(providers.some((p) => /opencode/i.test(p))).toBe(true);
    }
  });
});

describe("fixture cleanup safety", () => {
  it("preserves legitimate unowned test-/e2e- prefixed rows byte-for-byte", async () => {
    const { cleanupTestModels } = await import("./cleanup-test-models");
    const suffix = crypto.randomUUID().slice(0, 8);
    const [dev] = await client<{ id: string }[]>`SELECT id FROM developers LIMIT 1`;
    const [legit] = await client<{ id: string }[]>`
      INSERT INTO models (developer_id, canonical_id, name, slug, lifecycle, status)
      VALUES (
        ${dev.id}::uuid,
        ${`user:legit-${suffix}`},
        ${`test-legit-name-${suffix}`},
        ${`test-legit-slug-${suffix}`},
        'unknown',
        'active'
      )
      RETURNING id
    `;
    const [src] = await client<{ id: string }[]>`
      INSERT INTO sources (entity_type, entity_id, source_type, title)
      VALUES ('model', ${legit.id}::uuid, 'manual', ${`test-title-${suffix}`})
      RETURNING id
    `;
    const [key] = await client<{ id: string }[]>`
      INSERT INTO idempotency_keys (key, operation, request_hash, status)
      VALUES (${`mm:merge:prod-${suffix}`}, 'models.merge', 'hash', 'completed')
      RETURNING id
    `;
    const beforeModel = await client`SELECT * FROM models WHERE id = ${legit.id}::uuid`;
    const beforeSrc = await client`SELECT * FROM sources WHERE id = ${src.id}::uuid`;
    const beforeKey = await client`SELECT * FROM idempotency_keys WHERE id = ${key.id}::uuid`;

    await cleanupTestModels(resolveUrl());

    const afterModel = await client`SELECT * FROM models WHERE id = ${legit.id}::uuid`;
    const afterSrc = await client`SELECT * FROM sources WHERE id = ${src.id}::uuid`;
    const afterKey = await client`SELECT * FROM idempotency_keys WHERE id = ${key.id}::uuid`;
    expect(afterModel).toEqual(beforeModel);
    expect(afterSrc).toEqual(beforeSrc);
    expect(afterKey).toEqual(beforeKey);

    await client`DELETE FROM sources WHERE id = ${src.id}::uuid`;
    await client`DELETE FROM audit_events WHERE entity_id = ${legit.id}::uuid`;
    await client`DELETE FROM models WHERE id = ${legit.id}::uuid`;
    await client`DELETE FROM idempotency_keys WHERE id = ${key.id}::uuid`;
  });
});
