# Data Model Specification

## Design approach

Use a normalized relational core with JSONB only for extensible metadata. Canonical model identity, plans, personal subscriptions, access relationships, benchmark evidence, and score history remain explicit tables.

## Core entities

### User

The owner account. The schema retains a user ID even though the MVP is single-user.

### Developer

Organization responsible for creating a model, such as OpenAI, Anthropic, DeepSeek, Xiaomi, NVIDIA, Google, or xAI.

### Access Provider

Service through which a model is accessed, such as ChatGPT/Codex, OpenCode, Command Code, Grok, OpenRouter, or NVIDIA NIM.

### Plan

Commercial or free package offered by an access provider.

### Subscription

The owner's actual account-level purchase of a plan.

### Model

One canonical model identity. Provider-specific endpoint identifiers are not necessarily canonical model IDs.

### Model Alias

Alternative display names, historical IDs, short names, or access-specific names used during import and search.

### Model Access

A relationship between a canonical model and a plan. Contains access method, provider endpoint ID, availability, pricing, and limitations.

### Subscription Limit Rule

Structured or semi-structured quota rule, including rolling windows, monthly allowance, credit amount, or request range.

### Model Capability

Stable capability flags plus details. Unknown is represented by null.

### Score Methodology

Versioned definition of score factors and weights.

### Model Score

A model's score and optional rank under a methodology version.

### Benchmark

Definition of an evidence benchmark and comparable group.

### Benchmark Result

Raw model result, setting, harness, score, source, and verification date.

### Source

Provenance linked to any supported entity.

### Import Job

Uploaded file, parser version, preview statistics, status, and commit result.

### Import Conflict

Unresolved match or field conflict discovered during preview.

### Audit Event

Immutable record of a mutation.

### API Token

Hashed, scoped token used by Hermes.

### Usage Snapshot

Manual, mock, estimated, or provider-reported usage state. Included as an MVP placeholder.

## Critical uniqueness constraints

- `models.canonical_id`
- `(model_aliases.model_id, model_aliases.normalized_alias)` — scoped per model; see ADR-0007
- `developers.slug`
- `access_providers.slug`
- `(plans.access_provider_id, plans.slug)`
- `(model_access.model_id, model_access.plan_id, model_access.provider_model_id)`
- `(model_scores.model_id, model_scores.methodology_id, model_scores.score_type, model_scores.calculated_at)` — enforced in contract v1.1; see ADR-0006
- API token prefix
- import file checksum plus parser version, unless the user explicitly reimports — enforced via non-null idempotency key; see ADR-0005

## Null semantics

- `null` means unknown or not supplied.
- `false` means explicitly unsupported.
- `0` means a verified numeric zero.
- Empty strings must be normalized to null.
- Free-tier pricing may be zero only when the access path is explicitly a hosted free tier.
- Self-hosting cost must not be represented as zero API price.

## Lifecycle model

Store both:

- normalized lifecycle enum
- raw lifecycle label

Recommended enum:

```text
current
ga
preview
beta
legacy
deprecated
retired
unavailable
unknown
```

## Score model

Do not add a new database column for every score type. Use `model_scores` with:

- score type
- score value
- optional rank
- methodology version
- confidence
- manual override flag
- calculated timestamp

The UI may pivot score records into columns.

## Pricing model

Endpoint token pricing belongs to `model_access_pricing`, because the same canonical model may have different prices through different access providers.

Subscription fixed cost belongs to `subscriptions`.

Plan list price belongs to `plans`.

## Usage model

A future usage ingestion system should write immutable events and periodic snapshots. The MVP only requires snapshots, but the schema reserves:

- source type
- period start/end
- amount used
- amount remaining
- unit
- confidence
- raw payload
- model, subscription, agent, and project references

## Provenance model

Every imported record should retain:

- import job ID
- source sheet
- source row
- source column where practical
- source URL where available
- verified date
- original raw value for conflict review

## Merge behavior

When model A is merged into model B:

1. Lock both rows.
2. Verify B is active.
3. Transfer aliases.
4. Repoint access records.
5. Repoint benchmark results.
6. Repoint scores.
7. Repoint sources.
8. Resolve unique conflicts using explicit rules.
9. Archive A with `merged_into_model_id = B`.
10. Write one audit event containing the transfer summary.
11. Commit as one transaction.
