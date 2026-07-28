/**
 * csv-migration phase — apply parseMasterCsv() output + default seeds in one transaction.
 * Run: PATH="$HOME/.local/bin:$PATH" pnpm exec tsx scripts/apply-csv-migration.mts
 *
 * Env:
 *   DATABASE_URL (required) — target database
 *   DRY_RUN=1 — parse + join check only
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parseMasterCsv, type ParsedMaster } from "../packages/csv-import/src/index.ts";

// Resolve deps from workspace packages (scripts/ is not a package root).
const require = createRequire(resolve(import.meta.dirname, "../packages/database/package.json"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const postgres = require("postgres") as typeof import("postgres");

const REPO = resolve(import.meta.dirname, "..");
const CSV_PATH = resolve(REPO, "data/source/LLM_MASTER_v1.csv");

// ─── Skill catalogue (SPEC §5.4) ────────────────────────────────────────────

const SKILLS: ReadonlyArray<{
  key: string;
  name: string;
  slug: string;
  category: string;
  sortOrder: number;
  hasExternal: boolean;
}> = [
  { key: "coding", name: "Coding", slug: "coding", category: "core", sortOrder: 10, hasExternal: true },
  {
    key: "agent_tool",
    name: "Agent / Tool Use",
    slug: "agent-tool-use",
    category: "core",
    sortOrder: 20,
    hasExternal: true,
  },
  {
    key: "review_debug",
    name: "Review / Debug",
    slug: "review-debug",
    category: "core",
    sortOrder: 30,
    hasExternal: true,
  },
  {
    key: "long_context",
    name: "Long Context",
    slug: "long-context",
    category: "core",
    sortOrder: 40,
    hasExternal: true,
  },
  { key: "speed", name: "Speed", slug: "speed", category: "core", sortOrder: 50, hasExternal: true },
  { key: "value", name: "Value", slug: "value", category: "core", sortOrder: 60, hasExternal: true },
  {
    key: "multimodality",
    name: "Multimodality",
    slug: "multimodality",
    category: "core",
    sortOrder: 70,
    hasExternal: true,
  },
  {
    key: "reliability",
    name: "Reliability",
    slug: "reliability",
    category: "core",
    sortOrder: 80,
    hasExternal: true,
  },
  {
    key: "terminal_devops",
    name: "Terminal / DevOps",
    slug: "terminal-devops",
    category: "workflow",
    sortOrder: 90,
    hasExternal: true,
  },
  {
    key: "ui_frontend",
    name: "UI / Frontend",
    slug: "ui-frontend",
    category: "workflow",
    sortOrder: 100,
    hasExternal: true,
  },
  {
    key: "architecture",
    name: "Architecture",
    slug: "architecture",
    category: "workflow",
    sortOrder: 110,
    hasExternal: true,
  },
  {
    key: "bulk_work",
    name: "Bulk Work",
    slug: "bulk-work",
    category: "workflow",
    sortOrder: 120,
    hasExternal: true,
  },
  {
    key: "general_capability",
    name: "General Capability",
    slug: "general-capability",
    category: "foundation",
    sortOrder: 130,
    hasExternal: false,
  },
  {
    key: "research_reasoning",
    name: "Research / Reasoning",
    slug: "research-reasoning",
    category: "foundation",
    sortOrder: 140,
    hasExternal: false,
  },
  {
    key: "instruction_following",
    name: "Instruction Following",
    slug: "instruction-following",
    category: "foundation",
    sortOrder: 150,
    hasExternal: false,
  },
  {
    key: "writing_quality",
    name: "Writing Quality",
    slug: "writing-quality",
    category: "foundation",
    sortOrder: 160,
    hasExternal: false,
  },
];

/** SPEC §5.5 — 10 profiles with editable skill weights (keys = skill.key). */
const PROFILES: ReadonlyArray<{
  name: string;
  slug: string;
  description: string;
  isDefault: boolean;
  sortOrder: number;
  weights: Record<string, number>;
}> = [
  {
    name: "Best Everyday Model",
    slug: "best-everyday",
    description: "Balanced default profile (CSV Balanced composite).",
    isDefault: true,
    sortOrder: 10,
    weights: {
      coding: 1.2,
      agent_tool: 1.2,
      review_debug: 0.8,
      long_context: 1.0,
      speed: 1.0,
      value: 1.2,
      multimodality: 0.7,
      reliability: 1.2,
      general_capability: 1.0,
      instruction_following: 0.9,
    },
  },
  {
    name: "Heavy Coding",
    slug: "heavy-coding",
    description: "Repository and agent coding focus (CSV Capability composite).",
    isDefault: false,
    sortOrder: 20,
    weights: {
      coding: 2.0,
      agent_tool: 1.5,
      review_debug: 1.4,
      terminal_devops: 1.2,
      architecture: 1.0,
      long_context: 0.8,
      speed: 0.6,
      reliability: 0.8,
    },
  },
  {
    name: "Cheap Subagent",
    slug: "cheap-subagent",
    description: "Cost-efficient bulk/subagent work (CSV Value composite).",
    isDefault: false,
    sortOrder: 30,
    weights: {
      value: 2.0,
      speed: 1.5,
      bulk_work: 1.5,
      coding: 1.0,
      agent_tool: 1.0,
      reliability: 0.8,
    },
  },
  {
    name: "UI Builder",
    slug: "ui-builder",
    description: "Frontend and multimodal UI work.",
    isDefault: false,
    sortOrder: 40,
    weights: {
      ui_frontend: 2.0,
      multimodality: 1.5,
      coding: 1.2,
      instruction_following: 1.0,
      writing_quality: 0.8,
      speed: 0.8,
    },
  },
  {
    name: "Architecture and Planning",
    slug: "architecture-planning",
    description: "System design and long-horizon planning.",
    isDefault: false,
    sortOrder: 50,
    weights: {
      architecture: 2.0,
      research_reasoning: 1.4,
      long_context: 1.3,
      coding: 1.0,
      instruction_following: 1.0,
      reliability: 0.9,
    },
  },
  {
    name: "Review and Debug",
    slug: "review-debug",
    description: "Code review, repair, and debugging.",
    isDefault: false,
    sortOrder: 60,
    weights: {
      review_debug: 2.0,
      coding: 1.4,
      agent_tool: 1.2,
      terminal_devops: 1.0,
      reliability: 0.9,
    },
  },
  {
    name: "Fast Bulk Worker",
    slug: "fast-bulk-worker",
    description: "High-throughput low-cost bulk tasks.",
    isDefault: false,
    sortOrder: 70,
    weights: {
      bulk_work: 2.0,
      speed: 1.8,
      value: 1.5,
      coding: 0.8,
      reliability: 0.7,
    },
  },
  {
    name: "Research",
    slug: "research",
    description: "Deep research and reasoning.",
    isDefault: false,
    sortOrder: 80,
    weights: {
      research_reasoning: 2.0,
      long_context: 1.5,
      general_capability: 1.2,
      instruction_following: 1.0,
      writing_quality: 1.0,
      multimodality: 0.6,
    },
  },
  {
    name: "Long Documents",
    slug: "long-documents",
    description: "Long-context document work.",
    isDefault: false,
    sortOrder: 90,
    weights: {
      long_context: 2.0,
      writing_quality: 1.3,
      research_reasoning: 1.2,
      instruction_following: 1.0,
      reliability: 0.8,
      speed: 0.5,
    },
  },
  {
    name: "Multimodal Work",
    slug: "multimodal-work",
    description: "Vision and multimodal tasks.",
    isDefault: false,
    sortOrder: 100,
    weights: {
      multimodality: 2.0,
      ui_frontend: 1.2,
      instruction_following: 1.0,
      general_capability: 1.0,
      coding: 0.7,
      reliability: 0.8,
    },
  },
];

