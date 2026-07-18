# Contract Discrepancy List

- Date: 2026-07-18
- Scope: `contracts/postgresql-schema.sql`, `contracts/openapi.yaml`, `contracts/hermes-catalog.schema.json`, cross-checked against `docs/*` and `data/*`.
- Method: every discrepancy is either (a) fixed directly in the contract, (b) resolved by ADR, or (c) deferred to a named implementation issue. No silent choices.

Severity legend:

- **B — Blocker**: breaks seed load, import, or a core invariant if left as-is
- **H — High**: contract incorrect or incomplete against higher-tier sources
- **M — Medium**: consistency/clarity defect with workaround
- **L — Low**: documentation-level note

---

## Resolved by ADR

| ID | Sev | Discrepancy | Resolution |
|---|---|---|---|
| CD-01 | B | `docs/03` declares `model_scores` unique on `(model_id, methodology_id, score_type, calculated_at)`; the SQL contract omitted the constraint (lookup index only). Without it, reimport can silently duplicate score rows and corrupt "current score" reads. | **ADR-0006**; constraint added to SQL contract. |
| CD-02 | B | `import_jobs.UNIQUE(sha256, parser_version, idempotency_key)` with nullable `idempotency_key` — PostgreSQL treats NULLs as distinct, so unlimited duplicate imports of the same file+parser pass the constraint, violating the `docs/03` uniqueness rule and the "second import is idempotent" criterion. | **ADR-0005**; column now `NOT NULL DEFAULT ''`; duplicate upload → 409. |
| CD-03 | B | `model_aliases.normalized_alias` declared globally unique, but the authoritative seed contains `MiMo-V2.5` (display_name) and `mimo-v2.5` (provider_id) for the same model, which collide under any case-insensitive normalization (verified). The v1.0 contract made the seed unloadable. | **ADR-0007**; uniqueness rescoped to `(model_id, normalized_alias)` + lookup index; cross-model claims become import conflicts. |
| CD-05 | H | Hermes schema requires `catalogRevision` (integer ≥ 1) and docs require ETag/Last-Modified, but the DB contract has no revision source. | **ADR-0002**; `app_settings` counter bumped transactionally by the mutation/audit boundary; ETag `"mm-catalog-<rev>"`. |
| CD-06 | H | Product invariant 10 ("Hermes receives only active, explicitly available access paths") conflicts with the Hermes schema carrying `availability` incl. `unavailable`/`removed` plus an `available` flag. | **ADR-0001**; include confirmed+unconfirmed, exclude unavailable/removed/archived; flag rule defined; `accessible=true` filter reuses it. |
| CD-07 | H | `docs/05` lists 4 Hermes endpoints; `docs/08` and the Hermes JSON Schema define only the catalog. The other three endpoints have no payload contract. | **ADR-0004**; MVP surface = `/hermes/catalog` only; `docs/05` annotated. |
| CD-13 | H | Hermes `subscriptionId` backing value undefined: example uses seed ID `sub-opencode-go` (i.e. `external_seed_id`), DB PK is UUID, `external_seed_id` nullable. | **ADR-0003**; opaque identifier policy (external_seed_id when present, else UUID). |

## Fixed directly in the contracts (v1.1)

