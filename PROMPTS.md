# Copy-Ready Agent Prompts

Use the entire implementation package as attached context. Each run must update `PLAN.md` and `PROGRESS.md`.

---

## Prompt 0 — Architecture validation

**Suggested model:** GPT-5.6 Sol  
**Reasoning:** High

```text
You are the lead architect for Model Monitor.

Read the entire implementation package before changing anything:
- README.md
- AGENTS.md
- docs/*
- contracts/*
- data/workbook-inventory.json
- data/import-column-mapping.csv

Your job is to validate the package and convert it into an executable repository plan.

Requirements:
1. Preserve the locked scope. Do not add routing, live provider usage integrations, multi-user permissions, or provider credential storage.
2. Verify the entity boundaries: canonical model, developer, access provider, plan, personal subscription, model access, benchmark, score, source, import, audit, API token, and usage snapshot.
3. Compare contracts/postgresql-schema.sql, contracts/openapi.yaml, and contracts/hermes-catalog.schema.json for inconsistencies.
4. Propose the exact workspace structure and module boundaries.
5. Identify risks, ambiguous requirements, and missing acceptance tests.
6. Produce ADRs only where a choice is genuinely required.
7. Break the build into implementation issues sized for coding agents.
8. Update PLAN.md and PROGRESS.md.

Deliver:
- architecture review
- contract discrepancy list
- final directory tree
- module dependency map
- implementation issue list
- ADRs
- revised files

Do not implement product features yet.
```

---

## Prompt 1 — Foundation and schema

**Suggested model:** GPT-5.6 Terra  
**Reasoning:** High

```text
Implement Model Monitor Phase 1.

Read AGENTS.md, PLAN.md, PROGRESS.md, docs/00_PRODUCT_DECISIONS.md, docs/03_DATA_MODEL.md, docs/11_DEPLOYMENT.md, and contracts/postgresql-schema.sql.

Implement:
- workspace structure
- Next.js TypeScript app
- PostgreSQL Docker service
- Drizzle schema and migrations
- shared Zod schemas
- Auth.js Google OAuth
- allow-listed email authorization
- application shell
- light/dark design tokens
- structured logging and request IDs
- CI commands
- seed runner using data/*.seed.json
- seed integrity tests

Constraints:
- strict TypeScript
- no provider secrets
- no routing
- no live usage integrations
- unknown values remain null
- every future mutation path must have an audit-service boundary

Verification:
- clean database migration
- seed counts: 51 models, 4 subscriptions, 19 access records, 276 benchmark rows
- regular monthly cost: USD 61
- lint, typecheck, unit and integration tests

Update PLAN.md and PROGRESS.md with evidence. Stop after Phase 1 exit criteria pass.
```

---

## Prompt 2 — Model registry

**Suggested model:** GPT-5.6 Terra  
**Reasoning:** High

```text
Implement Model Monitor Phase 2: the model registry.

Read AGENTS.md, docs/01_PRD.md, docs/06_UI_UX_SPEC.md, docs/13_ACCEPTANCE_CRITERIA.md, and the existing repository.

Implement:
- server-paginated model library
- search by name, ID, alias, developer, family, and access provider
- filters and sorting
- model detail tabs
- create/edit
- archive/restore
- aliases
- tri-state capabilities
- scores and ranks with methodology version
- benchmark evidence
- sources and verification
- audit history
- transactional model merge

Rules:
- blank score is not zero
- unknown capability is not false
- normal deletion archives
- merge transfers all relationships in one transaction
- every mutation creates an audit event
- do not duplicate canonical models because of access provider

Add unit, integration, and Playwright tests for all critical flows. Update PLAN.md and PROGRESS.md. Stop when the Phase 2 exit criteria pass.
```

---

## Prompt 3 — Subscriptions and access matrix

**Suggested model:** GPT-5.6 Terra  
**Reasoning:** High

```text
Implement Model Monitor Phase 3.

Read the subscription seeds and docs/01_PRD.md, docs/03_DATA_MODEL.md, docs/06_UI_UX_SPEC.md, and docs/13_ACCEPTANCE_CRITERIA.md.

Implement:
- access providers
- plans
- personal subscriptions
- billing fields
- structured limit rules
- authentication and API access type
- manual usage fields
- mock usage display
- model access CRUD
- access matrix
- subscription detail
- dashboard fixed-cost calculations

Required data truths:
- ChatGPT Plus regular price USD 20 and no included API credits
- OpenCode Go regular price USD 10, introductory price USD 5
- SuperGrok regular price USD 30 and no general API credits
- Command Code Go regular price USD 1, CLI-only
- regular fixed monthly total USD 61
- DeepSeek V4 Pro, MiMo V2.5 Pro, and MiniMax M3 can have multiple access paths without duplicate canonical records

Every mutation must be audited. Add unit, integration, and E2E tests. Update PLAN.md and PROGRESS.md.
```

---

## Prompt 4 — Workbook import and export

**Suggested model:** GPT-5.6 Sol for design, GPT-5.6 Terra for implementation  
**Reasoning:** High

