# Product Requirements Document

## 1. Problem

LLM information is currently stored in a wide spreadsheet that combines canonical model identity, provider access, subscription pricing, usage limits, benchmarks, rankings, and recommendations. This makes duplicate models difficult to manage and prevents reliable programmatic consumption by Hermes.

The owner also has several subscriptions with different access methods and usage rules:

- ChatGPT Plus / Codex
- OpenCode Go
- SuperGrok
- Command Code Go

A private application is required to maintain this information over time and expose a clean catalog to Hermes.

## 2. Product objective

Create a trustworthy control panel that answers:

- Which canonical models exist?
- Which of them can the owner access now?
- Through which subscription or endpoint?
- What are their specifications, scores, benchmarks, and best uses?
- Which records are incomplete or stale?
- What subscriptions are active, what do they cost, and when do they renew?
- What normalized data can Hermes safely consume?

## 3. Users

### Owner

Needs full create, edit, archive, restore, merge, import, export, and administration capabilities.

### Hermes orchestrator

Needs a stable read-only API containing active models, capabilities, scores, access paths, and availability. Hermes must not receive private credentials or mutable administration endpoints.

## 4. Success metrics

### Data integrity

- 51 seed models import as 51 canonical records.
- Duplicate access paths do not create duplicate canonical models.
- All records contain import provenance.
- No permanent data loss occurs through normal UI actions.
- All mutations generate audit events.

### Usability

- A model is findable in under 10 seconds using search or filters.
- A subscription can be edited in under 60 seconds.
- A new access relationship can be created from either model or subscription detail.
- The access matrix displays all current relationships without horizontal ambiguity.
- Import conflicts are understandable before commit.

### Integration

- Hermes catalog endpoint responds in under 500 ms for the seed dataset on the VPS.
- API contract is versioned and covered by contract tests.
- Invalid or archived access paths are not exposed as available.

## 5. Functional requirements

### FR-01 Authentication

- Google OAuth.
- Only allow-listed email addresses may access the application.
- Unauthorized accounts are denied after OAuth callback.
- Sessions use secure, HTTP-only cookies.
- The first allow-listed user becomes the owner.

### FR-02 Dashboard

Display:

- active subscriptions
- regular monthly fixed cost
- current paid monthly cost
- canonical model count
- accessible model count
- models needing recheck
- upcoming renewals
- models with multiple access paths
- recently updated records
- mock/manual usage state

### FR-03 Model library

- Search by name, ID, alias, developer, family, or access provider.
- Filter by lifecycle, capability, vision, reasoning, developer, access provider, subscription, verification state, and score range.
- Sort and hide columns.
- Save personal table views.
- Add, edit, archive, restore, duplicate, and merge models.
- Bulk archive, tag, and mark for recheck.
- Export selected records.

### FR-04 Model detail

Sections:

1. identity
2. lifecycle
3. technical specifications
4. capabilities
5. factor scores
6. composite scores and ranks
7. benchmark evidence
8. access paths
9. best-use guidance
10. sources
11. revision history

### FR-05 Subscription management

- Manage providers, plans, and personal subscriptions separately.
- Record regular price, introductory price, actual current price, currency, cycle, next billing date, auto-renew state, and notes.
- Record authentication and API access type.
- Record manual usage check instructions.
- Support structured limit rules and free-form notes.
- Associate plans with models through access records.

### FR-06 Access matrix

- Rows: canonical models.
- Columns: active subscriptions or plans.
- Cell states: available, unconfirmed, unavailable, removed, archived.
- Cell click opens the access record.
- Filters for developer, plan, and availability.
- Do not infer access solely from the canonical developer.

### FR-07 Benchmarks and scores

- Store raw benchmark evidence separately from normalized factor scores.
- Preserve benchmark version, setting, harness, unit, comparable group, source, and verification date.
- Do not compare results across different comparable groups.
- Store score methodology version.
- Permit manual override only with an explicit reason.
- Retain score history.

### FR-08 Sources and verification

- A source may be attached to any entity.
- Sources include URL, publisher, type, retrieval date, verification date, and notes.
- Models can be marked `needs_recheck`.
- Unknown values remain null.
- Verification warnings appear when a configured interval is exceeded.

### FR-09 Archive, restore, and merge

- Normal deletion archives the record.
- Archived records remain visible through an explicit filter.
- Merge transfers aliases, access paths, benchmarks, scores, and sources to the selected canonical record.
- Merge runs in one database transaction.
- Merge creates a detailed audit event.
- Permanent deletion is limited to unreferenced records or an advanced confirmed cascade.

### FR-10 Workbook import

- Upload `.xlsx` or `.xlsm`.
- Parse supported sheets.
- Show import preview.
- Normalize model and provider names.
- Detect duplicates and conflicts.
- Allow manual match decisions.
- Commit only after confirmation.
- Retain original file metadata and an import log.
- Roll back the entire import when commit fails.

### FR-11 Export

- Export model catalog as JSON.
- Export selected tables as CSV.
- Export normalized workbook as XLSX.
- Export Hermes catalog JSON.
- Export full backup separately from data exports.

### FR-12 Audit history

Audit:

- create
- update
- archive
- restore
- merge
- import
- export
- settings change
- API token creation/revocation

Each event stores actor, entity, action, before state, after state, timestamp, and request metadata where available.

### FR-13 Hermes API

- Read-only.
- Versioned under `/api/v1`.
- Token authenticated.
- Scope limited to `catalog:read`.
- Never returns OAuth tokens, provider keys, billing secrets, internal notes marked private, or user identity data.
- Provides ETag or `updatedAt` for cache validation.

### FR-14 Usage placeholders

- Manual usage entries.
- Mock usage fixture for development.
- Structured future tables for provider-reported and Hermes-estimated usage.
- Every usage item identifies whether it is mock, manual, estimated, or provider-reported.
- Mock records must be visually labeled.

## 6. Non-functional requirements

### Reliability

- Database writes use transactions.
- Import and merge operations are idempotent where possible.
- Daily database backup.
- Health endpoint for web and database.
- Error boundary and structured logging.

### Performance

- Server-side pagination for tables.
- Search response under 500 ms for seed scale.
- Avoid loading all benchmark evidence into initial model-list requests.
- Hermes catalog may be cached for 60 seconds.

### Security

- No provider credentials stored during MVP.
- Secrets only in environment variables.
- CSRF-safe authentication flows.
- Rate limit API token endpoints.
- Prevent spreadsheet formula injection in exports.
- Validate uploaded file type and size.
- Sanitize untrusted text before rendering.

### Accessibility

- WCAG 2.1 AA target.
- Keyboard-accessible tables and dialogs.
- Visible focus states.
- Status is not communicated through color alone.
- Light and dark themes.

## 7. Assumptions

- Single owner in MVP.
- Domain is configured after local implementation.
- Subscription renewal dates may be unknown.
- Current usage is manually entered or mocked.
- Routing policies are implemented later.
- Workbook data is valuable but not perfectly normalized.

## 8. Release criteria

All acceptance criteria in `13_ACCEPTANCE_CRITERIA.md` must pass, including a restore test on an empty database and a Hermes contract test.
