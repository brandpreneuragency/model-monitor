# Implementation Issue List

- Date: 2026-07-18
- Source: Phase 0 architecture review (`docs/16`, `docs/17`, ADR-0001…0007).
- Sizing: each issue is one coding-agent run (~0.5–2 days) with explicit acceptance evidence.
- Rules for every issue: TypeScript strict, Zod at boundaries, audit event on every mutation, null ≠ 0/false, archive > delete, update PLAN.md + PROGRESS.md with evidence.

Dependency notation: `← MM-00x` = blocked by.

---

## Phase 1 — Foundation (target: clean DB migrates, seeds, owner signs into shell)

### MM-001 Workspace scaffold
- Scope: pnpm workspace root, `apps/web` + 6 packages, tsconfig.base (strict), ESLint + Prettier, `.env.example` (per docs/09 list), `.gitignore`, root scripts per docs/11.
- Evidence: `pnpm install` clean; `pnpm lint` / `pnpm typecheck` pass on skeleton.

### MM-002 Contract validation harness
- Scope: copy `contracts/` + `data/` into repo; script that applies `contracts/postgresql-schema.sql` to a Docker PostgreSQL 16 and reports; `openapi.yaml` lint (redocly or equivalent); `ajv` compile of `hermes-catalog.schema.json`; run in CI.
- Evidence: DDL applies with zero errors on PG16; validators pass in CI log.

### MM-003 `packages/schemas`
- Scope: Zod mirrors of all 12 enums, domain types, API DTOs per OpenAPI v1.1, form schemas, shared `normalize()` (ADR-0007), tri-state parser (docs/16 §6.2), null-semantics helpers.
- Evidence: unit tests incl. "Not confirmed" → null, blank → null, null score round-trip; package builds.

### MM-004 `packages/database` schema + migrations
- Scope: Drizzle tables mirroring contract v1.1 exactly (25 tables, 12 enums, constraints, indexes); `db:generate` + `db:migrate`; parity check Drizzle-schema ↔ contract DDL (MM-002 harness).
- Evidence: fresh DB migrates; constraint tests (canonical_id unique, alias per-model unique incl. NULL provider_model_id dedup on model_access, scores unique, import idempotency 409 path, benchmark NULLS NOT DISTINCT dedup).

### MM-005 Dev infrastructure
- Scope: `compose.yaml` (postgres:16), env loading, `db:seed`/`db:studio` scripts, `scripts/verify` runner.
- Evidence: one-command dev DB up; `verify` runs lint+typecheck+tests.

### MM-006 Seed runner
- Scope: `packages/database/src/seed`; derives 14 developers + 4 access providers + 4 plans; loads all `data/*.seed.json` per mapping rules docs/16 §6.1–§6.9 (lifecycle map, tri-state, alias dedupe, methodology `factor-model/session-6`, subscription→plan resolution, mock usage, router snapshot, 127 benchmark definitions + 276 results); sets `catalog_revision = 1`.
- Evidence: runner completes idempotently (second run = no-op); unit tests for each mapping table with real seed values.

### MM-007 Seed integrity suite (integration)
- Scope: assertions from docs/16 §11 at DB level.
- Evidence: 51 models / 4 subscriptions / 19 access / 276 results / 127 definitions / USD 61 regular monthly total; zero duplicate canonicals; DeepSeek V4 Pro has 2 access paths on 1 canonical record; all pass in CI.

### MM-008 Authentication
- Scope: Auth.js v5 Google provider, JWT sessions (no adapter tables), allow-list in `signIn` + re-check in `session` callback, owner upsert on first allow-listed sign-in, `/sign-in` + `/denied` pages, secure cookie config.
- Evidence: E2E — allow-listed signs in, non-allow-listed denied post-callback, anonymous redirected, sign-out invalidates.

### MM-009 Application shell + platform libs
- Scope: sidebar/topbar shell (docs/06), light/dark tokens in `packages/ui`, global search box (placeholder), request-id middleware, structured logger (no secret fields), error→shared-shape mapper, rate-limit helper, Europe/Istanbul date helper, `/api/v1/health`.
- Evidence: health returns app+db ok; logs show requestId, operation, duration; dark/light render.

### MM-010 CI pipeline
- Scope: GitHub Actions: install, lint, typecheck, unit, integration (postgres service), build.
- Evidence: green run on scaffold; required checks documented.

---

## Phase 2 — Model registry (target: docs/13 Models section passes)

### MM-011 Model list API ← MM-004
- Scope: `GET /models` service + handler: all v1.1 filters, sort (incl. `-scores.capability` via latest-score join), cursor pagination, `accessible` per ADR-0001.
- Evidence: integration tests per filter; p95 spot-check at seed scale.

