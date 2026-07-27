# ADR-0002: Catalog revision counter and ETag generation

- Status: Accepted
- Date: 2026-07-18
- Decision owner: Lead architect

## Context

`contracts/hermes-catalog.schema.json` requires `catalogRevision` (integer, minimum 1) on every catalog response, and `docs/08_HERMES_INTEGRATION.md` plus `contracts/openapi.yaml` require `ETag` / `Last-Modified` cache validation. The database contract defines no source for a revision number, so a generation strategy must be chosen.

## Decision

1. A monotonic catalog revision counter lives in `app_settings` under key `catalog_revision` (JSONB number, seeded at 1) with a companion key `catalog_revision_updated_at` (ISO 8601 timestamp).
2. Every mutation that changes catalog-visible data increments the counter and timestamp inside the same database transaction as the mutation. The affected entity set is: `models`, `model_aliases`, `model_capabilities`, `model_access`, `model_access_pricing`, `plans`, `access_providers`, `subscriptions` (status only), `model_scores`, `usage_snapshots`.
3. The increment is executed by the shared mutation/audit service boundary; no feature code writes catalog-visible tables without it.
4. The serializer emits `catalogRevision = counter`, `ETag = "mm-catalog-<revision>"` (strong), and `Last-Modified = catalog_revision_updated_at`.
5. `If-None-Match` matching the current ETag returns `304 Not Modified` with no body.

## Alternatives considered

- **Content hash (e.g., SHA-256 of payload)**: exact, but requires serializing the full catalog on every conditional request; at 50k+ benchmark scale the derived catalog will only grow. Rejected for MVP cost.
- **`max(updated_at)` across tables**: fragile — misses hard state changes without `updated_at` maintenance, ties inside one transaction, and deletions. Rejected.
- **Materialized snapshot table**: stronger but unnecessary before routing exists; the counter can later version snapshots without changing the contract.

## Consequences

- Every Phase 2-5 mutation service must call the revision bump; a lint-level checklist item and integration tests enforce it.
- The counter also gives Hermes a cheap staleness signal (`catalogRevision` comparison across polls).
- Seed loading sets the initial revision to 1.

## Migration or rollback

Counter reset to the current maximum is harmless: clients treat a changed ETag as invalidation. No data migration needed.

## Related requirements

- `contracts/hermes-catalog.schema.json` (`catalogRevision`)
- `docs/05_API_SPEC.md` (ETag support)
- `docs/08_HERMES_INTEGRATION.md` (cache behavior)
- AGENTS.md (every mutation audited; transactional integrity)