const STARTER_TAGS: ReadonlyArray<{
  name: string;
  slug: string;
  category: "status" | "capability" | "access" | "usage" | "cost" | "preference";
}> = [
  { name: "Active", slug: "active", category: "status" },
  { name: "Needs Review", slug: "needs-review", category: "status" },
  { name: "Legacy", slug: "legacy", category: "status" },
  { name: "Reasoning", slug: "reasoning", category: "capability" },
  { name: "Vision", slug: "vision", category: "capability" },
  { name: "Coding", slug: "coding", category: "capability" },
  { name: "Long Context", slug: "long-context", category: "capability" },
  { name: "API", slug: "api", category: "access" },
  { name: "Subscription", slug: "subscription", category: "access" },
  { name: "Open Weights", slug: "open-weights", category: "access" },
  { name: "Daily Driver", slug: "daily-driver", category: "usage" },
  { name: "Bulk", slug: "bulk", category: "usage" },
  { name: "Budget", slug: "budget", category: "cost" },
  { name: "Premium", slug: "premium", category: "cost" },
  { name: "Favourite", slug: "favourite", category: "preference" },
  { name: "Pinned", slug: "pinned", category: "preference" },
];

const DEFAULT_VIEWS: ReadonlyArray<{
  name: string;
  slug: string;
  filters: Record<string, unknown>;
  sort: Record<string, unknown>;
  visibleColumns: string[];
  viewMode: "table" | "cards" | "compact";
  density: "comfortable" | "standard" | "compact";
  isDefault: boolean;
  sortOrder: number;
}> = [
  {
    name: "All models",
    slug: "all-models",
    filters: {},
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: true,
    sortOrder: 10,
  },
  {
    name: "Favourites",
    slug: "favourites",
    filters: { isFavourite: true },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 20,
  },
  {
    name: "Needs review",
    slug: "needs-review",
    filters: { needsReview: true },
    sort: { field: "updatedAt", dir: "desc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 30,
  },
  {
    name: "Active",
    slug: "active",
    filters: { workflowStatus: ["active", "preferred"] },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 40,
  },
  {
    name: "Testing & preview",
    slug: "testing-preview",
    filters: { workflowStatus: ["testing", "preview"] },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 50,
  },
  {
    name: "Legacy",
    slug: "legacy",
    filters: { workflowStatus: ["legacy", "deprecated", "archived"] },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 60,
  },
  {
    name: "Coding specialists",
    slug: "coding-specialists",
    filters: { codingSpecialist: true },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 70,
  },
  {
    name: "Vision capable",
    slug: "vision-capable",
    filters: { capabilities: ["vision"] },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 80,
  },
  {
    name: "Reasoning",
    slug: "reasoning",
    filters: { capabilities: ["reasoning"] },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 90,
  },
  {
    name: "Open weights",
    slug: "open-weights",
    filters: { accessType: ["open_weights"] },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 100,
  },
  {
    name: "API access",
    slug: "api-access",
    filters: { accessType: ["api"] },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 110,
  },
  {
    name: "Subscription access",
    slug: "subscription-access",
    filters: { accessType: ["subscription"] },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 120,
  },
  {
    name: "Missing personal rating",
    slug: "missing-personal-rating",
    filters: { missingPersonalRating: true },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "standard",
    isDefault: false,
    sortOrder: 130,
  },
  {
    name: "Missing cost",
    slug: "missing-cost",
    filters: { missingCost: true },
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "table",
    density: "compact",
    isDefault: false,
    sortOrder: 140,
  },
  {
    name: "Card gallery",
    slug: "card-gallery",
    filters: {},
    sort: { field: "name", dir: "asc" },
    visibleColumns: defaultColumns(),
    viewMode: "cards",
    density: "comfortable",
    isDefault: false,
    sortOrder: 150,
  },
];

function defaultColumns(): string[] {
  return [
    "name",
    "creator",
    "accessProvider",
    "plan",
    "workflowStatus",
    "context",
    "speed",
    "overallScore",
    "bestSkill",
    "costQuota",
    "tags",
  ];
}

// Map CSV access-provider labels onto existing DB rows where they are the same entity.
const PROVIDER_NAME_ALIASES: Record<string, string> = {
  OpenAI: "ChatGPT / Codex",
  OpenCode: "OpenCode",
  xAI: "Grok",
};

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function numStr(n: number | null | undefined): string | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return String(n);
}

