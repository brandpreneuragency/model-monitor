import { readFile } from 'node:fs/promises';
import { normalize } from '@model-monitor/schemas';
import { z } from 'zod';
import { sql } from './client.js';

const data = async <T>(filename: string, schema: z.ZodType<T>): Promise<T> =>
  schema.parse(JSON.parse(await readFile(new URL(`../../../data/${filename}`, import.meta.url), 'utf8')));
const nullableString = z.string().nullish().transform((value) => value ?? null);
const nullableNumber = z.number().nullish().transform((value) => value ?? null);
const nullableGeneration = z.union([z.string(), z.number()]).nullish().transform((value) => value == null ? null : String(value));
type CanonicalSeed = {
  canonicalId: string; name: string; developer: string; family: string | null; generation: string | null;
  lifecycle: string | null; releaseDate: string | null; modelType: string | null; contextTokens: number | null;
  maxOutputTokens: number | null; reasoningSupport: string | null; toolSupport: string | null; visionSupport: string | null;
  speedRating: string | null; verifiedTps: number | null; knowledgeCutoff: string | null; codingSpecialization: string | null;
  bestUse: string | null; avoidFor: string | null; verifiedOn: string | null; needsRecheck: boolean;
  scores: Record<string, number | null>; ranks: Record<string, number | null>;
};
const canonicalSchema = z.array(z.object({
  canonicalId: z.string(), name: z.string(), developer: z.string(), family: nullableString,
  generation: nullableGeneration, lifecycle: nullableString, releaseDate: nullableString,
  modelType: nullableString, contextTokens: nullableNumber, maxOutputTokens: nullableNumber,
  reasoningSupport: nullableString, toolSupport: nullableString, visionSupport: nullableString,
  speedRating: nullableString, verifiedTps: nullableNumber, knowledgeCutoff: nullableString,
  codingSpecialization: nullableString, bestUse: nullableString, avoidFor: nullableString,
  verifiedOn: nullableString, needsRecheck: z.boolean().nullish().transform((value) => value ?? true),
  scores: z.record(z.string(), z.number().nullable()).nullish().transform((value) => value ?? {}),
  ranks: z.record(z.string(), z.number().nullable()).nullish().transform((value) => value ?? {}),
}).passthrough());
const subscriptionSchema = z.array(z.object({
  id: z.string(), provider: z.string(), accessProvider: z.string(), plan: z.string(), accountLabel: z.string(),
  status: z.enum(['active', 'paused', 'cancelled', 'expired', 'trial', 'archived']), regularPrice: z.number().nullable(), introductoryPrice: z.number().nullable().optional(), currentPrice: z.number().nullable(), currency: z.string().nullable(), billingInterval: z.string().nullable(), nextBillingDate: z.string().nullable(), autoRenews: z.boolean().nullable(), usageTrackingMode: z.enum(['manual', 'mock', 'estimated', 'provider_reported', 'hybrid']), usageCheckInstructions: z.string().nullable(), apiAccessType: z.enum(['included', 'separate_billing', 'restricted_provider_api', 'none_included', 'none', 'unknown']), authenticationType: z.enum(['oauth_subscription', 'api_key', 'consumer_subscription', 'cli_session', 'none', 'other']), notes: z.string().nullable(),
}));
const accessSchema = z.array(z.object({ subscriptionId: z.string(), modelCanonicalId: z.string(), availability: z.enum(['confirmed', 'unconfirmed', 'unavailable', 'removed']), accessMethod: z.enum(['oauth', 'provider_api', 'direct_api', 'cli', 'consumer_app', 'web', 'self_hosted', 'other']), includedInPlan: z.boolean().nullable(), cliOnly: z.boolean(), webOnly: z.boolean(), apiCompatible: z.boolean().nullable() }));
const aliasSchema = z.array(z.object({ alias: z.string(), canonicalId: z.string(), type: z.string() }));
const benchmarkSchema = z.array(z.object({ Provider: z.string(), Model: z.string(), Category: z.string(), Benchmark: z.string(), 'Version / Setting': z.string().nullable(), Score: z.number().nullable(), Unit: z.string().nullable(), 'Higher Better': z.string().nullable(), 'Comparable Group': z.string().nullable(), 'Source Type': z.string().nullable(), 'Source URL': z.string().nullable(), Notes: z.string().nullable(), 'Verified On': z.string().nullable() }));
const usageSchema = z.array(z.object({ subscriptionId: z.string(), isMock: z.boolean(), capturedAt: z.string(), periodLabel: z.string(), usedPercent: z.number().nullable(), remainingPercent: z.number().nullable(), status: z.string() }));
const routerSchema = z.array(z.record(z.string(), z.unknown()));

