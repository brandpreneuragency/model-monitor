# progress — model-monitor

## Deferred drops

Tables retained during redesign build; drop in `deploy-finalize`:

- `api_tokens` (and related token rows) — API-token admin surface removed in legacy-removal
- `model_scores` — scoring UI/API rewritten later; table stays until deploy
- `usage_snapshots` — mock usage / dashboard KPIs removed from product surface
- `subscriptions` / `subscription_limit_rules` — product concept retired; APIs/UI removed in legacy-removal (additive-only until deploy)

(none of the above are dropped by migrations until deploy-finalize)

## Deferred issues

(none yet)

## Phase log

### preflight (2026-07-27T21:52Z) — RESULT=PASS

#### Prior failure cause (fixed)
- Attempts 1–2 failed check 2: root public curl returned **307** while an older
  assertion required **200**.
- Live behavior: `GET /` → 307 `Location: /login?callbackUrl=%2F`; `GET /login` → 200.
- Current plan accepts root 200 **or** 307 when Location points to `/login`
  (optional `callbackUrl`). Re-run under that rule → PASS.
- No live-app auth change and no PLAN_DIR edit performed.

#### Built
- Branch `redesign/model-directory` created from clean `master`.
- `data/source/LLM_MASTER_v1.csv` copied from plan (53119 bytes,
  sha256 `b37b96531f332ac3940868609d659a17798b8ca30123be720cf96a888641e4e1`,
  byte-identical to plan source).
- `data/source/.gitattributes` with `*.csv -text` (preserve CSV bytes / no CRLF rewrite).
- DB dump (gain, retained on rollback):
  `/home/admin/01_atlas/05_backups/model-monitor-preredesign-20260727T215229Z.sql.gz`
  (118688 bytes, gzip ok). `scripts/backup-create.sh` not used: needs `DATABASE_URL`
  and writes custom-format `*.dump` with a different name; docker `pg_dump|gzip`
  fallback matched the required path.

#### Verified
- 7 containers up; `model-monitor-web` + `model-monitor-postgres` healthy.
- Public: root 307 → `/login?callbackUrl=%2F`; `/login` 200.
- git was clean on `master` before branch creation.
- Gate shell: `PATH="$HOME/.local/bin:$PATH"` → pnpm **11.11.0**, lint 0 err / 2 warn,
  typecheck clean.
- Telegram send works (start msg 251, test msg 253).
- Row counts: models 51, developers 14, access_providers 4, plans 77,
  subscriptions 12, model_access 19, model_benchmark_results 276, audit_events 992.
- `/home` free ~228 GB.
- CSV content: UTF-8; non-ASCII only U+2013/U+2014; header line 4 `Provider` / 76 cols;
  51 non-empty Model rows; `GPT-5.6 Sol` Reasoning Support `Yes: low–ultra` (U+2013).

#### Deferred / baseline notes
- Did **not** run `pnpm test:unit` (forbidden here). Known master baseline:
  2 failed / 11 passed — `import-pipeline.test.ts` and `openapi-contract.test.ts`
  reference deleted `docs/implementation-package/` (commit `16eafdd`).
  `legacy-removal` deletes the affected files; no gate needs unit until then.
- Lint warnings only (unused imports in `apps/web/e2e/subscriptions.spec.ts`).

#### Unsure / cosmetic
- git reports `master...origin/main [gone]`; trunk remains `master` as required.
  Cosmetic upstream mismatch; not blocking.
- `backup-create.sh` path/format differs from plan’s `preredesign-*.sql.gz` naming;
  fallback used deliberately.

#### Rollback (preflight mutations only)
```
git -C "$REPO_DIR" checkout master && git -C "$REPO_DIR" branch -D redesign/model-directory
# remove data/source/ and this progress.md if reverting the whole preflight tree state
# dump stays
```

### agents-rulebook (2026-07-27T21:55Z) — RESULT=PASS

#### Built
- Rewrote `AGENTS.md` for the model-directory redesign so cold-start agents no longer
  receive deleted-product instructions.

#### Verified
- Read full prior `AGENTS.md` and full `$PLAN_DIR/SPEC.md` before edit.
- Removed/replaced all listed false claims (Hermes catalog API, audit/benchmarks as
  headline areas, mock usage, excel-import/hermes-contract packages,
  `docs/implementation-package/` hierarchy, xlsm fixture, audit-on-every-mutation,
  subscription-cost wording).