function parseDateOrNull(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function mapLifecycle(status: string | null): {
  lifecycle: string;
  workflow: string | null;
} {
  if (!status) return { lifecycle: "unknown", workflow: null };
  const s = status.toLowerCase();
  if (s.includes("retir")) return { lifecycle: "retired", workflow: "archived" };
  if (s.includes("deprecat")) return { lifecycle: "deprecated", workflow: "deprecated" };
  if (s.includes("legacy")) return { lifecycle: "legacy", workflow: "legacy" };
  if (s.includes("preview")) return { lifecycle: "preview", workflow: "preview" };
  if (s.includes("beta")) return { lifecycle: "beta", workflow: "testing" };
  if (s.includes("ga") || s.includes("stable") || s.includes("current")) {
    return { lifecycle: s.includes("ga") ? "ga" : "current", workflow: "active" };
  }
  return { lifecycle: "unknown", workflow: "active" };
}

function inferAccessType(routeName: string): string {
  const r = routeName.toLowerCase();
  if (r.includes("open weight")) return "open_weights";
  if (r.includes("trial")) return "trial";
  if (r.includes("plus") || r.includes("go") || r.includes("pro") || r.includes("subscription")) {
    return "subscription";
  }
  if (r.includes("free")) return "free_tier";
  if (r.includes("local")) return "local";
  if (r.includes("api") || r.includes("nim") || r.includes("tokenhub")) return "api";
  return "api";
}

function inferAccessMethod(routeName: string, accessType: string): string {
  if (accessType === "open_weights" || accessType === "local") return "self_hosted";
  if (accessType === "subscription") return "oauth";
  if (routeName.toLowerCase().includes("cli")) return "cli";
  return "provider_api";
}

function inferAuth(accessType: string): string {
  if (accessType === "subscription") return "oauth_subscription";
  if (accessType === "open_weights" || accessType === "local") return "none";
  return "api_key";
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const envPath = resolve(REPO, ".env");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k === "DATABASE_URL" && v) return v;
  }
  throw new Error("DATABASE_URL not found");
}

type Sql = ReturnType<typeof postgres>;