const slug = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const lifecycle = (value: string | null): string => {
  const lower = value?.toLowerCase() ?? '';
  if (lower.includes('current')) return 'current';
  if (lower.includes('preview')) return 'preview';
  if (lower.includes('beta')) return 'beta';
  if (lower.includes('retired')) return 'retired';
  if (lower.includes('deprecated')) return 'deprecated';
  if (lower.includes('legacy')) return 'legacy';
  return 'unknown';
};
const triState = (value: string | null | undefined): boolean | null => {
  if (!value || /not confirmed|unknown/i.test(value)) return null;
  return /^yes|supported/i.test(value);
};
const sourceType = (value: string | null): string => {
  if (!value) return 'workbook';
  if (/model|launch/i.test(value)) return 'official_model_card';
  if (/official|primary/i.test(value)) return 'official_docs';
  return 'workbook';
};

const [parsedCanonicalModels, subscriptionRows, accessRows, aliases, benchmarkRows, usageRows, routerRows] = await Promise.all([
  data('canonical-models.seed.json', canonicalSchema), data('subscriptions.seed.json', subscriptionSchema), data('model-access.seed.json', accessSchema), data('model-aliases.seed.json', aliasSchema), data('benchmarks.seed.json', benchmarkSchema), data('mock-usage.seed.json', usageSchema), data('router-snapshot.seed.json', routerSchema),
]);
const canonicalModels = parsedCanonicalModels as CanonicalSeed[];

