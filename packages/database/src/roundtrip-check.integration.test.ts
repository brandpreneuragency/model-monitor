import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { parseSections, serializeSections } from "@model-monitor/csv-import";
import { listExportSevenTables, restoreSevenTableSections } from "./services/imports";
import { applyTestDatabaseEnv, assertNotProductionDatabase } from "./test-database-url";
import { db } from "./index";

const url = applyTestDatabaseEnv();
assertNotProductionDatabase(url);
const client = postgres(url, { max: 1 });
const TABLES = ["models", "access_providers", "plans", "model_access", "plan_quotas", "model_skill_ratings", "tags"] as const;
type Counts = Record<(typeof TABLES)[number], number>;
type QueryClient = { unsafe: (query: string, values?: readonly unknown[]) => Promise<Array<Record<string, unknown>>> };
function queryClient(value: unknown): QueryClient { return value as QueryClient; }

async function counts(sql: QueryClient): Promise<Counts> {
  const result = {} as Counts;
  for (const table of TABLES) {
    const [row] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    result[table] = Number(row?.count ?? 0);
  }
  return result;
}

async function sentinels(sql: QueryClient): Promise<Record<string, unknown>> {
  const [model] = await sql.unsafe("SELECT canonical_id, name, developer_id FROM models ORDER BY name LIMIT 1");
  const [plan] = await sql.unsafe("SELECT name, actual_price, regular_price FROM plans ORDER BY name LIMIT 1");
  const [access] = await sql.unsafe("SELECT model_id, plan_id, provider_model_id FROM model_access ORDER BY model_id LIMIT 1");
  const [rating] = await sql.unsafe("SELECT model_id, skill_id, personal_score, external_score FROM model_skill_ratings ORDER BY model_id LIMIT 1");
  return { model, plan, access, rating };
}

function encode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint" || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function sqlColumn(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

describe("seven-table transactional round trip", () => {
  it("serializes real export rows, parses bytes, clears and re-imports in a rollback-only transaction", async () => {
    const before = await counts(queryClient(client));
    const beforeSentinels = await sentinels(queryClient(client));
    let during: Counts | undefined;
    const exported = await listExportSevenTables(db);
    const sections = Object.entries(exported).map(([table, rows]) => {
      const normalized = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [sqlColumn(key), encode(value)])));
      return { table, headers: Array.from(new Set(normalized.flatMap((row) => Object.keys(row)))), rows: normalized };
    });
    const bytes = serializeSections(sections);
    const parsed = parseSections(bytes);
    expect(parsed.map((section) => section.table).sort()).toEqual([...TABLES].sort());
    await client.begin(async (tx) => {
      // Dependency-safe clear. model_tags is cleared only as a dependent join table;
      // the entire transaction is forced to roll back below.
      await tx.unsafe("DELETE FROM model_skill_ratings; DELETE FROM model_access_pricing; DELETE FROM model_access; DELETE FROM plan_quotas; DELETE FROM model_tags; DELETE FROM model_aliases; DELETE FROM model_capabilities; DELETE FROM model_benchmark_results; DELETE FROM import_provenance; DELETE FROM tags; DELETE FROM usage_snapshots; DELETE FROM subscription_limit_rules; DELETE FROM subscriptions; DELETE FROM plans; DELETE FROM access_providers; DELETE FROM models;");
        await restoreSevenTableSections(queryClient(tx), parsed);
      during = await counts(queryClient(tx));
      expect(during).toEqual(before);
      expect(await sentinels(queryClient(tx))).toEqual(beforeSentinels);
      throw new Error("ROUNDTRIP_ROLLBACK_SENTINEL");
    }).catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "ROUNDTRIP_ROLLBACK_SENTINEL") throw error;
    });
    expect(await counts(queryClient(client))).toEqual(before);
    expect(await sentinels(queryClient(client))).toEqual(beforeSentinels);
    console.log("ROUNDTRIP_TABLE", JSON.stringify(TABLES.map((table) => ({ table, before: before[table], after: during?.[table] ?? -1 }))));
    console.log("ROUNDTRIP_SENTINELS", JSON.stringify(beforeSentinels));
    console.log("ROUNDTRIP_ROLLBACK", "PASS");
  });
});

afterAll(async () => { await client.end({ timeout: 2 }); });
