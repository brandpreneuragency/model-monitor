import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared Playwright LD_LIBRARY_PATH for user-local Chromium deps.
 */
export function playwrightLdPath(): string {
  const home = process.env.HOME ?? "/home/admin";
  const pwLibs = path.join(home, ".local/pw-libs/usr/lib/x86_64-linux-gnu");
  const pwLibsAlt = path.join(home, ".local/pw-libs/lib/x86_64-linux-gnu");
  return [pwLibs, pwLibsAlt, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
}

export function playwrightPort(fallback: number): number {
  return Number(process.env.PLAYWRIGHT_PORT ?? fallback);
}

export function repoRootFromE2E(): string {
  return path.resolve(here, "../../..");
}

export async function firstAccessProviderId(): Promise<string> {
  const sql = postgres(resolveDatabaseUrl(), { max: 1 });
  try {
    const [row] = await sql<{ id: string }[]>`SELECT id FROM access_providers ORDER BY id LIMIT 1`;
    if (!row) throw new Error("No access provider available for alias E2E fixture");
    return row.id;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  const user = process.env.POSTGRES_USER ?? "modelmonitor";
  const pass = process.env.POSTGRES_PASSWORD ?? user;
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_PORT ?? "5433";
  const database = process.env.POSTGRES_DB ?? "modelmonitor_test";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}`;
}

export async function ensureEvidenceFixtures(
  modelId: string,
  opts: {
    methodologyName: string;
    methodologyVersion: string;
    sourceUrl: string;
    sourceTitle: string;
    benchmarkUrl: string;
    comparableGroup: string;
  },
) {
  const sql = postgres(resolveDatabaseUrl(), { max: 1 });
  try {
    const [meth] = await sql<{ id: string }[]>`
      INSERT INTO score_methodologies (name, version, description, factors, is_active)
      VALUES (
        ${opts.methodologyName},
        ${opts.methodologyVersion},
        'mme2e fixture',
        ${sql.json({ e2e: true })},
        true
      )
      ON CONFLICT (name, version) DO UPDATE SET is_active = true
      RETURNING id
    `;
    await sql`
      INSERT INTO model_scores (
        model_id, methodology_id, score_type, score_value, rank_value,
        eligible_count, is_manual_override, calculated_at
      )
      VALUES (
        ${modelId}::uuid,
        ${meth.id}::uuid,
        'capability',
        88.5,
        1,
        10,
        false,
        now()
      )
    `;
    await sql`
      INSERT INTO sources (entity_type, entity_id, source_type, url, title, verified_at)
      VALUES (
        'model',
        ${modelId}::uuid,
        'manual',
        ${opts.sourceUrl},
        ${opts.sourceTitle},
        now()
      )
    `;
    const [bench] = await sql<{ id: string }[]>`
      INSERT INTO benchmarks (name, category, version, comparable_group, score_unit, higher_is_better)
      VALUES (
        ${`mme2e:bench-${opts.comparableGroup}`},
        'general',
        '1.0',
        ${opts.comparableGroup},
        'score',
        true
      )
      ON CONFLICT (name, version, comparable_group) DO UPDATE SET status = 'active'
      RETURNING id
    `;
    const verifiedAt = "2024-03-15T00:00:00.000Z";
    await sql`
      INSERT INTO model_benchmark_results (
        model_id, benchmark_id, setting, score, score_text, source_type, source_url, verified_at, result_date
      )
      VALUES (
        ${modelId}::uuid,
        ${bench.id}::uuid,
        'mme2e:setting',
        91.2,
        '91.2',
        'manual',
        ${opts.benchmarkUrl},
        ${verifiedAt}::timestamptz,
        '2024-03-15'
      )
    `;
    // Ensure source verification date is deterministic.
    await sql`
      UPDATE sources SET verified_at = ${verifiedAt}::timestamptz
      WHERE entity_type = 'model' AND entity_id = ${modelId}::uuid AND title = ${opts.sourceTitle}
    `;
    return { ...opts, score: 88.5, rank: "1/10", verifiedAt, benchmarkScore: 91.2 };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

export async function ensureScoreSortFixtures(
  models: Array<{ id: string; scoreType: "capability" | "balanced" | "value"; value: number }>,
  methodologyName: string,
  methodologyVersion: string,
) {
  const sql = postgres(resolveDatabaseUrl(), { max: 1 });
  try {
    const [meth] = await sql<{ id: string }[]>`
      INSERT INTO score_methodologies (name, version, description, factors, is_active)
      VALUES (
        ${methodologyName},
        ${methodologyVersion},
        'mme2e score sort fixture',
        ${sql.json({ e2e: true })},
        true
      )
      ON CONFLICT (name, version) DO UPDATE SET is_active = true
      RETURNING id
    `;
    for (const m of models) {
      await sql`
        INSERT INTO model_scores (
          model_id, methodology_id, score_type, score_value, rank_value,
          eligible_count, is_manual_override, calculated_at
        )
        VALUES (
          ${m.id}::uuid,
          ${meth.id}::uuid,
          ${m.scoreType},
          ${m.value},
          1,
          10,
          false,
          now()
        )
      `;
    }
    return { methodologyId: meth.id };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}
