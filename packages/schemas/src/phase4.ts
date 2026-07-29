import { z } from "zod";
import { uuidSchema, requiredTrimmedString } from "./primitives";

// ── Formula-like text detection / neutralization ─────────────────
// Per product rules: spreadsheet formulas are never executed, and
// formula-like export values are neutralized so they open as literal
// text in spreadsheet software.

const FORMULA_PREFIX_SET = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * True when a string starts with a spreadsheet formula prefix
 * (=, +, -, @, tab, carriage return).
 */
export function isFormulaLike(value: string): boolean {
  if (value.length === 0) return false;
  const first = value[0];
  return first !== undefined && FORMULA_PREFIX_SET.has(first);
}

/**
 * Neutralize formula-like text by prepending a single-quote prefix so
 * spreadsheet software treats the value as literal text.
 * null/undefined stay null; empty string stays empty.
 */
export function neutralizeFormulaText(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  if (value.length === 0) return value;
  return isFormulaLike(value) ? `'${value}` : value;
}

/**
 * Recursively neutralize all string values in an export record.
 * Handles nested objects; arrays are mapped depth-first.
 * Never executes workbook macros or formulas.
 */
export function neutralizeExportRow<T extends Record<string, unknown>>(
  row: T,
): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string") {
      out[key] = neutralizeFormulaText(value);
    } else if (value !== null && typeof value === "object") {
      if (Array.isArray(value)) {
        const items: unknown[] = value;
        out[key] = items.map((item: unknown) =>
          item !== null && typeof item === "object" && !Array.isArray(item)
            ? neutralizeExportRow(item as Record<string, unknown>)
            : typeof item === "string"
              ? neutralizeFormulaText(item)
              : item,
        );
      } else {
        out[key] = neutralizeExportRow(value as Record<string, unknown>);
      }
    } else {
      out[key] = value;
    }
  }
  return out as unknown as T;
}

// ── Upload metadata ──────────────────────────────────────────────
// Validated file-intake payload. The server enforces size and type
// constraints; SHA-256 enables early duplicate detection.

export const importUploadSchema = z.object({
  filename: requiredTrimmedString,
  /** Expected upload size in bytes — validated server-side. */
  expectedSizeBytes: z.number().int().positive().optional(),
  /** Client-computed SHA-256 for early idempotency check. */
  sha256: z.string().length(64).optional(),
});

export type ImportUpload = z.infer<typeof importUploadSchema>;

// ── Per-sheet summary ────────────────────────────────────────────

export const sheetSummarySchema = z.object({
  sheetName: z.string(),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  columns: z.array(z.string()).optional(),
  skippedRows: z.number().int().nonnegative().optional(),
  errorCount: z.number().int().nonnegative().optional(),
});

export type SheetSummary = z.infer<typeof sheetSummarySchema>;

// ── Import status / preview summary ──────────────────────────────
// Structured shape for import_jobs.preview_summary jsonb.
// Also used as the response body for the preview endpoint.
// Counts are advisory — normalized database counts are authoritative.

export const importPreviewSummarySchema = z.object({
  /** Records matched exactly to existing rows — no change needed. */
  unchangedCount: z.number().int().nonnegative().default(0),
  /** New records the import would create. */
  createCount: z.number().int().nonnegative().default(0),
  /** Existing records with imported-value updates. */
  updateCount: z.number().int().nonnegative().default(0),
  /** Duplicate access rows that map to an existing canonical model. */
  duplicateCount: z.number().int().nonnegative().default(0),
  /** Rows in conflict that need manual resolution. */
  conflictCount: z.number().int().nonnegative().default(0),
  /** Rows with parse errors that will be skipped on commit. */
  errorCount: z.number().int().nonnegative().default(0),
  /** Skipped rows (headers, blanks, unmatched, intentionally omitted). */
  skipCount: z.number().int().nonnegative().default(0),
  /** Total populated rows across all sheets (advisory). */
  totalSourceRows: z.number().int().nonnegative().optional(),
  /** Populated source rows in the Master Models sheet. */
  masterModelRowCount: z.number().int().nonnegative().optional(),
  /** Canonical roster identities used for matching. */
  rosterModelCount: z.number().int().nonnegative().optional(),
  /** Benchmark rows planned for import. */
  benchmarkRowCount: z.number().int().nonnegative().optional(),
  /** Per-sheet breakdown. */
  sheets: z.array(sheetSummarySchema).optional(),
});