### MM-012 Model library UI ← MM-011
- Scope: TanStack Table: sticky model column, column chooser, density toggle, multi-select, bulk archive/tag/recheck actions, URL-addressable query state, skeleton/empty/error states, status text+icon (not color-only). Tags use `models.metadata.tags` as `{slug, label}` objects; slug is lowercase hyphenated and label is display-only.
- Evidence: Playwright — filter/sort/paginate round-trip via URL; axe pass on page.

### MM-013 Model detail ← MM-011
- Scope: all 7 tabs read paths (overview, capabilities, scores, benchmarks, access, sources, history) incl. methodology version, rank/eligible context, "unknown" rendering for nulls.
- Evidence: null capability renders "Unknown"; blank score never renders 0 (unit + E2E).

### MM-014 Model create/edit ← MM-013
- Scope: RHF + shared Zod; slug auto-derivation; canonical-ID change warning; validation→error shape; Duplicate action opens a prefilled create form and does not persist until Save.
- Evidence: create/edit and duplicate-form E2E; duplicate action creates no row before Save; audit events written (create + update).

### MM-015 Archive/restore ← MM-014
- Scope: DELETE + restore endpoints, archived filter, archive blocked when active import/merge references the model.
- Evidence: E2E archive → hidden → restore; audit events; default views exclude archived.

### MM-016 Aliases management ← MM-014
- Scope: alias CRUD on detail page, `normalize()` enforcement, duplicate-surface rejection with clear message.
- Evidence: MiMo case-variant scenario unit + integration tests.

### MM-017 Capabilities editor ← MM-014
- Scope: tri-state controls for all DB flags + details JSON editing.
- Evidence: unknown stays null through save round-trip.

### MM-018 Scores ← MM-013
- Scope: `GET/POST /models/{id}/scores`; override requires reason; history view; UI bars/cards with methodology version.
- Evidence: override without reason → 400; history append-only (update attempt impossible); Hermes-visible shape matches MM-050 expectations.

### MM-019 Benchmark evidence UI ← MM-013
- Scope: `/benchmarks` list + per-model evidence tab; filters by model/category; comparable group + source URL + verified date visible.
- Evidence: 276 rows filterable; comparable group never mixed in one comparison view (UI grouping test).

### MM-020 Sources ← MM-014
- Scope: polymorphic source attach/list on model, subscription, benchmark result.
- Evidence: source with URL + retrieval/verification dates persists; audit event.

### MM-021 Model history ← MM-015
- Scope: `GET /models/{id}/history` + History tab (audit feed).
- Evidence: events ordered newest-first; before/after diff visible; requestId shown.

### MM-022 Merge ← MM-016, MM-018
- Scope: `POST /models/merge` per docs/03 merge behavior: row locks, transfer aliases/access/benchmarks/scores/sources, unique-conflict resolution rules, archive source with `merged_into_model_id`, one transaction, idempotency key, one summary audit event; UI merge dialog.
- Evidence: injected-failure rollback test (zero partial transfers); replay with same key = same result; transfer counts in audit metadata; E2E merge of a seeded duplicate pair.

### MM-023 Phase 2 E2E pack
- Scope: search by name/alias/ID; full CRUD cycle; archive/restore; null rendering; merge.
- Evidence: Playwright suite green; PROGRESS updated.

---

## Phase 3 — Subscriptions and access (target: docs/13 Subscriptions section passes)

### MM-024 Providers and plans ← MM-014
- Scope: access provider + plan CRUD (pages per route map), plan-level api_access_type/authentication_type.
- Evidence: CRUD + audit integration tests.

### MM-025 Subscriptions CRUD ← MM-024
- Scope: billing fields, auth/API access type, usage check instructions, importance; list + detail pages.
- Evidence: seed truths hold — ChatGPT Plus $20 no API credits; OpenCode Go $10/$5 intro; SuperGrok $30 no general API; Command Code $1 CLI-only (integration assertions).

### MM-026 Limit rules ← MM-025
- Scope: structured limit-rule editor + raw notes retention.
- Evidence: rolling-window + monthly + credit rules persist; raw_text preserved.

### MM-027 Model access CRUD ← MM-024
- Scope: create from model or subscription detail; uniqueness violation → friendly 409; availability/access-method/cliOnly/webOnly fields.
- Evidence: duplicate (model, plan, null endpoint) rejected; Command Code rows CLI-only (seed assertion).

