# Hermes Integration Contract

## MVP objective

Provide Hermes with a clean, read-only representation of the model catalog and current access paths. Hermes routing logic is not implemented in Model Monitor during the MVP.

## Authentication

- Bearer token
- scope: `catalog:read`
- token stored hashed
- token displayed once
- optional expiry
- revocable in Settings

## Primary endpoint

`GET /api/v1/hermes/catalog`

## Catalog guarantees

- Each canonical model appears once.
- Access paths are nested under the model.
- Only active, non-archived subscriptions and access records are marked available.
- Unknown capabilities are null.
- Scores include methodology version.
- Mock or manual usage is explicitly labeled.
- No provider secret or OAuth token is returned.

## Suggested cache behavior

- `ETag`
- `Last-Modified`
- `Cache-Control: private, max-age=60`
- return `304 Not Modified` when appropriate

## Minimum catalog fields

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-07-18T03:00:00+03:00",
  "catalogRevision": 1,
  "models": [
    {
      "canonicalId": "deepseek/v4-pro",
      "name": "DeepSeek V4 Pro",
      "developer": "DeepSeek",
      "lifecycle": "current",
      "capabilities": {
        "vision": null,
        "reasoning": true,
        "tools": true,
        "parallelAgents": null
      },
      "technical": {
        "contextTokens": null,
        "maxOutputTokens": null,
        "speedRating": null
      },
      "scores": {
        "capability": {
          "value": 0,
          "methodologyVersion": "session-6"
        }
      },
      "access": [
        {
          "subscriptionId": "sub-opencode-go",
          "provider": "OpenCode",
          "plan": "OpenCode Go",
          "available": true,
          "accessMethod": "provider_api",
          "apiCompatible": true,
          "cliOnly": false
        }
      ],
      "verification": {
        "verifiedAt": null,
        "needsRecheck": false
      }
    }
  ]
}
```

The numeric score above is illustrative only. Production exports must omit unknown scores or return null, never a fabricated zero.

## Future routing fields

The schema should later support:

- task categories
- policy weights
- minimum capability thresholds
- quota reserve thresholds
- privacy constraints
- maximum cost
- escalation chains
- retry behavior
- provider health
- historical success rate

Do not implement these fields as hard-coded model columns. Use versioned routing policies and routing runs.

## Hermes failure behavior

- If Model Monitor is unavailable, Hermes should use its last valid cached catalog.
- An expired catalog should generate a warning, not silently route.
- A model with no active access path must not be selected.
- A mock usage snapshot must not be treated as authoritative quota truth.
