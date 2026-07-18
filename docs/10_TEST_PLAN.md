# Test Plan

## Test pyramid

### Unit tests

- normalization functions
- alias matching
- tri-state parsing
- Excel date conversion
- score null handling
- subscription cost calculations
- availability calculation
- Hermes serialization
- token hashing
- export formula-injection protection

### Integration tests

- database constraints
- model CRUD
- archive/restore
- merge transaction
- audit creation
- import preview
- import commit and rollback
- API token scope
- access matrix query
- catalog filtering

### End-to-end tests

Use Playwright.

Critical flows:

1. Sign in with allow-listed account.
2. Reject non-allow-listed account.
3. Browse and filter models.
4. Create and edit a model.
5. Archive and restore a model.
6. Add an access relationship.
7. Edit a subscription.
8. Upload workbook and preview.
9. Resolve a conflict and commit.
10. Merge duplicate model.
11. Create Hermes token.
12. Retrieve Hermes catalog.
13. Export JSON and CSV.
14. Restore a backup into an empty database.

## Seed-data assertions

- 51 canonical models.
- 4 subscriptions.
- 19 confirmed access relationships.
- 276 benchmark evidence rows.
- base regular subscription total: USD 61/month.
- OpenCode and Command Code share canonical models without duplication.

## Import fixture tests

Use `source/LLM_MASTER_v2.xlsm`.

Assertions:

- macros are never executed
- 15 sheets discovered
- supported sheets parsed
- 31 populated `Master Models` rows detected
- roster count sourced from normalized records
- second import is idempotent
- blank Model IDs generate match proposals or conflicts
- provider/developer separation is preserved
- null price is not converted to zero

## Merge tests

- transfer all relationships
- deduplicate aliases
- deduplicate access records
- preserve benchmark results
- preserve source provenance
- archive merged source record
- full rollback on injected failure
- audit includes transfer counts

## Security tests

- unauthorized API returns 401
- wrong scope returns 403
- archived token returns 401
- token is not retrievable after creation
- uploaded non-workbook file rejected
- oversized workbook rejected
- formula injection neutralized in CSV/XLSX export
- imported script tags are escaped
- secrets absent from logs

## Performance tests

At minimum test:

- 5,000 models
- 50,000 benchmark results
- 20 subscriptions
- 500 access paths
- 100,000 audit events

Targets:

- model list p95 under 500 ms
- model detail p95 under 500 ms
- Hermes catalog p95 under 500 ms at seed scale
- import preview remains responsive with 10,000 rows

## Accessibility tests

- axe automated checks
- keyboard-only navigation
- screen-reader labels
- focus trap in dialogs
- non-color status indicators
- table header associations
- light and dark contrast

## Release evidence

Record evidence in `PROGRESS.md`:

- command
- date
- result
- relevant log or screenshot path
- unresolved issue