export type ImportPreviewSummary = z.infer<typeof importPreviewSummarySchema>;

// ── Commit summary ───────────────────────────────────────────────
// Structured shape for import_jobs.commit_summary jsonb.

export const importCommitSummarySchema = z.object({
  modelsCreated: z.number().int().nonnegative().default(0),
  modelsUpdated: z.number().int().nonnegative().default(0),
  accessCreated: z.number().int().nonnegative().default(0),
  accessUpdated: z.number().int().nonnegative().default(0),
  benchmarkRowsCreated: z.number().int().nonnegative().default(0),
  sourcesCreated: z.number().int().nonnegative().default(0),
  scoresCreated: z.number().int().nonnegative().default(0),
  aliasesCreated: z.number().int().nonnegative().default(0),
  conflictsResolved: z.number().int().nonnegative().default(0),
  rowsSkipped: z.number().int().nonnegative().default(0),
  /** ISO-8601 timestamp of the commit transaction. */
  committedAt: z.string().datetime().optional(),
});

export type ImportCommitSummary = z.infer<typeof importCommitSummarySchema>;

// ── Error summary ────────────────────────────────────────────────
// Structured shape for import_jobs.error_summary jsonb.

export const importErrorSummarySchema = z.object({
  totalErrors: z.number().int().nonnegative().default(0),
  errors: z
    .array(
      z.object({
        sheetName: z.string().optional(),
        row: z.number().int().nonnegative().optional(),
        column: z.string().optional(),
        code: z.string(),
        message: z.string(),
        rawValue: z.unknown().optional(),
      }),
    )
    .default([]),
});

export type ImportErrorSummary = z.infer<typeof importErrorSummarySchema>;

// ── Conflict types ───────────────────────────────────────────────
// Catalog of every conflict kind the import pipeline can detect.
// See docs/07_IMPORT_AND_MIGRATION.md §5.

export const importConflictTypeSchema = z.enum([
  "canonical_identity_collision",
  "alias_collision",
  "developer_mismatch",
  "lifecycle_mismatch",
  "newer_local_value",
  "older_imported_value",
  "access_provider_mismatch",
  "duplicate_plan_model",
  "benchmark_group_mismatch",
  "score_methodology_mismatch",
  "destructive_blank_overwrite",
  "unmatched_model_id",
  "manual_review_required",
]);

export type ImportConflictType = z.infer<typeof importConflictTypeSchema>;

// ── Conflict DTO ─────────────────────────────────────────────────
// Typed representation of an import_conflicts row, used for preview
// display and resolution workflow.

