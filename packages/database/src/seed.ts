import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  const user = process.env.POSTGRES_USER ?? "modelmonitor";
  const pass = process.env.POSTGRES_PASSWORD ?? user;
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_PORT ?? "5433";
  const database = process.env.POSTGRES_DB ?? "modelmonitor";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}`;
}

const sql = postgres(resolveDatabaseUrl(), { max: 1 });

const SEED_DIR = join(import.meta.dirname, "..", "seed-data");

const BASELINE_PREFIX = "mm-baseline:";
const OWNER_EMAIL = "owner@model-monitor.local";

// Optional adversarial hook used only by integration tests.
const FAIL_AFTER = process.env.MM_SEED_FAIL_AFTER?.trim() || "";

interface CanonicalModelSeed {
  canonicalId: string;
  name: string;
  developer: string;
  family?: string | null;
  generation?: string | number | null;
  lifecycle?: string | null;
  releaseDate?: string | null;
  knowledgeCutoff?: string | null;
  modelType?: string | null;
  codingSpecialization?: string | null;
  bestUse?: string | null;
  avoidFor?: string | null;
  contextTokens?: number | null;
  maxOutputTokens?: number | null;
  speedRating?: string | null;
  verifiedTps?: number | string | null;
  needsRecheck?: boolean | null;
  verifiedOn?: string | null;
  visionSupport?: string | null;
  reasoningSupport?: string | null;
  toolSupport?: string | null;
}

interface SubscriptionSeed {
  id: string;
  accessProvider: string;
  plan: string;
  accountLabel: string;
  status?: string | null;
  nextBillingDate?: string | null;
  autoRenews?: boolean | null;
  currentPrice?: number | null;
  regularPrice?: number | null;
  introductoryPrice?: number | null;
  currency?: string | null;
  billingInterval?: string | null;
  apiAccessType?: string | null;
  authenticationType?: string | null;
  usageTrackingMode?: string | null;
  usageCheckInstructions?: string | null;
  notes?: string | null;
}

interface ModelAccessSeed {
  modelCanonicalId: string;
  subscriptionId: string;
  availability?: string | null;
  accessMethod?: string | null;
  includedInPlan?: boolean | null;
  cliOnly?: boolean | null;
  webOnly?: boolean | null;
  apiCompatible?: boolean | null;
}

interface AliasSeed {
  canonicalId: string;
  alias: string;
  type?: string | null;
}

interface BenchmarkSeed {
  Benchmark: string;
  Category?: string | null;
  "Version / Setting"?: string | null;
  "Comparable Group"?: string | null;
  Unit?: string | null;
  "Higher Better"?: string | boolean | null;
  Model: string;
  Score?: string | number | null;
  "Verified On"?: string | null;
  "Source URL"?: string | null;
  Notes?: string | null;
}

interface MockUsageSeed {
  subscriptionId: string;
  periodLabel?: string | null;
  usedPercent?: number | null;
  capturedAt?: string | null;
}

interface IdRow {
  id: string;
}

interface PlanIdRow {
  plan_id: string;
}

function loadSeed<T>(filename: string): T {
  const content = readFileSync(join(SEED_DIR, filename), "utf-8");
  return JSON.parse(content) as T;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function maybeFail(checkpoint: string): void {
  if (FAIL_AFTER && FAIL_AFTER === checkpoint) {
    throw new Error(`Injected seed failure after ${checkpoint}`);
  }
}

function benchSeedKey(
  modelCanonicalId: string,
  benchmark: string,
  version: string,
  group: string,
  ordinal: number,
): string {
  return `${BASELINE_PREFIX}bench:${modelCanonicalId}|${benchmark}|${version}|${group}|${ordinal}`;
}

function usageSeedKey(subscriptionExternalId: string, periodLabel: string | null | undefined): string {
  return `${BASELINE_PREFIX}usage:${subscriptionExternalId}|${periodLabel ?? ""}`;
}

async function main() {
  console.log("Seeding database...");

  const canonicalModels = loadSeed<CanonicalModelSeed[]>("canonical-models.seed.json");
  const subscriptionsSeed = loadSeed<SubscriptionSeed[]>("subscriptions.seed.json");
  const modelAccessSeed = loadSeed<ModelAccessSeed[]>("model-access.seed.json");
  const aliasesSeed = loadSeed<AliasSeed[]>("model-aliases.seed.json");
  const benchmarksSeed = loadSeed<BenchmarkSeed[]>("benchmarks.seed.json");
  const mockUsageSeed = loadSeed<MockUsageSeed[]>("mock-usage.seed.json");

  const baselineCanonicalIds = canonicalModels.map((m) => m.canonicalId);
  const baselineSubscriptionExternalIds = subscriptionsSeed.map((s) => s.id);

  const seedStats = await sql.begin(async (tx) => {
    // 1. Owner user
    const [user] = await tx<IdRow[]>`
      INSERT INTO users (email, display_name, role)
      VALUES (${OWNER_EMAIL}, 'Owner', 'owner')
      ON CONFLICT (email) DO UPDATE SET updated_at = now()
      RETURNING id
    `;
    if (!user) throw new Error("Failed to upsert owner user");
    const userId = user.id;
    maybeFail("user");

    // 2. Developers
    const developerNames = Array.from(new Set(canonicalModels.map((m) => m.developer)));
    const devMap = new Map<string, string>();
    for (const name of developerNames) {
      const slug = slugify(name);
      const [dev] = await tx<IdRow[]>`
        INSERT INTO developers (name, slug)
        VALUES (${name}, ${slug})
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
        RETURNING id
      `;
      if (!dev) throw new Error(`Failed to upsert developer: ${name}`);
      devMap.set(name, dev.id);
    }
    maybeFail("developers");

    // 3. Access providers
    const providerMap = new Map<string, string>();
    for (const sub of subscriptionsSeed) {
      const name = sub.accessProvider;
      if (providerMap.has(name)) continue;
      const slug = slugify(name);
      const [prov] = await tx<IdRow[]>`
        INSERT INTO access_providers (name, slug)
        VALUES (${name}, ${slug})
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
        RETURNING id
      `;
      if (!prov) throw new Error(`Failed to upsert access provider: ${name}`);
      providerMap.set(name, prov.id);
    }
    maybeFail("providers");

    // 4. Plans
    const planMap = new Map<string, string>(); // subscription external id -> plan id
    for (const sub of subscriptionsSeed) {
      const providerId = providerMap.get(sub.accessProvider)!;
      const slug = slugify(sub.plan);
      const [plan] = await tx<IdRow[]>`
        INSERT INTO plans (
          access_provider_id, name, slug, regular_price, introductory_price,
          currency, billing_interval, api_access_type, authentication_type
        )
        VALUES (
          ${providerId}, ${sub.plan}, ${slug}, ${sub.regularPrice ?? null},
          ${sub.introductoryPrice ?? null}, ${sub.currency ?? "USD"},
          ${sub.billingInterval ?? "monthly"}, ${sub.apiAccessType ?? "unknown"},
          ${sub.authenticationType ?? "other"}
        )
        ON CONFLICT (access_provider_id, slug) DO UPDATE SET
          regular_price = EXCLUDED.regular_price,
          introductory_price = EXCLUDED.introductory_price,
          currency = EXCLUDED.currency,
          billing_interval = EXCLUDED.billing_interval,
          api_access_type = EXCLUDED.api_access_type,
          authentication_type = EXCLUDED.authentication_type,
          updated_at = now()
        RETURNING id
      `;
      if (!plan) throw new Error(`Failed to upsert plan for subscription seed: ${sub.id}`);
      planMap.set(sub.id, plan.id);
    }
    maybeFail("plans");

    // 5. Subscriptions
    for (const sub of subscriptionsSeed) {
      const planId = planMap.get(sub.id)!;
      await tx`
        INSERT INTO subscriptions (
          owner_user_id, plan_id, external_seed_id, account_label, status,
          next_billing_date, auto_renews, actual_price, currency, billing_interval,
          usage_tracking_mode, usage_check_instructions, notes
        )
        VALUES (
          ${userId}, ${planId}, ${sub.id}, ${sub.accountLabel}, ${sub.status ?? "active"},
          ${sub.nextBillingDate ?? null}, ${sub.autoRenews ?? null}, ${sub.currentPrice ?? null},
          ${sub.currency ?? "USD"}, ${sub.billingInterval ?? "monthly"},
          ${sub.usageTrackingMode ?? "manual"}, ${sub.usageCheckInstructions ?? null},
          ${sub.notes ?? null}
        )
        ON CONFLICT (external_seed_id) DO UPDATE SET
          plan_id = EXCLUDED.plan_id,
          account_label = EXCLUDED.account_label,
          status = EXCLUDED.status,
          next_billing_date = EXCLUDED.next_billing_date,
          auto_renews = EXCLUDED.auto_renews,
          actual_price = EXCLUDED.actual_price,
          currency = EXCLUDED.currency,
          billing_interval = EXCLUDED.billing_interval,
          usage_tracking_mode = EXCLUDED.usage_tracking_mode,
          usage_check_instructions = EXCLUDED.usage_check_instructions,
          notes = EXCLUDED.notes,
          updated_at = now()
      `;
    }
    maybeFail("subscriptions");

    // 6. Canonical models (stable UUID via ON CONFLICT DO UPDATE RETURNING id).
    // Never mutate merged tombstones; resolve relationships onto the surviving target.
    const modelMap = new Map<string, string>(); // canonicalId -> writable model id (survivor if merged)
    const modelByName = new Map<string, string>();
    const baselineModelIds = new Set<string>(); // original baseline row ids (may be tombstones)
    for (const m of canonicalModels) {
      const devId = devMap.get(m.developer)!;
      const slug = slugify(m.name);

      const [existing] = await tx<
        { id: string; merged_into_model_id: string | null; status: string }[]
      >`
        SELECT id, merged_into_model_id, status
        FROM models
        WHERE canonical_id = ${m.canonicalId}
        LIMIT 1
      `;

      if (existing?.merged_into_model_id) {
        // Baseline canonical IDs found as merged tombstones are a hard conflict.
        // Refuse before generic count validation; do not restore, move, or mutate the tombstone.
        throw new Error(
          `Seed conflict: baseline canonical ID ${m.canonicalId} is a merged tombstone (merged_into=${existing.merged_into_model_id}); refuse to restore or mutate`,
        );
      }

      const [model] = await tx<IdRow[]>`
        INSERT INTO models (
          developer_id, canonical_id, name, slug, family, generation, lifecycle,
          lifecycle_raw, release_date, knowledge_cutoff, model_type, coding_specialization,
          best_use, avoid_for, context_tokens, max_output_tokens, speed_rating,
          verified_tps, needs_recheck, verified_at
        )
        VALUES (
          ${devId}, ${m.canonicalId}, ${m.name}, ${slug}, ${m.family ?? null},
          ${m.generation?.toString() ?? null}, 'unknown', ${m.lifecycle ?? null},
          ${m.releaseDate ?? null}, ${m.knowledgeCutoff ?? null}, ${m.modelType ?? null},
          ${m.codingSpecialization ?? null}, ${m.bestUse ?? null}, ${m.avoidFor ?? null},
          ${m.contextTokens ?? null}, ${m.maxOutputTokens ?? null}, ${m.speedRating ?? null},
          ${m.verifiedTps ?? null}, ${m.needsRecheck ?? true}, ${m.verifiedOn ?? null}
        )
        ON CONFLICT (canonical_id) DO UPDATE SET
          developer_id = EXCLUDED.developer_id,
          name = EXCLUDED.name,
          family = EXCLUDED.family,
          generation = EXCLUDED.generation,
          lifecycle_raw = EXCLUDED.lifecycle_raw,
          release_date = EXCLUDED.release_date,
          knowledge_cutoff = EXCLUDED.knowledge_cutoff,
          model_type = EXCLUDED.model_type,
          coding_specialization = EXCLUDED.coding_specialization,
          best_use = EXCLUDED.best_use,
          avoid_for = EXCLUDED.avoid_for,
          context_tokens = EXCLUDED.context_tokens,
          max_output_tokens = EXCLUDED.max_output_tokens,
          speed_rating = EXCLUDED.speed_rating,
          verified_tps = EXCLUDED.verified_tps,
          needs_recheck = EXCLUDED.needs_recheck,
          verified_at = EXCLUDED.verified_at,
          updated_at = now()
        WHERE models.merged_into_model_id IS NULL
        RETURNING id
      `;
      if (!model) throw new Error(`Failed to upsert model: ${m.canonicalId}`);
      baselineModelIds.add(model.id);
      modelMap.set(m.canonicalId, model.id);
      modelByName.set(m.name, model.id);
    }
    maybeFail("models");

    // 7. Capabilities — only on non-tombstone writable targets
    for (const m of canonicalModels) {
      const modelId = modelMap.get(m.canonicalId)!;
      const [row] = await tx<{ merged_into_model_id: string | null }[]>`
        SELECT merged_into_model_id FROM models WHERE id = ${modelId}::uuid
      `;
      if (row?.merged_into_model_id) {
        throw new Error(`Refusing to write capabilities onto merged tombstone ${modelId}`);
      }
      const vision = m.visionSupport ? m.visionSupport.toLowerCase().startsWith("yes") : null;
      const reasoning = m.reasoningSupport
        ? m.reasoningSupport.toLowerCase().startsWith("yes")
        : null;
      const toolUse = m.toolSupport ? m.toolSupport.toLowerCase().startsWith("yes") : null;
      await tx`
        INSERT INTO model_capabilities (model_id, vision, reasoning, tool_use)
        VALUES (${modelId}, ${vision}, ${reasoning}, ${toolUse})
        ON CONFLICT (model_id) DO UPDATE SET
          vision = EXCLUDED.vision,
          reasoning = EXCLUDED.reasoning,
          tool_use = EXCLUDED.tool_use,
          updated_at = now()
      `;
    }
    maybeFail("capabilities");

    // 8. Aliases (idempotent; do not steal unrelated aliases; never attach to tombstones)
    for (const a of aliasesSeed) {
      const modelId = modelMap.get(a.canonicalId);
      if (!modelId) continue;
      const normalized = slugify(a.alias);
      await tx`
        INSERT INTO model_aliases (model_id, alias, normalized_alias, alias_type)
        VALUES (${modelId}, ${a.alias}, ${normalized}, ${a.type ?? "display_name"})
        ON CONFLICT (normalized_alias) DO UPDATE SET
          model_id = CASE
            WHEN model_aliases.model_id = EXCLUDED.model_id THEN model_aliases.model_id
            ELSE model_aliases.model_id
          END,
          alias = CASE
            WHEN model_aliases.model_id = EXCLUDED.model_id THEN EXCLUDED.alias
            ELSE model_aliases.alias
          END
      `;
    }
    maybeFail("aliases");

    // 9. Access paths for baseline models/subscriptions only (survivor targets)
    for (const acc of modelAccessSeed) {
      const modelId = modelMap.get(acc.modelCanonicalId);
      if (!modelId) continue;
      const [sub] = await tx<PlanIdRow[]>`
        SELECT plan_id FROM subscriptions WHERE external_seed_id = ${acc.subscriptionId}
      `;
      if (!sub) continue;
      await tx`
        INSERT INTO model_access (
          model_id, plan_id, availability, access_method, included_in_plan,
          cli_only, web_only, api_compatible
        )
        VALUES (
          ${modelId}, ${sub.plan_id}, ${acc.availability ?? "unconfirmed"},
          ${acc.accessMethod ?? "other"}, ${acc.includedInPlan ?? null},
          ${acc.cliOnly ?? false}, ${acc.webOnly ?? false}, ${acc.apiCompatible ?? null}
        )
        ON CONFLICT DO NOTHING
      `;
    }
    maybeFail("access");

    // 10. Baseline benchmarks — upsert by durable seed_key; never touch unowned rows.
    const desiredBenchKeys = new Set<string>();
    const benchMap = new Map<string, string>();
    const unmatchedBenchModels = new Set<string>();
    const modelOrdinal = new Map<string, number>();
    let benchRowsUpserted = 0;

    for (const b of benchmarksSeed) {
      const benchKey = `${b.Benchmark}|${b["Version / Setting"] ?? ""}|${b["Comparable Group"] ?? ""}`;
      if (!benchMap.has(benchKey)) {
        const [bench] = await tx<IdRow[]>`
          INSERT INTO benchmarks (name, category, version, comparable_group, score_unit, higher_is_better)
          VALUES (
            ${b.Benchmark},
            ${b.Category ?? "general"},
            ${b["Version / Setting"] ?? null},
            ${b["Comparable Group"] ?? null},
            ${b.Unit ?? null},
            ${b["Higher Better"]?.toString().toLowerCase().startsWith("yes") ?? null}
          )
          ON CONFLICT (name, version, comparable_group) DO UPDATE SET status = 'active'
          RETURNING id
        `;
        if (!bench) throw new Error(`Failed to upsert benchmark: ${benchKey}`);
        benchMap.set(benchKey, bench.id);
      }
      const benchId = benchMap.get(benchKey)!;
      const modelId = modelByName.get(b.Model) ?? modelMap.get(b.Model) ?? null;
      if (!modelId) {
        unmatchedBenchModels.add(b.Model);
        continue;
      }
      const modelCanonical =
        [...modelMap.entries()].find(([, id]) => id === modelId)?.[0] ?? b.Model;
      const ordKey = `${modelCanonical}|${benchKey}`;
      const ordinal = modelOrdinal.get(ordKey) ?? 0;
      modelOrdinal.set(ordKey, ordinal + 1);
      const seedKey = benchSeedKey(
        modelCanonical,
        b.Benchmark,
        b["Version / Setting"] ?? "",
        b["Comparable Group"] ?? "",
        ordinal,
      );
      desiredBenchKeys.add(seedKey);

      const scoreNum = parseFloat(String(b.Score));
      const notes = b.Notes ?? null;

      // Prefer existing owned row; else adopt legacy unmarked baseline twin ONLY on exact
      // authoritative identity. Ambiguous matches are never claimed.
      const [owned] = await tx<IdRow[]>`
        SELECT id FROM model_benchmark_results WHERE seed_key = ${seedKey} LIMIT 1
      `;
      if (owned) {
        await tx`
          UPDATE model_benchmark_results SET
            model_id = ${modelId},
            benchmark_id = ${benchId},
            setting = ${b["Version / Setting"] ?? null},
            score = ${Number.isNaN(scoreNum) ? null : scoreNum},
            score_text = ${b.Score != null ? String(b.Score) : null},
            result_date = ${b["Verified On"] ?? null},
            source_type = 'workbook',
            source_url = ${b["Source URL"] ?? null},
            notes = ${notes},
            verified_at = ${b["Verified On"] ?? null}
          WHERE id = ${owned.id}
            AND seed_key = ${seedKey}
        `;
      } else {
        const legacyCandidates = await tx<IdRow[]>`
          SELECT id FROM model_benchmark_results
          WHERE seed_key IS NULL
            AND import_job_id IS NULL
            AND model_id = ${modelId}
            AND benchmark_id = ${benchId}
            AND coalesce(setting, '') = coalesce(${b["Version / Setting"] ?? null}, '')
            AND coalesce(score_text, '') = coalesce(${b.Score != null ? String(b.Score) : null}, '')
            AND (
              (score IS NULL AND ${Number.isNaN(scoreNum) ? null : scoreNum}::numeric IS NULL)
              OR score = ${Number.isNaN(scoreNum) ? null : scoreNum}
            )
            AND source_type = 'workbook'
            AND coalesce(source_url, '') = coalesce(${b["Source URL"] ?? null}, '')
            AND coalesce(notes, '') = coalesce(${notes}, '')
            AND coalesce(result_date::text, '') = coalesce(${b["Verified On"] ?? null}, '')
            AND coalesce(verified_at::date::text, '') = coalesce(${b["Verified On"] ?? null}, '')
          ORDER BY created_at ASC, id ASC
        `;
        if (legacyCandidates.length === 1) {
          await tx`
            UPDATE model_benchmark_results SET
              seed_key = ${seedKey}
            WHERE id = ${legacyCandidates[0].id}
              AND seed_key IS NULL
          `;
          // After claiming ownership, refresh authoritative baseline fields.
          await tx`
            UPDATE model_benchmark_results SET
              setting = ${b["Version / Setting"] ?? null},
              score = ${Number.isNaN(scoreNum) ? null : scoreNum},
              score_text = ${b.Score != null ? String(b.Score) : null},
              result_date = ${b["Verified On"] ?? null},
              source_url = ${b["Source URL"] ?? null},
              notes = ${notes},
              verified_at = ${b["Verified On"] ?? null}
            WHERE id = ${legacyCandidates[0].id}
              AND seed_key = ${seedKey}
          `;
        } else {
          // 0 = no twin; >1 = ambiguous — never claim.
          await tx`
            INSERT INTO model_benchmark_results (
              model_id, benchmark_id, setting, score, score_text, result_date,
              source_type, source_url, notes, verified_at, seed_key
            )
            VALUES (
              ${modelId}, ${benchId}, ${b["Version / Setting"] ?? null},
              ${Number.isNaN(scoreNum) ? null : scoreNum},
              ${b.Score != null ? String(b.Score) : null},
              ${b["Verified On"] ?? null}, 'workbook', ${b["Source URL"] ?? null},
              ${notes}, ${b["Verified On"] ?? null}, ${seedKey}
            )
          `;
        }
      }
      benchRowsUpserted += 1;
    }

    // Delete only previously owned baseline keys that are no longer authoritative.
    const ownedBenchKeys = desiredBenchKeys.size
      ? await tx<{ seed_key: string }[]>`
          SELECT seed_key FROM model_benchmark_results
          WHERE seed_key LIKE ${BASELINE_PREFIX + "%"}
        `
      : [];
    for (const row of ownedBenchKeys) {
      if (row.seed_key && !desiredBenchKeys.has(row.seed_key)) {
        await tx`DELETE FROM model_benchmark_results WHERE seed_key = ${row.seed_key}`;
      }
    }
    maybeFail("benchmarks");

    // 11. Baseline mock usage — owned by seed_key only
    const desiredUsageKeys = new Set<string>();
    let mockUpserted = 0;
    for (const u of mockUsageSeed) {
      const [sub] = await tx<IdRow[]>`
        SELECT id FROM subscriptions WHERE external_seed_id = ${u.subscriptionId}
      `;
      if (!sub) continue;
      const seedKey = usageSeedKey(u.subscriptionId, u.periodLabel);
      desiredUsageKeys.add(seedKey);
      const [owned] = await tx<IdRow[]>`
        SELECT id FROM usage_snapshots WHERE seed_key = ${seedKey} LIMIT 1
      `;
      if (owned) {
        await tx`
          UPDATE usage_snapshots SET
            subscription_id = ${sub.id},
            source = 'mock',
            is_mock = true,
            period_label = ${u.periodLabel ?? null},
            used_percent = ${u.usedPercent ?? null},
            captured_at = ${u.capturedAt ?? new Date().toISOString()},
            raw_payload = ${tx.json({ seed: "mm-baseline-seed", seed_key: seedKey })}
          WHERE id = ${owned.id}
            AND seed_key = ${seedKey}
        `;
      } else {
        // Adopt only an exact authoritative identity match; ambiguous => insert new owned row.
        const captured = u.capturedAt ?? null;
        const legacyCandidates = await tx<IdRow[]>`
          SELECT id FROM usage_snapshots
          WHERE seed_key IS NULL
            AND is_mock = true
            AND source = 'mock'
            AND subscription_id = ${sub.id}
            AND coalesce(period_label, '') = coalesce(${u.periodLabel ?? null}, '')
            AND (
              (used_percent IS NULL AND ${u.usedPercent ?? null}::numeric IS NULL)
              OR used_percent = ${u.usedPercent ?? null}
            )
            AND (
              ${captured}::timestamptz IS NULL
              OR captured_at = ${captured}::timestamptz
            )
            AND raw_payload = ${tx.json({ seed: "mm-baseline-seed", seed_key: seedKey })}::jsonb
          ORDER BY created_at ASC, id ASC
        `;
        if (legacyCandidates.length === 1) {
          await tx`
            UPDATE usage_snapshots SET
              seed_key = ${seedKey}
            WHERE id = ${legacyCandidates[0].id}
              AND seed_key IS NULL
          `;
        } else {
          await tx`
            INSERT INTO usage_snapshots (
              subscription_id, source, is_mock, period_label, used_percent,
              captured_at, raw_payload, seed_key
            )
            VALUES (
              ${sub.id}, 'mock', true, ${u.periodLabel ?? null}, ${u.usedPercent ?? null},
              ${u.capturedAt ?? new Date().toISOString()},
              ${tx.json({ seed: "mm-baseline-seed", seed_key: seedKey })},
              ${seedKey}
            )
          `;
        }
      }
      mockUpserted += 1;
    }

    const ownedUsage = await tx<{ seed_key: string }[]>`
      SELECT seed_key FROM usage_snapshots
      WHERE seed_key LIKE ${BASELINE_PREFIX + "%"}
    `;
    for (const row of ownedUsage) {
      if (row.seed_key && !desiredUsageKeys.has(row.seed_key)) {
        await tx`DELETE FROM usage_snapshots WHERE seed_key = ${row.seed_key}`;
      }
    }
    maybeFail("usage");

    // Baseline-scoped verification (must not fail due to legitimate extra user data).
    const [modelCount] = await tx<{ c: number }[]>`
      SELECT count(*)::int AS c FROM models
      WHERE canonical_id = ANY(${baselineCanonicalIds})
        AND status = 'active'
    `;
    const [subCount] = await tx<{ c: number }[]>`
      SELECT count(*)::int AS c FROM subscriptions
      WHERE external_seed_id = ANY(${baselineSubscriptionExternalIds})
        AND status = 'active'
    `;
    const [accessCount] = await tx<{ c: number }[]>`
      SELECT count(*)::int AS c
      FROM model_access ma
      JOIN models m ON m.id = ma.model_id
      JOIN subscriptions s ON s.plan_id = ma.plan_id
      WHERE m.canonical_id = ANY(${baselineCanonicalIds})
        AND s.external_seed_id = ANY(${baselineSubscriptionExternalIds})
        AND ma.status = 'active'
    `;
    const [benchCount] = await tx<{ c: number }[]>`
      SELECT count(*)::int AS c FROM model_benchmark_results
      WHERE seed_key LIKE ${BASELINE_PREFIX + "bench:%"}
    `;
    const [mockCount] = await tx<{ c: number }[]>`
      SELECT count(*)::int AS c FROM usage_snapshots
      WHERE seed_key LIKE ${BASELINE_PREFIX + "usage:%"}
    `;
    const [costRow] = await tx<{ total: string | number }[]>`
      SELECT COALESCE(SUM(p.regular_price), 0) AS total
      FROM subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.external_seed_id = ANY(${baselineSubscriptionExternalIds})
        AND s.status = 'active'
    `;
    const [devCount] = await tx<{ c: number }[]>`
      SELECT count(*)::int AS c FROM developers WHERE slug = ANY(${developerNames.map(slugify)})
    `;
    const [provCount] = await tx<{ c: number }[]>`
      SELECT count(*)::int AS c FROM access_providers
      WHERE slug = ANY(${[...providerMap.keys()].map(slugify)})
    `;
    const [aliasCount] = await tx<{ c: number }[]>`
      SELECT count(*)::int AS c FROM model_aliases ma
      JOIN models m ON m.id = ma.model_id
      WHERE m.canonical_id = ANY(${baselineCanonicalIds})
    `;
    const [capCount] = await tx<{ c: number }[]>`
      SELECT count(*)::int AS c FROM model_capabilities mc
      JOIN models m ON m.id = mc.model_id
      WHERE m.canonical_id = ANY(${baselineCanonicalIds})
    `;

    maybeFail("verify");

    const stats = {
      userId,
      developers: Number(devCount.c),
      providers: Number(provCount.c),
      aliases: Number(aliasCount.c),
      capabilities: Number(capCount.c),
      models: Number(modelCount.c),
      subscriptions: Number(subCount.c),
      modelAccess: Number(accessCount.c),
      benchmarks: Number(benchCount.c),
      mockUsage: Number(mockCount.c),
      monthlyCost: Number(costRow.total),
      benchRowsUpserted,
      mockUpserted,
      unmatchedBenchModels,
    };

    // Assertions must run inside the transaction so failures roll back all writes.
    // Test-only overrides force the real count/cost assertion path (not only injected throws).
    const expectModels = Number(process.env.MM_SEED_EXPECT_MODELS ?? 51);
    const expectSubs = Number(process.env.MM_SEED_EXPECT_SUBS ?? 4);
    // Baseline seed alone → 19; after csv-migration on same subscription plans → 23.
    const expectAccessExact = process.env.MM_SEED_EXPECT_ACCESS
      ? Number(process.env.MM_SEED_EXPECT_ACCESS)
      : null;
    const expectBenches = Number(process.env.MM_SEED_EXPECT_BENCHES ?? 276);
    const expectUsage = Number(process.env.MM_SEED_EXPECT_USAGE ?? 4);
    const expectCost = Number(process.env.MM_SEED_EXPECT_COST ?? 61);
    const accessOk =
      expectAccessExact !== null
        ? stats.modelAccess === expectAccessExact
        : stats.modelAccess === 19 || stats.modelAccess === 23;
    const allCorrect =
      stats.models === expectModels &&
      stats.subscriptions === expectSubs &&
      accessOk &&
      stats.benchmarks === expectBenches &&
      stats.mockUsage === expectUsage &&
      stats.monthlyCost === expectCost;

    if (!allCorrect) {
      throw new Error(
        `SEED ASSERTIONS FAILED inside transaction — models=${stats.models} subs=${stats.subscriptions} access=${stats.modelAccess} benches=${stats.benchmarks} mock=${stats.mockUsage} cost=${stats.monthlyCost}`,
      );
    }

    return stats;
  });

  if (seedStats.unmatchedBenchModels.size > 0) {
    console.log(
      `  ! Unmatched benchmark models: ${Array.from(seedStats.unmatchedBenchModels).join(", ")}`,
    );
  }

  console.log(`  ✓ User: ${seedStats.userId}`);
  console.log(`  ✓ Developers: ${seedStats.developers}`);
  console.log(`  ✓ Access providers: ${seedStats.providers}`);
  console.log(`  ✓ Canonical models: ${seedStats.models}`);
  console.log(`  ✓ Model capabilities: ${seedStats.capabilities}`);
  console.log(`  ✓ Aliases (on baseline models): ${seedStats.aliases}`);
  console.log(`  ✓ Baseline model access: ${seedStats.modelAccess}`);
  console.log(
    `  ✓ Baseline benchmark rows upserted: ${seedStats.benchRowsUpserted} (owned=${seedStats.benchmarks})`,
  );
  console.log(`  ✓ Baseline mock usage: ${seedStats.mockUpserted} (owned=${seedStats.mockUsage})`);

  console.log("\n── Seed verification (baseline-owned only) ──");
  console.log(`  Active baseline models:          ${seedStats.models} (expected 51)`);
  console.log(`  Active baseline subscriptions:   ${seedStats.subscriptions} (expected 4)`);
  console.log(`  Active baseline model access:    ${seedStats.modelAccess} (expected 19 baseline / 23 post-csv-migration)`);
  console.log(`  Baseline-owned benchmarks:       ${seedStats.benchmarks} (expected 276)`);
  console.log(`  Baseline-owned mock usage:       ${seedStats.mockUsage} (expected 4)`);
  console.log(`  Baseline developers:             ${seedStats.developers}`);
  console.log(`  Baseline providers:              ${seedStats.providers}`);
  console.log(`  Baseline aliases:                ${seedStats.aliases}`);
  console.log(`  Baseline capabilities:           ${seedStats.capabilities}`);
  console.log(`  Baseline monthly cost:           $${seedStats.monthlyCost} (expected 61)`);

  console.log("\n✓ ALL SEED ASSERTIONS PASS");

  await sql.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