- Preserved binding data/engineering invariants (null/false/0, one canonical model,
  creator ≠ access provider, provenance + transactional idempotent import, archive
  over delete, no secrets in artifacts, TS strict / Zod / Drizzle).
- Added redesign binding constraints section: four primary nav destinations only;
  colours only in `packages/ui/src/tokens.css`; personal vs external scores never
  merged; incomplete records allowed (only `name` required); additive-only migrations
  with drops deferred to `## Deferred drops`.
- Ensured `progress.md` has `## Deferred drops`, `## Deferred issues`, `## Phase log`.
- Evidence: `$RUN_DIR/agents-rulebook.txt`.

#### Deferred
- None for this phase.

#### Unsure
- None.

#### Rollback (this phase only)
```
git -C "$REPO_DIR" checkout -- AGENTS.md progress.md
```

### agents-rulebook (2026-07-27T21:58Z) attempt 2 — RESULT=PASS

#### Prior failure cause (fixed first)
- Attempt 1 wrote a correct redesign rulebook but left the literal substring
  `hermes-contract` in §4 ("do not restore … packages/hermes-contract").
- Phase gate is `! grep -q "hermes-contract" "$REPO_DIR/AGENTS.md"` — any mention
  of the deleted package path fails closed, including "do not restore" notes.
- Fixed by rewording §4 to forbid restoring deleted pre-redesign packages without
  spelling the banned path string. No other partial residue; kept attempt-1 rewrite.

#### Built
- Patched `AGENTS.md` §4 package note (gate-safe wording).
- Re-verified full required/surviving rules and redesign binding constraints still present.
- Refreshed `$RUN_DIR/agents-rulebook.txt` evidence.

#### Verified
- Gate predicates: AGENTS.md non-empty, progress.md non-empty, no `LLM_MASTER_v2.xlsm`,
  no `hermes-contract`, `RESULT=PASS` in evidence file.
- Surviving invariants still verbatim in spirit/text as required.
- Headings present: `## Deferred drops`, `## Deferred issues`, `## Phase log`.

#### Deferred
- None for this phase.

#### Unsure
- None.

#### Rollback (this phase only)
```
git -C "$REPO_DIR" checkout -- AGENTS.md progress.md
```

### legacy-removal (2026-07-27T22:04Z) — RESULT=PASS

#### Built
- Deleted redesign-removed packages, app routes, API routes, and components (Hermes catalog,
  excel-import, access-matrix, benchmarks, audit, imports UI, dashboard, subscriptions,
  api-tokens, audit-events APIs, admin components).
- Deleted import-pipeline + broken openapi/catalog/import tests; hermes ADRs 0001-0004 + ADR-003.
- Also removed orphaned `api/v1/imports` (only depended on deleted excel-import/import-pipeline)
  and e2e `subscriptions.spec.ts`.
- Cleaned `apps/web/package.json` (hermes-contract, excel-import, exceljs); `pnpm install` OK.
- Home redirects to `/models`; shell nav trimmed; settings stubbed; export XLSX without exceljs.
- admin-routes tests stripped of token/audit cases; surviving saved-views + verification kept.
- Deferred drops listed: api_tokens, model_scores, usage_snapshots (plus subscriptions tables).

#### Verified
- `pnpm install` exit 0
- `pnpm lint` exit 0
- `pnpm typecheck` exit 0 (after clearing stale `.next` route types)
- `pnpm test:unit` exit 0 — web 8 files / 52 tests; monorepo all packages green
- Gate path absences: hermes-contract, excel-import, access-matrix, benchmarks, audit,
  api/v1/hermes, api/v1/api-tokens
- Evidence: `$RUN_DIR/legacy-removal.txt` with `RESULT=PASS`

#### Deferred
- DB table drops (api_tokens, model_scores, usage_snapshots, subscriptions*) to deploy-finalize
- Full settings UI to settings-responsive phase
- Primary nav Overview/Rankings/Providers to shell + later page phases
- CSV import replacement to csv-importer / import-export phases

#### Unsure
- None blocking. export-pipeline now uses a minimal OOXML writer instead of exceljs;
  import-export phase may revisit XLSX fidelity.

