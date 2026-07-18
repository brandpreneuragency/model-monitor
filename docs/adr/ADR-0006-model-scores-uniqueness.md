# ADR-0006: Model score uniqueness per calculation event

- Status: Accepted
- Date: 2026-07-18
- Decision owner: Lead architect

## Context

`docs/03_DATA_MODEL.md` lists `(model_id, methodology_id, score_type, calculated_at)` as a critical uniqueness constraint for `model_scores`. The original SQL contract created only a lookup index, omitting the constraint — a direct conflict between the data-model specification and the database contract. Per AGENTS.md, the conflict is documented here rather than silently resolved.

Score history is append-only: a model accumulates one row per `(methodology, score_type)` per calculation event. Two rows with the same tuple are always a data error (e.g., a re-import applying the same calculation twice), never meaningful history.

## Decision

1. Add `UNIQUE(model_id, methodology_id, score_type, calculated_at)` to `model_scores`.
2. New calculations always insert a new row with a fresh `calculated_at`; existing rows are never updated (history retention per `docs/01_PRD.md` FR-07).
3. Import re-encountering the same calculation (same tuple) treats it as an idempotent skip, not an error; differing values at the same timestamp become an import conflict.
4. "Current score" reads select the latest row per `(model_id, score_type)` for the active methodology.

## Alternatives considered

- **Keep contract as-is (index only)**: rejected — duplicate score rows would corrupt rank displays and the Hermes `scores` map, and reimport idempotency would depend on perfect application code.
- **Unique without `calculated_at`**: rejected — that would forbid legitimate recalculation history under one methodology.

## Consequences

- Contract patched in `contracts/postgresql-schema.sql`.
- Seed loads scores+ranks as one row per score type with a single shared `calculated_at`; no collisions (verified against `data/canonical-models.seed.json`).
- Import commit relies on the constraint as the final idempotency backstop for scores.

## Migration or rollback

No data exists yet; lands in the initial migration.

## Related requirements

- `docs/03_DATA_MODEL.md` (critical uniqueness constraints, score model)
- `docs/01_PRD.md` FR-07 (score history retained)
- `docs/07_IMPORT_AND_MIGRATION.md` (reimport idempotency)
