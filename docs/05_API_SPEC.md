# API Specification

The machine-readable contract is `contracts/openapi.yaml`.

## API principles

- Base path: `/api/v1`
- JSON only
- ISO 8601 timestamps
- Cursor pagination for large collections
- Stable IDs; slugs are convenience fields
- Zod validation at the boundary
- Structured errors
- Idempotency keys for import commit and merge operations
- ETag support for Hermes catalog
- Read-only Hermes token scope

## Error shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be processed.",
    "fieldErrors": {
      "name": ["Name is required."]
    },
    "requestId": "req_..."
  }
}
```

## Collection response

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

## Required endpoints

### Models

- `GET /models`
- `POST /models`
- `GET /models/{modelId}`
- `PATCH /models/{modelId}`
- `DELETE /models/{modelId}` — archive
- `POST /models/{modelId}/restore`
- `POST /models/merge`
- `GET /models/{modelId}/history`

### Subscriptions

- `GET /subscriptions`
- `POST /subscriptions`
- `GET /subscriptions/{subscriptionId}`
- `PATCH /subscriptions/{subscriptionId}`
- `DELETE /subscriptions/{subscriptionId}` — archive
- `POST /subscriptions/{subscriptionId}/restore`

### Access

- `GET /model-access`
- `POST /model-access`
- `PATCH /model-access/{accessId}`
- `DELETE /model-access/{accessId}` — archive
- `GET /access-matrix`

### Benchmarks and scores

- `GET /benchmarks`
- `POST /benchmark-results`
- `PATCH /benchmark-results/{resultId}`
- `GET /models/{modelId}/scores`
- `POST /models/{modelId}/scores`

### Import

- `POST /imports/preview`
- `GET /imports/{importId}`
- `POST /imports/{importId}/resolve`
- `POST /imports/{importId}/commit`
- `POST /imports/{importId}/cancel`

### Audit and exports

- `GET /audit-events`
- `GET /exports/models.json`
- `GET /exports/models.csv`
- `GET /exports/models.xlsx`
- `GET /exports/hermes.json`

### Hermes

- `GET /hermes/catalog`

Post-MVP candidates (not part of the MVP surface — see ADR-0004):

- `GET /hermes/models/{canonicalId}`
- `GET /hermes/subscriptions`
- `GET /hermes/access`

## Filtering conventions

Example:

```text
GET /models?search=deepseek&developer=deepseek&accessible=true&needsRecheck=false&sort=-scores.capability
```

Supported model filters:

- search
- developer
- family
- lifecycle
- archived
- accessible
- subscription
- accessProvider
- vision
- reasoning
- toolSupport
- needsRecheck
- verifiedBefore
- minimumCapabilityScore
- minimumContextTokens

## Hermes catalog behavior

The catalog includes:

- canonical identity
- normalized capabilities
- current scores
- active access paths
- access restrictions
- manual/mock usage status
- verification metadata

It excludes:

- private account labels unless explicitly allowed
- credentials
- OAuth details
- billing payment data
- audit events
- raw imported files
- private notes

## API token requirements

- Store only a hash.
- Display token once at creation.
- Prefix tokens for identification.
- Support expiry and revocation.
- Scopes: initially only `catalog:read`.
- Rate limit by token.
