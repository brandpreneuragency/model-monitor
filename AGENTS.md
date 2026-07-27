# AGENTS.md — Model Monitor

These rules apply to every coding agent working in this repository.

## 1. Product boundaries

Model Monitor is a private, single-user personal workspace for choosing which AI model
to use for a task. It is a manually maintained LLM directory — not an automation platform.

It answers:

- Which models are available, and where can each be accessed?
- Which plan includes it, what does it cost, what quota applies?
- Which model is best for a specific job?
- Which should be primary, backup, specialist, or bulk worker?

MVP includes:

- model registry (identity, capabilities, tags, favourites, workflow status)
- providers and plans (cost and quota live on the plan; access routes link models to plans)
- personal and external skill ratings (kept strictly separate)
- ranking profiles and leaderboards
- CSV import/export with provenance
- Overview, Models, Rankings, and Providers & Plans destinations

MVP excludes:

- live provider integrations and background synchronisation
- automatic routing and model discovery
- provider credential storage
- mock/manual usage tracking
- Hermes catalog API and any provider-facing API
- audit UI and API-token management as product destinations
- notifications, multi-user permissions, and approval workflows
- light mode and mobile layouts below tablet width (this redesign)

Do not expand scope without an explicit decision record.

Benchmark *data* may appear as a secondary Research tab on the model drawer. Audit
*events* remain a table written for structural mutations; audit is not a navigation
destination. `subscriptions` is not a product concept — commercial terms live on `plans`.

## 2. Source-of-truth hierarchy

1. This `AGENTS.md`
2. The active redesign plan and `SPEC.md` under the ATLAS plans tree for this run
   (when present on the host)
3. `docs/design/` reference mockups and `DESIGN.md` (visual contract after design-tokens)
4. Drizzle schema and migrations in `packages/database`
5. Shared Zod contracts in `packages/schemas`
6. Seed/fixture CSV at `data/source/LLM_MASTER_v1.csv`
7. PRD and supporting notes under `docs/` when they do not conflict with higher sources

When sources conflict, stop and document the conflict. Do not silently choose a different
product model.

`docs/implementation-package/` does not exist and must not be referenced.

## 3. Required engineering standards

- TypeScript strict mode.
- No `any` unless isolated at an external boundary and justified in code.
- Validate every external input with Zod.
- Use Drizzle migrations for schema changes.
- Use transactions for imports, merges, and multi-entity writes.
- Archive rather than delete in normal flows.
- Never place secrets in source, logs, fixtures, or audit payloads.
- Never execute spreadsheet macros or formulas; formula-like export values are neutralized.

### Audit writes

Create an audit event for mutations to models, plans, providers, and access routes.

Do **not** require audit events for high-frequency personal edits: skill ratings, tags,
and saved views.

### Cost ownership

Never store subscription or plan cost on a model. Cost, billing period, renewal, and
quota live on the plan. Access-specific token pricing may live on access/pricing rows
tied to a model–plan route — never as a subscription entity on the model itself.
The `subscriptions` table/concept is retired; do not reintroduce it in new code.

## 4. Repository structure

```text
apps/web
packages/database
packages/schemas
packages/ui
packages/api-client
packages/csv-import
docs
data/source
scripts
docker
```

- Do not restore deleted pre-redesign packages (Excel workbook importer, Hermes OpenAPI
  contract package). They are gone from the tree; use `packages/csv-import` for CSV I/O.
- A different top-level structure requires an ADR.

## 5. Redesign binding constraints

These constraints are non-negotiable for this redesign and every later phase:

1. **Primary navigation.** The only primary destinations are Overview (`/`), Models
   (`/models`), Rankings (`/rankings`), and Providers & Plans (`/providers`). Nothing
   else may be added to primary navigation. Import/Export, Tags, Skills, Backup, and
   Appearance/General are secondary (settings or utility), never primary.

2. **Design tokens.** `packages/ui/src/tokens.css` is the only place a colour may be
   defined. No component may use a raw hex value, a gradient, or a glow. Use CSS custom
   properties from the token file.

3. **Score separation.** Personal and external scores are never averaged, never rendered
   in one column, and never fall back to one another. Combined views show both side by
   side and label which is which. Overall score, when shown, is computed (not stored)
   and must state which inputs it used.

4. **Incomplete records.** Incomplete records are always allowed. Only `name` is required
   to create a model. Forms must not force fields the owner does not have.

5. **Additive-only migrations during the build.** During this run, **no migration may drop
   or rename anything** the live app might still read. Removals are recorded in
   `progress.md` under `## Deferred drops` for the deploy phase to execute. Schema work
   is additive until deploy.

## 6. Architecture rules

### UI

- Server components by default.
- Client components only for interaction.
- Server-side pagination for large tables.
- Query state must be URL-addressable where practical.
- Forms use React Hook Form and shared Zod schemas.
- Use accessible primitives.
- Status must not rely only on color.
- Dark-only UI for this redesign (tokens may leave room for light later).
- Subtle borders over shadows; restrained motion (colour/background only).