async function apply(sql: Sql, parsed: ParsedMaster): Promise<Record<string, number | string>> {
  const counts: Record<string, number | string> = {};

  // Join check
  const dbModels = await sql<{ id: string; name: string; metadata: unknown }[]>`
    SELECT id, name, metadata FROM models
  `;
  const byName = new Map(dbModels.map((m) => [m.name, m]));
  const csvNames = new Set(parsed.models.map((m) => m.name));
  const onlyCsv = [...csvNames].filter((n) => !byName.has(n));
  const onlyDb = [...byName.keys()].filter((n) => !csvNames.has(n));
  if (onlyCsv.length || onlyDb.length || parsed.models.length !== 51) {
    throw new Error(
      `JOIN failed: csv=${parsed.models.length} onlyCsv=${JSON.stringify(onlyCsv)} onlyDb=${JSON.stringify(onlyDb)}`,
    );
  }
  counts.JOIN = "51/51";

  await sql.begin(async (tx) => {
    const owner =
      (
        await tx<{ id: string }[]>`
          SELECT id FROM users ORDER BY created_at ASC LIMIT 1
        `
      )[0] ?? null;
    if (!owner) throw new Error("No users row for import_jobs.user_id");

    const csvBuf = readFileSync(CSV_PATH);
    const sha = createHash("sha256").update(csvBuf).digest("hex");
    const importJobId = randomUUID();
    await tx`
      INSERT INTO import_jobs (
        id, user_id, filename, stored_path, sha256, parser_version, status,
        sheet_summary, preview_summary, commit_summary, committed_at
      ) VALUES (
        ${importJobId},
        ${owner.id},
        ${"LLM_MASTER_v1.csv"},
        ${"data/source/LLM_MASTER_v1.csv"},
        ${sha},
        ${"csv-migration/1.0.0"},
        ${"committed"},
        ${tx.json({ models: 51, providers: parsed.providers.length })},
        ${tx.json({ join: "51/51" })},
        ${tx.json({ phase: "csv-migration" })},
        now()
      )
    `;

    // ── Providers ──────────────────────────────────────────────
    const existingProviders = await tx<{ id: string; name: string; slug: string }[]>`
      SELECT id, name, slug FROM access_providers
    `;
    const providerIdByName = new Map(existingProviders.map((p) => [p.name, p.id]));

    function resolveProviderId(csvName: string): string | undefined {
      const alias = PROVIDER_NAME_ALIASES[csvName] ?? csvName;
      return providerIdByName.get(alias) ?? providerIdByName.get(csvName);
    }

    let providersCreated = 0;
    for (const p of parsed.providers) {
      const existingId = resolveProviderId(p.name);
      if (existingId) {
        providerIdByName.set(p.name, existingId);
        continue;
      }
      const id = randomUUID();
      const slugBase = slugify(p.name);
      let slug = slugBase;
      let n = 2;
      while ([...providerIdByName.values()].some(() => false)) {
        // slug uniqueness checked by DB; try insert
        break;
      }
      // ensure slug unique among known
      const usedSlugs = new Set(existingProviders.map((x) => x.slug));
      for (const [, ] of providerIdByName) {
        /* rebuilt below */
      }
      const allSlugs = await tx<{ slug: string }[]>`SELECT slug FROM access_providers`;
      const slugSet = new Set(allSlugs.map((s) => s.slug));
      while (slugSet.has(slug)) {
        slug = `${slugBase}-${n++}`;
      }
      await tx`
        INSERT INTO access_providers (id, name, slug, provider_type, status)
        VALUES (${id}, ${p.name}, ${slug}, ${"api_provider"}, ${"active"})
      `;
      providerIdByName.set(p.name, id);
      providerIdByName.set(p.name, id);
      providersCreated++;
    }
    // Refresh map including aliases pointing at same id
    for (const [csv, alias] of Object.entries(PROVIDER_NAME_ALIASES)) {
      const id = providerIdByName.get(alias);
      if (id) providerIdByName.set(csv, id);
    }
    counts.providers_created = providersCreated;
    counts.providers_total = (
      await tx<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM access_providers`
    )[0]!.c;

    // ── Plans from unique routes ───────────────────────────────
    type PlanKey = string; // providerId|slug
    const planIdByKey = new Map<string, string>();
    const existingPlans = await tx<
      { id: string; name: string; slug: string; access_provider_id: string }[]
    >`
      SELECT id, name, slug, access_provider_id FROM plans
    `;
    for (const pl of existingPlans) {
      planIdByKey.set(`${pl.access_provider_id}|${pl.slug}`, pl.id);
      planIdByKey.set(`${pl.access_provider_id}|name:${pl.name}`, pl.id);
    }

    // Build unique routes with commercial terms from package-level plan rows
    const packageTerms = new Map(
      parsed.plans.map((p) => [p.packageName, p] as const),
    );

    const uniqueRoutes = new Map<
      string,
      { providerName: string; routeName: string; packageName: string }
    >();
    for (const r of parsed.accessRoutes) {
      const k = `${r.providerName}::${r.routeName}`;
      if (!uniqueRoutes.has(k)) {
        uniqueRoutes.set(k, {
          providerName: r.providerName,
          routeName: r.routeName,
          packageName: r.packageName,
        });
      }
    }

    let plansCreated = 0;
    for (const route of uniqueRoutes.values()) {
      const providerId = providerIdByName.get(route.providerName);
      if (!providerId) throw new Error(`Missing provider ${route.providerName}`);
      const accessType = inferAccessType(route.routeName);
      const slug = slugify(route.routeName);
      const nameKey = `${providerId}|name:${route.routeName}`;
      const slugKey = `${providerId}|${slug}`;
      let planId = planIdByKey.get(slugKey) ?? planIdByKey.get(nameKey);

      // Also match known existing plan names when route equals package compound
      if (!planId) {
        const byName = existingPlans.find(
          (p) =>
            p.access_provider_id === providerId &&
            (p.name === route.routeName || p.name === route.packageName),
        );
        if (byName) planId = byName.id;
      }

      const terms = packageTerms.get(route.packageName);
      if (!planId) {
        planId = randomUUID();
        await tx`
          INSERT INTO plans (
            id, access_provider_id, name, slug, plan_type,
            regular_price, introductory_price, currency, billing_interval,
            api_access_type, authentication_type, status, access_type
          ) VALUES (
            ${planId},
            ${providerId},
            ${route.routeName},
            ${slug},
            ${accessType},
            ${numStr(terms?.subscriptionUsd ?? null)},
            ${numStr(terms?.introPriceUsd ?? null)},
            ${"USD"},
            ${accessType === "subscription" ? "month" : null},
            ${accessType === "api" ? "separate_billing" : accessType === "subscription" ? "included" : "unknown"},
            ${inferAuth(accessType)},
            ${"active"},
            ${accessType}
          )
        `;
        plansCreated++;
      } else {
        // Update commercial fields from CSV when present (attributes CSV wins)
        await tx`
          UPDATE plans SET
            regular_price = COALESCE(${numStr(terms?.subscriptionUsd ?? null)}, regular_price),
            introductory_price = COALESCE(${numStr(terms?.introPriceUsd ?? null)}, introductory_price),
            currency = COALESCE(currency, ${"USD"}),
            access_type = COALESCE(access_type, ${accessType}::access_type),
            updated_at = now()
          WHERE id = ${planId}
        `;
      }
      planIdByKey.set(slugKey, planId);
      planIdByKey.set(nameKey, planId);
      planIdByKey.set(`${route.providerName}::${route.routeName}`, planId);
    }
    counts.plans_created = plansCreated;
    counts.plans_total = (
      await tx<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM plans`
    )[0]!.c;

    // ── Plan quotas (once per plan from first matching quota row) ─
    const quotaWritten = new Set<string>();
    let quotasWritten = 0;
    for (const q of parsed.quotas) {
      const routes = parsed.accessRoutes.filter(
        (r) => r.modelName === q.modelName && r.packageName === q.packageName,
      );
      for (const r of routes) {
        const planId = planIdByKey.get(`${r.providerName}::${r.routeName}`);
        if (!planId || quotaWritten.has(planId)) continue;
        // Only write if any quota field present
        const has5h = q.fiveHourMin !== null || q.fiveHourMax !== null;
        const hasWeekly = q.weeklyRequests !== null;
        const hasMonthly = q.monthlyRequests !== null;
        if (!has5h && !hasWeekly && !hasMonthly) {
          quotaWritten.add(planId);
          continue;
        }
        if (has5h) {
          await tx`
            INSERT INTO plan_quotas (
              id, plan_id, name, amount, amount_min, amount_max, unit, period,
              remaining_amount, is_unlimited
            ) VALUES (
              ${randomUUID()},
              ${planId},
              ${"5-hour window"},
              ${q.fiveHourMin !== null && q.fiveHourMax !== null && q.fiveHourMin === q.fiveHourMax
                ? numStr(q.fiveHourMin)
                : null},
              ${numStr(q.fiveHourMin)},
              ${numStr(q.fiveHourMax)},
              ${"requests"},
              ${"five_hour_window"},
              ${null},
              ${false}
            )
          `;
          quotasWritten++;
        }
        if (hasWeekly) {
          await tx`
            INSERT INTO plan_quotas (
              id, plan_id, name, amount, unit, period, remaining_amount, is_unlimited
            ) VALUES (
              ${randomUUID()},
              ${planId},
              ${"Weekly requests"},
              ${numStr(q.weeklyRequests)},
              ${"requests"},
              ${"weekly"},
              ${null},
              ${false}
            )
          `;
          quotasWritten++;
        }
        if (hasMonthly) {
          await tx`
            INSERT INTO plan_quotas (
              id, plan_id, name, amount, unit, period, remaining_amount, is_unlimited
            ) VALUES (
              ${randomUUID()},
              ${planId},
              ${"Monthly requests"},
              ${numStr(q.monthlyRequests)},
              ${"requests"},
              ${"monthly"},
              ${null},
              ${false}
            )
          `;
          quotasWritten++;
        }
        quotaWritten.add(planId);
      }
    }
    counts.plan_quotas = (
      await tx<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM plan_quotas`
    )[0]!.c;
    counts.plan_quotas_inserted = quotasWritten;

    // ── Models + capabilities + provenance ─────────────────────
    let provenanceRows = 0;
    for (const m of parsed.models) {
      const row = byName.get(m.name)!;
      const prev = await tx<Record<string, unknown>[]>`
        SELECT family, generation, lifecycle, lifecycle_raw, release_date,
               knowledge_cutoff, model_type, coding_specialization, best_use, avoid_for,
               context_tokens, max_output_tokens, speed_rating, verified_tps,
               needs_recheck, needs_review, workflow_status, metadata
        FROM models WHERE id = ${row.id}
      `;
      const before = prev[0]!;
      const { lifecycle, workflow } = mapLifecycle(m.status);
      const needsReview = m.needsRecheck !== null && m.needsRecheck !== "No";
      const metaIn =
        before.metadata && typeof before.metadata === "object" && !Array.isArray(before.metadata)
          ? (before.metadata as Record<string, unknown>)
          : {};
      const metaOut = {
        ...metaIn,
        csvMigration: {
          importJobId,
          rankQcNote: m.rankQcNote,
          needsRecheckText: m.needsRecheck,
          globalCapabilityEligible: m.globalCapabilityEligible,
          balancedValueEligible: m.balancedValueEligible,
          composites: {
            capabilityScore: m.capabilityScore,
            capabilityRank: m.capabilityRank,
            balancedScore: m.balancedScore,
            balancedRank: m.balancedRank,
            valueScore: m.valueScore,
            valueRank: m.valueRank,
          },
        },
      };

      const fields: Array<[string, unknown, unknown]> = [
        ["family", before.family, m.family],
        ["generation", before.generation, m.generation],
        ["lifecycle_raw", before.lifecycle_raw, m.status],
        ["release_date", before.release_date, parseDateOrNull(m.releaseDate)],
        ["knowledge_cutoff", before.knowledge_cutoff, m.knowledgeCutoff],
        ["model_type", before.model_type, m.modelType],
        ["coding_specialization", before.coding_specialization, m.codingSpecialization],
        ["best_use", before.best_use, m.bestUse],
        ["avoid_for", before.avoid_for, m.avoidFor],
        ["context_tokens", before.context_tokens, m.contextTokens],
        ["max_output_tokens", before.max_output_tokens, m.maxOutputTokens],
        ["speed_rating", before.speed_rating, m.speedRating],
        ["verified_tps", before.verified_tps, m.verifiedTps],
        ["needs_review", before.needs_review, needsReview],
      ];

      await tx`
        UPDATE models SET
          family = ${m.family},
          generation = ${m.generation},
          lifecycle = ${lifecycle}::lifecycle_status,
          lifecycle_raw = ${m.status},
          release_date = ${parseDateOrNull(m.releaseDate)},
          knowledge_cutoff = ${m.knowledgeCutoff},
          model_type = ${m.modelType},
          coding_specialization = ${m.codingSpecialization},
          best_use = ${m.bestUse},
          avoid_for = ${m.avoidFor},
          context_tokens = ${m.contextTokens},
          max_output_tokens = ${m.maxOutputTokens},
          speed_rating = ${m.speedRating},
          verified_tps = ${numStr(m.verifiedTps)},
          needs_recheck = ${needsReview},
          needs_review = ${needsReview},
          workflow_status = COALESCE(${workflow}::workflow_status, workflow_status),
          metadata = ${tx.json(metaOut)},
          updated_at = now()
        WHERE id = ${row.id}
      `;

      for (const [col, oldVal, newVal] of fields) {
        const oldS = JSON.stringify(oldVal ?? null);
        const newS = JSON.stringify(newVal ?? null);
        if (oldS === newS) continue;
        await tx`
          INSERT INTO import_provenance (
            id, import_job_id, entity_type, entity_id, source_sheet, source_row,
            source_column, raw_value
          ) VALUES (
            ${randomUUID()},
            ${importJobId},
            ${"model"},
            ${row.id},
            ${"Master Models"},
            ${m.sheetRow},
            ${col},
            ${tx.json({ prior: oldVal ?? null, value: newVal ?? null })}
          )
        `;
        provenanceRows++;
      }

      // Capabilities upsert
      const details = {
        visionProse: m.vision.prose,
        reasoningProse: m.reasoning.prose,
        parallelAgentProse: m.parallelAgent.prose,
      };
      await tx`
        INSERT INTO model_capabilities (
          model_id, vision, reasoning, parallel_agents, details, updated_at
        ) VALUES (
          ${row.id},
          ${m.vision.value},
          ${m.reasoning.value},
          ${m.parallelAgent.value},
          ${tx.json(details)},
          now()
        )
        ON CONFLICT (model_id) DO UPDATE SET
          vision = EXCLUDED.vision,
          reasoning = EXCLUDED.reasoning,
          parallel_agents = EXCLUDED.parallel_agents,
          details = model_capabilities.details || EXCLUDED.details,
          updated_at = now()
      `;
    }
    counts.provenance_rows = provenanceRows;

    // ── Access routes + pricing + aliases ──────────────────────
    // Clear preferred flags before assigning CSV preferred routes
    await tx`UPDATE model_access SET is_preferred = false WHERE is_preferred = true`;

    const preferredSet = new Set<string>();
    let accessInserted = 0;
    let pricingInserted = 0;
    let aliasesInserted = 0;

    for (const route of parsed.accessRoutes) {
      const model = byName.get(route.modelName)!;
      const planId = planIdByKey.get(`${route.providerName}::${route.routeName}`);
      if (!planId) throw new Error(`No plan for ${route.providerName}::${route.routeName}`);
      const accessType = inferAccessType(route.routeName);
      const accessMethod = inferAccessMethod(route.routeName, accessType);
      const auth = inferAuth(accessType);
      const providerId = providerIdByName.get(route.providerName)!;
      const isPreferred = !preferredSet.has(model.id);
      if (isPreferred) preferredSet.add(model.id);

      const providerModelId = route.providerModelId || null;
      // Prefer exact (model, plan, provider_model_id), else reuse legacy null-id row on same plan.
      const existing = await tx<{ id: string; provider_model_id: string | null }[]>`
        SELECT id, provider_model_id FROM model_access
        WHERE model_id = ${model.id}
          AND plan_id = ${planId}
          AND (
            provider_model_id IS NOT DISTINCT FROM ${providerModelId}
            OR provider_model_id IS NULL
          )
        ORDER BY
          CASE WHEN provider_model_id IS NOT DISTINCT FROM ${providerModelId} THEN 0 ELSE 1 END,
          created_at ASC
        LIMIT 1
      `;

      let accessId: string;
      if (existing[0]) {
        accessId = existing[0].id;
        await tx`
          UPDATE model_access SET
            provider_model_id = COALESCE(${providerModelId}, provider_model_id),
            availability = ${"confirmed"}::availability_status,
            access_method = ${accessMethod}::access_method,
            authentication_type = ${auth}::authentication_type,
            is_preferred = ${isPreferred},
            status = ${"active"},
            archived_at = NULL,
            notes = ${JSON.stringify({
              avgRequestCost: route.avgRequestCost,
              providerRelativeUsageCost: route.providerRelativeUsageCost,
              packageName: route.packageName,
            })},
            updated_at = now()
          WHERE id = ${accessId}
        `;
        // Archive any other active duplicates on the same plan for this model
        await tx`
          UPDATE model_access SET
            status = ${"archived"},
            is_preferred = false,
            archived_at = COALESCE(archived_at, now()),
            updated_at = now()
          WHERE model_id = ${model.id}
            AND plan_id = ${planId}
            AND id <> ${accessId}
            AND status = ${"active"}
        `;
      } else {
        accessId = randomUUID();
        await tx`
          INSERT INTO model_access (
            id, model_id, plan_id, provider_model_id, availability,
            access_method, authentication_type, is_preferred, notes, status
          ) VALUES (
            ${accessId},
            ${model.id},
            ${planId},
            ${providerModelId},
            ${"confirmed"}::availability_status,
            ${accessMethod}::access_method,
            ${auth}::authentication_type,
            ${isPreferred},
            ${JSON.stringify({
              avgRequestCost: route.avgRequestCost,
              providerRelativeUsageCost: route.providerRelativeUsageCost,
              packageName: route.packageName,
            })},
            ${"active"}
          )
        `;
        accessInserted++;
      }

      // Pricing for this model×package (attach to this access)
      const price = parsed.pricing.find(
        (p) => p.modelName === route.modelName && p.packageName === route.packageName,
      );
      if (price) {
        const hasAny = [
          price.inputPerM,
          price.cachedReadPerM,
          price.cacheWritePerM,
          price.outputPerM,
          price.longContextInputPerM,
          price.longContextCachedPerM,
          price.longContextCacheWritePerM,
          price.longContextOutputPerM,
        ].some((x) => x !== null);
        if (hasAny) {
          const existingPrice = await tx<{ id: string }[]>`
            SELECT id FROM model_access_pricing WHERE model_access_id = ${accessId} LIMIT 1
          `;
          if (existingPrice[0]) {
            await tx`
              UPDATE model_access_pricing SET
                input_per_million = ${numStr(price.inputPerM)},
                cached_read_per_million = ${numStr(price.cachedReadPerM)},
                cache_write_per_million = ${numStr(price.cacheWritePerM)},
                output_per_million = ${numStr(price.outputPerM)},
                long_input_per_million = ${numStr(price.longContextInputPerM)},
                long_cached_per_million = ${numStr(price.longContextCachedPerM)},
                long_cache_write_per_million = ${numStr(price.longContextCacheWritePerM)},
                long_output_per_million = ${numStr(price.longContextOutputPerM)}
              WHERE id = ${existingPrice[0].id}
            `;
          } else {
            await tx`
              INSERT INTO model_access_pricing (
                id, model_access_id, currency,
                input_per_million, cached_read_per_million, cache_write_per_million, output_per_million,
                long_input_per_million, long_cached_per_million, long_cache_write_per_million, long_output_per_million
              ) VALUES (
                ${randomUUID()},
                ${accessId},
                ${"USD"},
                ${numStr(price.inputPerM)},
                ${numStr(price.cachedReadPerM)},
                ${numStr(price.cacheWritePerM)},
                ${numStr(price.outputPerM)},
                ${numStr(price.longContextInputPerM)},
                ${numStr(price.longContextCachedPerM)},
                ${numStr(price.longContextCacheWritePerM)},
                ${numStr(price.longContextOutputPerM)}
              )
            `;
            pricingInserted++;
          }
        }
      }

      // Alias for provider model id
      if (providerModelId) {
        const norm = providerModelId.trim().toLowerCase();
        const aliasExists = await tx<{ id: string }[]>`
          SELECT id FROM model_aliases WHERE normalized_alias = ${norm} LIMIT 1
        `;
        if (!aliasExists[0]) {
          await tx`
            INSERT INTO model_aliases (
              id, model_id, alias, normalized_alias, alias_type, access_provider_id
            ) VALUES (
              ${randomUUID()},
              ${model.id},
              ${providerModelId},
              ${norm},
              ${"provider_model_id"},
              ${providerId}
            )
          `;
          aliasesInserted++;
        }
      }
    }
    counts.access_inserted = accessInserted;
    counts.pricing_inserted = pricingInserted;
    counts.aliases_inserted = aliasesInserted;

    const withoutAccess = await tx<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM models m
      WHERE NOT EXISTS (
        SELECT 1 FROM model_access ma WHERE ma.model_id = m.id AND ma.status = 'active'
      )
    `;
    counts.MODELS_WITHOUT_ACCESS = withoutAccess[0]!.c;
    if (withoutAccess[0]!.c !== 0) {
      throw new Error(`MODELS_WITHOUT_ACCESS=${withoutAccess[0]!.c}`);
    }

    // ── Skills + ratings ───────────────────────────────────────
    const skillIdByKey = new Map<string, string>();
    for (const sk of SKILLS) {
      const id = randomUUID();
      await tx`
        INSERT INTO skills (id, name, slug, category, description, sort_order, is_default, status)
        VALUES (
          ${id}, ${sk.name}, ${sk.slug}, ${sk.category},
          ${sk.hasExternal ? "Seeded with CSV external scores where available" : "Seeded empty — owner rates personally"},
          ${sk.sortOrder}, ${true}, ${"active"}
        )
      `;
      skillIdByKey.set(sk.key, id);
    }
    counts.SKILLS = (
      await tx<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM skills`
    )[0]!.c;

    // Index skill scores from parser
    const scoreMap = new Map<string, { score: number | null; rank: number | null }>();
    for (const s of parsed.skillScores) {
      scoreMap.set(`${s.modelName}::${s.skillKey}`, {
        score: s.externalScore,
        rank: s.externalRank,
      });
    }

    // Confidence from first benchmark result per model
    const confByModel = new Map<string, number | null>();
    for (const b of parsed.benchmarkResults) {
      if (confByModel.has(b.modelName)) continue;
      // confidence already decimal-parsed? It's still string in type - parse
      const raw = b.confidence;
      if (!raw) {
        confByModel.set(b.modelName, null);
        continue;
      }
      const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
      const n = Number(normalized);
      confByModel.set(b.modelName, Number.isFinite(n) ? n : null);
    }

    let ratings = 0;
    for (const m of parsed.models) {
      const model = byName.get(m.name)!;
      const conf = confByModel.get(m.name) ?? null;
      for (const sk of SKILLS) {
        const hit = scoreMap.get(`${m.name}::${sk.key}`);
        const externalScore = sk.hasExternal ? (hit?.score ?? null) : null;
        const externalRank = sk.hasExternal ? (hit?.rank ?? null) : null;
        await tx`
          INSERT INTO model_skill_ratings (
            id, model_id, skill_id,
            personal_score, personal_confidence,
            external_score, external_rank, external_confidence,
            tested, hidden, pinned, source
          ) VALUES (
            ${randomUUID()},
            ${model.id},
            ${skillIdByKey.get(sk.key)!},
            ${null},
            ${null},
            ${numStr(externalScore)},
            ${externalRank},
            ${numStr(conf)},
            ${false},
            ${false},
            ${false},
            ${"csv-master-v1"}
          )
        `;
        ratings++;
      }
    }
    counts.ratings = ratings;

    const personalSet = await tx<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM model_skill_ratings WHERE personal_score IS NOT NULL
    `;
    counts.PERSONAL_SCORES_SET = personalSet[0]!.c;
    if (personalSet[0]!.c !== 0) {
      throw new Error(`PERSONAL_SCORES_SET=${personalSet[0]!.c}`);
    }

    // ── Ranking profiles ───────────────────────────────────────
    for (const profile of PROFILES) {
      const pid = randomUUID();
      await tx`
        INSERT INTO ranking_profiles (id, name, slug, description, is_default, sort_order)
        VALUES (
          ${pid}, ${profile.name}, ${profile.slug}, ${profile.description},
          ${profile.isDefault}, ${profile.sortOrder}
        )
      `;
      for (const [skillKey, weight] of Object.entries(profile.weights)) {
        const sid = skillIdByKey.get(skillKey);
        if (!sid) throw new Error(`Unknown skill key in profile weights: ${skillKey}`);
        await tx`
          INSERT INTO ranking_profile_skills (id, profile_id, skill_id, weight)
          VALUES (${randomUUID()}, ${pid}, ${sid}, ${String(weight)})
        `;
      }
    }
    counts.PROFILES = (
      await tx<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM ranking_profiles`
    )[0]!.c;

    // ── Benchmarks upsert by seed_key ──────────────────────────
    const benchIdByName = new Map<string, string>();
    const existingBench = await tx<{ id: string; name: string }[]>`
      SELECT id, name FROM benchmarks
    `;
    for (const b of existingBench) {
      // prefer first id per name
      if (!benchIdByName.has(b.name)) benchIdByName.set(b.name, b.id);
    }

    const BENCH_CATEGORY: Record<string, string> = {
      "SWE-Bench Pro": "coding",
      "Terminal-Bench 2.1": "coding",
      "Terminal-Bench 2.0": "coding",
      "Coding Agent Index": "coding",
      "SWE-Bench Verified": "coding",
      Toolathlon: "agents",
      "MCP Atlas": "agents",
      OSWorld: "agents",
      "GPQA Diamond": "knowledge",
      "Headline Long-Context %": "long_context",
    };

    let benchCreated = 0;
    let benchResultsUpserted = 0;
    for (const name of new Set(parsed.benchmarkResults.map((b) => b.benchmark))) {
      if (!benchIdByName.has(name)) {
        const id = randomUUID();
        await tx`
          INSERT INTO benchmarks (id, name, category, higher_is_better, status)
          VALUES (
            ${id},
            ${name},
            ${BENCH_CATEGORY[name] ?? "other"},
            ${true},
            ${"active"}
          )
        `;
        benchIdByName.set(name, id);
        benchCreated++;
      }
    }

    for (const br of parsed.benchmarkResults) {
      const model = byName.get(br.modelName)!;
      const benchId = benchIdByName.get(br.benchmark)!;
      const seedKey = `csv-master-v1:${br.benchmark}:${model.id}`;
      const conf = confByModel.get(br.modelName) ?? null;
      const existing = await tx<{ id: string }[]>`
        SELECT id FROM model_benchmark_results WHERE seed_key = ${seedKey} LIMIT 1
      `;
      if (existing[0]) {
        await tx`
          UPDATE model_benchmark_results SET
            score = ${numStr(br.score)},
            confidence = ${numStr(conf)},
            source_type = ${"workbook"}::source_type,
            notes = ${"csv-master-v1"}
          WHERE id = ${existing[0].id}
        `;
      } else {
        await tx`
          INSERT INTO model_benchmark_results (
            id, model_id, benchmark_id, score, confidence, source_type, notes, seed_key
          ) VALUES (
            ${randomUUID()},
            ${model.id},
            ${benchId},
            ${numStr(br.score)},
            ${numStr(conf)},
            ${"workbook"}::source_type,
            ${"csv-master-v1"},
            ${seedKey}
          )
        `;
        benchResultsUpserted++;
      }
    }
    counts.benchmarks_created = benchCreated;
    counts.benchmark_results_inserted = benchResultsUpserted;
    counts.benchmark_results_total = (
      await tx<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM model_benchmark_results`
    )[0]!.c;

    // ── Sources ────────────────────────────────────────────────
    let sourcesInserted = 0;
    for (const s of parsed.sources) {
      const model = byName.get(s.modelName)!;
      const verified = parseDateOrNull(s.verifiedOn);
      const entries: Array<[string, string | null, string]> = [
        ["roster", s.rosterSource, "official_docs"],
        ["pricing", s.pricingSource, "official_pricing"],
        ["benchmark", s.benchmarkSource, "benchmark_report"],
      ];
      for (const [title, url, sourceType] of entries) {
        if (!url) continue;
        await tx`
          INSERT INTO sources (
            id, entity_type, entity_id, source_type, url, title, verified_at, import_job_id
          ) VALUES (
            ${randomUUID()},
            ${"model"},
            ${model.id},
            ${sourceType}::source_type,
            ${url},
            ${title},
            ${verified ? new Date(verified).toISOString() : null},
            ${importJobId}
          )
        `;
        sourcesInserted++;
      }
    }
    counts.sources_inserted = sourcesInserted;

    // ── Tags ───────────────────────────────────────────────────
    const tagIdBySlug = new Map<string, string>();
    for (const t of STARTER_TAGS) {
      const id = randomUUID();
      await tx`
        INSERT INTO tags (id, name, slug, category)
        VALUES (${id}, ${t.name}, ${t.slug}, ${t.category}::tag_category)
      `;
      tagIdBySlug.set(t.slug, id);
    }
    counts.tags = tagIdBySlug.size;

    // Light auto-tag from capabilities / needs_review
    for (const m of parsed.models) {
      const model = byName.get(m.name)!;
      const tagSlugs: string[] = [];
      if (m.needsRecheck !== null && m.needsRecheck !== "No") tagSlugs.push("needs-review");
      if (m.vision.value === true) tagSlugs.push("vision");
      if (m.reasoning.value === true) tagSlugs.push("reasoning");
      if ((m.codingSpecialization ?? "").toLowerCase().includes("cod")) tagSlugs.push("coding");
      if ((m.contextTokens ?? 0) >= 500_000) tagSlugs.push("long-context");
      for (const slug of tagSlugs) {
        const tagId = tagIdBySlug.get(slug);
        if (!tagId) continue;
        await tx`
          INSERT INTO model_tags (model_id, tag_id)
          VALUES (${model.id}, ${tagId})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    // ── Saved views ────────────────────────────────────────────
    for (const v of DEFAULT_VIEWS) {
      await tx`
        INSERT INTO saved_views (
          id, name, slug, filters, sort, visible_columns, view_mode, density, is_default, sort_order
        ) VALUES (
          ${randomUUID()},
          ${v.name},
          ${v.slug},
          ${tx.json(v.filters)},
          ${tx.json(v.sort)},
          ${tx.json(v.visibleColumns)},
          ${v.viewMode}::view_mode,
          ${v.density}::view_density,
          ${v.isDefault},
          ${v.sortOrder}
        )
      `;
    }
    counts.saved_views = (
      await tx<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM saved_views`
    )[0]!.c;

    // Final audit event
    await tx`
      INSERT INTO audit_events (
        id, actor_user_id, entity_type, entity_id, action, after_data, metadata
      ) VALUES (
        ${randomUUID()},
        ${owner.id},
        ${"import_job"},
        ${importJobId},
        ${"import"}::audit_action,
        ${tx.json({ phase: "csv-migration", join: "51/51" })},
        ${tx.json({ skills: 16, profiles: 10, ratings })}
      )
    `;
  });

  return counts;
}

async function main() {
  const dry = process.env.DRY_RUN === "1";
  const url = resolveDatabaseUrl();
  // never print full URL with password
  const safeUrl = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
  console.log(`target=${safeUrl}`);
  console.log(`csv=${CSV_PATH}`);

  const buf = readFileSync(CSV_PATH);
  const parsed = parseMasterCsv(buf);
  console.log(
    JSON.stringify(
      {
        models: parsed.models.length,
        providers: parsed.providers.length,
        plans: parsed.plans.length,
        accessRoutes: parsed.accessRoutes.length,
        skillScores: parsed.skillScores.length,
        warnings: parsed.warnings.length,
      },
      null,
      2,
    ),
  );

  if (dry) {
    console.log("DRY_RUN=1 — exit before DB writes");
    process.exit(0);
  }

  const sql = postgres(url, { max: 1 });
  try {
    // Guard against half-applied previous run
    const [{ skills }] = await sql<{ skills: number }[]>`
      SELECT (SELECT COUNT(*)::int FROM skills) AS skills
    `;
    if (skills > 0) {
      throw new Error(
        `Refusing to run: skills already has ${skills} rows. Restore dump first or truncate seed tables.`,
      );
    }

    const counts = await apply(sql, parsed);
    console.log("COUNTS", JSON.stringify(counts, null, 2));

    // Post checks
    const checks = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM models) AS models,
        (SELECT COUNT(*)::int FROM skills) AS skills,
        (SELECT COUNT(*)::int FROM ranking_profiles) AS profiles,
        (SELECT COUNT(*)::int FROM model_skill_ratings) AS ratings,
        (SELECT COUNT(*)::int FROM model_skill_ratings WHERE personal_score IS NOT NULL) AS personal_set,
        (SELECT COUNT(*)::int FROM models m WHERE NOT EXISTS (
           SELECT 1 FROM model_access ma WHERE ma.model_id = m.id AND ma.status = 'active'
         )) AS without_access,
        (SELECT COUNT(*)::int FROM saved_views) AS views,
        (SELECT COUNT(*)::int FROM plan_quotas) AS plan_quotas,
        (SELECT COUNT(*)::int FROM access_providers) AS providers,
        (SELECT COUNT(*)::int FROM plans) AS plans
    `;
    console.log("POST", checks[0]);
    if (Number(checks[0].skills) !== 16) throw new Error("SKILLS != 16");
    if (Number(checks[0].profiles) !== 10) throw new Error("PROFILES != 10");
    if (Number(checks[0].ratings) !== 816) throw new Error("ratings != 816");
    if (Number(checks[0].personal_set) !== 0) throw new Error("personal_set != 0");
    if (Number(checks[0].without_access) !== 0) throw new Error("without_access != 0");
    if (Number(checks[0].views) !== 15) throw new Error("views != 15");
    console.log("APPLY_OK");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("APPLY_FAIL", err);
  process.exit(1);
});
