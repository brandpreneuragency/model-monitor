# Risks and Open Items

## Known risks

### Workbook inconsistency

The workbook declares 51 models but the master sheet contains 31 populated rows. Mitigation: use normalized roster sheets and seed data as identity source.

### Provider versus developer ambiguity

Mitigation: separate entities and require explicit mapping during import.

### Subscription limits are heterogeneous

Mitigation: use structured limit rules plus raw notes. Do not force all limits into request counts.

### Consumer subscription access may change

Mitigation: record verification dates and access type; do not assume subscription authentication equals a general API.

### Score methodology evolution

Mitigation: version methodologies and score records. Do not overwrite historical calculations.

### Future routing may require more operational telemetry

Mitigation: retain flexible usage and policy tables, but avoid prematurely implementing routing logic.

## Open items that do not block MVP

- production domain
- exact renewal dates for OpenCode, SuperGrok, and Command Code
- live usage integration feasibility
- Hermes routing policy design
- provider credential storage approach
- notification channel
- long-term backup destination
- whether normalized XLSX export must mimic the original workbook styling
