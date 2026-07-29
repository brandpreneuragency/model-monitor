/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
/**
 * Integration tests for the import service (Phase 4 Wave C1).
 * Uses the live local Postgres; seed data must be present.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema/index";
import {
  createImportJob,
  getImportJob,
  storePreview,
  getPreview,
  listConflicts,
  resolveConflicts,
  commitImport,
  listExportModels,
  listExportSubscriptions,
  listExportAccess,
  listExportBenchmarks,
  updateImportJobStatus,
  type ImportPlan,
  type ImportPlanModelRow,
} from "./services/imports";
import { ModelServiceError, type Db } from "./services/audit";
import { applyTestDatabaseEnv, assertNotProductionDatabase } from "./test-database-url";

// ── DB helpers ─────────────────────────────────────────────────

function resolveUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  return ["postgresql://", "modelmonitor", ":", "modelmonitor", "@", "127.0.0.1", ":", "5433", "/", "modelmonitor"].join("");
}

const client = postgres(resolveUrl(), { max: 5 });
const db = drizzle(client, { schema }) as Db;
assertNotProductionDatabase(resolveUrl());

// ── Cleanup tracking ───────────────────────────────────────────

const createdJobIds: string[] = [];
const createdModelIds: string[] = [];
const createdAccessIds: string[] = [];
const createdBenchIds: string[] = [];
const createdUserIds: string[] = [];

function errorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  const { message } = error;
  return typeof message === "string" ? message : undefined;
}

function nestedCauseMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("cause" in error)) return undefined;
  return errorMessage(error.cause);
}

// ── Seed lookups ───────────────────────────────────────────────

let userId: string;
let devName: string;
let apName: string | null = null;
let planName: string | null = null;
let planIdVal: string | null = null;

// ── Lifecycle ──────────────────────────────────────────────────

beforeAll(async () => {
  applyTestDatabaseEnv();
  const [{ database }] = await client`SELECT current_database() AS database`;
  if (database !== "modelmonitor_test") throw new Error(`Refusing integration writes against ${database}`);
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .limit(1);
  if (!user) throw new Error("No users — run db:seed first");
  userId = user.id;

  const [dev] = await db
    .select({ id: schema.developers.id, name: schema.developers.name })
    .from(schema.developers)
    .where(eq(schema.developers.status, "active"))
    .limit(1);
  if (!dev) throw new Error("No active developer found");
  devName = dev.name;

  const [ap] = await db
    .select({ id: schema.accessProviders.id, name: schema.accessProviders.name })
    .from(schema.accessProviders)
    .where(eq(schema.accessProviders.status, "active"))
    .limit(1);
  if (ap) {
    apName = ap.name;
  }

  const [p] = await db
    .select({ id: schema.plans.id, name: schema.plans.name })
    .from(schema.plans)
    .limit(1);
  if (p) {
    planIdVal = p.id;
    planName = p.name;
  }
});

afterAll(async () => {
  for (const id of createdBenchIds) {
    await client`DELETE FROM model_benchmark_results WHERE id = ${id}::uuid`;
  }
  for (const id of createdAccessIds.reverse()) {
    await client`DELETE FROM model_access_pricing WHERE model_access_id = ${id}::uuid`;
    await client`DELETE FROM model_access WHERE id = ${id}::uuid`;
  }
  for (const id of createdModelIds) {
    const accessRows = await client`SELECT id FROM model_access WHERE model_id = ${id}::uuid`;
    for (const row of accessRows) {
      await client`DELETE FROM model_access_pricing WHERE model_access_id = ${row.id}::uuid`;
      await client`DELETE FROM model_access WHERE id = ${row.id}::uuid`;
    }
    await client`DELETE FROM audit_events WHERE entity_id = ${id}::uuid`;
    await client`DELETE FROM import_provenance WHERE entity_id = ${id}::uuid`;
    await client`DELETE FROM model_capabilities WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM model_aliases WHERE model_id = ${id}::uuid`;
    await client`DELETE FROM models WHERE id = ${id}::uuid`;
  }
  for (const id of createdJobIds) {
    await client`DELETE FROM import_conflicts WHERE import_job_id = ${id}::uuid`;
    await client`DELETE FROM import_provenance WHERE import_job_id = ${id}::uuid`;
    await client`DELETE FROM import_jobs WHERE id = ${id}::uuid`;
  }
  await client.unsafe(`
    DROP TRIGGER IF EXISTS trg_fail_import ON models;
    DROP FUNCTION IF EXISTS fail_test_import();
  `).catch(() => undefined);
  for (const id of createdUserIds) await client`DELETE FROM users WHERE id = ${id}::uuid`;
  await client.end({ timeout: 2 });
});

// ── Helpers ────────────────────────────────────────────────────

function tag(): string {
  return `mmtest:import-${crypto.randomUUID().slice(0, 8)}`;
}

function validCreateInput() {
  const t = tag();
  return {
    userId,
    filename: `${t}.xlsx`,
    storedPath: `/tmp/${t}.xlsx`,
    sha256: crypto.randomUUID().replace(/-/g, "").padEnd(64, "0"),
    parserVersion: "1.0.0",
  };
}

function skipRow(canonicalId?: string): ImportPlanModelRow {
  return {
    classification: "skip",
    canonicalId: canonicalId ?? null,
    developerName: null, name: null, family: null, generation: null,
    lifecycleRaw: null, releaseDate: null, modelType: null,
    contextTokens: null, maxOutputTokens: null, speedRating: null,
    codingSpecialization: null, bestUse: null, avoidFor: null,
    visionSupport: null, reasoningSupport: null, toolSupport: null,
    knowledgeCutoff: null, needsRecheck: null,
    accessProviderName: null, planName: null, providerModelId: null,
    subscriptionUsdMo: null, sourceSheet: null, sourceRow: null, verifiedOn: null,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("Import Service — CRUD & Preview", () => {
  it("1. creates and retrieves an import job", async () => {
    const input = validCreateInput();
    const job = await createImportJob(db, input);
    expect(job.id).toBeTruthy();
    expect(job.filename).toBe(input.filename);
    expect(job.status).toBe("uploaded");
    expect(job.sha256).toBe(input.sha256);
    createdJobIds.push(job.id);

    const fetched = await getImportJob(db, job.id);
    expect(fetched.id).toBe(job.id);
  });

  it("rejects invalid import job payload", async () => {
    await expect(createImportJob(db, { userId: "not-a-uuid" })).rejects.toThrow(ModelServiceError);
  });

  it("2. storePreview does not touch domain tables", async () => {
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    const [{ c: before }] = await client`SELECT count(*)::int AS c FROM models`;

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { unchangedCount: 10, createCount: 2, updateCount: 1, duplicateCount: 0, conflictCount: 1, errorCount: 2, skipCount: 3 },
      conflicts: [
        {
          conflictType: "lifecycle_mismatch",
          sourceSheet: "Master Models",
          sourceRow: 5,
          sourceColumn: "F",
          entityType: "model",
          currentValue: { lifecycleRaw: "GA" },
          importedValue: { lifecycleRaw: "preview" },
        },
      ],
    });

    const [{ c: after }] = await client`SELECT count(*)::int AS c FROM models`;
    expect(after).toBe(before);

    const preview = await getPreview(db, job.id);
    expect(preview.summary.createCount).toBe(2);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0].conflictType).toBe("lifecycle_mismatch");
  });

  it("3. listConflicts returns stored conflicts", async () => {
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { conflictCount: 2 },
      conflicts: [
        { conflictType: "alias_collision", sourceSheet: "Master", sourceRow: 1 },
        { conflictType: "developer_mismatch", sourceSheet: "Master", sourceRow: 2 },
      ],
    });
    const conflicts = await listConflicts(db, job.id);
    expect(conflicts).toHaveLength(2);
  });

  it("4. resolveConflicts marks resolution and auto-transitions", async () => {
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { conflictCount: 1 },
      conflicts: [
        { conflictType: "lifecycle_mismatch", sourceSheet: "Master", sourceRow: 3, currentValue: {}, importedValue: {} },
      ],
    });
    await expect(getImportJob(db, job.id)).resolves.toMatchObject({ status: "needs_resolution" });

    const conflicts = await listConflicts(db, job.id);
    const resolved = await resolveConflicts(db, job.id, {
      importJobId: job.id,
      resolutions: [{ conflictId: conflicts[0].id, action: "keep_existing" }],
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].resolution).toBe("keep_existing");
    expect(resolved[0].resolvedAt).toBeTruthy();
    await expect(getImportJob(db, job.id)).resolves.toMatchObject({ status: "preview_ready" });
  });
});

describe("Import Service — Commit", () => {
  it("rejects an absent preview digest before any domain write", async () => {
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);
    const plan: ImportPlan = { modelRows: [], benchmarkRows: [] };
    await storePreview(db, job.id, { plan, previewSummary: {}, conflicts: [] });
    await client`UPDATE import_jobs SET idempotency_key = NULL WHERE id = ${job.id}::uuid`;
    await expect(commitImport(db, job.id, plan)).rejects.toThrow(/digest is required/);
  });

  it("same-file second job with update-existing leaves models, access, plans, aliases, and tags unchanged", async () => {
    const canonicalId = `mmtest:two-job-${crypto.randomUUID().slice(0, 8)}`;
    const firstInput = validCreateInput();
    const first = await createImportJob(db, firstInput);
    createdJobIds.push(first.id);
    const createPlan: ImportPlan = { modelRows: [{ ...skipRow(canonicalId), classification: "create", canonicalId, developerName: devName, name: `Two Job ${canonicalId}` }], benchmarkRows: [] };
    await storePreview(db, first.id, { plan: createPlan, previewSummary: { createCount: 1 }, conflicts: [] });
    await commitImport(db, first.id, createPlan);
    const [model] = await db.select({ id: schema.models.id }).from(schema.models).where(eq(schema.models.canonicalId, canonicalId)).limit(1);
    if (!model) throw new Error("Expected first import model");
    createdModelIds.push(model.id);
    const [{ models: beforeModels, access: beforeAccess, plans: beforePlans, aliases: beforeAliases, tags: beforeTags }] = await client`SELECT (SELECT count(*)::int FROM models) AS models, (SELECT count(*)::int FROM model_access) AS access, (SELECT count(*)::int FROM plans) AS plans, (SELECT count(*)::int FROM model_aliases) AS aliases, (SELECT count(*)::int FROM tags) AS tags`;

    const second = await createImportJob(db, { ...validCreateInput(), sha256: firstInput.sha256 });
    createdJobIds.push(second.id);
    const updatePlan: ImportPlan = { modelRows: [{ ...createPlan.modelRows[0], classification: "update" }], benchmarkRows: [] };
    await storePreview(db, second.id, { plan: updatePlan, previewSummary: { updateCount: 1 }, conflicts: [] });
    await commitImport(db, second.id, updatePlan);
    const [{ models: afterModels, access: afterAccess, plans: afterPlans, aliases: afterAliases, tags: afterTags }] = await client`SELECT (SELECT count(*)::int FROM models) AS models, (SELECT count(*)::int FROM model_access) AS access, (SELECT count(*)::int FROM plans) AS plans, (SELECT count(*)::int FROM model_aliases) AS aliases, (SELECT count(*)::int FROM tags) AS tags`;
    expect(afterModels).toBe(beforeModels);
    expect(afterAccess).toBe(beforeAccess);
    expect({ afterPlans, afterAliases, afterTags }).toEqual({ afterPlans: beforePlans, afterAliases: beforeAliases, afterTags: beforeTags });
  });

  it("5. commitImport full flow: model + access + benchmark + provenance + audit", async () => {
    const canonicalId = `mmtest:c5-${crypto.randomUUID().slice(0, 8)}`;
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });
    await expect(getImportJob(db, job.id)).resolves.toMatchObject({ status: "preview_ready" });

    const plan: ImportPlan = {
      modelRows: [
        {
          classification: "create",
          canonicalId,
          developerName: devName,
          name: `Test M ${canonicalId}`,
          family: "Test", generation: "1.0", lifecycleRaw: "current",
          releaseDate: "2026-07-01", modelType: "LLM",
          contextTokens: 100000, maxOutputTokens: 4096, speedRating: "fast",
          codingSpecialization: "general", bestUse: "testing", avoidFor: null,
          visionSupport: true, reasoningSupport: "yes", toolSupport: "yes",
          knowledgeCutoff: "2026-06", needsRecheck: false,
          accessProviderName: apName, planName,
          providerModelId: `test/${canonicalId}`,
          subscriptionUsdMo: null,
          sourceSheet: "Master Models", sourceRow: 1, verifiedOn: "2026-07-23",
        },
      ],
      benchmarkRows: [
        {
          modelCanonicalId: canonicalId,
          benchmarkName: "MMTest-Bench-C5",
          category: "coding", version: "1.0", comparableGroup: "general",
          score: 95.5, scoreText: null, setting: "zero-shot", harness: "mmtest",
          sourceType: "third_party", sourceUrl: "https://example.com",
          resultDate: "2026-07-23", confidence: 0.9,
        },
      ],
    };

    await storePreview(db, job.id, {
      plan,
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });
    const result = await commitImport(db, job.id, plan);
    expect(result.modelsCreated).toBe(1);
    expect(result.benchmarkRowsCreated).toBe(1);
    if (apName && planName) expect(result.accessCreated).toBe(1);

    const [model] = await db
      .select({ id: schema.models.id, contextTokens: schema.models.contextTokens })
      .from(schema.models)
      .where(eq(schema.models.canonicalId, canonicalId))
      .limit(1);
    if (!model) throw new Error("Expected created model");
    expect(model.contextTokens).toBe(100000);
    createdModelIds.push(model.id);

    // Provenance.
    const prov = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.importProvenance)
      .where(eq(schema.importProvenance.importJobId, job.id))
      .then((r) => Number(r[0].count));
    expect(prov).toBeGreaterThanOrEqual(1);

    // Audit event.
    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.entityId, job.id));
    const importAudit = audit.find((a) => a.action === "import");
    expect(importAudit).toBeTruthy();

    // Job committed.
    await expect(getImportJob(db, job.id)).resolves.toMatchObject({ status: "committed" });

    // Access rows.
    if (apName && planName) {
      const acc = await db
        .select({ id: schema.modelAccess.id })
        .from(schema.modelAccess)
        .where(eq(schema.modelAccess.modelId, model.id));
      for (const a of acc) createdAccessIds.push(a.id);
    }

    // Benchmark result.
    const br = await db
      .select({ id: schema.modelBenchmarkResults.id })
      .from(schema.modelBenchmarkResults)
      .where(eq(schema.modelBenchmarkResults.modelId, model.id));
    for (const b of br) createdBenchIds.push(b.id);
  });

  it("6. commitImport fails on unresolved conflicts", async () => {
    const canonicalId = `mmtest:c6-${crypto.randomUUID().slice(0, 8)}`;
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    const plan: ImportPlan = { modelRows: [skipRow(canonicalId)], benchmarkRows: [] };
    await storePreview(db, job.id, {
      plan,
      previewSummary: { conflictCount: 1 },
      conflicts: [
        { conflictType: "lifecycle_mismatch", currentValue: { l: "ga" }, importedValue: { l: "preview" } },
      ],
    });
    await expect(commitImport(db, job.id, plan)).rejects.toThrow(ModelServiceError);
    await expect(getImportJob(db, job.id)).resolves.toMatchObject({ status: "needs_resolution" });
  });

  it("7. commitImport rolls back on induced failure", async () => {
    const canonicalId = `mmtest:c7-${crypto.randomUUID().slice(0, 8)}`;
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });

    await client.unsafe(`
      CREATE OR REPLACE FUNCTION fail_test_import() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'induced rollback for import test'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_fail_import BEFORE INSERT ON models
        FOR EACH ROW EXECUTE FUNCTION fail_test_import();
    `);

    const [{ c: before }] = await client`SELECT count(*)::int AS c FROM models`;

    const plan: ImportPlan = {
      modelRows: [
        {
          classification: "create", canonicalId, developerName: devName,
          name: `Rollback ${canonicalId}`,
          family: null, generation: null, lifecycleRaw: "current", releaseDate: null,
          modelType: null, contextTokens: null, maxOutputTokens: null, speedRating: null,
          codingSpecialization: null, bestUse: null, avoidFor: null,
          visionSupport: null, reasoningSupport: null, toolSupport: null, knowledgeCutoff: null,
          needsRecheck: null, accessProviderName: null, planName: null, providerModelId: null,
          subscriptionUsdMo: null, sourceSheet: null, sourceRow: null, verifiedOn: null,
        },
      ],
      benchmarkRows: [],
    };

    await storePreview(db, job.id, {
      plan,
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });

    try {
      let commitError: unknown;
      try {
        await commitImport(db, job.id, plan);
      } catch (error: unknown) {
        commitError = error;
      }

      expect(commitError).toBeDefined();
      expect(nestedCauseMessage(commitError)).toMatch(/induced rollback/);
    } finally {
      await client.unsafe("DROP TRIGGER IF EXISTS trg_fail_import ON models");
      await client.unsafe("DROP FUNCTION IF EXISTS fail_test_import()");
    }

    const [{ c: after }] = await client`SELECT count(*)::int AS c FROM models`;
    expect(after).toBe(before);
    await expect(getImportJob(db, job.id)).resolves.toMatchObject({ status: "preview_ready" });
  });

  it("8. commitImport is idempotent (no model 52)", async () => {
    const canonicalId = `mmtest:c8-${crypto.randomUUID().slice(0, 8)}`;
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });

    const plan: ImportPlan = {
      modelRows: [
        {
          classification: "create", canonicalId, developerName: devName,
          name: `Idem ${canonicalId}`,
          family: null, generation: null, lifecycleRaw: "current", releaseDate: null,
          modelType: null, contextTokens: null, maxOutputTokens: null, speedRating: null,
          codingSpecialization: null, bestUse: null, avoidFor: null,
          visionSupport: null, reasoningSupport: null, toolSupport: null, knowledgeCutoff: null,
          needsRecheck: null, accessProviderName: null, planName: null, providerModelId: null,
          subscriptionUsdMo: null, sourceSheet: null, sourceRow: null, verifiedOn: null,
        },
      ],
      benchmarkRows: [],
    };

    await storePreview(db, job.id, {
      plan,
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });
    const firstResult = await commitImport(db, job.id, plan);
    expect(firstResult.modelsCreated).toBe(1);

    const [{ c: count1 }] = await client`SELECT count(*)::int AS c FROM models`;

    const [model] = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.canonicalId, canonicalId))
      .limit(1);
    if (model) createdModelIds.push(model.id);

    const secondResult = await commitImport(db, job.id, plan);
    expect(secondResult.modelsCreated).toBe(1); // Replay from stored summary.

    const [{ c: count2 }] = await client`SELECT count(*)::int AS c FROM models`;
    expect(count2).toBe(count1);
  });

  it("9. duplicate access rows do not duplicate canonical model", async () => {
    const canonicalId = `mmtest:c9-${crypto.randomUUID().slice(0, 8)}`;
    // Need 2 active providers with plans.
    const providers = await db
      .select({ id: schema.accessProviders.id, name: schema.accessProviders.name })
      .from(schema.accessProviders)
      .where(eq(schema.accessProviders.status, "active"))
      .limit(2);
    if (providers.length < 2 || !planName || !planIdVal) return; // Skip if insufficient data.

    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });

    const plan: ImportPlan = {
      modelRows: [
        {
          classification: "create", canonicalId, developerName: devName,
          name: `Dedup ${canonicalId}`,
          family: null, generation: null, lifecycleRaw: "current", releaseDate: null,
          modelType: null, contextTokens: null, maxOutputTokens: null, speedRating: null,
          codingSpecialization: null, bestUse: null, avoidFor: null,
          visionSupport: null, reasoningSupport: null, toolSupport: null, knowledgeCutoff: null,
          needsRecheck: null,
          accessProviderName: providers[0].name, planName,
          providerModelId: `test/${canonicalId}`,
          subscriptionUsdMo: null, sourceSheet: null, sourceRow: null, verifiedOn: null,
        },
        {
          classification: "update", canonicalId, developerName: devName,
          name: `Dedup ${canonicalId}`,
          family: null, generation: null, lifecycleRaw: null, releaseDate: null,
          modelType: null, contextTokens: null, maxOutputTokens: null, speedRating: null,
          codingSpecialization: null, bestUse: null, avoidFor: null,
          visionSupport: null, reasoningSupport: null, toolSupport: null, knowledgeCutoff: null,
          needsRecheck: null,
          accessProviderName: providers[1].name, planName,
          providerModelId: `test/${canonicalId}-alt`,
          subscriptionUsdMo: null, sourceSheet: null, sourceRow: null, verifiedOn: null,
        },
      ],
      benchmarkRows: [],
    };

    await storePreview(db, job.id, {
      plan,
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });
    const result = await commitImport(db, job.id, plan);
    expect(result.modelsCreated).toBe(1);

    const [model] = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.canonicalId, canonicalId))
      .limit(1);
    expect(model).toBeTruthy();
    if (!model) throw new Error("Expected created model");
    createdModelIds.push(model.id);

    const [{ c: accessCount }] = await client`
      SELECT count(*)::int AS c FROM model_access WHERE model_id = ${model.id}::uuid
    `;
    expect(accessCount).toBeGreaterThanOrEqual(1);

    const acc = await db
      .select({ id: schema.modelAccess.id })
      .from(schema.modelAccess)
      .where(eq(schema.modelAccess.modelId, model.id));
    for (const a of acc) createdAccessIds.push(a.id);
  });

  it("10. null cost is preserved", async () => {
    const canonicalId = `mmtest:c10-${crypto.randomUUID().slice(0, 8)}`;
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });

    const plan: ImportPlan = {
      modelRows: [
        {
          classification: "create", canonicalId, developerName: devName,
          name: `NullCost ${canonicalId}`,
          family: null, generation: null, lifecycleRaw: "current", releaseDate: null,
          modelType: null, contextTokens: null, maxOutputTokens: null, speedRating: null,
          codingSpecialization: null, bestUse: null, avoidFor: null,
          visionSupport: null, reasoningSupport: null, toolSupport: null, knowledgeCutoff: null,
          needsRecheck: null, accessProviderName: null, planName: null, providerModelId: null,
          subscriptionUsdMo: null,
          sourceSheet: null, sourceRow: null, verifiedOn: null,
        },
      ],
      benchmarkRows: [],
    };

    await storePreview(db, job.id, {
      plan,
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });
    await commitImport(db, job.id, plan);
    const [model] = await db
      .select()
      .from(schema.models)
      .where(eq(schema.models.canonicalId, canonicalId))
      .limit(1);
    if (!model) throw new Error("Expected created model");
        createdModelIds.push(model.id);
        expect(model.contextTokens).toBeNull();
  });

  it("11. audit events written", async () => {
    const canonicalId = `mmtest:c11-${crypto.randomUUID().slice(0, 8)}`;
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });

    const plan: ImportPlan = {
      modelRows: [
        {
          classification: "create", canonicalId, developerName: devName,
          name: `AuditT ${canonicalId}`,
          family: null, generation: null, lifecycleRaw: "current", releaseDate: null,
          modelType: null, contextTokens: null, maxOutputTokens: null, speedRating: null,
          codingSpecialization: null, bestUse: null, avoidFor: null,
          visionSupport: null, reasoningSupport: null, toolSupport: null, knowledgeCutoff: null,
          needsRecheck: null, accessProviderName: null, planName: null, providerModelId: null,
          subscriptionUsdMo: null, sourceSheet: null, sourceRow: null, verifiedOn: null,
        },
      ],
      benchmarkRows: [],
    };

    await storePreview(db, job.id, {
      plan,
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });
    await commitImport(db, job.id, plan);
    const [model] = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.canonicalId, canonicalId))
      .limit(1);
    if (model) createdModelIds.push(model.id);

    const auditEvents = await db
      .select({ action: schema.auditEvents.action, entityType: schema.auditEvents.entityType })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.entityId, job.id));
    expect(auditEvents.length).toBeGreaterThanOrEqual(1);
    const importAudit = auditEvents.find((a) => a.action === "import");
    expect(importAudit).toBeTruthy();
  });

  it("12. provenance written on commit", async () => {
    const canonicalId = `mmtest:c12-${crypto.randomUUID().slice(0, 8)}`;
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await storePreview(db, job.id, {
      plan: { modelRows: [], benchmarkRows: [] },
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });

    const plan: ImportPlan = {
      modelRows: [
        {
          classification: "create", canonicalId, developerName: devName,
          name: `ProvT ${canonicalId}`,
          family: null, generation: null, lifecycleRaw: "current", releaseDate: null,
          modelType: null, contextTokens: 50000, maxOutputTokens: 2048, speedRating: null,
          codingSpecialization: null, bestUse: null, avoidFor: null,
          visionSupport: null, reasoningSupport: null, toolSupport: null, knowledgeCutoff: null,
          needsRecheck: null, accessProviderName: null, planName: null, providerModelId: null,
          subscriptionUsdMo: null, sourceSheet: "Master", sourceRow: 10, verifiedOn: null,
        },
      ],
      benchmarkRows: [],
    };

    await storePreview(db, job.id, {
      plan,
      previewSummary: { createCount: 1, conflictCount: 0 },
      conflicts: [],
    });
    await commitImport(db, job.id, plan);
    const [model] = await db
      .select({ id: schema.models.id })
      .from(schema.models)
      .where(eq(schema.models.canonicalId, canonicalId))
      .limit(1);
    if (model) createdModelIds.push(model.id);

    const prov = await db
      .select()
      .from(schema.importProvenance)
      .where(eq(schema.importProvenance.importJobId, job.id));
    expect(prov.length).toBeGreaterThanOrEqual(1);
    expect(prov.some((p) => p.entityType === "model")).toBe(true);
    expect(prov.some((p) => p.sourceSheet === "Master")).toBe(true);
  });
});

describe("Import Service — Export", () => {
  it("13. listExportModels returns typed rows with formula neutralization", async () => {
    const rows = await listExportModels(db);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row.canonicalId).toBeDefined();
    expect(row.name).toBeDefined();
    for (const r of rows) {
      if (typeof r.name === "string") expect(r.name[0]).not.toBe("=");
    }
  });

  it("listExportSubscriptions returns typed rows", async () => {
    const rows = await listExportSubscriptions(db);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("listExportAccess returns typed rows", async () => {
    const rows = await listExportAccess(db);
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length > 0) expect(rows[0].modelCanonicalId).toBeDefined();
  });

  it("listExportBenchmarks returns typed rows", async () => {
    const rows = await listExportBenchmarks(db);
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("Import Service — Status transitions", () => {
  it("rejects invalid transitions", async () => {
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);

    await expect(updateImportJobStatus(db, job.id, { status: "committed" })).rejects.toThrow(ModelServiceError);
  });
});

describe("Import Service — Doctor 5 acceptance proofs", () => {
  async function insertCandidate(label: string): Promise<{ id: string; canonicalId: string; name: string }> {
    const canonicalId = `mmtest:doctor5-candidate-${label}-${crypto.randomUUID().slice(0, 8)}`;
    const name = `Doctor 5 Candidate ${label}`;
    const [developer] = await db.select({ id: schema.developers.id }).from(schema.developers).where(eq(schema.developers.name, devName)).limit(1);
    if (!developer) throw new Error("Acceptance fixture requires a developer");
    const [candidate] = await db.insert(schema.models).values({ developerId: developer.id, canonicalId, name, slug: `doctor-5-candidate-${label}-${crypto.randomUUID().slice(0, 8)}`, lifecycle: "current", lifecycleRaw: "GA", needsRecheck: false }).returning({ id: schema.models.id, canonicalId: schema.models.canonicalId, name: schema.models.name });
    createdModelIds.push(candidate.id);
    return candidate;
  }

  function conflictPlan(candidate: { canonicalId: string }, sourceRow: number, name: string): ImportPlan {
    return { modelRows: [{ ...skipRow(candidate.canonicalId), classification: "create", canonicalId: candidate.canonicalId, developerName: devName, name, lifecycleRaw: "current", accessProviderName: apName, planName, providerModelId: `doctor5/${name.toLowerCase().replace(/\\s+/g, "-")}`, sourceSheet: "Master Models", sourceRow }], benchmarkRows: [] };
  }

  it("tampered digest is rejected with domain, job, conflict, provenance, and audit state unchanged", async () => {
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);
    const plan = { modelRows: [skipRow()], benchmarkRows: [] } satisfies ImportPlan;
    await storePreview(db, job.id, { plan, previewSummary: {}, conflicts: [] });
    const [{ models, jobs, conflicts, provenance, audit }] = await client`SELECT (SELECT count(*)::int FROM models) AS models, (SELECT count(*)::int FROM import_jobs WHERE id = ${job.id}::uuid) AS jobs, (SELECT count(*)::int FROM import_conflicts WHERE import_job_id = ${job.id}::uuid) AS conflicts, (SELECT count(*)::int FROM import_provenance WHERE import_job_id = ${job.id}::uuid) AS provenance, (SELECT count(*)::int FROM audit_events WHERE entity_id = ${job.id}::uuid) AS audit`;
    const tampered = { ...plan, modelRows: [{ ...plan.modelRows[0], lifecycleRaw: "tampered" }] } satisfies ImportPlan;
    await expect(commitImport(db, job.id, tampered)).rejects.toMatchObject({ code: "PRECONDITION_FAILED", status: 400 });
    const [{ models: afterModels, jobs: afterJobs, conflicts: afterConflicts, provenance: afterProvenance, audit: afterAudit }] = await client`SELECT (SELECT count(*)::int FROM models) AS models, (SELECT count(*)::int FROM import_jobs WHERE id = ${job.id}::uuid) AS jobs, (SELECT count(*)::int FROM import_conflicts WHERE import_job_id = ${job.id}::uuid) AS conflicts, (SELECT count(*)::int FROM import_provenance WHERE import_job_id = ${job.id}::uuid) AS provenance, (SELECT count(*)::int FROM audit_events WHERE entity_id = ${job.id}::uuid) AS audit`;
    expect({ afterModels, afterJobs, afterConflicts, afterProvenance, afterAudit }).toEqual({ afterModels: models, afterJobs: jobs, afterConflicts: conflicts, afterProvenance: provenance, afterAudit: audit });
    await expect(getImportJob(db, job.id)).resolves.toMatchObject({ status: "preview_ready" });
  });

  it("owner mismatch is forbidden and performs zero writes", async () => {
    const secondUser = crypto.randomUUID();
    createdUserIds.push(secondUser);
    await client`INSERT INTO users (id, email, display_name, role) VALUES (${secondUser}::uuid, ${`doctor5-${secondUser}@example.test`}, 'Doctor 5 second user', 'owner')`;
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);
    const plan = { modelRows: [skipRow()], benchmarkRows: [] } satisfies ImportPlan;
    await storePreview(db, job.id, { plan, previewSummary: {}, conflicts: [] });
    const [{ models, access, prov, audits }] = await client`SELECT (SELECT count(*)::int FROM models) AS models, (SELECT count(*)::int FROM model_access) AS access, (SELECT count(*)::int FROM import_provenance WHERE import_job_id = ${job.id}::uuid) AS prov, (SELECT count(*)::int FROM audit_events WHERE entity_id = ${job.id}::uuid) AS audits`;
    await expect(commitImport(db, job.id, plan, { actorUserId: secondUser })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    const [{ models: afterModels, access: afterAccess, prov: afterProv, audits: afterAudits }] = await client`SELECT (SELECT count(*)::int FROM models) AS models, (SELECT count(*)::int FROM model_access) AS access, (SELECT count(*)::int FROM import_provenance WHERE import_job_id = ${job.id}::uuid) AS prov, (SELECT count(*)::int FROM audit_events WHERE entity_id = ${job.id}::uuid) AS audits`;
    expect({ afterModels, afterAccess, afterProv, afterAudits }).toEqual({ afterModels: models, afterAccess: access, afterProv: prov, afterAudits: audits });
    await expect(getImportJob(db, job.id)).resolves.toMatchObject({ status: "preview_ready", userId });
  });

  it("create-new conflict creates one stable-ID model and owned related rows", async () => {
    if (!apName || !planName) throw new Error("Acceptance fixture requires an access provider and plan");
    const candidate = await insertCandidate("create");
    const input = validCreateInput();
    const job = await createImportJob(db, input);
    createdJobIds.push(job.id);
    const plan = conflictPlan(candidate, 501, `Doctor 5 Create ${candidate.id}`);
    await storePreview(db, job.id, { plan, previewSummary: { conflictCount: 1 }, conflicts: [{ conflictType: "canonical_identity_collision", sourceRow: 501, candidateEntityId: candidate.id, entityType: "model" }] });
    const [{ count: before }] = await client`SELECT count(*)::int AS count FROM models`;
    const result = await commitImport(db, job.id, plan, { actorUserId: userId }, [{ sourceRow: 501, action: "create-new" }]);
    expect(result.modelsCreated).toBe(1);
    const expectedCanonicalId = `import:${createHash("sha256").update(`${input.sha256}:501:${plan.modelRows[0]!.name!.trim().toLowerCase()}`, "utf8").digest("hex").slice(0, 40)}`;
    const [created] = await db.select({ id: schema.models.id, canonicalId: schema.models.canonicalId }).from(schema.models).where(eq(schema.models.canonicalId, expectedCanonicalId)).limit(1);
    expect(created).toBeTruthy();
    expect(created?.canonicalId).not.toBe(candidate.canonicalId);
    expect(Number((await client`SELECT count(*)::int AS count FROM models`)[0]!.count)).toBe(Number(before) + 1);
    if (created) {
      createdModelIds.push(created.id);
      const [{ access, aliases, prov }] = await client`SELECT (SELECT count(*)::int FROM model_access WHERE model_id = ${created.id}::uuid) AS access, (SELECT count(*)::int FROM model_aliases WHERE model_id = ${created.id}::uuid) AS aliases, (SELECT count(*)::int FROM import_provenance WHERE entity_id = ${created.id}::uuid AND import_job_id = ${job.id}::uuid) AS prov`;
      expect(Number(access)).toBe(1);
      expect(Number(aliases)).toBe(1);
      expect(Number(prov)).toBeGreaterThanOrEqual(1);
      const rows = await db.select({ id: schema.modelAccess.id }).from(schema.modelAccess).where(eq(schema.modelAccess.modelId, created.id));
      for (const row of rows) createdAccessIds.push(row.id);
    }
  });

  it("update-existing conflict updates the candidate canonical row without creating a model", async () => {
    const candidate = await insertCandidate("update");
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);
    const plan = conflictPlan(candidate, 502, `Doctor 5 Updated ${candidate.id}`);
    await storePreview(db, job.id, { plan, previewSummary: { conflictCount: 1 }, conflicts: [{ conflictType: "canonical_identity_collision", sourceRow: 502, candidateEntityId: candidate.id, entityType: "model" }] });
    const [{ count: before }] = await client`SELECT count(*)::int AS count FROM models`;
    const result = await commitImport(db, job.id, plan, { actorUserId: userId }, [{ sourceRow: 502, action: "update-existing" }]);
    expect(result.modelsCreated).toBe(0);
    expect(result.modelsUpdated).toBe(1);
    const [updated] = await db.select({ id: schema.models.id, canonicalId: schema.models.canonicalId, name: schema.models.name }).from(schema.models).where(eq(schema.models.id, candidate.id)).limit(1);
    expect(updated).toMatchObject({ id: candidate.id, canonicalId: candidate.canonicalId, name: plan.modelRows[0]!.name });
    expect(Number((await client`SELECT count(*)::int AS count FROM models`)[0]!.count)).toBe(Number(before));
  });

  it("forced failure after conflict resolution rolls back resolution, job, domain, provenance, and audit", async () => {
    const candidate = await insertCandidate("rollback");
    const job = await createImportJob(db, validCreateInput());
    createdJobIds.push(job.id);
    const plan = conflictPlan(candidate, 503, `Doctor 5 Rollback ${candidate.id}`);
    await storePreview(db, job.id, { plan, previewSummary: { conflictCount: 1 }, conflicts: [{ conflictType: "canonical_identity_collision", sourceRow: 503, candidateEntityId: candidate.id, entityType: "model" }] });
    const [beforeConflict] = await db.select({ resolution: schema.importConflicts.resolution, resolvedAt: schema.importConflicts.resolvedAt }).from(schema.importConflicts).where(eq(schema.importConflicts.importJobId, job.id));
    const [{ models, prov, audit }] = await client`SELECT (SELECT count(*)::int FROM models) AS models, (SELECT count(*)::int FROM import_provenance WHERE import_job_id = ${job.id}::uuid) AS prov, (SELECT count(*)::int FROM audit_events WHERE entity_id = ${job.id}::uuid) AS audit`;
    await client.unsafe(`CREATE OR REPLACE FUNCTION fail_test_import() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'doctor5 forced failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER trg_fail_import BEFORE UPDATE ON models FOR EACH ROW EXECUTE FUNCTION fail_test_import();`);
    try {
      let commitError: unknown;
      try {
        await commitImport(db, job.id, plan, { actorUserId: userId }, [{ sourceRow: 503, action: "update-existing" }]);
      } catch (error: unknown) {
        commitError = error;
      }
      expect(commitError).toBeDefined();
      expect(`${errorMessage(commitError) ?? ""} ${nestedCauseMessage(commitError) ?? ""}`).toMatch(/doctor5 forced failure/);
    } finally {
      await client.unsafe("DROP TRIGGER IF EXISTS trg_fail_import ON models");
      await client.unsafe("DROP FUNCTION IF EXISTS fail_test_import()");
    }
    const [afterConflict] = await db.select({ resolution: schema.importConflicts.resolution, resolvedAt: schema.importConflicts.resolvedAt }).from(schema.importConflicts).where(eq(schema.importConflicts.importJobId, job.id));
    const [{ models: afterModels, prov: afterProv, audit: afterAudit }] = await client`SELECT (SELECT count(*)::int FROM models) AS models, (SELECT count(*)::int FROM import_provenance WHERE import_job_id = ${job.id}::uuid) AS prov, (SELECT count(*)::int FROM audit_events WHERE entity_id = ${job.id}::uuid) AS audit`;
    expect(afterConflict).toEqual(beforeConflict);
    expect({ afterModels, afterProv, afterAudit }).toEqual({ afterModels: models, afterProv: prov, afterAudit: audit });
    await expect(getImportJob(db, job.id)).resolves.toMatchObject({ status: "needs_resolution" });
  });
});
