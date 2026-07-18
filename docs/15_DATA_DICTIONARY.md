# Data Dictionary

The executable field contract is in `contracts/postgresql-schema.sql`.

## Model identity

| Field | Meaning |
|---|---|
| `canonical_id` | Stable public or internally normalized identity |
| `name` | Human-readable canonical name |
| `developer_id` | Organization that created the model |
| `family` | Model family |
| `generation` | Generation or version label |
| `lifecycle` | Normalized lifecycle |
| `lifecycle_raw` | Exact source wording |
| `merged_into_model_id` | Canonical target after a merge |

## Technical fields

| Field | Meaning |
|---|---|
| `context_tokens` | Maximum supported context, when verified |
| `max_output_tokens` | Maximum output, when verified |
| `speed_rating` | Qualitative speed |
| `verified_tps` | Verified token throughput, nullable |
| `model_type` | Architecture/classification |
| `knowledge_cutoff` | Text because sources may not provide a complete date |

## Subscription fields

| Field | Meaning |
|---|---|
| `plan_id` | Commercial package definition |
| `account_label` | Owner-facing account name |
| `actual_price` | Current amount paid |
| `next_billing_date` | Next known charge date |
| `auto_renews` | Explicit renewal state; null if unknown |
| `usage_tracking_mode` | manual, mock, estimated, provider-reported, or hybrid |

## Access fields

| Field | Meaning |
|---|---|
| `model_id` | Canonical model |
| `plan_id` | Plan that exposes it |
| `provider_model_id` | Endpoint-specific identifier |
| `availability` | confirmed, unconfirmed, unavailable, or removed |
| `access_method` | OAuth, provider API, direct API, CLI, consumer app, web, self-hosted |
| `api_compatible` | Whether Hermes-compatible API calls are supported |
| `cli_only` | Access is limited to CLI |
| `web_only` | Access is limited to web/consumer UI |

## Evidence fields

| Field | Meaning |
|---|---|
| `comparable_group` | Exact group in which benchmark values can be compared |
| `setting` | Benchmark version/configuration |
| `harness` | Agent or scaffold used |
| `verified_at` | Last verification timestamp |
| `needs_recheck` | Record should be revalidated |

## Audit fields

| Field | Meaning |
|---|---|
| `before_data` | State before mutation |
| `after_data` | State after mutation |
| `metadata` | Transfer counts, import IDs, request details excluding secrets |
