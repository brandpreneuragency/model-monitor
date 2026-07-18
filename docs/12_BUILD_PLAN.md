# Build Plan

## Phase 0 — Architecture lock

Deliver:

- confirmed repository structure
- final schema review
- page route map
- API boundaries
- import architecture
- ADRs for disputed choices
- task breakdown

Exit criteria:

- no unresolved entity-boundary issue
- SQL and OpenAPI contracts accepted
- implementation tasks sized

## Phase 1 — Foundation

Implement:

- monorepo or workspace
- Next.js app
- PostgreSQL
- Drizzle migrations
- Auth.js
- allow-list
- design tokens
- shell navigation
- error handling
- logging
- CI
- seed runner

Exit criteria:

- authenticated owner can open the empty shell
- migrations and seeds run on clean database
- 51/4/19 seed assertions pass

## Phase 2 — Model registry

Implement:

- model list
- model detail
- CRUD
- capabilities
- aliases
- sources
- scores
- benchmarks
- archive/restore
- history

Exit criteria:

- model workflows pass E2E
- null scores display correctly
- audit events created

## Phase 3 — Subscriptions and access

Implement:

- access providers
- plans
- subscriptions
- limit rules
- model access
- access matrix
- manual/mock usage

Exit criteria:

- monthly regular total shows USD 61
- overlapping access does not duplicate models
- access matrix matches seed data

## Phase 4 — Import and export

Implement:

- XLSX/XLSM parser
- workbook normalization
- match engine
- preview
- conflicts
- commit
- rollback
- JSON/CSV/XLSX exports

Exit criteria:

- fixture import passes
- reimport idempotent
- no formula injection
- import provenance visible

## Phase 5 — Dashboard and administration

Implement:

- KPI dashboard
- data quality warnings
- audit log
- verification settings
- saved table views
- API tokens
- backup controls or documented scripts

Exit criteria:

- dashboard calculations tested
- audit filters work
- Hermes token created and revoked

## Phase 6 — Hermes contract

Implement:

- read-only catalog endpoints
- scoped token auth
- JSON Schema validation
- ETag
- OpenAPI docs
- example client
- contract tests

Exit criteria:

- catalog validates against schema
- unavailable models excluded from active access
- mock usage labeled
- token scope enforced

## Phase 7 — Hardening and deployment

Implement:

- full test suite
- accessibility review
- responsive review
- security review
- production compose
- reverse proxy instructions
- backup and restore proof
- release checklist

Exit criteria:

- all acceptance criteria pass
- clean deployment succeeds
- restore test succeeds
