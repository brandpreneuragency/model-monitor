# Model Monitor Progress

## Current phase

`Phase 1 — Foundation: ACTIVE (2026-07-18). Database, seed, health, and available browser evidence pass; real Google OAuth callback coverage remains.`

## Current objective

Add test Google OAuth credentials and validate allow-listed, denied-callback, and sign-out flows for MM-008.

## Decisions made during implementation

| Date | Decision | Reason | ADR |
|---|---|---|---|
| 2026-07-18 | Hermes catalog includes confirmed + unconfirmed access paths; unavailable/removed/archived excluded; `available` flag rule defined | Invariant 10 conflicted with the Hermes schema shape | ADR-0001 |
| 2026-07-18 | `app_settings` catalog_revision counter → ETag `"mm-catalog-<rev>"`, Last-Modified, 304 | Schema requires `catalogRevision`; no DB source existed | ADR-0002 |
| 2026-07-18 | Hermes identifiers opaque: canonical_id; subscriptionId = external_seed_id else UUID | Example payload conflicted with UUID PKs; nullable seed IDs | ADR-0003 |
| 2026-07-18 | Hermes MVP surface = `GET /hermes/catalog` only | docs/05 listed 4 endpoints; only catalog has a payload contract | ADR-0004 |
| 2026-07-18 | `import_jobs.idempotency_key` NOT NULL DEFAULT '' | Nullable key silently allowed duplicate imports | ADR-0005 |
| 2026-07-18 | `model_scores` UNIQUE(model_id, methodology_id, score_type, calculated_at) | docs/03 declared it; contract omitted it | ADR-0006 |
| 2026-07-18 | Alias uniqueness scoped to (model_id, normalized_alias); shared normalize() | Global unique made the authoritative seed unloadable (MiMo case variants) | ADR-0007 |
| 2026-07-18 | Tooling baseline: pnpm workspaces, Node 22, Next.js 15, PostgreSQL 16, Auth.js JWT sessions (no adapter tables), Vitest + Playwright | Standard for the locked stack; single-user auth needs no session tables | — |
| 2026-07-18 | Added `router_snapshots` and `saved_views` tables to the contract | Approved requirements (product decision 12, FR-03) had no storage | — (docs/17 CD-04, CD-24) |
| 2026-07-18 | Phase 1 foundation uses pnpm, Next.js 15, PostgreSQL 16 Compose, Auth.js JWT sessions, Drizzle typed boundary, and the v1.1 SQL contract as its versioned initial migration | Preserves the locked stack and source-of-truth contract | — |

## Completed work

| Date | Item | Commit/PR | Evidence |
|---|---|---|---|
| 2026-07-18 | Full package review (16 docs, 3 contracts, 9 data files, templates) | — | docs/16_ARCHITECTURE_REVIEW.md |
| 2026-07-18 | Contract discrepancy analysis (25 items) and resolutions | — | docs/17_CONTRACT_DISCREPANCIES.md |
| 2026-07-18 | SQL contract v1.1 (7 fixes/additions) | — | contracts/postgresql-schema.sql header |
| 2026-07-18 | OpenAPI v1.1 (12 → 29 paths, 23 schemas, unified envelope, error responses) | — | contracts/openapi.yaml |
| 2026-07-18 | Workspace structure + module dependency map | — | docs/16 §4–§5 |
| 2026-07-18 | Implementation issue breakdown (61 issues, 7 phases) | — | docs/18_IMPLEMENTATION_ISSUES.md |
| 2026-07-18 | docs/03, docs/05 annotated with ADR pointers | — | file diffs |
| 2026-07-18 | Owner decisions recorded and acceptance criteria promoted | — | docs/16 §8–§9; docs/13 |
| 2026-07-18 | Phase 1 workspace, app shell, Auth.js allow-list, health endpoint, request logging, schemas, Compose, CI, and seed runner | — | `package.json`, `apps/web`, `packages/*`, `compose.yaml`, `.github/workflows/ci.yml` |
| 2026-07-18 | Isolated local PostgreSQL configuration and full typed Drizzle boundary | — | Compose/database defaults use port 5433; `packages/database/src/schema.ts` declares 25 tables and 12 enums |
| 2026-07-18 | PostgreSQL 16 database verification and Playwright foundation suite | — | Docker Desktop Compose service; migration, idempotent seed, integration, protected-route, denied-state, and health evidence |

