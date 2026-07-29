import postgres from "postgres";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  const user = process.env.POSTGRES_USER ?? "modelmonitor";
  const pass = process.env.POSTGRES_PASSWORD ?? user;
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_PORT ?? "5433";
  const database = process.env.POSTGRES_DB ?? "modelmonitor";
  // Use the computed password; never log this URL.
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}`;
}

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Application schema objects that indicate a non-empty historical database. */
const KNOWN_APP_TABLES = [
  "users",
  "developers",
  "access_providers",
  "plans",
  "models",
  "model_aliases",
  "model_capabilities",
  "model_access",
  "model_access_pricing",
  "score_methodologies",
  "benchmarks",
  "model_benchmark_results",
  "sources",
  "import_jobs",
  "import_conflicts",
  "import_provenance",
  "audit_events",
  "app_settings",
  "idempotency_keys",
] as const;

const KNOWN_APP_TYPES = [
  "record_status",
  "subscription_status",
  "lifecycle_status",
  "availability_status",
  "access_method",
  "authentication_type",
  "api_access_type",
  "usage_tracking_mode",
  "source_type",
  "audit_action",
  "import_status",
  "usage_source",
] as const;

// Stable per database: all migration runners serialize on this key.
const MIGRATION_LOCK_KEY = 0x4d4d5f4d;

async function ensureLedger(sql: postgres.Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function tableExists(sql: postgres.Sql, table: string): Promise<boolean> {
  const [row] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return Boolean(row?.exists);
}

async function typeExists(sql: postgres.Sql, typeName: string): Promise<boolean> {
  const [row] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = ${typeName}
    ) AS exists
  `;
  return Boolean(row?.exists);
}

/**
 * Detect any known application schema object (tables or enums).
 * schema_migrations itself is not an application object.
 */
async function anyKnownApplicationSchemaObject(sql: postgres.Sql): Promise<boolean> {
  for (const table of KNOWN_APP_TABLES) {
    if (await tableExists(sql, table)) return true;
  }
  for (const typeName of KNOWN_APP_TYPES) {
    if (await typeExists(sql, typeName)) return true;
  }
  return false;
}

/**
 * Empty ledger policy (fail closed):
 * - empty ledger + no application schema objects → fresh DB; apply migrations normally
 * - empty ledger + any known application schema object → refuse; insert zero ledger rows
 *
 * No probe-based legacy baselining. No MM_LEGACY_BASELINE auto-adoption.
 * Existing DBs that already have a ledger are undisturbed.
 */
async function assertEmptyLedgerIsSafe(sql: postgres.Sql) {
  const existing = await sql<{ filename: string }[]>`
    SELECT filename FROM schema_migrations
  `;
  if (existing.length > 0) return;

  if (await anyKnownApplicationSchemaObject(sql)) {
    throw new Error(
      "Migration ledger is empty but application schema objects already exist. " +
        "Refusing to baseline or guess historical migrations. " +
        "Restore a known-good database that includes schema_migrations, or recreate the database and apply migrations from scratch. " +
        "No ledger rows were inserted.",
    );
  }
}

/** Fail clearly when an applied migration file was edited after being recorded. */
async function verifyAppliedChecksums(
  sql: postgres.Sql,
  files: string[],
  migrationsDir: string,
) {
  const disk = new Map(
    files.map((file) => {
      const content = readFileSync(join(migrationsDir, file), "utf-8");
      return [file, checksum(content)] as const;
    }),
  );

  const rows = await sql<{ filename: string; checksum: string }[]>`
    SELECT filename, checksum FROM schema_migrations ORDER BY filename
  `;

  for (const row of rows) {
    const expected = disk.get(row.filename);
    if (!expected) {
      throw new Error(
        `Migration ledger contains unknown file "${row.filename}" that is not present on disk`,
      );
    }
    if (expected !== row.checksum) {
      throw new Error(
        `Migration checksum mismatch for "${row.filename}": ledger=${row.checksum} disk=${expected}. Edited migration history is not allowed.`,
      );
    }
  }
}

async function main() {
  const url = resolveDatabaseUrl();
  const sql = postgres(url, { max: 1 });
  const migrationsDir = join(import.meta.dirname, "..", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Migration runner — ${files.length} file(s) discovered`);

  try {
    const barrier = process.env.MM_MIGRATION_START_BARRIER;
    if (barrier) {
      await sql`SELECT pg_advisory_lock(${Number(barrier)})`;
      await sql`SELECT pg_advisory_unlock(${Number(barrier)})`;
    }

    await sql.begin(async (tx) => {
      // Hold this transaction-scoped lock across ledger validation, DDL, and
      // ledger inserts. A concurrent fresh runner cannot observe partial work.
      await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
      await ensureLedger(tx as unknown as postgres.Sql);
      await assertEmptyLedgerIsSafe(tx as unknown as postgres.Sql);
      await verifyAppliedChecksums(tx as unknown as postgres.Sql, files, migrationsDir);

      const appliedRows = await tx<{ filename: string }[]>`
        SELECT filename FROM schema_migrations
      `;
      const applied = new Set(appliedRows.map((r) => r.filename));
      let ran = 0;
      for (const file of files) {
        if (applied.has(file)) {
          console.log(`  ✓ ${file} (already applied)`);
          continue;
        }
        const content = readFileSync(join(migrationsDir, file), "utf-8");
        const sum = checksum(content);
        console.log(`  → applying ${file}`);
        await tx.unsafe(content);
        await tx`
          INSERT INTO schema_migrations (filename, checksum)
          VALUES (${file}, ${sum})
        `;
        ran += 1;
        console.log(`  ✓ ${file}`);
      }
      await verifyAppliedChecksums(tx as unknown as postgres.Sql, files, migrationsDir);
      if (ran === 0) console.log("✓ All migrations already applied — nothing to do");
      else console.log(`✓ Applied ${ran} migration(s) successfully`);
    });
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