export const importConflictDtoSchema = z.object({
  id: uuidSchema,
  importJobId: uuidSchema,
  conflictType: importConflictTypeSchema,
  sourceSheet: z.string().nullable().optional(),
  sourceRow: z.number().int().nonnegative().nullable().optional(),
  sourceColumn: z.string().nullable().optional(),
  entityType: z.string().nullable().optional(),
  candidateEntityId: z.string().uuid().nullable().optional(),
  /** Current value in the database (as JSON). */
  currentValue: z.unknown().nullable().optional(),
  /** Value from the import (as JSON). */
  importedValue: z.unknown().nullable().optional(),
  resolution: z.string().nullable().optional(),
  resolutionPayload: z.unknown().nullable().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type ImportConflictDto = z.infer<typeof importConflictDtoSchema>;

// ── Conflict resolution ──────────────────────────────────────────
// Resolution choices a user may pick when previewing conflicts.

export const importResolutionActionSchema = z.enum([
  "keep_existing",
  "use_imported",
  "merge",
  "create_separate_access",
  "ignore_row",
  "defer",
]);

export type ImportResolutionAction = z.infer<typeof importResolutionActionSchema>;

export const importConflictResolutionSchema = z.object({
  conflictId: uuidSchema,
  action: importResolutionActionSchema,
  /** Optional payload for merge actions (field-level overrides). */
  payload: z.unknown().optional(),
});

export type ImportConflictResolution = z.infer<typeof importConflictResolutionSchema>;

/** Batch resolution sent by the client after user reviews conflicts. */
export const importBatchResolutionSchema = z.object({
  importJobId: uuidSchema,
  resolutions: z.array(importConflictResolutionSchema).min(1),
});

export type ImportBatchResolution = z.infer<typeof importBatchResolutionSchema>;

// ── Provenance DTO ───────────────────────────────────────────────
// Typed representation of an import_provenance row.

export const importProvenanceDtoSchema = z.object({
  id: uuidSchema,
  importJobId: uuidSchema,
  entityType: z.string(),
  entityId: uuidSchema,
  sourceSheet: z.string().nullable().optional(),
  sourceRow: z.number().int().nonnegative().nullable().optional(),
  sourceColumn: z.string().nullable().optional(),
  rawValue: z.unknown().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type ImportProvenanceDto = z.infer<typeof importProvenanceDtoSchema>;

// ── Import job response ──────────────────────────────────────────

export const importJobResponseSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  filename: z.string(),
  storedPath: z.string(),
  sha256: z.string(),
  parserVersion: z.string(),
  status: z.enum([
    "uploaded",
    "parsing",
    "preview_ready",
    "needs_resolution",
    "committing",
    "committed",
    "failed",
    "cancelled",
  ]),
  sheetSummary: z.array(sheetSummarySchema).nullable().optional(),
  previewSummary: importPreviewSummarySchema.nullable().optional(),
  commitSummary: importCommitSummarySchema.nullable().optional(),
  errorSummary: importErrorSummarySchema.nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  committedAt: z.string().datetime().nullable().optional(),
});

export type ImportJobResponse = z.infer<typeof importJobResponseSchema>;

// ── Import preview response ──────────────────────────────────────
// The full preview payload returned by the preview endpoint.

export const importPreviewRowSchema = z.object({
  /** One of: create, update, unchanged, conflict, error, skip, duplicate */
  classification: z.enum([
    "create",
    "update",
    "unchanged",
    "conflict",
    "error",
    "skip",
    "duplicate",
  ]),
  entityType: z.string().optional(),
  sourceSheet: z.string().optional(),
  sourceRow: z.number().int().nonnegative().optional(),
  /** Human-readable label for the record. */
  label: z.string().optional(),
  /** Proposed entity values after import (display-only — read-only). */
  proposedValues: z.record(z.unknown()).optional(),
  /** Conflict reference when classification is "conflict". */
  conflictId: uuidSchema.optional(),
  /** Error message when classification is "error". */
  errorMessage: z.string().optional(),
});

export type ImportPreviewRow = z.infer<typeof importPreviewRowSchema>;

export const importPreviewResponseSchema = z.object({
  importJobId: uuidSchema,
  summary: importPreviewSummarySchema,
  rows: z.array(importPreviewRowSchema),
  conflicts: z.array(importConflictDtoSchema),
  errors: z.array(z.object({ sheet: z.string().optional(), row: z.number().optional(), message: z.string() })).optional(),
});

export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;

// ── Export formats ───────────────────────────────────────────────

export const exportFormatSchema = z.enum(["json", "csv", "xlsx"]);

export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const exportScopeSchema = z.enum([
  "models",
  "subscriptions",
  "access",
  "benchmarks",
  "scores",
  "sources",
  "full",
  "current",
  "selected",
  "all",
  "backup",
]);

export type ExportScope = z.infer<typeof exportScopeSchema>;

/** Export request parameters. */
export const exportRequestSchema = z.object({
  format: exportFormatSchema,
  scope: exportScopeSchema.default("full"),
  /** Include archived records. */
  includeArchived: z.boolean().default(false),
  /** Include provenance metadata in JSON export. */
  includeProvenance: z.boolean().default(false),
  /** When true, neutralize formula-like strings for spreadsheet safety. */
  neutralizeFormulas: z.boolean().default(true),
  /** Optional filter: only export models matching a search. */
  search: z.string().optional(),
  /** Optional filter: only export records for a specific developer. */
  developerId: uuidSchema.optional(),
  /** Optional filter: only export records for a specific access provider. */
  accessProviderId: uuidSchema.optional(),
  /** Validated model IDs for the selected-model export. */
  modelIds: z.array(uuidSchema).default([]),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;

// ── Export response (download metadata) ──────────────────────────

export const exportResponseSchema = z.object({
  id: uuidSchema,
  format: exportFormatSchema,
  scope: exportScopeSchema,
  filename: z.string(),
  /** MIME type of the exported file. */
  mimeType: z.string(),
  /** Size in bytes. */
  byteSize: z.number().int().nonnegative(),
  /** Number of records exported. */
  recordCount: z.number().int().nonnegative(),
  /** True when formula neutralization was applied. */
  formulasNeutralized: z.boolean(),
  createdAt: z.string().datetime(),
});

export type ExportResponse = z.infer<typeof exportResponseSchema>;

// ── Export row schemas (structured row types per scope) ──────────

/** A single model row in a JSON export. */
export const exportModelRowSchema = z.object({
  canonicalId: z.string(),
  name: z.string(),
  slug: z.string(),
  developer: z.string().nullable().optional(),
  family: z.string().nullable().optional(),
  generation: z.string().nullable().optional(),
  lifecycle: z.string(),
  modelType: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  codingSpecialization: z.string().nullable().optional(),
  bestUse: z.string().nullable().optional(),
  contextTokens: z.number().int().nullable().optional(),
  maxOutputTokens: z.number().int().nullable().optional(),
  speedRating: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  knowledgeCutoff: z.string().nullable().optional(),
  capabilities: z
    .object({
      vision: z.boolean().nullable().optional(),
      reasoning: z.boolean().nullable().optional(),
      toolUse: z.boolean().nullable().optional(),
    })
    .optional(),
});

export type ExportModelRow = z.infer<typeof exportModelRowSchema>;

/** A single subscription row in a JSON export. */
export const exportSubscriptionRowSchema = z.object({
  accountLabel: z.string(),
  provider: z.string(),
  plan: z.string(),
  status: z.string(),
  billingInterval: z.string().nullable().optional(),
  actualPrice: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  usageTrackingMode: z.string(),
});

export type ExportSubscriptionRow = z.infer<typeof exportSubscriptionRowSchema>;

/** A single access row in a JSON export. */
export const exportAccessRowSchema = z.object({
  modelCanonicalId: z.string(),
  modelName: z.string(),
  provider: z.string(),
  plan: z.string(),
  providerModelId: z.string().nullable().optional(),
  availability: z.string(),
  accessMethod: z.string(),
  cliOnly: z.boolean(),
  webOnly: z.boolean(),
});

export type ExportAccessRow = z.infer<typeof exportAccessRowSchema>;

/** A single benchmark row in a JSON export. */
export const exportBenchmarkRowSchema = z.object({
  modelCanonicalId: z.string(),
  benchmark: z.string(),
  category: z.string(),
  score: z.number().nullable().optional(),
  scoreText: z.string().nullable().optional(),
  setting: z.string().nullable().optional(),
  harness: z.string().nullable().optional(),
  comparableGroup: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  resultDate: z.string().nullable().optional(),
});

export type ExportBenchmarkRow = z.infer<typeof exportBenchmarkRowSchema>;

export const exportScoreRowSchema = z.object({
  modelCanonicalId: z.string(), modelName: z.string(), methodology: z.string(), methodologyVersion: z.string(),
  scoreType: z.string(), scoreValue: z.number().nullable().optional(), rankValue: z.number().int().nullable().optional(),
  eligibleCount: z.number().int().nullable().optional(), confidence: z.number().nullable().optional(),
  isManualOverride: z.boolean(), overrideReason: z.string().nullable().optional(), calculatedAt: z.string(),
});
export type ExportScoreRow = z.infer<typeof exportScoreRowSchema>;
export const exportSourceRowSchema = z.object({
  entityType: z.string(), entityId: uuidSchema, sourceType: z.string(), url: z.string().nullable().optional(),
  title: z.string().nullable().optional(), publisher: z.string().nullable().optional(), retrievedAt: z.string().nullable().optional(),
  verifiedAt: z.string().nullable().optional(), notes: z.string().nullable().optional(),
});
export type ExportSourceRow = z.infer<typeof exportSourceRowSchema>;

/** Full export payload (all scopes). */
export const exportPayloadSchema = z.object({
  exportedAt: z.string().datetime(),
  format: exportFormatSchema,
  scope: exportScopeSchema,
  formulasNeutralized: z.boolean(),
  models: z.array(exportModelRowSchema).optional(),
  subscriptions: z.array(exportSubscriptionRowSchema).optional(),
  access: z.array(exportAccessRowSchema).optional(),
  benchmarks: z.array(exportBenchmarkRowSchema).optional(),
  scores: z.array(exportScoreRowSchema).optional(),
  sources: z.array(exportSourceRowSchema).optional(),
  provenance: z.array(importProvenanceDtoSchema).optional(),
});

export type ExportPayload = z.infer<typeof exportPayloadSchema>;
