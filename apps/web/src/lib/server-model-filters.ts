export type ServerModelFilterState = Record<string, string | boolean | number>;

const NON_FILTER_KEYS = new Set(["page", "limit", "sort", "cursor", "view", "density", "cols", "viewId", "profile", "profileId"]);
const BOOLEAN_KEYS = new Set(["favourite", "isFavourite", "needsReview", "pricingKnown", "pricingMissing"]);
const NUMBER_KEYS = new Set(["minCost", "maxCost", "minContext", "maxContext", "minScore", "maxScore"]);

export function parseModelFiltersForServer(params: Record<string, string | string[] | undefined>): ServerModelFilterState {
  const result: ServerModelFilterState = {};
  for (const [key, value] of Object.entries(params)) {
    if (NON_FILTER_KEYS.has(key) || value == null) continue;
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) continue;
    if (BOOLEAN_KEYS.has(key)) result[key] = raw === "true";
    else if (NUMBER_KEYS.has(key) && Number.isFinite(Number(raw))) result[key] = Number(raw);
    else result[key] = raw;
  }
  return result;
}
