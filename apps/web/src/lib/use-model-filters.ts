"use client";

/**
 * URL-addressable model filters (brief §7.3 — six groups).
 * Pure parse/serialize helpers are unit-tested; the hook wires them to Next.js
 * search params so every view mode shares one source of truth.
 */

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Keys that are view chrome / pagination — never treated as filters. */
export const NON_FILTER_QUERY_KEYS = [
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
] as const;

export type NonFilterQueryKey = (typeof NON_FILTER_QUERY_KEYS)[number];

export type FilterPrimitive = string | boolean | number;

/** Flat filter bag mirrored 1:1 into the query string. */
export type ModelFilterState = Record<string, FilterPrimitive>;

export type FilterChipDescriptor = {
  /** Unique id = filter key (one chip per key). */
  id: string;
  key: string;
  label: string;
  value: string;
  displayValue: string;
};

export type FilterOption = {
  /** Query param key written when this option is chosen. */
  key: string;
  /** Param value (string form before type coercion). */
  value: string;
  /** Chip / menu label. */
  label: string;
  valueLabel: string;
};

export type FilterGroupDef = {
  id: string;
  label: string;
  options: FilterOption[];
};

/**
 * Six groups from brief §7.3:
 * 1 identity/taxonomy · 2 status · 3 capabilities · 4 ratings ·
 * 5 cost & quota · 6 data maintenance
 */
