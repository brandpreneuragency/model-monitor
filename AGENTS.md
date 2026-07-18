# AGENTS.md — Model Monitor

These rules apply to every coding agent working in this repository.

## 1. Product boundaries

Model Monitor is a private, single-user LLM registry and subscription manager with a read-only Hermes catalog.

MVP includes:

- model registry
- subscriptions and access paths
- benchmarks, scores, sources
- import/export
- audit history
- manual/mock usage
- Hermes read-only API

MVP excludes:

- live provider integrations
- automatic routing
- provider credential storage
- notifications
- multi-user permissions

Do not expand scope without an explicit decision record.

## 2. Source-of-truth hierarchy

1. Accepted product decisions in `docs/00_PRODUCT_DECISIONS.md`
2. Acceptance criteria in `docs/13_ACCEPTANCE_CRITERIA.md`
3. Database contract in `contracts/postgresql-schema.sql`
4. API contract in `contracts/openapi.yaml`
5. Hermes schema in `contracts/hermes-catalog.schema.json`
6. PRD and supporting specifications
7. Source workbook and raw seed files

When sources conflict, stop and document the conflict in an ADR. Do not silently choose a different product model.

## 3. Required engineering standards

- TypeScript strict mode.
- No `any` unless isolated at an external boundary and justified in code.
- Validate every external input with Zod.
- Use Drizzle migrations for schema changes.
- Use transactions for imports, merges, and multi-entity writes.
- Every mutation must create an audit event.
- Archive rather than delete in normal flows.
- Unknown values stay `null`.
- Never convert missing values to `0` or `false`.
- Never store subscription cost on a model.
- Never duplicate a canonical model because a second provider offers it.
- Never execute workbook macros or formulas.
- Never place secrets in source, logs, fixtures, or audit payloads.
- Keep the Hermes API versioned and read-only.

## 4. Repository structure

Use:

```text
apps/web
packages/database
packages/schemas
packages/ui
packages/api-client
packages/excel-import
packages/hermes-contract
docs
scripts
```

A different structure requires an ADR.

## 5. Architecture rules

### UI

- Server components by default.
- Client components only for interaction.
- Server-side pagination for large tables.
- Query state must be URL-addressable where practical.
- Forms use React Hook Form and shared Zod schemas.
- Use accessible primitives.
- Status must not rely only on color.

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
- Audit events immutable.
- API tokens stored hashed.

## 6. Data rules

### Canonical model

One record per materially distinct model endpoint identity. Access-specific copies belong in `model_access`.

### Developer and access provider

Do not conflate them.

Examples:

- DeepSeek develops DeepSeek V4 Pro.
- OpenCode and Command Code provide access.
- NVIDIA develops Nemotron.
- OpenCode Zen may provide access.

### Nulls

- null: unknown
- false: explicitly unsupported
- 0: verified numeric zero

### Scores

- score methodology must be versioned
- blank score is not zero
- manual override requires a reason
- score history is retained

### Benchmarks

- preserve exact benchmark setting and harness
- preserve comparable group
- do not compare across groups
- preserve source and verification date

## 7. Import rules

- Use `source/LLM_MASTER_v2.xlsm` as the fixture.
- Initial seed data in `/data` is normalized and authoritative for bootstrap.
- Import preview must be read-only.
- Commit must be explicit and transactional.
- Reimport must be idempotent.
- Blank model IDs must be matched or flagged.
- Spreadsheet formulas are not evaluated.
- Formula-like export values are neutralized.

## 8. Testing requirements

Every feature must include:

- unit tests for domain logic
- integration tests for database behavior
- E2E coverage for critical user flow
- acceptance-criterion reference

Before declaring a phase complete, run:

```text
lint
typecheck
test:unit
test:integration
test:e2e
```

Record evidence in `PROGRESS.md`.

## 9. UI quality

- Use generous page spacing.
- Keep density inside tables, not across the whole interface.
- Support light and dark modes.
- Keep a sticky identity column in wide tables.
- Use skeletons, clear empty states, and error states.
- Make mock usage visually explicit.
- Never show guessed renewal dates as facts.

## 10. Change discipline

Before editing:

1. Read the relevant specification.
2. Inspect existing implementation.
3. State intended files and tests in the task log.
4. Make the smallest coherent change.
5. Update tests.
6. Run verification.
7. Update `PROGRESS.md`.

Do not rewrite unrelated code.

## 11. Review checklist

Reviewers must check:

- product scope
- data invariants
- migration safety
- transactional integrity
- audit coverage
- null handling
- duplicate model prevention
- auth and token scope
- import safety
- accessibility
- test evidence

## 12. Completion rule

A phase is not complete because code exists. It is complete only when its exit criteria and relevant acceptance criteria have passing evidence.
