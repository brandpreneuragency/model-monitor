# ADR-0005: Import idempotency key is required (not nullable)

- Status: Accepted
- Date: 2026-07-18
- Decision owner: Lead architect

## Context

`docs/03_DATA_MODEL.md` declares the uniqueness rule "import file checksum plus parser version, unless the user explicitly reimports." The original contract implemented this as `UNIQUE(sha256, parser_version, idempotency_key)` with a **nullable** `idempotency_key`. In PostgreSQL, NULL values in a unique constraint are treated as distinct, so any number of duplicate imports of the same file and parser version would be allowed whenever the key is absent — silently defeating the documented rule and the "reimport must be idempotent" acceptance criterion.

## Decision

1. `import_jobs.idempotency_key` becomes `text NOT NULL DEFAULT ''`; the existing `UNIQUE(sha256, parser_version, idempotency_key)` is kept.
2. Upload without an explicit key stores `''`; a second upload of the same file with the same parser version is rejected with `409 Conflict` pointing at the existing import job.
3. An explicit reimport (UI action) generates a fresh client key, creating a new job while preserving full history.
4. The commit endpoint's `Idempotency-Key` header is stored on the job and replayed commits return the original result without re-applying changes.

## Alternatives considered

- **`UNIQUE ... NULLS NOT DISTINCT`**: makes nullable keys behave like `''` anyway; choosing a NOT NULL column is stricter and self-documenting.
- **Application-level check only**: rejected — race conditions between concurrent uploads must be stopped by the database.

## Consequences

- Contract patched in `contracts/postgresql-schema.sql`.
- Import upload handler maps the unique violation to `409` with the existing job reference.
- Fixture tests cover duplicate upload rejection and explicit reimport.

## Migration or rollback

No data exists yet; the change lands in the initial migration. Rollback would re-open the duplicate-import hole, so it is not recommended.

## Related requirements

- `docs/03_DATA_MODEL.md` (critical uniqueness constraints)
- `docs/07_IMPORT_AND_MIGRATION.md` (idempotent commit)
- `docs/13_ACCEPTANCE_CRITERIA.md` ("Second import is idempotent")