```text
Implement Model Monitor Phase 4.

Read docs/07_IMPORT_AND_MIGRATION.md, data/workbook-inventory.json, data/import-column-mapping.csv, and source/LLM_MASTER_v2.xlsm.

Implement:
- secure XLSX/XLSM upload
- file signature and size validation
- SHA-256
- supported sheet parser
- raw provenance
- Excel serial-date conversion
- normalization
- alias matching
- duplicate detection
- conflict records
- read-only preview
- manual conflict resolution
- idempotent transactional commit
- rollback
- import log
- JSON, CSV, and normalized XLSX export
- spreadsheet formula-injection protection

Important:
- do not execute macros or formulas
- source workbook has 15 sheets
- Master Models has 31 populated rows
- canonical roster is 51
- Benchmarks has 276 evidence rows
- provider and developer must remain separate
- subscription price must not be imported onto models
- null cost must not become zero
- reimport must not create a 52nd model

Add fixture-based tests using the supplied workbook. Update PLAN.md and PROGRESS.md with exact verification evidence.
```

---

## Prompt 5 — Dashboard and administration

**Suggested model:** GPT-5.6 Terra  
**Reasoning:** Medium-high

```text
Implement Model Monitor Phase 5.

Implement:
- complete dashboard KPI set
- mock/manual usage panel
- upcoming renewal panel
- models with multiple access paths
- data quality warnings
- recent changes
- audit log filters
- saved table views
- verification interval settings
- Hermes API token creation and revocation UI
- backup scripts and documentation

The interface should be spacious and premium, with density concentrated inside tables. Support light and dark modes. Mock values must be visibly labeled.

Add tests for dashboard calculations, warning conditions, audit filters, token lifecycle, and backup command validation. Update PLAN.md and PROGRESS.md.
```

---

## Prompt 6 — Hermes API

**Suggested model:** GPT-5.6 Terra  
**Reasoning:** High

```text
Implement Model Monitor Phase 6.

Read contracts/openapi.yaml, contracts/hermes-catalog.schema.json, and docs/08_HERMES_INTEGRATION.md.

Implement:
- read-only /api/v1/hermes endpoints
- bearer token authentication
- catalog:read scope
- hashed token storage
- token expiry and revocation
- canonical catalog serializer
- active access filtering
- mock/manual usage labeling
- ETag and Last-Modified
- OpenAPI documentation
- generated or hand-written typed client
- example Hermes client
- contract tests against the JSON Schema

Security:
- never return credentials, OAuth data, private notes, user details, or audit payloads
- invalid scope returns 403
- revoked or expired token returns 401

Performance target at seed scale: p95 under 500 ms. Update PLAN.md and PROGRESS.md.
```

---

## Prompt 7 — Hardening and deployment

**Suggested model:** GPT-5.6 Sol  
**Reasoning:** High

```text
Perform Model Monitor Phase 7 hardening and release preparation.

Review the entire repository against:
- AGENTS.md
- docs/09_SECURITY_AND_AUTH.md
- docs/10_TEST_PLAN.md
- docs/11_DEPLOYMENT.md
- docs/13_ACCEPTANCE_CRITERIA.md

Tasks:
1. Run a full architecture and security review.
2. Fix data-integrity, authorization, import, and audit issues.
3. Run lint, typecheck, unit, integration, E2E, accessibility, and performance checks.
4. Verify light and dark modes and responsive monitoring.
5. Build production Docker Compose.
6. Write reverse-proxy and future-domain instructions.
7. Create an encrypted backup.
8. Restore it into a clean database.
9. Run seed integrity and Hermes contract checks after restore.
10. Complete the acceptance checklist.
11. Update PLAN.md and PROGRESS.md with evidence.

Do not declare release readiness while any critical acceptance criterion lacks evidence.
```

---

## Review prompt — use after every implementation run

**Suggested model:** GPT-5.6 Sol  
**Reasoning:** High

```text
Review the latest Model Monitor implementation against the package and AGENTS.md.

Focus on:
- scope drift
- canonical model duplication
- developer/access-provider confusion
- subscription cost placement
- null-versus-zero errors
- missing audit events
- unsafe archive/delete behavior
- non-transactional merge or import
- import idempotency
- spreadsheet injection
- auth and API token scope
- Hermes schema violations
- accessibility
- missing test evidence

Return:
1. blocking defects
2. high-priority defects
3. lower-priority improvements
4. exact files and tests affected
5. a remedy plan

Do not make changes in this review run unless explicitly instructed.
```

---

## Remedy prompt

**Suggested model:** GPT-5.6 Terra  
**Reasoning:** High

```text
Implement only the approved remedies from the latest review.

For each remedy:
- reproduce the defect
- add or update a failing test
- implement the smallest coherent fix
- run relevant tests
- run regression checks
- update PROGRESS.md with evidence

Do not refactor unrelated areas or expand scope.
```

---

## Mechanical task prompt

**Suggested model:** GPT-5.6 Luna or MiMo V2.5  
**Reasoning:** Low-medium

```text
Perform the specified mechanical Model Monitor task only.

Follow AGENTS.md. Do not alter architecture, schema boundaries, public API behavior, or product scope. Preserve strict typing. Run the narrowest relevant tests and record the result in PROGRESS.md.
```