### Backend

- Route handler or service boundary validates input.
- Business logic lives outside React components.
- Database calls go through repository/service modules.
- Mutations return typed domain results.
- Errors map to the shared API error shape.
- Log request ID, operation, duration, and result; never secrets.

### Database

- UUID primary keys.
- Stable canonical IDs and slugs.
- Explicit indexes for list, filter, and history queries.
- Foreign keys enforced.
- Import provenance preserved.
- Audit events immutable where written.
- Do not drop or rename live columns/tables until the deploy phase deferred list runs.

## 7. Data rules

### Nulls

`null` means unknown, `false` means explicitly unsupported, `0` means a verified numeric
zero. Never convert a missing value to `0` or `false`.

### Canonical model

One record per materially distinct model identity. Never duplicate a canonical model
because a second provider offers it. Access-specific copies and provider aliases belong
in `model_access` / `model_aliases`, not as extra `models` rows.

### Developer and access provider

Developer (creator) and access provider are never conflated. CSV `Provider` often mixes
the two; the database creator mapping wins for identity.

### Scores and rankings

- Personal scores start null; external scores come from research/CSV where present.
- Blank score is not zero.
- Manual personal override may carry confidence and notes; do not invent values.
- Ranking profiles weight skills; switching profile changes leaderboard order.
- Do not store overall score; compute it when needed and label sources.

### Benchmarks

- Benchmark data is secondary (Research tab), not a primary product area.
- Preserve exact benchmark setting, harness, comparable group, source, and verification
  date when storing results.
- Do not compare across incompatible groups.

### Tags and saved views

- Tag usage counts are derived by query, never denormalised as a source of truth.
- Saved views persist filters, sort, columns, view mode, and density.

## 8. Import rules

- Use `data/source/LLM_MASTER_v1.csv` as the fixture (not any `.xlsm` workbook).
- Import provenance is preserved; imports are transactional and idempotent.
- Import preview must be read-only.
- Commit must be explicit and transactional.
- Reimport must be idempotent.
- CSV wins on attributes; database wins on identity (creator, canonical_id, slugs).
- Join seed rows on model display `name` unless a later ADR says otherwise.
- Handle CSV hazards: preamble rows, decimal commas, UTF-8 only, prose booleans,
  compound package values, non-numeric Generation text.
- Prose booleans: affirmative → `true`; explicit negative → `false`; "not confirmed" or
  absent → `null` (never `false` for unknown).
- Records that cannot be resolved are flagged for review, not deleted.
- Spreadsheet formulas are not evaluated.
- Formula-like export values are neutralized.

## 9. Testing requirements

Every feature must include:

- unit tests for domain logic
- integration tests for database behavior
- E2E coverage for critical user flows (in phases that own E2E)
- acceptance-criterion or phase-gate reference

Before declaring a gated phase complete, run the gates that phase requires (typically):

```text
lint
typecheck
test:unit
test:integration
```

plus that phase's structural assertions. Run `test:e2e` only when the phase owns it.

Record evidence in `progress.md` (this filename, not a legacy `PROGRESS.md` only).

E2E must not target the production database. No `mmtest:` / `mme2e:` junk may remain in
production after hygiene phases.

## 10. UI quality

- Use generous page spacing; keep density inside tables, not across the whole interface.
- Sticky identity column in wide tables; sticky headers and filter bars where specified.
- Use skeletons, clear empty states, and error states with an action.
- Never show guessed renewal dates as facts.
- Density control (comfortable / standard / compact) may persist per user.
- Comparison tray appears when models are selected.
- Follow `docs/design/` reference HTML as the visual contract when present; screenshots
  corroborate. On conflict, mockup wins and the conflict is logged to `progress.md`.

## 11. Change discipline

Before editing:

1. Read this file and the relevant specification or phase prompt.
2. Inspect existing implementation.
3. Make the smallest coherent change.
4. Update tests.
5. Run verification required by the phase.
6. Append to `progress.md` (phase log, deferred drops, deferred issues as needed).

Do not rewrite unrelated code. Do not expand primary navigation. Do not introduce raw
colour values outside `packages/ui/src/tokens.css`.

## 12. Review checklist

Reviewers and later agents must check:

- product scope and primary-nav constraint
- data invariants (null/false/0, one canonical model, creator ≠ access provider)
- migration safety (additive-only until deploy; drops only via `## Deferred drops`)
- transactional integrity and import idempotency / provenance
- audit coverage only where required (not ratings/tags/saved views)
- score separation (personal vs external)
- cost on plan, not on model
- token-only colours (no raw hex/gradient/glow in components)
- auth boundaries
- accessibility (status not colour-only)
- test evidence

## 13. Completion rule

A phase is not complete because code exists. It is complete only when its exit criteria
and relevant acceptance criteria have passing evidence, and `progress.md` records what
was built, deferred, and left unsure.