export const FILTER_GROUPS: FilterGroupDef[] = [
  {
    id: "identity",
    label: "Identity",
    options: [
      { key: "accessType", value: "api", label: "Access type", valueLabel: "API" },
      {
        key: "accessType",
        value: "subscription",
        label: "Access type",
        valueLabel: "Subscription",
      },
      {
        key: "accessType",
        value: "open_weights",
        label: "Access type",
        valueLabel: "Open weights",
      },
      {
        key: "accessType",
        value: "local",
        label: "Access type",
        valueLabel: "Local",
      },
      {
        key: "modelType",
        value: "chat",
        label: "Model type",
        valueLabel: "Chat",
      },
      {
        key: "modelType",
        value: "reasoning",
        label: "Model type",
        valueLabel: "Reasoning",
      },
      {
        key: "modelType",
        value: "code",
        label: "Model type",
        valueLabel: "Code",
      },
      {
        key: "family",
        value: "gpt",
        label: "Family",
        valueLabel: "GPT",
      },
      {
        key: "family",
        value: "claude",
        label: "Family",
        valueLabel: "Claude",
      },
      {
        key: "family",
        value: "gemini",
        label: "Family",
        valueLabel: "Gemini",
      },
    ],
  },
  {
    id: "status",
    label: "Status",
    options: [
      {
        key: "workflowStatus",
        value: "active",
        label: "Status",
        valueLabel: "Active",
      },
      {
        key: "workflowStatus",
        value: "preferred",
        label: "Status",
        valueLabel: "Preferred",
      },
      {
        key: "workflowStatus",
        value: "testing",
        label: "Status",
        valueLabel: "Testing",
      },
      {
        key: "workflowStatus",
        value: "preview",
        label: "Status",
        valueLabel: "Preview",
      },
      {
        key: "workflowStatus",
        value: "legacy",
        label: "Status",
        valueLabel: "Legacy",
      },
      {
        key: "workflowStatus",
        value: "deprecated",
        label: "Status",
        valueLabel: "Deprecated",
      },
      {
        key: "isFavourite",
        value: "true",
        label: "Favourite",
        valueLabel: "Yes",
      },
      {
        key: "archived",
        value: "true",
        label: "Archived",
        valueLabel: "Only",
      },
    ],
  },
  {
    id: "capabilities",
    label: "Capabilities",
    options: [
      { key: "vision", value: "true", label: "Vision", valueLabel: "Yes" },
      {
        key: "reasoning",
        value: "true",
        label: "Reasoning",
        valueLabel: "Yes",
      },
      { key: "toolUse", value: "true", label: "Tool use", valueLabel: "Yes" },
      { key: "agent", value: "true", label: "Agent", valueLabel: "Yes" },
      {
        key: "multimodal",
        value: "true",
        label: "Multimodal",
        valueLabel: "Yes",
      },
      {
        key: "codingSpecialist",
        value: "true",
        label: "Coding specialist",
        valueLabel: "Yes",
      },
      {
        key: "longContext",
        value: "true",
        label: "Long context",
        valueLabel: "Yes",
      },
    ],
  },
  {
    id: "ratings",
    label: "Ratings",
    options: [
      { key: "tested", value: "true", label: "Tested", valueLabel: "Yes" },
      { key: "tested", value: "false", label: "Tested", valueLabel: "No" },
      {
        key: "confidence",
        value: "high",
        label: "Confidence",
        valueLabel: "High",
      },
      {
        key: "confidence",
        value: "medium",
        label: "Confidence",
        valueLabel: "Medium",
      },
      {
        key: "confidence",
        value: "low",
        label: "Confidence",
        valueLabel: "Low",
      },
      {
        key: "skill",
        value: "coding",
        label: "Skill",
        valueLabel: "Coding",
      },
      {
        key: "skill",
        value: "reasoning",
        label: "Skill",
        valueLabel: "Reasoning",
      },
      {
        key: "skill",
        value: "writing",
        label: "Skill",
        valueLabel: "Writing",
      },
      {
        key: "personalScoreMin",
        value: "7",
        label: "Personal score ≥",
        valueLabel: "7",
      },
      {
        key: "skillScoreMin",
        value: "7",
        label: "Skill score ≥",
        valueLabel: "7",
      },
    ],
  },
  {
    id: "costQuota",
    label: "Cost & Quota",
    options: [
      { key: "free", value: "true", label: "Free", valueLabel: "Yes" },
      {
        key: "subscriptionAccess",
        value: "true",
        label: "Subscription",
        valueLabel: "Yes",
      },
      { key: "api", value: "true", label: "API priced", valueLabel: "Yes" },
      {
        key: "openWeights",
        value: "true",
        label: "Open weights",
        valueLabel: "Yes",
      },
      { key: "local", value: "true", label: "Local", valueLabel: "Yes" },
      {
        key: "unlimited",
        value: "true",
        label: "Unlimited quota",
        valueLabel: "Yes",
      },
      {
        key: "requestLimited",
        value: "true",
        label: "Request-limited",
        valueLabel: "Yes",
      },
      {
        key: "tokenLimited",
        value: "true",
        label: "Token-limited",
        valueLabel: "Yes",
      },
      {
        key: "pricingKnown",
        value: "true",
        label: "Pricing",
        valueLabel: "Known",
      },
      {
        key: "pricingMissing",
        value: "true",
        label: "Pricing",
        valueLabel: "Missing",
      },
    ],
  },
  {
    id: "maintenance",
    label: "Data maintenance",
    options: [
      {
        key: "needsReview",
        value: "true",
        label: "Needs review",
        valueLabel: "Yes",
      },
      {
        key: "missingRating",
        value: "true",
        label: "Missing rating",
        valueLabel: "Yes",
      },
      {
        key: "missingCost",
        value: "true",
        label: "Missing cost",
        valueLabel: "Yes",
      },
      {
        key: "missingQuota",
        value: "true",
        label: "Missing quota",
        valueLabel: "Yes",
      },
      {
        key: "recentlyVerified",
        value: "true",
        label: "Recently verified",
        valueLabel: "Yes",
      },
      {
        key: "outdated",
        value: "true",
        label: "Outdated",
        valueLabel: "Yes",
      },
    ],
  },
];