## Verification evidence

| Date | Command or test | Result | Notes/artifact |
|---|---|---|---|
| 2026-07-18 | Seed file counts (PowerShell JSON parse) | pass | 51/4/19/276/31 rows; 25 aliases; provider-limits raw (9 summaries + 51 model rows) |
| 2026-07-18 | Referential integrity: access seed → canonical IDs | pass | 0 unresolved of 19 |
| 2026-07-18 | Benchmark seed → canonical model names | pass | 276/276 matched; 127 distinct definitions (name, comparable_group) |
| 2026-07-18 | Alias normalization analysis | pass (2 documented same-model collisions, 0 cross-model) | ADR-0007 evidence |
| 2026-07-18 | Slug derivation collision check (51 canonical IDs) | pass | 0 collisions |
| 2026-07-18 | Regular monthly total recompute | pass | 20+10+30+1 = USD 61 |
| 2026-07-18 | `python -c yaml.safe_load contracts/openapi.yaml` | pass | OpenAPI 3.1.0, 29 paths, 23 schemas |
| 2026-07-18 | `python -c json.load contracts/hermes-catalog.schema.json` | pass | draft 2020-12 |
| 2026-07-18 | SQL structural check (custom script) | pass | 25 tables, 12 enums, all FK targets exist, balanced |
| 2026-07-18 | `pnpm install` | pass | pnpm lockfile generated; 8 workspace projects installed |
| 2026-07-18 | `pnpm contract:validate` | pass | OpenAPI 3.1, Hermes JSON Schema, and 25-table SQL contract validated |
| 2026-07-18 | `pnpm lint` | pass | all workspace packages |
| 2026-07-18 | `pnpm typecheck` | pass | strict TypeScript across all workspace packages |
| 2026-07-18 | `pnpm test:unit` | pass | 3 tests: null semantics, alias normalization, seed fixture counts/cost |
| 2026-07-18 | `pnpm build` | pass | Next.js production build completed |
| 2026-07-18 | `docker compose up -d` | pass | Docker Desktop PostgreSQL 16 healthy at `127.0.0.1:5433` |
| 2026-07-18 | `pnpm db:migrate` | pass | clean v1.1 contract migration applied; rerun reports `0000_contract_v1_1 already applied` |
| 2026-07-18 | `pnpm db:seed` twice | pass | both runs report 51 models, 4 subscriptions, 19 access records, 276 benchmark results; second run adds no duplicates |
| 2026-07-18 | `pnpm test:integration` | pass | 2 assertions: 51/4/19/276/127/USD 61 and DeepSeek V4 Pro has two access paths |
| 2026-07-18 | `pnpm test:e2e` | pass | 3 Playwright tests: anonymous redirect, denied state, health reports app + database |
| 2026-07-18 | Drizzle schema inventory | pass | 25 `pgTable` declarations and 12 `pgEnum` declarations |

## Seed integrity

| Assertion | Expected | Actual | Status |
|---|---:|---:|---|
| Canonical models | 51 | 51 | database integration verified |
| Subscriptions | 4 | 4 | database integration verified |
| Model access records | 19 | 19 | database integration verified |
| Benchmark evidence rows | 276 | 276 | database integration verified |
| Regular monthly cost USD | 61 | 61 | database integration verified |

## Open issues

| Priority | Issue | Owner | Blocked phase | Next action |
|---|---|---|---|---|
| Medium | Real Google OAuth callback and sign-out flows lack E2E evidence | Product owner | Phase 1 | Supply test Google OAuth client credentials and an allow-listed test account |
| Low | docs/14 open items (domain, renewal dates, XLSX styling, …) | Product owner | Phase 7 | Keep open; revisit at release |

## Acceptance criteria completed

Reference `docs/13_ACCEPTANCE_CRITERIA.md`.

- [ ] Authentication
- [ ] Seed and dashboard (database seed assertions pass; dashboard UI is Phase 5)
- [ ] Models
- [ ] Subscriptions and access
- [ ] Benchmarks and sources (276 database evidence rows and 127 definitions seeded; UI is Phase 2)
- [ ] Import
- [ ] Export
- [ ] Hermes
- [ ] Security and operations (private localhost database binding and healthy database endpoint pass; backup remains Phase 5/7)
- [ ] Quality (lint, typecheck, unit, integration, E2E, and production build pass; accessibility remains Phase 7)
