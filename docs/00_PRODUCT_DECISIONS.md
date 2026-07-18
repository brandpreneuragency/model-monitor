# Product Decisions

## Product identity

| Decision | Value |
|---|---|
| Product | Model Monitor |
| Repository | `model-monitor` |
| Primary user | One owner |
| Secondary consumer | Hermes orchestrator |
| Domain | To be selected |
| Default timezone | Europe/Istanbul |
| Default currency | USD |

## MVP scope

### Included

- Private authentication
- Dashboard
- Canonical model library
- Model details and CRUD
- Subscription and plan management
- Model-access management
- Access matrix
- Benchmark and score display
- Sources and verification dates
- Archive, restore, and merge
- Full audit history
- Workbook import preview and commit
- JSON, CSV, and Excel exports
- Manual/mock usage status
- Read-only Hermes API
- Database backups

### Postponed

- Live usage APIs
- Billing synchronization
- Automated model discovery
- Automatic benchmark research
- Routing policy editor
- Automated routing
- Quota-aware failover
- Cost attribution by agent or project
- Alerts and notifications
- Provider outage monitoring
- Multi-user permissions

## Core invariants

1. A canonical model exists once, regardless of how many providers expose it.
2. A provider plan may expose many models.
3. A model may be exposed by many plans.
4. Subscription cost belongs to a subscription or plan, never to a model.
5. Endpoint token pricing belongs to an access record, not to the canonical model.
6. Missing values remain unknown; they are never silently converted to zero or false.
7. Every imported value retains provenance.
8. Every mutation is auditable.
9. Archiving is the default removal behavior.
10. Hermes receives only active, explicitly available access paths.
11. Workbook summary counts are advisory; normalized database counts are authoritative.
12. Historical router recommendations are imported as snapshots, not executable policies.

## Out-of-scope design constraint

The database and API must be routing-ready, but no production routing logic is implemented in the MVP. The future router must be able to consume model capabilities, scores, access availability, usage status, and policy records without schema redesign.