#### Rollback (this phase only)
```
git -C "$REPO_DIR" checkout -- . && PATH="$HOME/.local/bin:$PATH" pnpm install
```

### design-tokens (2026-07-27T22:20Z) — RESULT=PASS

#### Built
- `packages/ui/src/tokens.css` — full dark-only token set from SPEC §7.1 (surfaces, borders,
  text, accent, seven semantic colours with paired `*-bg`, score bands, chart series,
  `--shadow-drawer`, radii 4/6/8/12, spacing 2–48, type scale, row heights 52/44/36).
- `docs/design/DESIGN.md` — token usage map, SPEC §7.2 component rules, density definitions,
  forbidden patterns (raw hex, gradients, glows, non-drawer shadows, layout animation).
- Static reference screens (token-only CSS, link to `../../packages/ui/src/tokens.css`):
  - `docs/design/overview.html`
  - `docs/design/models.html` (table + open drawer)
  - `docs/design/rankings.html` (personal scores untested; separate external column)
  - `docs/design/providers.html`

#### Vision
- `VISION=USED` — opened all four plan screenshots via vision tool and built from them
  plus the written anatomy. Seed content uses real directory models/providers/quotas.

#### Verified
- Raw hex/rgb/hsl grep on the four HTML files: empty.
- All hex in `tokens.css` confined to the single `:root` block.
- No gradients / glows / extra shadows in mockups.
- Machine gate precheck: all six files non-empty, `bg-app` present, evidence RESULT=PASS.

#### Conflicts / notes
- Screenshots show filled personal scores; product rule D13 + phase anatomy require
  untested personal cells in the rankings reference — HTML follows D13 (HTML is the
  gateable contract). Logged for later UI phases.

#### Rollback
```
rm -rf "$REPO_DIR/docs/design"
rm -f "$REPO_DIR/packages/ui/src/tokens.css"
# revert this progress.md entry if abandoning the phase
```


## ui-primitives (2026-07-27T22:28Z) — RESULT=PASS

### Built
- Full design-system component set in `packages/ui/src/` (one file each, exported from `index.ts`):
  Button, IconButton, Badge, StatusChip, Tag, FilterChip, Card, Panel, DataTable,
  Drawer, Dialog, Popover, Select, Combobox, Input, Textarea, Toggle, Slider,
  ProgressBar, ScoreCell, Sparkline, EmptyState, Skeleton, Tabs, SegmentedControl.
- Shared `types.ts` / `styles.ts`; styles use only `var(--…)` tokens from `tokens.css`.
- `ScoreCell`: null/undefined → untested `—` (empty band); `0` renders `"0"` (weak) — never conflated.
- `ProgressBar`: `unlimited` shows `∞` with no percentage.
- `DataTable`: TanStack Table, sticky header, density, selection, sortable columns.
- `Drawer`: right side, sizes, focus trap, Escape to close, `--shadow-drawer`.
- Unit tests: `score-cell`, `progress-bar`, `status-chip`, `data-table`, `drawer` (+ existing `cn`).
- Dev gallery: `apps/web/src/app/_gallery/page.tsx` (not linked from nav).
- Deps: `@tanstack/react-table`, testing-library + jsdom for UI package.

### Verified
- `pnpm lint` EXIT=0
- `pnpm typecheck` EXIT=0
- `pnpm test:unit` EXIT=0 (ui 15, web 52, database 41, schemas 85)
- Raw hex/rgb/hsl grep on `packages/ui/src` components: empty (hex only in `tokens.css`)
- No gradients / glows; shadow only via `--shadow-drawer` on overlay surfaces

### Evidence
- `$RUN_DIR/ui-primitives.txt` RESULT=PASS

### Rollback
```
git -C "$REPO_DIR" checkout -- packages/ui apps/web/src/app/_gallery
# also reverse pnpm-lock / package.json dep adds if abandoning:
# git checkout -- pnpm-lock.yaml packages/ui/package.json
```

### data-hygiene (2026-07-27T22:37Z) — RESULT=PASS

