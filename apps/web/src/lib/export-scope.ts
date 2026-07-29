import type { ExportAccessRow, ExportBenchmarkRow, ExportModelRow, ExportScoreRow, ExportSourceRow, ExportSubscriptionRow, ImportProvenanceDto } from "@model-monitor/schemas";

type ModelRelated = { modelCanonicalId?: string };

export interface ExportScopeInput {
  scope: "selected" | "current" | "all" | "full" | "models" | "subscriptions" | "access" | "benchmarks" | "scores" | "sources";
  models: ExportModelRow[];
  access: ExportAccessRow[];
  benchmarks: ExportBenchmarkRow[];
  scores: ExportScoreRow[];
  subscriptions: ExportSubscriptionRow[];
  sources: ExportSourceRow[];
  provenance: ImportProvenanceDto[];
  search?: string;
  selectedCanonicalIds?: Set<string>;
}

function filterRelated<T extends ModelRelated>(rows: T[], ids: Set<string>): T[] {
  return rows.filter((row) => !row.modelCanonicalId || ids.has(row.modelCanonicalId));
}

export function applyExportScope(input: ExportScopeInput) {
  let models = input.models;
  let ids = input.selectedCanonicalIds;
  if (input.scope === "current") {
    const term = input.search?.trim().toLowerCase();
    if (term) models = models.filter((row) => `${row.name} ${row.developer ?? ""} ${row.family ?? ""}`.toLowerCase().includes(term));
    ids = new Set(models.map((row) => row.canonicalId));
  } else if (input.scope === "selected") {
    ids = ids ?? new Set();
    models = models.filter((row) => ids!.has(row.canonicalId));
  }
  const scopedModelOnly = input.scope === "selected" || input.scope === "current";
  return {
    models,
    access: ids ? filterRelated(input.access, ids) : input.access,
    benchmarks: ids ? filterRelated(input.benchmarks, ids) : input.benchmarks,
    scores: ids ? filterRelated(input.scores, ids) : input.scores,
    subscriptions: scopedModelOnly ? [] : input.subscriptions,
    sources: scopedModelOnly ? [] : input.sources,
    provenance: scopedModelOnly ? [] : input.provenance,
  };
}
