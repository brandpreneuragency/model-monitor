# Architecture Review — Phase 0 Output

- Date: 2026-07-18
- Author: Lead architect
- Status: Complete. Contracts patched (v1.1), ADRs accepted, issue list executable.

Companion documents:

- `docs/17_CONTRACT_DISCREPANCIES.md` — full discrepancy list and resolutions
- `docs/18_IMPLEMENTATION_ISSUES.md` — sized implementation issues
- `docs/adr/ADR-0001..0007` — decisions

---

## 1. Scope verification

The package was checked against the locked MVP scope (`README.md`, `docs/00_PRODUCT_DECISIONS.md`, AGENTS.md §1).

| Forbidden in MVP | Present in package? | Evidence |
|---|---|---|
| Automatic routing / routing policy editor | No | `router_snapshots` stores historical recommendations only (product decision 12). No routing tables, endpoints, or UI exist. |
| Live provider usage integrations | No | Usage is manual/mock/estimated/provider-reported **snapshots** entered by hand; no provider API clients, no credential storage. |
| Provider credential storage | No | No credential columns anywhere in the schema. `docs/09` secrets list contains only app-level secrets. |
| Multi-user permissions | No | `users.role` exists but MVP has a single owner; service tokens carry the single `catalog:read` scope. |
| Notifications / alerts | No | Not in schema, API, or UI specs. |

**Conclusion:** the package is inside locked scope. This review adds no scope; two schema additions (`router_snapshots`, `saved_views`) close gaps between existing approved requirements (FR-03, product decision 12) and the contract — they implement approved features, not new ones.

## 2. Entity boundary verification

All 13 required entity boundaries exist in `contracts/postgresql-schema.sql` (v1.1) and are correctly separated.

| # | Entity | Table(s) | Boundary check |
|---|---|---|---|
| 1 | Canonical model | `models` | One row per endpoint identity; `canonical_id` UNIQUE; `merged_into_model_id` for merges. No cost columns. ✓ |
| 2 | Developer | `developers` | Separate from access providers; `models.developer_id` FK. ✓ |
| 3 | Access provider | `access_providers` | No link to models except through plans → model_access. ✓ |
| 4 | Plan | `plans` | Belongs to exactly one access provider; list price here (`regular_price`, `introductory_price`), not on models. ✓ |
| 5 | Personal subscription | `subscriptions` | Owner's purchase of a plan; `actual_price`, billing, and manual-usage fields here. Archive via `status='archived'` + `archived_at` (CD-23 documented). ✓ |
| 6 | Model access | `model_access` (+`model_access_pricing`) | Only model↔plan connection; `UNIQUE NULLS NOT DISTINCT (model_id, plan_id, provider_model_id)` prevents duplicate paths; endpoint token pricing lives here (invariant 5). ✓ |
| 7 | Benchmark | `benchmarks` + `model_benchmark_results` | Definition (with `comparable_group`) separated from raw results; results carry setting/harness/source/verified_at. ✓ |
| 8 | Score | `score_methodologies` + `model_scores` | Versioned methodology; append-only history with ADR-0006 uniqueness; `score_value` nullable (blank ≠ 0); override requires reason. ✓ |
| 9 | Source | `sources` | Polymorphic (`entity_type`,`entity_id`), carries URL/publisher/retrieved/verified dates. ✓ |
| 10 | Import | `import_jobs` + `import_conflicts` + `import_provenance` | File metadata + SHA-256, conflict records, per-row provenance. ADR-0005 fixed the idempotency hole. ✓ |
| 11 | Audit | `audit_events` | Immutable; actor (user or token), action enum covers all FR-12 events; before/after JSONB; secrets excluded by policy (`docs/09`). ✓ |
| 12 | API token | `api_tokens` | Hash-only storage, prefix UNIQUE, scopes array, expiry + revocation. ✓ |
| 13 | Usage snapshot | `usage_snapshots` | `source` enum (mock/manual/estimated/provider_reported) + `is_mock` label; nullable model link for subscription-level snapshots. ✓ |

Supporting entities also verified: `users`, `model_aliases` (ADR-0007), `model_capabilities` (1:1, tri-state nulls), `subscription_limit_rules`, `app_settings`, and the two review additions (`router_snapshots`, `saved_views`).

**No boundary violations found.** The four critical separations (developer vs access provider; plan vs subscription; cost on plan/subscription/access-pricing, never on model; one canonical model regardless of provider count) all hold in the contract and in the seed data.