/** Human labels for arbitrary filter keys (chips + free-form). */
export const FILTER_KEY_LABELS: Record<string, string> = {
  search: "Search",
  creator: "Creator",
  developer: "Creator",
  accessProvider: "Access provider",
  plan: "Plan",
  subscription: "Plan",
  accessType: "Access type",
  family: "Family",
  modelType: "Model type",
  lifecycle: "Lifecycle",
  status: "Status",
  workflowStatus: "Status",
  archived: "Archived",
  isFavourite: "Favourite",
  favourite: "Favourite",
  accessible: "Accessible",
  vision: "Vision",
  reasoning: "Reasoning",
  toolSupport: "Tool use",
  toolUse: "Tool use",
  agent: "Agent",
  multimodal: "Multimodal",
  codingSpecialist: "Coding specialist",
  longContext: "Long context",
  longContextMin: "Min context",
  skill: "Skill",
  skillId: "Skill",
  personalScoreMin: "Personal score ≥",
  personalScoreMax: "Personal score ≤",
  skillScoreMin: "Skill score ≥",
  skillScoreMax: "Skill score ≤",
  confidence: "Confidence",
  rankMin: "Rank ≥",
  rankMax: "Rank ≤",
  tested: "Tested",
  free: "Free",
  subscriptionAccess: "Subscription",
  api: "API priced",
  openWeights: "Open weights",
  local: "Local",
  unlimited: "Unlimited quota",
  requestLimited: "Request-limited",
  tokenLimited: "Token-limited",
  pricingKnown: "Pricing",
  pricingMissing: "Pricing",
  needsRecheck: "Needs recheck",
  needsReview: "Needs review",
  missingRating: "Missing rating",
  missingCost: "Missing cost",
  missingQuota: "Missing quota",
  recentlyVerified: "Recently verified",
  outdated: "Outdated",
  verifiedWithinDays: "Verified within days",
  outdatedAfterDays: "Outdated after days",
};

const BOOLEAN_KEYS = new Set([
  "archived",
  "isFavourite",
  "favourite",
  "accessible",
  "vision",
  "reasoning",
  "toolSupport",
  "toolUse",
  "agent",
  "multimodal",
  "codingSpecialist",
  "longContext",
  "tested",
  "free",
  "subscriptionAccess",
  "api",
  "openWeights",
  "local",
  "unlimited",
  "requestLimited",
  "tokenLimited",
  "pricingKnown",
  "pricingMissing",
  "needsRecheck",
  "needsReview",
  "missingRating",
  "missingCost",
  "missingQuota",
  "recentlyVerified",
  "outdated",
]);

const NUMBER_KEYS = new Set([
  "personalScoreMin",
  "personalScoreMax",
  "skillScoreMin",
  "skillScoreMax",
  "rankMin",
  "rankMax",
  "longContextMin",
  "verifiedWithinDays",
  "outdatedAfterDays",
]);

const NON_FILTER_SET = new Set<string>(NON_FILTER_QUERY_KEYS);

export function isFilterQueryKey(key: string): boolean {
  return key.length > 0 && !NON_FILTER_SET.has(key);
}

function coerceValue(key: string, raw: string): FilterPrimitive {
  if (BOOLEAN_KEYS.has(key)) {
    if (raw === "true") return true;
    if (raw === "false") return false;
  }
  if (NUMBER_KEYS.has(key)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return raw;
}

function valueToParam(value: FilterPrimitive): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function formatDisplayValue(key: string, value: FilterPrimitive): string {
  // Prefer option catalogue labels when available.
  for (const group of FILTER_GROUPS) {
    for (const opt of group.options) {
      if (opt.key === key && opt.value === valueToParam(value)) {
        return opt.valueLabel;
      }
    }
  }
  if (typeof value === "boolean") {
    if (key === "pricingKnown") return value ? "Known" : "No";
    if (key === "pricingMissing") return value ? "Missing" : "No";
    return value ? "Yes" : "No";
  }
  return String(value);
}

export function labelForFilterKey(key: string): string {
  return FILTER_KEY_LABELS[key] ?? key;
}

/** Read filter state from a URLSearchParams (or compatible). */
export function parseModelFilters(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): ModelFilterState {
  const sp =
    params instanceof URLSearchParams
      ? params
      : (() => {
          const out = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) {
            if (v == null) continue;
            if (Array.isArray(v)) {
              if (v[0] != null && v[0] !== "") out.set(k, v[0]);
            } else if (v !== "") {
              out.set(k, v);
            }
          }
          return out;
        })();

  const state: ModelFilterState = {};
  for (const [key, raw] of sp.entries()) {
    if (!isFilterQueryKey(key)) continue;
    if (raw === "") continue;
    state[key] = coerceValue(key, raw);
  }
  return state;
}

/**
 * Write filters into a URLSearchParams.
 * Clears previous filter keys on `base` then sets current ones.
 * Non-filter keys on `base` are preserved unless `clearNonFilters`.
 */
