# Model Monitor Implementation Plan

## Status legend

- `[ ]` not started
- `[~]` active
- `[x]` complete
- `[!]` blocked

Issue references (MM-###) point to `docs/18_IMPLEMENTATION_ISSUES.md`.

## Phase 0 — Architecture lock — COMPLETE (2026-07-18)

- [x] Review all package documents.
- [x] Confirm repository/workspace structure (docs/16 §4).
- [x] Validate contracts; patch to v1.1 (docs/17; `contracts/` updated).
- [x] Write ADRs for genuine conflicts (ADR-0001…ADR-0007, `docs/adr/`).
- [x] Produce implementation issue list (docs/18; MM-001…MM-061).
- [x] Verify seed data integrity at file level (docs/16 §11).

Deferred to Phase 1 (implementation, not review):

- [x] Convert SQL contract to Drizzle schema — **MM-004**
- [x] Generate initial migrations — **MM-004**
- [x] Mechanical contract validation in CI (PG16 apply, OpenAPI lint, ajv) — **MM-002**

## Phase 1 — Foundation — ACTIVE (2026-07-18)

- [x] Workspace scaffold — MM-001
- [x] Contract validation harness (PostgreSQL 16 apply verified locally) — MM-002
- [x] Shared Zod schemas — MM-003
- [x] Drizzle schema + initial contract migration (25 typed tables and 12 enums; PostgreSQL 16 migration verified) — MM-004
- [x] PostgreSQL + Docker Compose + scripts — MM-005
- [x] Seed runner (mapping rules docs/16 §6; idempotency verified) — MM-006
- [x] Seed integrity suite: database 51/4/19/276/127/USD 61 assertions pass — MM-007
- [~] Auth.js Google OAuth + email allow-list + owner bootstrap (OAuth callback E2E needs Google test credentials) — MM-008
- [x] Design system, shell, logging, request IDs, health — MM-009
- [x] CI — MM-010

## Phase 2 — Models

- [ ] Model list API (filters, sort, cursor) — MM-011
- [ ] Model library table UI — MM-012
- [ ] Model detail (all tabs) — MM-013
- [ ] Create/edit — MM-014
- [ ] Archive/restore — MM-015
- [ ] Aliases — MM-016
- [ ] Tri-state capabilities — MM-017
- [ ] Scores and ranks (methodology version, override reason) — MM-018
- [ ] Benchmark evidence — MM-019
- [ ] Sources — MM-020
- [ ] History — MM-021
- [ ] Transactional merge — MM-022
- [ ] Phase 2 E2E pack — MM-023

## Phase 3 — Subscriptions and access

- [ ] Access providers + plans — MM-024
- [ ] Subscriptions + billing fields — MM-025
- [ ] Limit rules — MM-026
- [ ] Model access CRUD — MM-027
- [ ] Access matrix — MM-028
- [ ] Manual usage + mock labels — MM-029
- [ ] Dashboard cost calculations — MM-030
- [ ] Phase 3 E2E pack — MM-031

## Phase 4 — Import and export

- [ ] Secure upload intake — MM-032
- [ ] XLSX/XLSM parser (no macros/formulas) — MM-033
- [ ] Normalization + matching — MM-034
- [ ] Conflict detection — MM-035
- [ ] Read-only preview — MM-036
- [ ] Conflict resolution — MM-037
- [ ] Transactional idempotent commit + rollback — MM-038
- [ ] Import log — MM-039
- [ ] JSON/CSV/XLSX exports + injection guard — MM-040
- [ ] Workbook fixture E2E — MM-041

## Phase 5 — Dashboard and administration

- [ ] KPI dashboard + panels — MM-042
- [ ] Data-quality warnings — MM-043
- [ ] Audit log + filters — MM-044
- [ ] Saved table views — MM-045
- [ ] Verification settings — MM-046
- [ ] API token settings — MM-047
- [ ] Backup scripts + runbook — MM-048

## Phase 6 — Hermes

- [ ] Token authentication (hash, scope, expiry, revocation, rate limit) — MM-049
- [ ] Catalog serializer + revision/ETag (ADR-0001…0003) — MM-050
- [ ] Contract tests vs JSON Schema — MM-051
- [ ] OpenAPI docs — MM-052
- [ ] Example Hermes client — MM-053
- [ ] Catalog performance check — MM-054

## Phase 7 — Release

- [ ] Security review — MM-055
- [ ] Accessibility review — MM-056
- [ ] Responsive review — MM-057
- [ ] Scale fixtures + performance tests — MM-058
- [ ] Production Compose + proxy runbook — MM-059
- [ ] Encrypted backup + empty-database restore proof — MM-060
- [ ] Acceptance checklist + release tag — MM-061

## Resolved product decisions

- Duplicate action: prefilled create form; no persistence until Save.
- Selected exports: CSV, JSON, and XLSX; Hermes export remains the full catalog.
- Tags: `models.metadata.tags` array of `{slug, label}` objects; lowercase hyphenated slugs with preserved display labels.
- All 13 additional acceptance tests in `docs/16` §9 are mandatory release criteria.
- Recent Google reauthentication is required before API-token creation and permanent deletion.