#### Built
- Pre-delete dump: `/home/admin/01_atlas/05_backups/model-monitor-prehygiene-20260727T223216Z.sql.gz` (118683 bytes).
- Deleted production junk in one transaction (prefix-only): 0 `model_access` on mmtest plans, 8 `mme2e:` subscriptions, 73 `mmtest:` plans.
- Created isolated Postgres DB `modelmonitor_test` (schema = post-hygiene prod clone; migrations 0000–0006 present).
- Forced `DATABASE_URL` → `modelmonitor_test` in:
  - `apps/web/playwright.config.ts`
  - `apps/web/playwright.auth.config.ts`
  - `apps/web/vitest.integration.config.ts`
  - `packages/database/vitest.integration.config.ts`
- Production guards (throw if `DATABASE_URL` ends with `/modelmonitor`) in:
  - `apps/web/e2e/global-setup.ts` (+ teardown)
  - `apps/web/src/test/integration-setup.ts`
  - `packages/database/src/integration-setup.ts` / `test-database-url.ts`
  - `seed-integrity.test.ts`
- Restored seed JSON fixtures to `packages/database/seed-data/` and pointed `seed.ts` + `seed-integrity` at that path (legacy `docs/implementation-package/data` was deleted earlier).

#### Verified
- Before: mmtest plans 73, mme2e subs 8 (matches preflight 77/12 totals).
- After delete production: plans 4, subscriptions 4, models 51, access_providers 4, model_access 19, benchmarks 276; junk counts 0.
- `pnpm test:integration` exit 0 (db 64 pass / 2 skip; web health 1 pass).
- Production unchanged after integration (audit still 992; zero mmtest rows).
- `modelmonitor_test` received writes (plans 4→7 with 3 mmtest plans; audit 992→1025).
- Guard unit: blocks `/modelmonitor`, allows `/modelmonitor_test`.
- OLD_APP: 7 containers; `/login` 200; `/` 307 → `/login?callbackUrl=%2F`.
- `pnpm lint` 0; `pnpm typecheck` 0.
- Evidence: `$RUN_DIR/data-hygiene.txt` with `JUNK_PLANS=0`, `JUNK_SUBS=0`, `TEST_DB_ISOLATED=PASS`, `OLD_APP=UP`, `RESULT=PASS`.

#### Deferred
- None for this phase. Residual mmtest rows left in `modelmonitor_test` only (expected; cleaned by e2e cleanup when those suites run).

#### Unsure
- None blocking.

#### Rollback (this phase only)
```
# restore production rows from pre-hygiene dump (sql.gz via psql), then:
git -C "$REPO_DIR" checkout -- apps/web packages/database
# drop test db:
docker exec -i model-monitor-postgres psql -U modelmonitor -d postgres -c 'DROP DATABASE IF EXISTS modelmonitor_test;'
# dump file may be kept
```

### schema-rankings (2026-07-27T22:46Z) — RESULT=PASS

#### Built
- Pre-migration dump: `~/01_atlas/05_backups/model-monitor-schema-rankings-20260727T224019Z.sql.gz` (114431 B).
- Hand-written `packages/database/migrations/0007_rankings_tags_views.sql` creating:
  - enums: `personal_confidence`, `tag_category`, `view_mode`, `view_density`
  - tables: `skills`, `model_skill_ratings`, `ranking_profiles`, `ranking_profile_skills`, `tags`, `model_tags`, `saved_views`
  - unique `(model_id, skill_id)` + indexes `(skill_id, external_score)` / `(skill_id, personal_score)`
  - `personal_score` / `personal_confidence` nullable with no default
  - FKs `ON DELETE CASCADE` from ratings/tags to `models`
- Drizzle mirror: `packages/database/src/schema/rankings.ts` (+ enums) exported from `schema/index.ts`
- Zod: `packages/schemas/src/rankings.ts` exported from schemas barrel
- Integration tests: `packages/database/src/rankings.integration.test.ts`
  - null personal score insert
  - duplicate `(model_id, skill_id)` rejected
  - model delete cascades ratings + tags

#### Verified
- Applied 0007 to **both** `modelmonitor` and `modelmonitor_test` via `pnpm db:migrate`
- Table lists match; seven new tables empty on prod (`BOTH_DBS=PASS`)
- OLD_APP: 7 containers; `/` 307 → `/login?callbackUrl=%2F`; `/login` 200 → `OLD_APP=UP`
- `pnpm lint` 0; `pnpm typecheck` 0; `pnpm test:unit` 0; `pnpm test:integration` 0
  (db integration 67 pass / 2 skip; rankings 3 pass; web health 1 pass)
