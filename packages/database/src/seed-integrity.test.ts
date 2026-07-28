import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { applyTestDatabaseEnv, assertNotProductionDatabase } from "./test-database-url";

const databaseUrl = applyTestDatabaseEnv();
assertNotProductionDatabase(databaseUrl);
const sql = postgres(databaseUrl, { max: 1 });

const SEED_DIR = join(import.meta.dirname, "..", "seed-data");

function loadCanonicalIds(): string[] {
  const raw = JSON.parse(readFileSync(join(SEED_DIR, "canonical-models.seed.json"), "utf8")) as Array<{
    canonicalId: string;
  }>;
  return raw.map((m) => m.canonicalId);
}

function loadSubscriptionIds(): string[] {
  const raw = JSON.parse(readFileSync(join(SEED_DIR, "subscriptions.seed.json"), "utf8")) as Array<{
    id: string;
  }>;
  return raw.map((s) => s.id);
}

async function assertEqual(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`  ✓ ${label}: ${actual}`);
}

async function main() {
  console.log("Running seed integrity tests...");
  const canonicalIds = loadCanonicalIds();
  const subscriptionIds = loadSubscriptionIds();

  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM models WHERE status = 'active' AND canonical_id = ANY(${canonicalIds})) as models,
      (SELECT COUNT(*)::int FROM subscriptions WHERE status = 'active' AND external_seed_id = ANY(${subscriptionIds})) as subscriptions,
      (
        SELECT COUNT(*)::int
        FROM model_access ma
        JOIN models m ON m.id = ma.model_id
        JOIN subscriptions s ON s.plan_id = ma.plan_id
        WHERE ma.status = 'active'
          AND m.canonical_id = ANY(${canonicalIds})
          AND s.external_seed_id = ANY(${subscriptionIds})
      ) as model_access,
      (SELECT COUNT(*)::int FROM model_benchmark_results WHERE seed_key LIKE 'mm-baseline:bench:%') as benchmarks,
      (
        SELECT COUNT(*)::int FROM model_capabilities mc
        JOIN models m ON m.id = mc.model_id
        WHERE m.canonical_id = ANY(${canonicalIds})
      ) as capabilities,
      (SELECT COUNT(*)::int FROM usage_snapshots WHERE seed_key LIKE 'mm-baseline:usage:%') as mock_usage
  `;

  const [cost] = await sql`
    SELECT COALESCE(SUM(p.regular_price), 0)::float8 as total
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.status = 'active'
      AND s.external_seed_id = ANY(${subscriptionIds})
  `;

  await assertEqual("canonical models", Number(counts.models), 51);
  await assertEqual("subscriptions", Number(counts.subscriptions), 4);
  // Baseline seed had 19 access rows on subscription plans. csv-migration added 4 more
  // CSV-covered models onto those same plans (GPT-5.4 / mini / 5.5, Qwen3.6 Plus) → 23.
  await assertEqual("model access", Number(counts.model_access), 23);
  await assertEqual("baseline benchmark rows", Number(counts.benchmarks), 276);
  await assertEqual("capabilities", Number(counts.capabilities), 51);
  await assertEqual("baseline mock usage snapshots", Number(counts.mock_usage), 4);
  await assertEqual("regular monthly cost USD", Number(cost.total), 61);

  const [dupes] = await sql`
    SELECT COUNT(*)::int as c FROM (
      SELECT canonical_id FROM models GROUP BY canonical_id HAVING COUNT(*) > 1
    ) d
  `;
  await assertEqual("duplicate canonical IDs", Number(dupes.c), 0);

  const [orphans] = await sql`
    SELECT COUNT(*)::int as c
    FROM model_access ma
    LEFT JOIN models m ON m.id = ma.model_id
    LEFT JOIN plans p ON p.id = ma.plan_id
    WHERE m.id IS NULL OR p.id IS NULL
  `;
  await assertEqual("orphan access records", Number(orphans.c), 0);

  console.log("\n✓ ALL SEED INTEGRITY ASSERTIONS PASS");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end({ timeout: 1 }).catch(() => undefined);
  process.exit(1);
});
