# ADR-0001: Hermes catalog access-path inclusion and availability rule

- Status: Accepted
- Date: 2026-07-18
- Decision owner: Lead architect

## Context

Two package sources conflict:

- Product invariant 10 (`docs/00_PRODUCT_DECISIONS.md`): "Hermes receives only active, explicitly available access paths."
- `contracts/hermes-catalog.schema.json` carries an `availability` enum of `confirmed | unconfirmed | unavailable | removed` plus a required `available` boolean on every access entry, which only makes sense if non-confirmed entries can appear in the payload.

`docs/08_HERMES_INTEGRATION.md` adds: "Only active, non-archived subscriptions and access records are marked available", which describes flag semantics, not inclusion semantics.

A choice is required because the invariant and the schema cannot both be read literally.

## Decision

1. The catalog contains every non-archived canonical model exactly once. Models with no qualifying access path appear with an empty `access` array; Hermes already refuses to select models without an active path.
2. An access entry is included when its `availability` is `confirmed` or `unconfirmed` and the entire ownership chain (`model_access.status`, plan, access provider, model) is non-archived.
3. Access entries with `availability` of `unavailable` or `removed`, and any archived record in the chain, are excluded from the payload entirely.
4. `available: true` is emitted only when the entry is included per rule 2, `availability = 'confirmed'`, and a linked owner subscription exists with `subscriptions.status = 'active'`. Otherwise `available: false`.
5. Merged source models (`merged_into_model_id IS NOT NULL`) are excluded; their access paths live on the merge target.

## Alternatives considered

- **Strict invariant reading**: include only `confirmed` paths. Rejected: it makes the `unconfirmed` state invisible to Hermes planning and wastes the schema's explicit `available` flag; the owner's unconfirmed paths are exactly what the dashboard and Hermes capacity review need to see.
- **Include everything with flags**: rejected, because `unavailable`/`removed` paths are noise for an orchestrator and inflate the payload.

## Consequences

- The Hermes serializer implements rules 1-5 as a single tested function; contract tests assert exclusion and flag behavior (Phase 6).
- The `accessible=true` filter on `GET /models` uses the same rule as `available = true` so UI and catalog never disagree.
- The invariant is clarified, not weakened: Hermes never receives archived, unavailable, or removed paths.

## Migration or rollback

Not applicable; rules are evaluated at serialization time. Changing the rule later only changes serializer behavior and tests.

## Related requirements

- `docs/00_PRODUCT_DECISIONS.md` invariant 10
- `docs/08_HERMES_INTEGRATION.md` catalog guarantees
- `contracts/hermes-catalog.schema.json` access item schema
- `docs/13_ACCEPTANCE_CRITERIA.md` Hermes section