export function serializeModelFilters(
  filters: ModelFilterState,
  base?: URLSearchParams,
  options?: { clearNonFilters?: boolean },
): URLSearchParams {
  const next = new URLSearchParams(base?.toString() ?? "");

  // Drop existing filter keys
  for (const key of [...next.keys()]) {
    if (isFilterQueryKey(key)) next.delete(key);
  }
  if (options?.clearNonFilters) {
    for (const key of [...next.keys()]) {
      if (!isFilterQueryKey(key)) next.delete(key);
    }
  }

  const keys = Object.keys(filters).sort();
  for (const key of keys) {
    if (!isFilterQueryKey(key)) continue;
    const value = filters[key];
    if (value === undefined || value === "") continue;
    next.set(key, valueToParam(value));
  }
  return next;
}

/** Remove exactly one filter key (one chip). */
export function removeFilterKey(
  filters: ModelFilterState,
  key: string,
): ModelFilterState {
  if (!(key in filters)) return { ...filters };
  const next = { ...filters };
  delete next[key];
  return next;
}

/** Empty filter bag. */
export function clearAllFilters(): ModelFilterState {
  return {};
}

/** Build removable chips for every applied filter. */
export function filtersToChips(filters: ModelFilterState): FilterChipDescriptor[] {
  const keys = Object.keys(filters).sort();
  const chips: FilterChipDescriptor[] = [];
  for (const key of keys) {
    const value = filters[key];
    if (value === undefined) continue;
    chips.push({
      id: key,
      key,
      label: labelForFilterKey(key),
      value: valueToParam(value),
      displayValue: formatDisplayValue(key, value),
    });
  }
  return chips;
}

/**
 * Apply a single option from a group dropdown.
 * Same key replaces prior value (one value per key in the URL).
 */
export function applyFilterOption(
  filters: ModelFilterState,
  option: FilterOption,
): ModelFilterState {
  return {
    ...filters,
    [option.key]: coerceValue(option.key, option.value),
  };
}

/**
 * Normalize saved-view `filters` JSON (may use arrays / aliases) into flat URL state.
 */
export function normalizeViewFilters(
  raw: Record<string, unknown> | null | undefined,
): ModelFilterState {
  if (!raw || typeof raw !== "object") return {};
  const out: ModelFilterState = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;

    if (key === "capabilities" && Array.isArray(value)) {
      for (const cap of value) {
        if (typeof cap !== "string") continue;
        const k = cap === "tool_use" ? "toolUse" : cap;
        if (
          [
            "vision",
            "reasoning",
            "toolUse",
            "agent",
            "multimodal",
            "codingSpecialist",
            "longContext",
          ].includes(k)
        ) {
          out[k] = true;
        }
      }
      continue;
    }

    if (key === "missingPersonalRating") {
      out.missingRating = Boolean(value);
      continue;
    }

    if (key === "favourite") {
      out.isFavourite = Boolean(value);
      continue;
    }

    if (Array.isArray(value)) {
      const first: unknown = value[0];
      if (first == null) continue;
      if (typeof first === "boolean" || typeof first === "number") {
        out[key] = first;
      } else if (typeof first === "string") {
        out[key] = coerceValue(key, first);
      }
      // ignore nested objects / unsupported shapes
      continue;
    }

    if (typeof value === "boolean" || typeof value === "number") {
      out[key] = value;
      continue;
    }

    if (typeof value === "string" && value !== "") {
      out[key] = coerceValue(key, value);
    }
  }

  return out;
}

export function sortParamFromViewSort(sort: unknown): string | null {
  if (!sort) return null;
  if (typeof sort === "string" && sort.trim()) return sort.trim();
  if (Array.isArray(sort) && sort[0] && typeof sort[0] === "object") {
    const s = sort[0] as { id?: string; field?: string; desc?: boolean; dir?: string };
    const field = s.field ?? s.id;
    if (!field) return null;
    const desc =
      s.desc === true ||
      (typeof s.dir === "string" && s.dir.toLowerCase().startsWith("desc"));
    return desc ? `-${field}` : field;
  }
  if (typeof sort === "object") {
    const s = sort as { field?: string; dir?: string; id?: string; desc?: boolean };
    const field = s.field ?? s.id;
    if (!field) return null;
    const desc =
      s.desc === true ||
      (typeof s.dir === "string" && s.dir.toLowerCase().startsWith("desc"));
    return desc ? `-${field}` : field;
  }
  return null;
}