## 3. Contract consistency

Full analysis in `docs/17_CONTRACT_DISCREPANCIES.md` (24 items). Summary:

- **7 genuine conflicts/choices** resolved by ADR-0001…ADR-0007.
- **2 missing tables** added to the SQL contract: `router_snapshots` (product decision 12 + docs/07 step 7), `saved_views` (FR-03).
- **3 constraint bugs** fixed in the SQL contract: model_scores uniqueness, import idempotency nullability, benchmark definition NULLS NOT DISTINCT, plus alias uniqueness rescoped (ADR-0007).
- **OpenAPI completed** from 12 to 29 paths: history, restores, model-access PATCH/DELETE, benchmarks, benchmark-results, scores, import resolve/cancel, exports (JSON/CSV/XLSX/Hermes), saved views, unified collection envelope `{data,page,meta}`, full `/models` filter set, Hermes 401/403/429.
- **Hermes JSON Schema required no changes.** Serializer constraints (field whitelist, availability rule) documented in ADR-0001/0003 and Phase 6 issues.
- Validation evidence: OpenAPI parses (3.1.0, 29 paths, 23 schemas); SQL structurally checked (25 tables, all FK targets exist, 12 enums, balanced); JSON Schema parses.

## 4. Workspace structure (final)

Monorepo per AGENTS.md §4 and `docs/11_DEPLOYMENT.md`. Package manager: **pnpm workspaces**. Baseline: Node 22 LTS, Next.js 15 (App Router, React Server Components), React 19, TypeScript strict, PostgreSQL 16, Drizzle ORM + drizzle-kit, Zod, Tailwind CSS + shadcn/ui, TanStack Table, React Hook Form, Auth.js v5, Vitest (unit/integration), Playwright (E2E), ESLint + Prettier, GitHub Actions CI.

```text
model-monitor/
├── apps/
│   └── web/                            # Next.js application
│       ├── app/
│       │   ├── (auth)/                 # /sign-in, /denied — public
│       │   ├── (app)/                  # authenticated shell (sidebar, topbar)
│       │   │   ├── dashboard/
│       │   │   ├── models/             # list, new, [modelId]/{edit,access/new,history}
│       │   │   ├── subscriptions/      # list, new, [subscriptionId]/{edit,access/new}
│       │   │   ├── providers/[providerId]/
│       │   │   ├── plans/[planId]/
│       │   │   ├── access-matrix/
│       │   │   ├── benchmarks/[benchmarkId]/
│       │   │   ├── imports/            # new, [importId]
│       │   │   ├── audit/
│       │   │   └── settings/           # general, scores, verification, api-tokens, backups, danger
│       │   └── api/v1/                 # route handlers — thin; validate + call services
│       │       ├── health/
│       │       ├── models/  subscriptions/  model-access/  access-matrix/
│       │       ├── benchmarks/  benchmark-results/  imports/  audit-events/
│       │       ├── exports/  saved-views/
│       │       └── hermes/catalog/
│       ├── components/                 # app-specific client components (tables, forms, dialogs)
│       ├── lib/                        # auth.ts (Auth.js config), logger, request-id, rate-limit, http errors
│       ├── services/                   # application services: one module per aggregate;
│       │                               # orchestrates repositories + audit + catalog-revision bump
│       └── tests/                      # e2e (Playwright) + route-level integration
├── packages/
│   ├── database/
│   │   ├── src/schema/                 # Drizzle tables, one file per aggregate (mirrors contract)
│   │   ├── src/repositories/           # typed data access per aggregate; transactions injected
│   │   ├── src/seed/                   # seed runner + mapping tables (see §6)
│   │   ├── src/client.ts               # connection, transaction helper
│   │   └── drizzle/                    # generated migrations (committed)
│   ├── schemas/                        # Zod: enums, domain types, API DTOs, form schemas, normalize()
│   │                                   # ZERO runtime dependencies beyond zod — imported by everything
│   ├── excel-import/                   # workbook parse → normalize → match → conflicts → ImportPlan (pure)
│   ├── hermes-contract/                # JSON Schema copy, Zod mirror, catalog serializer, revision/ETag
│   ├── api-client/                     # typed /api/v1 client + example Hermes consumer
│   └── ui/                             # shadcn/ui primitives, tokens, light/dark themes
├── contracts/                          # copied verbatim from this package (versioned source of truth)
├── data/                               # seed fixtures copied from this package
├── docs/                               # package docs + adr/
├── docker/                             # postgres + backup container assets
├── scripts/                            # backup-create, backup-restore, import-fixture, verify
├── compose.yaml                        # dev: postgres
├── compose.production.yaml             # prod: web + postgres + backup
├── .env.example
├── package.json                        # pnpm workspace root + scripts (docs/11 list)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── AGENTS.md  PLAN.md  PROGRESS.md
```