### MM-028 Access matrix ← MM-027
- Scope: desktop grid (frozen model column, one column per active subscription, icon+text cells per CD-19 vocabulary map, cell → side panel edit); mobile model-first drill-down; developer/plan/availability filters.
- Evidence: matrix cells match 19 seed relationships exactly (E2E); keyboard navigation; axe pass.

### MM-029 Usage ← MM-025
- Scope: manual usage entry → `usage_snapshots`; mock fixtures visibly labeled (UI badge); latest-per-subscription read.
- Evidence: mock label visible in list/detail/dashboard; manual entry audited; source enum round-trip.

### MM-030 Cost and renewal calculations ← MM-025
- Scope: dashboard service: regular monthly = Σ plan.regular_price of active subs; current = Σ actual_price; renewals within 30 days; unknown renewal dates shown as unknown (never guessed).
- Evidence: USD 61 regular total unit + integration; unknown-date rendering test.

### MM-031 Phase 3 E2E pack
- Scope: subscription edit < 60s flow; add access from both directions; matrix checks.
- Evidence: Playwright green; PROGRESS updated.

---

## Phase 4 — Import and export (target: docs/13 Import + Export sections pass)

### MM-032 Upload intake ← MM-009
- Scope: `POST /imports/preview` intake: MIME + signature check, size limit, zip-bomb/row caps, SHA-256, stored outside web root with randomized name, `import_jobs` row, ADR-0005 duplicate → 409.
- Evidence: non-workbook rejected; oversized rejected; duplicate upload → 409 with existing job ref.

### MM-033 Workbook parser ← MM-032 (`packages/excel-import`)
- Scope: read-only parse of the 15 known sheets; raw value capture + sheet/row/column provenance; Excel serial-date conversion; empty-string→null; **no macro execution, no formula evaluation**.
- Evidence: fixture test — 15 sheets discovered, 31 populated master rows, formulas returned as cached values only, macros untouched.

### MM-034 Normalization + matching ← MM-033
- Scope: docs/16 §6 rules; 5-step match order (canonical ID → normalized alias → name+developer → family+generation+developer → manual review); developer/provider separation; endpoint-ID → `provider_model_id` matching.
- Evidence: unit tests with workbook-derived cases incl. MiMo/DeepSeek/Nemotron duplicate examples from docs/07.

### MM-035 Conflict detection ← MM-034
- Scope: all 10 conflict types from docs/07; conflict records with current/imported/provenance.
- Evidence: each conflict type has a triggering fixture test.

### MM-036 Preview UI ← MM-035
- Scope: read-only preview (summary cards per docs/06), status polling via `GET /imports/{id}`.
- Evidence: preview shows 31 master rows + 51-model roster; zero writes before commit (DB assertion).

### MM-037 Resolution UI ← MM-036
- Scope: `POST /imports/{id}/resolve`; 6 resolution choices; apply-to-similar; blocked commit until required resolutions.
- Evidence: resolution round-trip E2E; invalid resolution → 400.

### MM-038 Transactional commit ← MM-037
- Scope: single transaction, idempotency-key replay, provenance writes, audit events, rollback on failure, committed flag only after success.
- Evidence: injected-failure rollback leaves zero partial rows; replay returns original summary; reimport creates no 52nd model.

### MM-039 Import log ← MM-038
- Scope: per-job detail page + downloadable log.
- Evidence: log contains sheet/row decisions + counts; download works.

### MM-040 Exports ← MM-011
- Scope: JSON/CSV/XLSX model exports + Hermes JSON export; selected Model Library records are supported in CSV, JSON, and XLSX; Hermes export remains the full catalog; formula-injection neutralization (`= + - @` prefix guard) for CSV/XLSX.
- Evidence: selection is respected in CSV, JSON, and XLSX; injection fixture neutralized in CSV and XLSX; Hermes export validates against JSON Schema.

### MM-041 Fixture E2E ← MM-038
- Scope: full workbook flow: upload → preview → resolve → commit → verify.
- Evidence: docs/13 Import section checkboxes all evidenced; PROGRESS updated.

---

## Phase 5 — Dashboard and administration

### MM-042 Dashboard ← MM-030
- Scope: KPI row + 6 panels per docs/06; recently updated; multiple-access-paths panel.
- Evidence: KPI values match seeded truths; panel queries tested.

### MM-043 Data-quality warnings ← MM-042
- Scope: warning engine per docs/06 examples (unknown renewal, unconfirmed access, missing canonical ID, missing methodology, stale verification, alias collision, unresolved import conflict).
- Evidence: each warning condition has a triggering test.

### MM-044 Audit log ← MM-021
- Scope: `/audit` page with entity/action/date filters, cursor pagination.
- Evidence: filter integration tests; 100k-row pagination spot-check (fixture from MM-058).

