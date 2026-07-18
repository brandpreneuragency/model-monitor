# MVP Acceptance Criteria

## Authentication

- [ ] Allow-listed Google account can sign in.
- [ ] Non-allow-listed account is denied.
- [ ] Sign-out invalidates the session.
- [ ] Protected pages cannot be loaded anonymously.

## Seed and dashboard

- [ ] Database contains 51 canonical models.
- [ ] Database contains four active personal subscriptions.
- [ ] Database contains 19 confirmed access records.
- [ ] Regular monthly fixed cost is USD 61.
- [ ] Mock usage is visibly labeled.
- [ ] Unknown renewal dates are shown as unknown, not guessed.

## Models

- [ ] Search finds a model by canonical name, alias, and ID.
- [ ] Model can be created and edited.
- [ ] Archive removes model from default views.
- [ ] Restore returns it.
- [ ] Unknown capability displays as unknown.
- [ ] Blank score does not display as zero.
- [ ] Every write creates an audit event.
- [ ] Merge transfers all required relationships transactionally.

## Subscriptions and access

- [ ] Subscription can be created and edited.
- [ ] Billing, access type, and usage instructions are independent fields.
- [ ] A model can have multiple access paths.
- [ ] Command Code access records are CLI-only.
- [ ] SuperGrok does not claim general API access.
- [ ] ChatGPT Plus does not claim included API credits.
- [ ] Access matrix matches the seed relationships.

## Benchmarks and sources

- [ ] 276 benchmark evidence rows import.
- [ ] Comparable group is retained.
- [ ] Source URL and verification date are visible.
- [ ] Benchmark evidence can be filtered by model and category.
- [ ] Score methodology version is visible.

## Import

- [ ] XLSM fixture uploads without executing macros.
- [ ] Preview reports 31 populated master rows and the normalized 51-model roster.
- [ ] Duplicate access rows do not create duplicate canonical models.
- [ ] Empty Model ID rows are matched or flagged.
- [ ] User can resolve conflicts before commit.
- [ ] Failed commit leaves no partial mutations.
- [ ] Second import is idempotent.
- [ ] Import log can be downloaded.

## Export

- [ ] JSON export succeeds.
- [ ] CSV export succeeds.
- [ ] XLSX export succeeds.
- [ ] Formula-like text is neutralized.
- [ ] Hermes export validates against JSON Schema.

## Hermes

- [ ] Token with `catalog:read` can retrieve catalog.
- [ ] Invalid, expired, or revoked token is rejected.
- [ ] Catalog contains each canonical model once.
- [ ] Catalog includes active access paths.
- [ ] Catalog excludes secrets.
- [ ] ETag or Last-Modified works.
- [ ] Contract tests pass.

## Security and operations

- [ ] Database is not publicly exposed.
- [ ] Secrets are absent from repository and logs.
- [ ] Production HTTPS works.
- [ ] Daily backup runs.
- [ ] Latest backup restores into an empty database.
- [ ] Health endpoint reports application and database status.

## Quality

- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] E2E tests pass.
- [ ] Accessibility checks pass without critical violations.
- [ ] Dark and light themes are usable.
- [ ] Desktop and mobile monitoring flows are usable.

## Additional Mandatory Criteria

Approved on 2026-07-18 during Phase 0 architecture lock.

- [ ] A table view can be saved, reapplied after reload, and deleted.
- [ ] Bulk archive, tag, and recheck actions apply to all selected rows with audit coverage.
- [ ] Duplicating a model opens a prefilled create form and persists nothing until Save.
- [ ] Global search results group by models, aliases, subscriptions, providers, plans, and benchmarks.
- [ ] Selected-record exports respect the current selection in CSV, JSON, and XLSX formats.
- [ ] Permanent deletion requires typed entity name, reference summary, double confirmation, recent Google reauthentication, and an audit event.
- [ ] A record older than the configured verification interval appears in data-quality warnings.
- [ ] Token, import, and export rate limits return HTTP 429 after the configured threshold.
- [ ] Dates display in Europe/Istanbul while stored timestamps remain UTC.
- [ ] Replayed merge or import-commit idempotency keys return the original result without side effects.
- [ ] Model list, model detail, and Hermes catalog p95 performance remains under 500 ms at the documented scale fixture.
- [ ] The full API token is shown exactly once; later views show only its prefix; creation requires recent Google reauthentication.
- [ ] The first allow-listed sign-in becomes owner; a non-allow-listed account cannot bootstrap access.