await sql.begin(async (transaction) => {
  const seedEmail = 'seed-owner@model-monitor.local';
  const [owner] = await transaction<{ id: string }[]>`INSERT INTO users (email, display_name) VALUES (${seedEmail}, 'Seed Owner') ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`;
  if (!owner) throw new Error('Could not create seed owner.');

  const developerIds = new Map<string, string>();
  for (const name of new Set(canonicalModels.map((model) => model.developer))) {
    const [row] = await transaction<{ id: string }[]>`INSERT INTO developers (name, slug) VALUES (${name}, ${slug(name)}) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    if (!row) throw new Error(`Could not seed developer ${name}.`);
    developerIds.set(name, row.id);
  }
  const modelIds = new Map<string, string>();
  const modelNameIds = new Map<string, string>();
  for (const model of canonicalModels) {
    const developerId = developerIds.get(model.developer);
    if (!developerId) throw new Error(`Missing developer ${model.developer}.`);
    const [row] = await transaction<{ id: string }[]>`
      INSERT INTO models (developer_id, canonical_id, name, slug, family, generation, lifecycle, lifecycle_raw, release_date, model_type, context_tokens, max_output_tokens, speed_rating, verified_tps, knowledge_cutoff, coding_specialization, best_use, avoid_for, verified_at, needs_recheck)
      VALUES (${developerId}, ${model.canonicalId}, ${model.name}, ${slug(model.canonicalId)}, ${model.family}, ${model.generation}, ${lifecycle(model.lifecycle)}, ${model.lifecycle}, ${model.releaseDate}, ${model.modelType}, ${model.contextTokens}, ${model.maxOutputTokens}, ${model.speedRating}, ${model.verifiedTps}, ${model.knowledgeCutoff}, ${model.codingSpecialization}, ${model.bestUse}, ${model.avoidFor}, ${model.verifiedOn}, ${model.needsRecheck})
      ON CONFLICT (canonical_id) DO UPDATE SET name = EXCLUDED.name, developer_id = EXCLUDED.developer_id, lifecycle = EXCLUDED.lifecycle, lifecycle_raw = EXCLUDED.lifecycle_raw, updated_at = now()
      RETURNING id
    `;
    if (!row) throw new Error(`Could not seed model ${model.canonicalId}.`);
    modelIds.set(model.canonicalId, row.id); modelNameIds.set(model.name, row.id);
    await transaction`INSERT INTO model_capabilities (model_id, vision, reasoning, tool_use) VALUES (${row.id}, ${triState(model.visionSupport)}, ${triState(model.reasoningSupport)}, ${triState(model.toolSupport)}) ON CONFLICT (model_id) DO UPDATE SET vision = EXCLUDED.vision, reasoning = EXCLUDED.reasoning, tool_use = EXCLUDED.tool_use, updated_at = now()`;
  }
  for (const alias of aliases) {
    const modelId = modelIds.get(alias.canonicalId);
    if (!modelId) throw new Error(`Alias points to unknown model ${alias.canonicalId}.`);
    await transaction`INSERT INTO model_aliases (model_id, alias, normalized_alias, alias_type) VALUES (${modelId}, ${alias.alias}, ${normalize(alias.alias)}, ${alias.type}) ON CONFLICT (model_id, normalized_alias) DO NOTHING`;
  }
  const methodology = await transaction<{ id: string }[]>`INSERT INTO score_methodologies (name, version, factors) VALUES ('factor-model', 'session-6', ${JSON.stringify({ source: 'canonical-models.seed.json' })}::jsonb) ON CONFLICT (name, version) DO UPDATE SET factors = EXCLUDED.factors RETURNING id`;
  if (!methodology[0]) throw new Error('Could not seed score methodology.');
  const calculatedAt = '2026-07-18T00:00:00.000Z';
  for (const model of canonicalModels) {
    const modelId = modelIds.get(model.canonicalId);
    if (!modelId) throw new Error(`Missing seeded model ${model.canonicalId}.`);
    for (const [scoreType, scoreValue] of Object.entries(model.scores)) {
      await transaction`INSERT INTO model_scores (model_id, methodology_id, score_type, score_value, rank_value, calculated_at) VALUES (${modelId}, ${methodology[0].id}, ${scoreType}, ${scoreValue}, ${model.ranks[scoreType] ?? null}, ${calculatedAt}) ON CONFLICT (model_id, methodology_id, score_type, calculated_at) DO UPDATE SET score_value = EXCLUDED.score_value, rank_value = EXCLUDED.rank_value`;
    }
  }
  const providerIds = new Map<string, string>();
  const planIds = new Map<string, string>();
  for (const subscription of subscriptionRows) {
    const providerSlug = slug(subscription.accessProvider);
    const [provider] = await transaction<{ id: string }[]>`INSERT INTO access_providers (name, slug) VALUES (${subscription.accessProvider}, ${providerSlug}) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    if (!provider) throw new Error(`Could not seed access provider ${subscription.accessProvider}.`);
    providerIds.set(subscription.accessProvider, provider.id);
    const [plan] = await transaction<{ id: string }[]>`INSERT INTO plans (access_provider_id, name, slug, regular_price, introductory_price, currency, billing_interval, api_access_type, authentication_type) VALUES (${provider.id}, ${subscription.plan}, ${slug(subscription.plan)}, ${subscription.regularPrice?.toString() ?? null}, ${subscription.introductoryPrice?.toString() ?? null}, ${subscription.currency}, ${subscription.billingInterval}, ${subscription.apiAccessType}, ${subscription.authenticationType}) ON CONFLICT (access_provider_id, slug) DO UPDATE SET regular_price = EXCLUDED.regular_price, introductory_price = EXCLUDED.introductory_price RETURNING id`;
    if (!plan) throw new Error(`Could not seed plan ${subscription.plan}.`);
    planIds.set(subscription.id, plan.id);
    await transaction`INSERT INTO subscriptions (owner_user_id, plan_id, external_seed_id, account_label, status, next_billing_date, auto_renews, actual_price, currency, billing_interval, usage_tracking_mode, usage_check_instructions, notes) VALUES (${owner.id}, ${plan.id}, ${subscription.id}, ${subscription.accountLabel}, ${subscription.status}, ${subscription.nextBillingDate}, ${subscription.autoRenews}, ${subscription.currentPrice?.toString() ?? null}, ${subscription.currency}, ${subscription.billingInterval}, ${subscription.usageTrackingMode}, ${subscription.usageCheckInstructions}, ${subscription.notes}) ON CONFLICT (external_seed_id) DO UPDATE SET actual_price = EXCLUDED.actual_price, next_billing_date = EXCLUDED.next_billing_date, updated_at = now()`;
  }
  for (const access of accessRows) {
    const modelId = modelIds.get(access.modelCanonicalId); const planId = planIds.get(access.subscriptionId);
    if (!modelId || !planId) throw new Error(`Invalid model access ${access.modelCanonicalId}.`);
    await transaction`INSERT INTO model_access (model_id, plan_id, provider_model_id, availability, access_method, included_in_plan, api_compatible, cli_only, web_only) VALUES (${modelId}, ${planId}, ${null}, ${access.availability}, ${access.accessMethod}, ${access.includedInPlan}, ${access.apiCompatible}, ${access.cliOnly}, ${access.webOnly}) ON CONFLICT (model_id, plan_id, provider_model_id) DO UPDATE SET availability = EXCLUDED.availability, included_in_plan = EXCLUDED.included_in_plan, api_compatible = EXCLUDED.api_compatible, cli_only = EXCLUDED.cli_only, web_only = EXCLUDED.web_only`;
  }
  for (const benchmark of benchmarkRows) {
    const modelId = modelNameIds.get(benchmark.Model);
    if (!modelId) throw new Error(`Benchmark references unknown model ${benchmark.Model}.`);
    const [definition] = await transaction<{ id: string }[]>`INSERT INTO benchmarks (name, category, version, comparable_group, score_unit, higher_is_better) VALUES (${benchmark.Benchmark}, ${benchmark.Category}, ${null}, ${benchmark['Comparable Group']}, ${benchmark.Unit}, ${benchmark['Higher Better'] === 'Yes'}) ON CONFLICT (name, version, comparable_group) DO UPDATE SET category = EXCLUDED.category RETURNING id`;
    if (!definition) throw new Error(`Could not seed benchmark ${benchmark.Benchmark}.`);
    const existing = await transaction<{ id: string }[]>`SELECT id FROM model_benchmark_results WHERE model_id = ${modelId} AND benchmark_id = ${definition.id} AND setting IS NOT DISTINCT FROM ${benchmark['Version / Setting']} LIMIT 1`;
    if (existing.length === 0) await transaction`INSERT INTO model_benchmark_results (model_id, benchmark_id, setting, score, source_type, source_url, notes, verified_at) VALUES (${modelId}, ${definition.id}, ${benchmark['Version / Setting']}, ${benchmark.Score}, ${sourceType(benchmark['Source Type'])}, ${benchmark['Source URL']}, ${benchmark.Notes}, ${benchmark['Verified On']})`;
  }
  for (const usage of usageRows) {
    const [subscription] = await transaction<{ id: string }[]>`SELECT id FROM subscriptions WHERE external_seed_id = ${usage.subscriptionId}`;
    if (!subscription) throw new Error(`Missing subscription ${usage.subscriptionId}.`);
    const existing = await transaction<{ id: string }[]>`SELECT id FROM usage_snapshots WHERE subscription_id = ${subscription.id} AND captured_at = ${usage.capturedAt} LIMIT 1`;
    if (existing.length === 0) await transaction`INSERT INTO usage_snapshots (subscription_id, source, is_mock, period_label, used_percent, total_amount, remaining_amount, unit, raw_payload, captured_at) VALUES (${subscription.id}, 'mock', ${usage.isMock}, ${usage.periodLabel}, ${usage.usedPercent}, 100, ${usage.remainingPercent}, 'percent', ${JSON.stringify({ status: usage.status })}::jsonb, ${usage.capturedAt})`;
  }
  for (const snapshot of routerRows) await transaction`INSERT INTO router_snapshots (task_name, ranking_basis, payload) SELECT ${String(snapshot.Task ?? '')}, ${String(snapshot['Ranking Basis'] ?? '')}, ${JSON.stringify(snapshot)}::jsonb WHERE NOT EXISTS (SELECT 1 FROM router_snapshots WHERE task_name = ${String(snapshot.Task ?? '')})`;
  await transaction`INSERT INTO app_settings (key, value, updated_by) VALUES ('catalog_revision', '1'::jsonb, ${owner.id}) ON CONFLICT (key) DO NOTHING`;
});
console.log(`Seeded ${canonicalModels.length} models, ${subscriptionRows.length} subscriptions, ${accessRows.length} access records, and ${benchmarkRows.length} benchmark results.`);
await sql.end();