### MM-045 Saved views ← MM-012
- Scope: `/saved-views` CRUD + apply in model table.
- Evidence: save → reload → reapply → delete E2E.

### MM-046 Verification settings ← MM-043
- Scope: interval settings page (app_settings) wired into warnings; settings-change audit.
- Evidence: changing interval re-computes warnings; audit event written.

### MM-047 API token UI ← MM-009
- Scope: settings page: create (show once), list (prefix only), revoke, expiry; token_create/token_revoke audit.
- Evidence: full token never re-displayed; revoke immediate; audit coverage.

### MM-048 Backup scripts ← MM-005
- Scope: `backup:create` (pg_dump custom + encrypt + checksum + prune) and `backup:restore` per docs/11; runbook.
- Evidence: script runs against dev DB; checksum verifies; dry-run restore documented.

---

## Phase 6 — Hermes (target: docs/13 Hermes section passes)

### MM-049 Token authentication ← MM-047
- Scope: bearer middleware: `mm_<prefix>_<secret>` parse, hash lookup, expiry/revocation checks, `catalog:read` scope, per-token rate limit, last_used_at update, auth-header redaction in logs.
- Evidence: 401 invalid/expired/revoked; 403 wrong scope; 429 over limit; token never logged.

### MM-050 Catalog serializer ← MM-030
- Scope: `packages/hermes-contract`: ADR-0001 inclusion rules, ADR-0003 identifiers, `tool_use→tools` + field whitelist, latest score per type with methodologyVersion, latest usage per subscription (mock labeled), revision/ETag/Last-Modified/304 (ADR-0002), `Cache-Control: private, max-age=60`.
- Evidence: ajv validation of live response; archived/unavailable/removed excluded; merged models absent; 304 on matching If-None-Match.

### MM-051 Contract test pack ← MM-050
- Scope: automated schema validation + semantic assertions in CI.
- Evidence: each canonical model exactly once; active access paths present; secrets absent (field denylist test); mock usage labeled.

### MM-052 API documentation ← MM-050
- Scope: serve OpenAPI v1.1 + rendered docs route (owner-only).
- Evidence: docs page renders; contract matches implementation (route inventory test).

### MM-053 Example Hermes client ← MM-050
- Scope: `packages/api-client`: typed catalog client with ETag caching + example script.
- Evidence: example retrieves catalog against dev instance; 304 path exercised.

### MM-054 Catalog performance ← MM-050
- Scope: p95 < 500 ms at seed scale measurement + query tuning.
- Evidence: measurement recorded in PROGRESS (environment noted).

---

## Phase 7 — Hardening and release (target: all docs/13 sections pass)

### MM-055 Security review
- Scope: CSP, headers, rate-limit coverage, upload guards re-check, secret scan of repo + logs, audit-payload secret denylist test, mandatory recent Google reauthentication before API-token creation and permanent deletion.
- Evidence: checklist per docs/09; findings fixed or ADR'd.

### MM-056 Accessibility review
- Scope: axe on all primary pages, keyboard-only pass, focus traps, contrast both themes.
- Evidence: zero critical violations; report stored.

### MM-057 Responsive review
- Scope: mobile monitoring flows per docs/02/06.
- Evidence: screenshots + checklist.

### MM-058 Scale fixtures + performance
- Scope: generator for 5k models / 50k results / 20 subs / 500 access / 100k audit; run docs/10 perf targets.
- Evidence: p95 numbers recorded in PROGRESS.

### MM-059 Production compose + proxy
- Scope: `compose.production.yaml` (web, postgres, backup), non-root containers, no public DB port, reverse-proxy + TLS + future-domain runbook.
- Evidence: clean-boot on fresh VM or equivalent; checklist.

### MM-060 Backup/restore proof
- Scope: encrypted backup → restore into empty DB → migrate → seed-integrity + Hermes contract checks.
- Evidence: restore log + passing suites recorded.

### MM-061 Acceptance + release
- Scope: execute docs/13 end-to-end incl. §9 additions (if approved), tag release.
- Evidence: every checkbox linked to artifact in PROGRESS; release tag.

---

## Sequencing notes

1. MM-001…MM-010 are strictly ordered; everything after Phase 1 branches safely.
2. MM-022 (merge) and Phase 4 (import) are the two transactional-critical paths — do not start before their test plans exist in the issue branch.
3. Phase 6 depends only on Phase 1 + MM-025/MM-030 data truths; it may run parallel to Phases 4–5 if capacity allows.
4. Product decisions in docs/16 §8 are resolved. The 13 approved additional acceptance tests in docs/16 §9 are mandatory and must be evidenced in Phase 7.
