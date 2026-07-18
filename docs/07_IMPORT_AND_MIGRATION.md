# Workbook Import and Migration

## Source workbook

`source/LLM_MASTER_v2.xlsm`

## Confirmed source characteristics

- 15 sheets
- locked roster of 51 canonical models
- 276 benchmark evidence rows
- 76 columns in `Master Models`
- 31 populated rows in `Master Models`
- duplicate access-provider rows in the master sheet
- developer and access provider mixed in the same field
- subscription prices repeated at model-row level

## Production source priority

1. `Expansion Scope` and `Baseline Reference` for roster identity.
2. `Google Model Data`, `Mistral & Nemotron Data`, and `Session 5 Model Data` for canonical technical details.
3. `Master Models` for populated scores, ranks, usage estimates, best-use guidance, and verification fields.
4. `Benchmarks` for raw evidence.
5. `Provider Limits` for provider-level pricing and limits.
6. `Methodology & Sources` for methodology and source metadata.
7. `Model Router` as a historical snapshot only.
8. Handoff sheets are not production records.

## Import pipeline

### 1. File intake

- Accept XLSX and XLSM.
- Reject password-protected files.
- Limit file size through configuration.
- Calculate SHA-256.
- Save the original file outside the public web root.
- Create an `import_jobs` record.

### 2. Parse

- Read only known sheets by default.
- Capture sheet name, row number, and column for provenance.
- Preserve raw values.
- Convert Excel serial dates.
- Normalize empty strings to null.
- Guard against formulas beginning with `=`, `+`, `-`, or `@` when exporting.

### 3. Normalize

- Trim whitespace.
- Normalize provider naming and casing.
- Resolve aliases.
- Create stable slugs.
- Parse tri-state booleans.
- Preserve raw lifecycle labels.
- Separate developer, access provider, plan, and personal subscription.
- Never interpret missing numeric cost as zero.

### 4. Match

Match in this order:

1. exact canonical ID
2. normalized alias
3. normalized name plus developer
4. family plus generation plus developer
5. manual review

An access-specific endpoint ID may match `model_access.provider_model_id` rather than `models.canonical_id`.

### 5. Detect conflicts

Conflict types:

- canonical identity collision
- alias collision
- developer mismatch
- lifecycle mismatch
- newer local value versus older imported value
- access provider incorrectly treated as developer
- duplicated plan-model relationship
- benchmark comparable-group mismatch
- score methodology mismatch
- destructive blank overwrite

### 6. Preview

Preview must be read-only and display:

- proposed creates
- proposed updates
- unchanged records
- duplicates
- conflicts
- errors
- skipped rows

### 7. Resolve

Store conflict decisions before commit:

- keep existing
- use imported
- merge
- create separate access endpoint
- ignore row
- defer

### 8. Commit

- Require explicit confirmation.
- Use a single transaction for each import job.
- Use idempotency key.
- Write import provenance.
- Write audit events.
- Roll back all changes on failure.
- Mark import committed only after successful transaction.

## Initial migration strategy

Use the normalized package seeds rather than importing the workbook directly on first boot:

1. Seed developers and access providers.
2. Seed 51 canonical models from `canonical-models.seed.json`.
3. Seed aliases.
4. Seed four subscriptions.
5. Seed 19 model-access records.
6. Seed benchmark evidence.
7. Seed historical router snapshot.
8. Retain the workbook as import fixture.
9. Run an import preview against the same workbook.
10. Confirm the preview produces no unexpected duplicate canonical models.

## Duplicate examples

### MiMo V2.5

The following identify one canonical model:

- `MiMo-V2.5`
- `MiMo V2.5`
- `mimo-v2.5`
- OpenCode access row
- OpenCode Zen access row

### DeepSeek V4 Pro

One canonical model may have:

- OpenCode Go access
- Command Code Go access
- future direct API access

### Nemotron 3 Ultra

NVIDIA is the developer. OpenCode Zen or NVIDIA NIM may be access providers.

## Import acceptance tests

- The normalized seed produces 51 models.
- Reimport does not create model 52.
- Command Code rows create access relationships, not duplicate models.
- Empty Model ID rows are matched by alias or held for review.
- Subscription prices are not written to models.
- Benchmark rows retain comparable groups and source URLs.
- Null prices remain null.
- Import rollback leaves no partial rows.
