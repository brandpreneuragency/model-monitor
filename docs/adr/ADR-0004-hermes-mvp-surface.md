# ADR-0004: Hermes MVP surface is the catalog endpoint only

- Status: Accepted
- Date: 2026-07-18
- Decision owner: Lead architect

## Context

`docs/05_API_SPEC.md` lists four Hermes endpoints: `GET /hermes/catalog`, `GET /hermes/models/{canonicalId}`, `GET /hermes/subscriptions`, `GET /hermes/access`. `docs/08_HERMES_INTEGRATION.md` — the dedicated integration contract — defines exactly one primary endpoint, `GET /api/v1/hermes/catalog`, and `contracts/hermes-catalog.schema.json` only describes the catalog payload. No payload contract exists for the other three endpoints, and the catalog already nests access paths under each model with subscription identifiers.

Shipping endpoints without payload contracts would create untested, unversioned surface for an external consumer.

## Decision

1. The MVP Hermes surface is `GET /api/v1/hermes/catalog` only.
2. `/hermes/models/{canonicalId}`, `/hermes/subscriptions`, and `/hermes/access` are postponed beyond MVP. They may be added later as additive, non-breaking changes with their own contract tests.
3. `docs/05_API_SPEC.md` is annotated to point at this ADR so the endpoint list is not read as MVP-committed.
4. Phase 6 scope, tests, and acceptance criteria target the catalog endpoint exclusively.

## Alternatives considered

- **Define and ship all four now**: rejected — duplicates catalog data, quadruples contract-test surface, and encodes URL structure before Hermes has a demonstrated need.
- **Remove the extra endpoints from docs entirely**: rejected — they remain a reasonable post-MVP extension; the ADR keeps the intent discoverable.

## Consequences

- Smaller Phase 6; one payload shape to keep stable.
- Hermes must fetch the full catalog even for single-model lookups; at seed scale (<500 ms p95, ~51 models) this is acceptable and is what the cache headers are for.

## Migration or rollback

Adding the postponed endpoints later is purely additive. No migration.

## Related requirements

- `docs/05_API_SPEC.md` (Hermes endpoint list)
- `docs/08_HERMES_INTEGRATION.md` (primary endpoint)
- `contracts/hermes-catalog.schema.json`
- AGENTS.md (Hermes API versioned and read-only; do not expand scope)
