export type ColumnMapping = Record<string, string>;

const aliases: Record<string, string[]> = {
  modelName: ["model", "model name", "name", "model_name", "display name"],
  providerAlias: ["model id", "provider alias", "provider_model_id", "alias", "provider model id"],
  provider: ["provider", "access provider", "access_provider", "vendor"],
  plan: ["package", "plan", "plan name", "subscription", "tier"],
  canonicalId: ["canonical id", "canonical_id", "canonicalid"],
  slug: ["slug", "model slug"],
  family: ["family"],
  generation: ["generation", "version"],
  tags: ["tags", "tag"],
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\u005f-]+/g, " ").replace(/\s+/g, " ");
}

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const result: ColumnMapping = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    const index = headers.findIndex((header) => candidates.includes(normalize(header)));
    if (index >= 0) result[field] = headers[index]!;
  }
  return result;
}

export function mergeColumnMapping(headers: string[], supplied: ColumnMapping): ColumnMapping {
  return { ...autoDetectColumnMapping(headers), ...supplied };
}

export function requiredMappingErrors(mapping: ColumnMapping): string[] {
  return mapping.modelName ? [] : ["modelName: map a model name column before previewing"];
}

export function normalizeColumnName(value: string): string {
  return normalize(value);
}