| ID | Sev | Discrepancy | Fix |
|---|---|---|---|
| CD-04 | B | No storage for the historical router snapshot, although product decision 12, `docs/07` step 7, `data/router-snapshot.seed.json`, and the column mapping (`router_snapshot.task_name`) all require it. | `router_snapshots` table added (raw payload + provenance, `import_jobs` FK). |
| CD-08 | H | `openapi.yaml` (12 paths) omitted ~17 endpoints required by `docs/05` and tier-2 acceptance criteria: model history, subscription restore, model-access PATCH/DELETE, benchmarks list, benchmark-results create/patch, model scores list/create, import resolve/cancel, all four exports, saved views. XLSX export (FR-11) was missing from `docs/05` too. | OpenAPI v1.1: 29 paths, all endpoints declared; `GET /exports/models.xlsx` added; `docs/05` exports list annotated. |
| CD-09 | H | `/hermes/catalog` declared only 200/304, but security docs require 401 (invalid/expired/revoked token), 403 (wrong scope), and rate limiting (429). | Responses added in OpenAPI v1.1. |
| CD-10 | M | Collection shapes inconsistent: `/models` used `{data,page}`, while subscriptions/model-access/audit returned bare arrays; `docs/05`'s envelope includes `meta.requestId`, which `ModelCollection` lacked. | Unified `{data,page,meta}` envelope via `Page`/`CollectionMeta` components across all collections. |
| CD-11 | M | `/models` query params covered only 7 of the 17 filters `docs/05` defines (missing family, subscription, accessProvider, vision, reasoning, toolSupport, needsRecheck, verifiedBefore, minimumCapabilityScore, minimumContextTokens, sort). | All params declared; tri-state capability filters use `'true'/'false'/'unknown'`. |
| CD-12 | M | `benchmarks.UNIQUE(name, version, comparable_group)` allows duplicate definitions when `version`/`comparable_group` are NULL (Postgres NULLs-distinct), and seed analysis shows definitions should key on `(name, comparable_group)` with `version = NULL` ("Version / Setting" is result-level `setting`; 276 rows → 127 definitions). | `UNIQUE NULLS NOT DISTINCT (name, version, comparable_group)`; mapping rule recorded in `docs/16` §6.7. |
| CD-14 | M | Capability naming/shape mismatch: DB `tool_use` vs Hermes `tools`; DB has 5 more flags (`computer_use`, `audio_input`, `video_input`, `image_input`, `structured_output`, `function_calling`) than the Hermes schema, whose `additionalProperties: false` forbids emitting them. | No schema change; serializer whitelist + `tool_use→tools` mapping mandated (`docs/16` §5.5, issue MM-050). |
| CD-15 | L | `sessionAuth` hardcodes cookie `authjs.session-token`; production Auth.js uses the `__Secure-` prefix. | Description note added to the security scheme. |
| CD-16 | L | `Model.status` schema used `enum` without `type`. | `type: string` added. |
| CD-17 | M | AGENTS.md requires explicit indexes for list/filter/history queries; the v1.0 contract lacked indexes on `models(status)`, `models(developer_id)`, `model_access(model_id|plan_id)`, `model_access_pricing(model_access_id)`, `subscriptions(owner_user_id)`, `subscription_limit_rules(subscription_id)`, `import_conflicts(import_job_id)`, and the alias lookup. | Indexes added to SQL contract. |
| CD-24 | H | FR-03 "Save personal table views" and Phase 5 "saved table views" had no storage (no table, no endpoint). | `saved_views` table + `/saved-views` endpoints added. Model tags use the approved `models.metadata.tags` array of `{slug, label}` objects; the existing JSONB column avoids another table. |

## Documented behavior (no contract change) and deferred items

| ID | Sev | Item | Handling |
|---|---|---|---|
| CD-18 | L | Route-map mismatch: `docs/02` shows `/api/v1/access`; `docs/05` and the contract use `/model-access`. | `/model-access` wins (contract, tier 4); noted for Phase 1 routing. |
| CD-19 | M | Vocabulary mismatch: FR-06 matrix cell states are "available, unconfirmed, unavailable, removed, archived" vs DB enum `confirmed, unconfirmed, unavailable, removed` + record status. | UI mapping: `confirmed` → "Available"; "Archived" cell derives from `model_access.status`. Glossary lives in the access-matrix issue (MM-028); no schema change. |
| CD-20 | M | `mock-usage.seed.json` fields `remainingPercent`, `status` have no columns; `source` column absent. | Seed runner maps `usedPercent→used_percent`, sets `source='mock'`, `unit='percent'`, preserves extras in `raw_payload` (`docs/16` §6.8). |
| CD-21 | H | Seed scores carry no methodology version, but Hermes requires `methodologyVersion` on every emitted score and docs/13 requires it visible. | Seed runner creates methodology `{name: "factor-model", version: "session-6"}` and attaches all seed scores (`docs/16` §6.6, MM-006). |
| CD-22 | M | `model-access.seed.json` references **subscriptions**; `model_access` references **plans**. | Seed runner resolves subscription→plan (1:1 in the seed set; verified 19/19 resolvable). Rule recorded in `docs/16` §6.5. |
| CD-23 | M | `subscriptions.status` enum mixes lifecycle states with `archived`, unlike other entities that use `record_status` + `archived_at`. | Archive rule documented: archive sets `status='archived'` **and** `archived_at`; queries filter on `status <> 'archived'`. No schema change (enum serves double duty acceptably for one entity). |
| CD-25 | L | `docs/00`/`docs/01` KPI "regular monthly fixed cost" source field unnamed (plan list price vs subscription actual). | Dashboard service defines: regular = Σ active subscriptions' plan `regular_price` (normalized to monthly); current = Σ `actual_price`. Issue MM-030. |

## Sources checked

- `contracts/postgresql-schema.sql` (v1.0 → v1.1)
- `contracts/openapi.yaml` (12 → 29 paths)
- `contracts/hermes-catalog.schema.json` (no changes required)
- `docs/00`–`docs/15`, AGENTS.md, README.md
- All 9 files under `data/` (counts and shapes verified programmatically; evidence in `docs/16` §11)
