/**
 * Models directory view mode (Table / Cards / Compact).
 * Remembered per browser user alongside density (`mm.density`).
 */

export const VIEW_MODE_STORAGE_KEY = "mm.models.viewMode";

export type ModelsViewMode = "table" | "cards" | "compact";

export function isModelsViewMode(value: unknown): value is ModelsViewMode {
  return value === "table" || value === "cards" || value === "compact";
}

export function parseModelsViewMode(
  raw: string | null | undefined,
  fallback: ModelsViewMode = "table",
): ModelsViewMode {
  if (isModelsViewMode(raw)) return raw;
  return fallback;
}

export function loadModelsViewMode(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !==
  "undefined"
    ? window.localStorage
    : null,
): ModelsViewMode {
  if (!storage) return "table";
  try {
    return parseModelsViewMode(storage.getItem(VIEW_MODE_STORAGE_KEY), "table");
  } catch {
    return "table";
  }
}

export function persistModelsViewMode(
  mode: ModelsViewMode,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !==
  "undefined"
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * URL patch when switching view mode. Only touches view chrome keys —
 * filters, sort, page, selection are intentionally left alone.
 */
export function viewModeQueryPatch(
  mode: ModelsViewMode,
  options?: { coupleDensity?: boolean },
): Record<string, string> {
  const patch: Record<string, string> = { view: mode };
  if (options?.coupleDensity !== false) {
    if (mode === "compact") patch.density = "compact";
    else if (mode === "cards") patch.density = "comfortable";
    else patch.density = "standard";
  }
  return patch;
}

/**
 * Assert that a query-string patch for view mode does not clear filter keys.
 * Used by unit tests and as a documentation contract for mode switching.
 */
export function preservesFiltersOnViewSwitch(
  current: URLSearchParams,
  mode: ModelsViewMode,
): { next: URLSearchParams; filterKeysUnchanged: boolean } {
  const patch = viewModeQueryPatch(mode);
  const next = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    next.set(k, v);
  }
  const nonFilterChrome = new Set([
    "page",
    "limit",
    "sort",
    "cursor",
    "view",
    "density",
    "cols",
    "viewId",
    "profile",
    "profileId",
  ]);
  const beforeFilters = [...current.entries()]
    .filter(([k]) => !nonFilterChrome.has(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const afterFilters = [...next.entries()]
    .filter(([k]) => !nonFilterChrome.has(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const filterKeysUnchanged =
    beforeFilters.length === afterFilters.length &&
    beforeFilters.every(
      ([k, v], i) => afterFilters[i]?.[0] === k && afterFilters[i]?.[1] === v,
    );
  return { next, filterKeysUnchanged };
}