export function viewSortFromSortParam(sort: string | null | undefined): {
  field: string;
  dir: "asc" | "desc";
} {
  const raw = (sort ?? "name").trim() || "name";
  const desc = raw.startsWith("-");
  const field = raw.replace(/^-/, "") || "name";
  return { field, dir: desc ? "desc" : "asc" };
}

/**
 * Strip every filter key from a query string (Clear all).
 * Non-filter keys are removed too when `emptyAll` is true (default: only filters).
 * Tests require Clear all to empty the query string of filters.
 */
export function clearFiltersFromSearchParams(
  base?: URLSearchParams,
  options?: { emptyAll?: boolean },
): URLSearchParams {
  if (options?.emptyAll) return new URLSearchParams();
  const next = new URLSearchParams(base?.toString() ?? "");
  for (const key of [...next.keys()]) {
    if (isFilterQueryKey(key)) next.delete(key);
  }
  // Reset paging when filters clear
  next.delete("page");
  return next;
}

export type UseModelFiltersResult = {
  filters: ModelFilterState;
  chips: FilterChipDescriptor[];
  groups: FilterGroupDef[];
  /** Replace entire filter bag (resets page). */
  setFilters: (next: ModelFilterState) => void;
  /** Set or replace one key. */
  setFilter: (key: string, value: FilterPrimitive | null | undefined) => void;
  /** Apply a catalogue option. */
  applyOption: (option: FilterOption) => void;
  /** Remove exactly one chip / key. */
  removeChip: (chipId: string) => void;
  /** Clear all filters (filter keys only; page reset). */
  clearAll: () => void;
  /** Full replace of search string builder (filters + optional patch). */
  buildSearchParams: (
    filters: ModelFilterState,
    patch?: Record<string, string | null | undefined>,
  ) => URLSearchParams;
  /** Current raw search params. */
  searchParams: URLSearchParams;
};

export function useModelFilters(): UseModelFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => parseModelFilters(searchParams),
    [searchParams],
  );

  const chips = useMemo(() => filtersToChips(filters), [filters]);

  const replace = useCallback(
    (next: URLSearchParams) => {
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const buildSearchParams = useCallback(
    (
      nextFilters: ModelFilterState,
      patch?: Record<string, string | null | undefined>,
    ) => {
      const next = serializeModelFilters(nextFilters, searchParams);
      if (patch) {
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || v === "") next.delete(k);
          else next.set(k, v);
        }
      }
      return next;
    },
    [searchParams],
  );

  const setFilters = useCallback(
    (nextFilters: ModelFilterState) => {
      const next = buildSearchParams(nextFilters, { page: null });
      replace(next);
    },
    [buildSearchParams, replace],
  );

  const setFilter = useCallback(
    (key: string, value: FilterPrimitive | null | undefined) => {
      const nextFilters = { ...filters };
      if (value === null || value === undefined || value === "") {
        delete nextFilters[key];
      } else {
        nextFilters[key] = value;
      }
      setFilters(nextFilters);
    },
    [filters, setFilters],
  );

  const applyOption = useCallback(
    (option: FilterOption) => {
      setFilters(applyFilterOption(filters, option));
    },
    [filters, setFilters],
  );

  const removeChip = useCallback(
    (chipId: string) => {
      setFilters(removeFilterKey(filters, chipId));
    },
    [filters, setFilters],
  );

  const clearAll = useCallback(() => {
    // Empty filter keys; drop page. If nothing else remains, query string is empty.
    const next = clearFiltersFromSearchParams(searchParams);
    // Also drop viewId — cleared filters no longer match a saved view snapshot.
    next.delete("viewId");
    replace(next);
  }, [searchParams, replace]);

  return {
    filters,
    chips,
    groups: FILTER_GROUPS,
    setFilters,
    setFilter,
    applyOption,
    removeChip,
    clearAll,
    buildSearchParams,
    searchParams: new URLSearchParams(searchParams.toString()),
  };
}