## 5. Module dependency map

Allowed dependency direction (enforced by ESLint `import/no-restricted-paths`):

```text
packages/schemas            ← everything (depends on nothing except zod)
packages/database           → schemas
packages/excel-import       → schemas                      (pure; never imports database)
packages/hermes-contract    → schemas
packages/api-client         → hermes-contract, schemas
packages/ui                 → (nothing)
apps/web                    → database, schemas, excel-import, hermes-contract, ui
scripts/                    → database, excel-import, schemas
api-client is consumed by Hermes/external tests, NOT by apps/web runtime
```

Boundary rules:

1. **Route handlers are thin**: parse/validate with Zod → call a service → map result to the shared error shape. No SQL in `app/`.
2. **Services own business rules and transactions.** Every mutation service calls the audit helper and, when it touches catalog-visible data, the catalog-revision bump (ADR-0002) inside the same transaction.
3. **Repositories own SQL** (Drizzle). Services compose repositories; repositories never call services.
4. **`excel-import` is a pure pipeline**: `parse → normalize → match → detectConflicts → buildPlan`. It emits a typed `ImportPlan`; the web service layer executes the plan transactionally. This keeps the entire import engine unit-testable without a database.
5. **`hermes-contract` owns the whitelist**: serializer emits exactly the JSON-Schema fields (`additionalProperties: false` everywhere), maps `tool_use → tools`, applies ADR-0001 inclusion rules and ADR-0003 identifier policy.
6. **Auth.js uses JWT sessions** (no adapter tables): the allow-list is enforced in the `signIn` callback and re-checked in the `session` callback; the first allow-listed sign-in upserts the `users` row with role `owner`.

## 6. Seed and import mapping rules (normative)

These rules close the gap between raw seed/workbook shapes and the contract. They are inputs to issues MM-006/MM-034 and are covered by unit tests.

### 6.1 Lifecycle mapping (18 raw labels → 9-value enum)

Raw label preserved in `models.lifecycle_raw` in all cases.

| Raw label | Enum |
|---|---|
| Current, Current flagship, Current balanced, Current efficient, Current coding specialist, Current / open weights + API, Current / Premier, Current; Vibe public preview | `current` |
| Current / GA, Stable / GA | `ga` |
| Current / beta, Public beta | `beta` |
| Preview | `preview` |
| Legacy selectable, Current predecessor, Preview predecessor, Stable / previous generation | `legacy` |
| Deprecated; retires 2026-07-31 | `deprecated` |
| (anything unrecognized) | `unknown` |

### 6.2 Tri-state capability parsing

Applied to `visionSupport`, `reasoningSupport`, `toolSupport`, parallel-agent fields:

- blank / null → `null`
- matches /^(not confirmed|unknown|tbc|unconfirmed)/i → `null` (unknown, **never** false)
- matches /^(no\b|unsupported)/i → `false`
- any other non-empty value ("Yes", "Yes: low–ultra", "Adaptive thinking", …) → `true`, original text stored in `model_capabilities.details`

Seed evidence requiring this rule: 34 null, 4 "Not confirmed in Go docs", 1 "Not confirmed" vision values.

### 6.3 Aliases

- `normalize()` per ADR-0007; dedupe per (model, normalized) preferring `provider_id`/`source_model_id` types (2 collisions in seed: the two MiMo pairs).
- 25 seed rows → 23 alias rows after dedupe; zero cross-model collisions (verified).

### 6.4 Subscriptions → plans → access providers

- 4 access providers and 4 plans derive from `subscriptions.seed.json` (`accessProvider`, `plan` fields): ChatGPT / Codex, OpenCode, Grok, Command Code.
- `regularPrice`/`introductoryPrice` → `plans.regular_price`/`introductory_price`; `currentPrice` → `subscriptions.actual_price`; `external_seed_id` = seed `id`.
- Seed `provider` field is the billing party label (informational only; not the developer, not the access provider).
- Regular monthly fixed total: 20+10+30+1 = **USD 61** (acceptance anchor).

### 6.5 Model access

