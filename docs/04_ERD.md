# Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ SUBSCRIPTIONS : owns
    USERS ||--o{ API_TOKENS : creates
    DEVELOPERS ||--o{ MODELS : develops
    ACCESS_PROVIDERS ||--o{ PLANS : offers
    PLANS ||--o{ SUBSCRIPTIONS : purchased_as
    MODELS ||--o{ MODEL_ALIASES : has
    MODELS ||--|| MODEL_CAPABILITIES : has
    MODELS ||--o{ MODEL_ACCESS : exposed_by
    PLANS ||--o{ MODEL_ACCESS : includes
    MODEL_ACCESS ||--o{ MODEL_ACCESS_PRICING : priced_as
    SUBSCRIPTIONS ||--o{ SUBSCRIPTION_LIMIT_RULES : limited_by
    SUBSCRIPTIONS ||--o{ USAGE_SNAPSHOTS : measured_by
    MODELS ||--o{ MODEL_SCORES : scored_by
    SCORE_METHODOLOGIES ||--o{ MODEL_SCORES : defines
    BENCHMARKS ||--o{ MODEL_BENCHMARK_RESULTS : contains
    MODELS ||--o{ MODEL_BENCHMARK_RESULTS : receives
    IMPORT_JOBS ||--o{ IMPORT_CONFLICTS : detects
    IMPORT_JOBS ||--o{ IMPORT_PROVENANCE : creates
    MODELS ||--o{ IMPORT_PROVENANCE : sourced_from
    AUDIT_EVENTS }o--|| USERS : acted_by
```

## Ownership boundaries

- Models do not own subscriptions.
- Plans do not represent personal billing state.
- Subscription limits belong to personal subscriptions unless explicitly global to a plan.
- Model access is the only supported connection between a canonical model and a plan.
- Scores and benchmarks are independent evidence layers.