- Prod models still 51; new tables remain empty after tests

#### Deferred
- None new. `plan_quotas` and models/plans column adds are later schema phases.
- Existing deferred drops unchanged.

#### Unsure
- None blocking. `view_mode` / `view_density` enums chosen from SPEC product language (table/cards/compact; comfortable/standard/compact).

#### Rollback (this phase only)
```
# drop only the seven new tables + four enums on BOTH dbs, remove ledger row:
# DROP TABLE IF EXISTS model_skill_ratings, ranking_profile_skills, model_tags,
#   saved_views, ranking_profiles, tags, skills CASCADE;
# DROP TYPE IF EXISTS personal_confidence, tag_category, view_mode, view_density;
# DELETE FROM schema_migrations WHERE filename = '0007_rankings_tags_views.sql';
git -C "$REPO_DIR" checkout -- packages/
```

Evidence: `$RUN_DIR/schema-rankings.txt` — `BOTH_DBS=PASS`, `OLD_APP=UP`, `RESULT=PASS`.
Telegram start #277.

### schema-rankings attempt-1 (2026-07-27T22:50Z) — RESULT=PASS

#### Prior failure cause (fixed)
- Attempt 0 claimed PASS but the orchestrator gate failed on `pnpm lint`:
  `@typescript-eslint/no-unnecessary-type-assertion` at
  `packages/database/src/rankings.integration.test.ts` lines 186 and 191
  (duplicate unique-error text used redundant `as` casts after `"code" in` narrowing).
- Fix only: rewrite error extraction with plain type-narrowing `if` guards; no casts.
- Migration 0007 + Drizzle/Zod mirrors already applied from attempt 0 — retained (additive,
  seven tables empty on both DBs). No rollback of schema required.

#### Verified (re-run)
- Dump (attempt 0, retained): `~/01_atlas/05_backups/model-monitor-schema-rankings-20260727T224019Z.sql.gz` (114431 B)
- BOTH_DBS=PASS — table lists match; seven new tables empty on prod
- OLD_APP=UP — docker=7; `/` 307 Location `…/login?callbackUrl=%2F`; `/login` 200
- `pnpm lint` 0; `pnpm typecheck` 0; `pnpm test:unit` 0; `pnpm test:integration` 0
  (rankings.integration.test.ts 3/3 pass)
- Prod models still 51

#### Deferred
- Unchanged. `plan_quotas` and models/plans column adds remain later phases.

#### Rollback (this phase only)
```
# drop only the seven new tables + four enums on BOTH dbs, remove ledger row:
# DROP TABLE IF EXISTS model_skill_ratings, ranking_profile_skills, model_tags,
#   saved_views, ranking_profiles, tags, skills CASCADE;
# DROP TYPE IF EXISTS personal_confidence, tag_category, view_mode, view_density;
# DELETE FROM schema_migrations WHERE filename = '0007_rankings_tags_views.sql';
git -C "$REPO_DIR" checkout -- packages/
```

Evidence: `$RUN_DIR/schema-rankings.txt` — `BOTH_DBS=PASS`, `OLD_APP=UP`, `RESULT=PASS`.

### schema-plans-models (2026-07-27T23:04Z) — RESULT=PASS

#### Built
- Pre-migration dump: `~/01_atlas/05_backups/model-monitor-schema-plans-models-20260727T225332Z.sql.gz` (115541 B).
- Hand-written `packages/database/migrations/0008_plans_quotas_models.sql`:
  - enums: `access_type` (7), `workflow_status` (7), `quota_unit` (9), `quota_period` (9)
  - `plans` nullable billing cols: renewal_date, billing_period, auto_renews, actual_price,
    notes, started_at, cancelled_at, intro_price_expires_at, access_type
  - new table `plan_quotas` (SPEC §4.1) + index on plan_id
  - `models`: is_favourite, needs_review (bool not null default false), workflow_status nullable
  - `model_access`: is_preferred + partial unique index `model_access_preferred_uidx`
  - backfill `models.workflow_status` from lifecycle/status (prod: 51 → active)
  - fold 4 real subscriptions → plans (copy only; subscriptions untouched)