- 19 rows resolve `subscriptionId → plan` (1:1 in seed set); `provider_model_id` populated from `source_model_id` aliases where the provider matches (e.g. `opencode-go/deepseek-v4-pro`); verified zero unresolved canonical references.

### 6.6 Scores and ranks

- Seed contains no methodology version (CD-21): the seed runner creates methodology `{name: "factor-model", version: "session-6", factors: <Session 6 weights>}` and attaches all seed scores/ranks to it with one shared `calculated_at`.
- 28 of 51 models have null capability scores — nulls inserted as null, never 0.

### 6.7 Benchmarks

- 276 evidence rows → 127 benchmark definitions keyed by `(name, comparable_group)` with `version = null`; "Version / Setting" maps to **result-level `setting`** (CD analysis in docs/17 CD-12 note).
- Source-type mapping: "Official model/launch evidence" & "Official model card / launch evidence" → `official_model_card`; "Official / primary evidence" → `official_docs`; "Inherited authoritative Session 2 workbook" → `workbook`.
- 2 rows with null `Score` stay null (`score_text` carries text). All 276 rows match a canonical model name exactly (verified).

### 6.8 Mock usage

- `source='mock'`, `is_mock=true`, `unit='percent'`, `used_percent` from seed; `remainingPercent`/`status` have no columns → preserved in `raw_payload` (CD-20).

### 6.9 Router snapshot

- 10 task rows → `router_snapshots` with full raw payload; never read by any live code path (product decision 12).

## 7. Risks register

| ID | Risk | Impact | Mitigation (issue) |
|---|---|---|---|
| R1 | Workbook inconsistency (51 roster vs 31 master rows, mixed provider semantics, blank Model IDs) | Wrong canonical identity | Normalized seeds are authoritative; import match order + manual review queue (MM-034, MM-036) |
| R2 | Lifecycle mis-mapping (18 raw labels) | Filter corruption | Versioned mapping table §6.1 + unit tests per label (MM-006) |
| R3 | Tri-state mis-parse ("Not confirmed" → false) | False capability claims | §6.2 rules + tests with real seed values (MM-006, MM-034) |
| R4 | Seed lacks methodology version | Hermes contract violation | §6.6 methodology seed (MM-006) |
| R5 | Score pivot sort/filter performance at scale | p95 breach | Latest-score lateral join + `model_scores_lookup_idx`; scale test (MM-011, MM-058) |
| R6 | Auth edge cases (first-user race, de-allowed email keeps session) | Unauthorized access | JWT session callback re-checks allow-list; owner bootstrap tested (MM-008) |
| R7 | Import idempotency race (double upload/commit) | Duplicate data | ADR-0005 constraint + 409 mapping + commit key replay (MM-032, MM-038) |
| R8 | Catalog revision misses a mutation | Stale Hermes cache | Single mutation/audit boundary; revision-bump integration tests (MM-050) |
| R9 | XLSM parser evaluates formulas/macros or zip-bombs | Security incident | Read-only parse (no `cellFormula` eval), archive size/row limits, fixture tests (MM-033) |
| R10 | Scale-test fixtures missing (5k/50k/100k rows) | Perf regressions ship | Generator script (MM-058) |
| R11 | `provider-limits.raw.json` is raw worksheet shape | Misimported pricing | Treated as evidence only; Phase 4 mapping rules (MM-034) |
| R12 | Timezone (`Europe/Istanbul`) display drift | Misleading dates | Single date-format helper; SSR in UTC, display in TZ (MM-009) |

## 8. Resolved product decisions

| ID | Item | Why it matters | Proposal |
|---|---|---|---|
| A1 | FR-03 "duplicate" model action semantics | Server-side copy vs prefilled create form | **Decided:** prefilled create form; no new canonical record until saved. |
| A2 | "Export selected records" formats | FR-03 unspecified | **Decided:** selected records support CSV, JSON, and XLSX. Hermes export remains the full catalog. |
| A3 | Tags storage for "bulk tag" (FR-03) | No tags column exists (CD-24) | **Decided:** `models.metadata.tags` is an array of `{slug, label}` objects. Slugs are lowercase hyphenated values; labels are preserved for display and deduplicated by slug. |
| A4 | Missing acceptance criteria (§9) | Untestable requirements risk scope creep | **Decided:** all 13 criteria in §9 are mandatory release criteria. |
| A5 | `provider` field in subscription seed | Semantics undocumented | Treat as billing-party label only (§6.4). |
| A6 | XLSX export styling fidelity | Already open in docs/14 | Keep open; normalized data export only in MVP. |
| A7 | `importance` 1–5 semantics | Unused in UI specs | Keep column; dashboard sort hint only. |
| A8 | Reauthentication for token creation/permanent delete | `docs/09` previously said "recommended" | **Decided:** required for both sensitive actions. |

