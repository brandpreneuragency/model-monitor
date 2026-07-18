# ADR-0007: Alias normalization rule and per-model uniqueness

- Status: Accepted
- Date: 2026-07-18
- Decision owner: Lead architect

## Context

`docs/03_DATA_MODEL.md` declares `model_aliases.normalized_alias` globally unique, and the original contract enforced `UNIQUE(normalized_alias)`. Data verification against `data/model-aliases.seed.json` shows the shipped seed cannot satisfy that constraint: the aliases `MiMo-V2.5` (display_name) and `mimo-v2.5` (provider_id) belong to the same model yet normalize to the same string under any case-insensitive rule, as do the `MiMo-V2.5-Pro` pair. A global unique constraint therefore makes the authoritative seed unloadable — a conflict between the contract and the data it must hold.

## Decision

1. Normalization function: `normalize(alias) = lowercase(trim(collapse-whitespace(alias)))`, applied identically in the seed runner, import matcher, and search.
2. Uniqueness is scoped per model: `UNIQUE(model_id, normalized_alias)`. A non-unique index on `normalized_alias` supports global lookup during import matching.
3. The seed runner deduplicates aliases that collapse onto the same `(model_id, normalized_alias)`, preferring the row whose `alias_type` is operationally significant (`provider_id` / `source_model_id` over `display_name`); the discarded surface form remains derivable from the model name and the kept alias.
4. Two different models claiming the same normalized alias is allowed by the schema but always raised as an `alias_collision` import conflict requiring manual resolution (verified: no such collision exists in the current seed).

## Alternatives considered

- **Keep global uniqueness, drop colliding seed aliases**: rejected — silently discards authoritative matching evidence and would re-break on the next provider spelling variant.
- **Keep case-sensitive normalization**: rejected — case-insensitive matching is the entire point of the normalized column.

## Consequences

- Contract patched in `contracts/postgresql-schema.sql`; `docs/03_DATA_MODEL.md` annotated.
- Import matching step 2 (normalized alias) may return multiple candidates across models; that is a conflict, not an automatic match.
- Search and import use the shared `normalize()` from `packages/schemas` so behavior never diverges.

## Migration or rollback

No data exists yet; lands in the initial migration.

## Related requirements

- `docs/03_DATA_MODEL.md` (critical uniqueness constraints)
- `docs/07_IMPORT_AND_MIGRATION.md` (match order, alias collision conflict type)
- `data/model-aliases.seed.json` (collision evidence)
