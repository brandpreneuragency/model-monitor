# Information Architecture

## Primary navigation

1. Dashboard
2. Models
3. Subscriptions
4. Access Matrix
5. Benchmarks
6. Imports
7. Audit Log
8. Settings

## Route map

```text
/
├── /dashboard
├── /models
│   ├── /new
│   └── /[modelId]
│       ├── /edit
│       ├── /access/new
│       └── /history
├── /subscriptions
│   ├── /new
│   └── /[subscriptionId]
│       ├── /edit
│       └── /access/new
├── /providers
│   └── /[providerId]
├── /plans
│   └── /[planId]
├── /access-matrix
├── /benchmarks
│   └── /[benchmarkId]
├── /imports
│   ├── /new
│   └── /[importId]
├── /audit
├── /settings
│   ├── /general
│   ├── /scores
│   ├── /verification
│   ├── /api-tokens
│   ├── /backups
│   └── /danger
└── /api/v1
    ├── /health
    ├── /models
    ├── /subscriptions
    ├── /access
    └── /hermes/catalog
```

## Entity relationships in the UI

```text
Developer → Canonical Model
Access Provider → Plan → Personal Subscription
Canonical Model ↔ Model Access ↔ Plan
Canonical Model → Benchmark Results
Canonical Model → Scores
Any Entity → Sources
Any Mutable Entity → Audit Events
```

## Global interaction patterns

### Search

Global search should return grouped results:

- models
- model aliases
- subscriptions
- providers
- plans
- benchmarks

### Create menu

A global Create button offers:

- model
- subscription
- plan
- access record
- benchmark result
- source

### Status language

Use consistent labels:

- Active
- Current
- Preview
- Legacy
- Deprecated
- Retired
- Archived
- Needs recheck
- Unconfirmed access
- Mock usage

### Responsive behavior

Desktop is primary. On smaller screens:

- tables become card lists or support horizontal scrolling with sticky first column
- editing forms remain fully usable
- access matrix becomes a model-first drill-down
- no data field is removed solely for mobile
