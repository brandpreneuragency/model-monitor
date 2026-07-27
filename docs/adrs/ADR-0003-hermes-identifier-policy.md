# ADR-0003: Hermes payload identifier policy

- Status: Accepted
- Date: 2026-07-18
- Decision owner: Lead architect

## Context

The Hermes catalog carries identifiers (`canonicalId`, `subscriptionId`, `providerModelId`) but the package never states which database value backs them. The worked example in `docs/08_HERMES_INTEGRATION.md` shows `"subscriptionId": "sub-opencode-go"`, which matches the seed file ID stored in `subscriptions.external_seed_id` — yet `external_seed_id` is nullable and only present for seed data, while primary keys are UUIDs. Hermes is an external consumer, so the choice is a contract decision.

## Decision

Identifiers exposed to Hermes are opaque strings:

1. `canonicalId` = `models.canonical_id` (already a stable public identity, e.g. `deepseek/v4-pro`).
2. `subscriptionId` = `subscriptions.external_seed_id` when present, otherwise `subscriptions.id` (UUID). Consumers must treat it as opaque; no semantics may be inferred from its shape.
3. `providerModelId` = `model_access.provider_model_id` (nullable; null stays null).
4. Internal UUIDs of users, API tokens, import jobs, and audit events are never exposed in Hermes payloads.
5. The main API (`/api/v1/models`, `/subscriptions`, …) continues to use UUID `id` fields; only the Hermes surface follows this policy.

## Alternatives considered

- **Always UUID**: uniform, but discards the readable seed identities the example and operator workflows already use, and makes Hermes logs harder to read.
- **Slug for subscriptions**: subscriptions have no slug column; adding one is schema churn for no consumer benefit.

## Consequences

- `external_seed_id` becomes API-visible for seeded subscriptions; it is treated as a stable public ID and must never be recycled for a different subscription.
- New subscriptions created through the UI expose their UUID; no backfill of seed-style IDs is required.
- The serializer and contract tests enforce the policy.

## Migration or rollback

If the policy is ever reversed, `subscriptionId` values change and Hermes caches must be invalidated by a catalog revision bump (ADR-0002). Documented as a breaking change requiring a `schemaVersion` bump.

## Related requirements

- `docs/08_HERMES_INTEGRATION.md` (example payload)
- `contracts/hermes-catalog.schema.json` (`subscriptionId`)
- `contracts/postgresql-schema.sql` (`subscriptions.external_seed_id`)