## 9. Approved Additional Acceptance Tests

The owner approved all 13 additions below. They are mandatory release criteria and are now copied into `docs/13_ACCEPTANCE_CRITERIA.md`.

| # | Requirement (source) | Proposed criterion |
|---|---|---|
| 1 | Saved table views (FR-03, Phase 5) | A view can be saved, reapplied after reload, and deleted. |
| 2 | Bulk actions (FR-03) | Multi-select archive/tag/recheck applies to all selected rows with one audit event each. |
| 3 | Duplicate action (FR-03) | Duplicating a model opens a create form and does not persist until saved. |
| 4 | Global search grouping (docs/02) | Results group by models/aliases/subscriptions/providers/plans/benchmarks. |
| 5 | Export selected records (FR-03) | Export respects current selection. |
| 6 | Danger-zone permanent deletion (docs/06, FR-09) | Deletion requires typed name + double confirm + reference summary, and writes an audit event. |
| 7 | Verification-interval warnings (FR-08) | A record older than the configured interval appears in data-quality warnings. |
| 8 | Rate limiting (docs/09) | Token/import/export endpoints return 429 after the configured threshold. |
| 9 | Timezone rendering (docs/00) | Dates render in Europe/Istanbul; stored values remain UTC. |
| 10 | Idempotency replay (docs/05) | Replayed merge/import-commit with the same key returns the original result without side effects. |
| 11 | Performance targets (docs/10) | p95 < 500 ms for list/detail/catalog at the docs/10 scale fixture. |
| 12 | Token one-time display (docs/05) | Full token is shown exactly once; later reads show prefix only. |
| 13 | Owner bootstrap (FR-01) | First allow-listed sign-in becomes owner; non-allow-listed first sign-in is denied. |

## 10. ADR index

| ADR | Decision |
|---|---|
| ADR-0001 | Hermes inclusion rule: confirmed + unconfirmed paths included; unavailable/removed/archived excluded; `available` flag rule |
| ADR-0002 | `app_settings` catalog_revision counter → ETag `"mm-catalog-<rev>"`, Last-Modified, 304 |
| ADR-0003 | Hermes identifiers opaque: canonical_id; external_seed_id else UUID for subscriptions |
| ADR-0004 | Hermes MVP surface = `/hermes/catalog` only |
| ADR-0005 | `import_jobs.idempotency_key` NOT NULL DEFAULT '' (duplicate upload → 409) |
| ADR-0006 | `model_scores` UNIQUE(model_id, methodology_id, score_type, calculated_at) |
| ADR-0007 | Alias normalize rule + UNIQUE(model_id, normalized_alias); cross-model claims = conflicts |

## 11. Phase 0 verification evidence

Executed against the package data files (database-level verification is Phase 1, issue MM-007):

| Check | Expected | Actual | Result |
|---|---|---|---|
| canonical-models.seed.json rows | 51 | 51 | pass |
| Distinct canonical IDs | 51 | 51 | pass |
| subscriptions.seed.json rows | 4 | 4 | pass |
| model-access.seed.json rows | 19 | 19 | pass |
| Access rows referencing unknown canonical ID | 0 | 0 | pass |
| benchmarks.seed.json rows | 276 | 276 | pass |
| Benchmark rows matching a canonical model name | 276/276 | 276/276 | pass |
| Distinct benchmark definitions (name, comparable_group) | — | 127 | recorded |
| Regular monthly total (20+10+30+1) | USD 61 | USD 61 | pass |
| master-models.raw.json populated rows | 31 | 31 | pass |
| Alias normalized collisions | documented | 2 (MiMo pairs, same-model) | ADR-0007 |
| Cross-model normalized alias collisions | 0 | 0 | pass |
| Slug derivation collisions (canonical_id → slug) | 0 | 0 | pass |
| Models with null capability score | — | 28 | null-handling anchor |
| Workbook inventory | 15 sheets | 15 listed | pass |
| OpenAPI YAML parse | valid | 3.1.0, 29 paths, 23 schemas | pass |
| Hermes JSON Schema parse | valid | draft 2020-12 | pass |
| SQL structural check (FK targets, enums, balance) | clean | 25 tables, 12 enums, no missing refs | pass |