- Drizzle: enums + plans/plan_quotas + models/model_access mirrors
- Zod: `packages/schemas/src/plans-models.ts` + primitives/phase3 field extensions
- Integration: `plans-models.integration.test.ts` (quota insert, preferred unique, nullable ws)
- Compat: `services/plans.ts` mapPlanRow row type; models.integration mock row; schema-unit list

#### Verified
- Applied 0008 to **both** `modelmonitor` and `modelmonitor_test`
  (test via direct `tsx src/migrate.ts` with DATABASE_URL path override — turbo does not
  forward DATABASE_URL to package scripts)
- Column lists match for plans/models/model_access/plan_quotas → `BOTH_DBS=PASS`
- plan_quotas count = 0; models 51/51 non-null workflow_status; 4 plans folded;
  subscriptions still 4 rows
- OLD_APP: 7 containers; `/` 307 → `/login?callbackUrl=%2F`; `/login` 200 → `OLD_APP=UP`
- `pnpm lint` 0; `pnpm typecheck` 0; `pnpm test:unit` 0; `pnpm test:integration` 0
  (plans-models.integration.test.ts 3/3)

#### Deferred
- `subscriptions` / `subscription_limit_rules` remain in `## Deferred drops` (fold was a copy;
  old app still reads them). Drop only in deploy-finalize.

#### Unsure
- None blocking. `plan_quotas` includes created_at/updated_at for consistency with other tables
  (SPEC §4.1 listed domain columns only).

#### Rollback (this phase only)
```
# BOTH dbs:
# ALTER TABLE model_access DROP COLUMN IF EXISTS is_preferred;
# DROP INDEX IF EXISTS model_access_preferred_uidx;
# ALTER TABLE models DROP COLUMN IF EXISTS is_favourite, DROP COLUMN IF EXISTS needs_review,
#   DROP COLUMN IF EXISTS workflow_status;
# ALTER TABLE plans DROP COLUMN IF EXISTS renewal_date, DROP COLUMN IF EXISTS billing_period,
#   DROP COLUMN IF EXISTS auto_renews, DROP COLUMN IF EXISTS actual_price, DROP COLUMN IF EXISTS notes,
#   DROP COLUMN IF EXISTS started_at, DROP COLUMN IF EXISTS cancelled_at,
#   DROP COLUMN IF EXISTS intro_price_expires_at, DROP COLUMN IF EXISTS access_type;
# DROP TABLE IF EXISTS plan_quotas CASCADE;
# DROP TYPE IF EXISTS access_type, workflow_status, quota_unit, quota_period;
# DELETE FROM schema_migrations WHERE filename = '0008_plans_quotas_models.sql';
git -C "$REPO_DIR" checkout -- packages/
```

Evidence: `$RUN_DIR/schema-plans-models.txt` — `BOTH_DBS=PASS`, `OLD_APP=UP`, `RESULT=PASS`.

### csv-importer (2026-07-27T23:12Z) — RESULT=PASS

#### Built
- New workspace package `packages/csv-import` (`@model-monitor/csv-import`).
- Pure `parseMasterCsv(buffer: Buffer): ParsedMaster` — no DB writes.
- Hazard coverage (SPEC §5.1): preamble/header assert, decimal-comma numbers,
  UTF-8-only decode + U+2013 assert, Generation-as-text, prose booleans,
  compound Package split with known-compound list (`ChatGPT Plus / Codex`).
- Unit tests run against real `data/source/LLM_MASTER_v1.csv` (13 tests).

#### Verified
- `pnpm lint` 0; `pnpm typecheck` 0; `pnpm test:unit` 0 (csv-import 13/13).
- Counts: models 51, providers 9, plans 11, accessRoutes 70, quotas 51,
  pricing 51, benchmarkResults 155, skillScores 612, sources 51, warnings [].
- Spot checks: GPT-5.6 Sol / GLM-5.2 / Generation / Vision null / EN DASH /
  blank→null across all 51 rows.

#### Deferred
- None for this phase. DB application is the next phase (`csv-migration`).

#### Rollback (this phase only)
```
rm -rf packages/csv-import
# restore lockfile if needed:
git checkout -- pnpm-lock.yaml
PATH="$HOME/.local/bin:$PATH" pnpm install
```

Evidence: `$RUN_DIR/csv-importer.txt` — `RESULT=PASS`.
