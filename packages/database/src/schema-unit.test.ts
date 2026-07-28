import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  recordStatus,
  subscriptionStatus,
  lifecycleStatus,
} from "./schema/enums";
import * as schema from "./schema/index";
import { planAccessMerge } from "@model-monitor/schemas";

describe("schema barrel", () => {
  it("exports core enum constructors", () => {
    expect(recordStatus.enumValues).toEqual(["active", "archived"]);
    expect(subscriptionStatus.enumValues).toContain("active");
    expect(lifecycleStatus.enumValues).toContain("unknown");
  });

  it("exports expected high-value tables", () => {
    expect(schema.models).toBeDefined();
    expect(schema.subscriptions).toBeDefined();
    expect(schema.modelAccess).toBeDefined();
    expect(schema.modelBenchmarkResults).toBeDefined();
    expect(schema.plans).toBeDefined();
  });
});

describe("SQL migrations", () => {
  it("ships ordered hand-written migration files", () => {
    const dir = join(import.meta.dirname, "..", "migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files).toEqual([
      "0000_initial.sql",
      "0001_subscriptions_models.sql",
      "0002_access_scores.sql",
      "0003_benchmarks_imports.sql",
      "0004_provenance_usage_tokens_audit.sql",
      "0005_idempotency_keys.sql",
      "0006_seed_ownership.sql",
      "0007_rankings_tags_views.sql",
      "0008_plans_quotas_models.sql",
      "0009_provider_logo_colour.sql",
    ]);
  });

  it("exports idempotency_keys table", () => {
    expect(schema.idempotencyKeys).toBeDefined();
  });

  it("exports rankings / tags / saved_views tables", () => {
    expect(schema.skills).toBeDefined();
    expect(schema.modelSkillRatings).toBeDefined();
    expect(schema.rankingProfiles).toBeDefined();
    expect(schema.rankingProfileSkills).toBeDefined();
    expect(schema.tags).toBeDefined();
    expect(schema.modelTags).toBeDefined();
    expect(schema.savedViews).toBeDefined();
  });

  it("exports plan_quotas and redesign model/plan fields", () => {
    expect(schema.planQuotas).toBeDefined();
    expect(schema.accessType.enumValues).toContain("subscription");
    expect(schema.workflowStatus.enumValues).toContain("preferred");
    expect(schema.quotaUnit.enumValues).toHaveLength(9);
    expect(schema.quotaPeriod.enumValues).toHaveLength(9);
  });
});

describe("seed_key partial unique indexes", () => {
  it("declares WHERE seed_key IS NOT NULL predicates matching migration 0006", () => {
    const evidence = readFileSync(join(import.meta.dirname, "schema/evidence.ts"), "utf8");
    const operations = readFileSync(join(import.meta.dirname, "schema/operations.ts"), "utf8");
    const migration = readFileSync(
      join(import.meta.dirname, "..", "migrations", "0006_seed_ownership.sql"),
      "utf8",
    );
    expect(migration).toMatch(
      /model_benchmark_results_seed_key_uidx[\s\S]*WHERE seed_key IS NOT NULL/,
    );
    expect(migration).toMatch(/usage_snapshots_seed_key_uidx[\s\S]*WHERE seed_key IS NOT NULL/);
    expect(evidence).toContain(
      'uniqueIndex("model_benchmark_results_seed_key_uidx").on(t.seedKey).where(isNotNull(t.seedKey))',
    );
    expect(operations).toContain(
      'uniqueIndex("usage_snapshots_seed_key_uidx").on(t.seedKey).where(isNotNull(t.seedKey))',
    );
  });
});

describe("deterministic access reconciliation planning", () => {
  it("chooses the lowest source ID for source-only duplicate keys", () => {
    const result = planAccessMerge([], [
      { id: "z", planId: "p", providerModelId: "same" },
      { id: "a", planId: "p", providerModelId: "same" },
    ]);
    expect(result.transferIds).toEqual(["a"]);
    expect(result.skippedDuplicateIds).toEqual(["z"]);
  });

  it("retains deterministic target-first reconciliation for target duplicates", () => {
    const result = planAccessMerge(["p::same"], [
      { id: "b", planId: "p", providerModelId: "same" },
      { id: "a", planId: "p", providerModelId: "same" },
    ]);
    expect(result.transferIds).toEqual([]);
    expect(result.skippedDuplicateIds).toEqual(["a", "b"]);
  });
});
