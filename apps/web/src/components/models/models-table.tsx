"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  useRouter,
  usePathname,
  useSearchParams,
} from "next/navigation";
import type {
  OnChangeFn,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import {
  Button,
  DataTable,
  IconButton,
  Popover,
  SegmentedControl,
  Select,
} from "@model-monitor/ui";
import { useCompareTray, useDensity, useDrawerHost } from "@/components/shell";
import {
  buildModelColumns,
  COLUMN_LABELS,
  COLUMN_SORT_KEYS,
  DEFAULT_COLUMN_IDS,
  OPTIONAL_COLUMN_IDS,
  type ModelColumnId,
  type ModelTableRow,
} from "./models-columns";
import { FilterBar } from "./filter-bar";
import { ModelsCardsGrid } from "./model-card";
import { ModelsCompact } from "./models-compact";
import {
  parseModelFilters,
  serializeModelFilters,
  type ModelFilterState,
} from "@/lib/use-model-filters";
import {
  loadModelsViewMode,
  parseModelsViewMode,
  persistModelsViewMode,
  viewModeQueryPatch,
  type ModelsViewMode,
} from "@/lib/models-view-mode";

export type ModelsListPage = {
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  page: number;
  pageSize: number;
};

export type ModelsListResponse = {
  data: ModelTableRow[];
  page: ModelsListPage;
  meta?: unknown;
};

const PAGE_SIZE_OPTIONS = ["10", "20", "50", "100"] as const;
const DEFAULT_LIMIT = 20;
const COLUMNS_STORAGE_KEY = "mm.models.columns";

function parseLimit(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  if (![10, 20, 50, 100].includes(n)) return DEFAULT_LIMIT;
  return n;
}

function parsePage(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function sortingFromSortParam(sort: string | null | undefined): SortingState {
  const raw = (sort ?? "name").trim() || "name";
  const desc = raw.startsWith("-");
  const field = raw.replace(/^-/, "");
  // Map API field → column id
  const reverse: Record<string, ModelColumnId> = {
    name: "model",
    creator: "creator",
    developer: "creator",
    workflowStatus: "status",
    context: "context",
    speed: "speed",
    overallScore: "overallScore",
    updatedAt: "updated",
    family: "family",
    lifecycle: "lifecycle",
  };
  const id = reverse[field] ?? "model";
  return [{ id, desc }];
}

function sortParamFromSorting(sorting: SortingState): string {
  if (!sorting[0]) return "name";
  const colId = sorting[0].id as ModelColumnId;
  const api = COLUMN_SORT_KEYS[colId] ?? "name";
  return sorting[0].desc ? `-${api}` : api;
}

function loadVisibleColumns(): ModelColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_COLUMN_IDS];
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_COLUMN_IDS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_COLUMN_IDS];
    const allowed = new Set<string>([
      ...DEFAULT_COLUMN_IDS,
      ...OPTIONAL_COLUMN_IDS,
    ]);
    const ids = parsed.filter(
      (v): v is ModelColumnId => typeof v === "string" && allowed.has(v),
    );
    // Always keep model first among data columns
    if (!ids.includes("model")) ids.unshift("model");
    return ids.length > 0 ? ids : [...DEFAULT_COLUMN_IDS];
  } catch {
    return [...DEFAULT_COLUMN_IDS];
  }
}

function ModelDrawerBody({ model }: { model: ModelTableRow }) {
  const row: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: "var(--space-2)",
    fontSize: "var(--text-meta-size)",
    padding: "var(--space-1) 0",
    borderBottom: "1px solid var(--border-subtle)",
  };
  const label: CSSProperties = { color: "var(--text-muted)" };
  const value: CSSProperties = { color: "var(--text)" };
  const pairs: Array<[string, string]> = [
    ["Creator", model.creator?.name ?? model.developerName ?? "—"],
    [
      "Access",
      model.preferredAccess?.providerName ??
        model.preferredAccessProvider?.name ??
        "—",
    ],
    [
      "Plan",
      model.preferredAccess?.planName ?? model.preferredPlan?.name ?? "—",
    ],
    ["Status", model.workflowStatus ?? model.status ?? "—"],
    [
      "Context",
      model.context != null || model.contextTokens != null
        ? String(model.context ?? model.contextTokens)
        : "—",
    ],
    ["Speed", model.speed ?? model.speedRating ?? "—"],
    [
      "Overall",
      model.overallScore == null ? "untested" : String(model.overallScore),
    ],
    ["Best skill", model.bestSkill?.name ?? "—"],
    ["Cost / Quota", model.costOrQuota?.trim() ? model.costOrQuota : "not recorded"],
    ["Canonical", model.canonicalId ?? "—"],
  ];
  return (
    <div data-testid="models-drawer-body">
      <p
        style={{
          margin: "0 0 var(--space-3)",
          color: "var(--text-muted)",
          fontSize: "var(--text-meta-size)",
        }}
      >
        Full model drawer arrives in a later phase. Snapshot of list fields:
      </p>
      {pairs.map(([k, v]) => (
        <div key={k} style={row}>
          <span style={label}>{k}</span>
          <span style={value}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function ModelsTable({
  initialData,
  initialQuery,
}: {
  initialData: ModelsListResponse;
  initialQuery: {
    page: number;
    limit: number;
    sort: string;
    filters?: ModelFilterState;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { density, setDensity } = useDensity();
  const { openDrawer } = useDrawerHost();
  const compare = useCompareTray();

  const page = parsePage(
    searchParams.get("page") ?? String(initialQuery.page),
  );
  const limit = parseLimit(
    searchParams.get("limit") ?? String(initialQuery.limit),
  );
  const sort =
    searchParams.get("sort") ?? initialQuery.sort ?? "name";

  const filters = useMemo(
    () => parseModelFilters(searchParams),
    [searchParams],
  );
  const filtersKey = useMemo(
    () => serializeModelFilters(filters).toString(),
    [filters],
  );

  const [data, setData] = useState<ModelTableRow[]>(initialData.data);
  const [pageInfo, setPageInfo] = useState<ModelsListPage>(initialData.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<ModelColumnId[]>([
    ...DEFAULT_COLUMN_IDS,
  ]);
  const viewFromUrl = searchParams.get("view");
  const [viewMode, setViewMode] = useState<ModelsViewMode>(() =>
    parseModelsViewMode(viewFromUrl, "table"),
  );
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Hydrate column prefs + URL/local view/density
  useEffect(() => {
    setVisibleColumns(loadVisibleColumns());
    const v = searchParams.get("view");
    if (v === "table" || v === "cards" || v === "compact") {
      setViewMode(v);
      persistModelsViewMode(v);
    } else {
      const stored = loadModelsViewMode();
      setViewMode(stored);
      if (stored !== "table") {
        // Reflect remembered mode into the URL without wiping filters.
        const next = new URLSearchParams(searchParams.toString());
        next.set("view", stored);
        const q = next.toString();
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      }
    }
    const d = searchParams.get("density");
    if (d === "comfortable" || d === "standard" || d === "compact") {
      setDensity(d);
    }
    const cols = searchParams.get("cols");
    if (cols) {
      const allowed = new Set<string>([
        ...DEFAULT_COLUMN_IDS,
        ...OPTIONAL_COLUMN_IDS,
      ]);
      const ids = cols
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is ModelColumnId => allowed.has(s));
      if (ids.length > 0) {
        if (!ids.includes("model")) ids.unshift("model");
        setVisibleColumns(ids);
      }
    }
    // Intentionally run once on mount for localStorage hydrate; URL-driven
    // updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydrate
  }, []);

  // Keep viewMode in sync when URL changes (saved views, back/forward)
  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "table" || v === "cards" || v === "compact") {
      setViewMode(v);
      persistModelsViewMode(v);
    }
    const d = searchParams.get("density");
    if (d === "comfortable" || d === "standard" || d === "compact") {
      setDensity(d);
    }
    const cols = searchParams.get("cols");
    if (cols) {
      const allowed = new Set<string>([
        ...DEFAULT_COLUMN_IDS,
        ...OPTIONAL_COLUMN_IDS,
      ]);
      const ids = cols
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is ModelColumnId => allowed.has(s));
      if (ids.length > 0) {
        if (!ids.includes("model")) ids.unshift("model");
        setVisibleColumns(ids);
      }
    }
  }, [searchParams, setDensity]);

  // Saved-view application event (columns / mode)
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | {
            viewMode?: "table" | "cards" | "compact";
            columns?: ModelColumnId[];
            density?: "comfortable" | "standard" | "compact";
          }
        | undefined;
      if (!detail) return;
      if (detail.viewMode) setViewMode(detail.viewMode);
      if (detail.columns?.length) setVisibleColumns(detail.columns);
      if (detail.density) setDensity(detail.density);
    };
    window.addEventListener("mm:saved-view-applied", handler);
    return () => window.removeEventListener("mm:saved-view-applied", handler);
  }, [setDensity]);

  const initialFiltersKey = useMemo(
    () => serializeModelFilters(initialQuery.filters ?? {}).toString(),
    [initialQuery.filters],
  );

  // Sync initial server payload when query matches
  useEffect(() => {
    if (
      page === initialQuery.page &&
      limit === initialQuery.limit &&
      sort === initialQuery.sort &&
      filtersKey === initialFiltersKey
    ) {
      setData(initialData.data);
      setPageInfo(initialData.page);
    }
  }, [
    initialData,
    initialQuery,
    page,
    limit,
    sort,
    filtersKey,
    initialFiltersKey,
  ]);

  // Client fetch when URL query changes away from SSR payload
  useEffect(() => {
    let cancelled = false;
    const matchesInitial =
      page === initialQuery.page &&
      limit === initialQuery.limit &&
      sort === initialQuery.sort &&
      filtersKey === initialFiltersKey;

    if (matchesInitial) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = serializeModelFilters(filters);
        qs.set("page", String(page));
        qs.set("limit", String(limit));
        qs.set("sort", sort);
        const res = await fetch(`/api/v1/models?${qs.toString()}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`Failed to load models (${res.status})`);
        }
        const json = (await res.json()) as ModelsListResponse;
        if (cancelled) return;
        setData(json.data ?? []);
        setPageInfo(json.page);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load models");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    page,
    limit,
    sort,
    filters,
    filtersKey,
    initialFiltersKey,
    initialQuery,
  ]);

  const replaceQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const sorting = useMemo(() => sortingFromSortParam(sort), [sort]);

  const onSortingChange: OnChangeFn<SortingState> = useCallback(
    (updater) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      const param = sortParamFromSorting(next);
      replaceQuery({ sort: param, page: "1" });
    },
    [sorting, replaceQuery],
  );

  // Selection controlled by compare tray (global, multi-page aware)
  const rowSelection = useMemo<RowSelectionState>(() => {
    const state: RowSelectionState = {};
    for (const id of compare.selectedIds) {
      if (data.some((r) => r.id === id)) state[id] = true;
    }
    return state;
  }, [compare.selectedIds, data]);

  const onRowSelectionChange: OnChangeFn<RowSelectionState> = useCallback(
    (updater) => {
      // Page-local selection state from the table (only current page keys toggle)
      const pageState: RowSelectionState = { ...rowSelection };
      const nextPage =
        typeof updater === "function" ? updater(pageState) : updater;

      const pageIds = new Set(data.map((r) => r.id));
      // Desired selection for current page
      const wantOnPage = new Set(
        Object.entries(nextPage)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .filter((id) => pageIds.has(id)),
      );

      // Models on this page currently selected
      const currentlyOnPage = compare.selected.filter((m) =>
        pageIds.has(m.id),
      );
      const currentlyOnPageIds = new Set(currentlyOnPage.map((m) => m.id));

      // Off-page selections stay; track remaining capacity with a local count
      let selectedCount = compare.selected.length;

      // Removals
      for (const m of currentlyOnPage) {
        if (!wantOnPage.has(m.id)) {
          compare.remove(m.id);
          selectedCount -= 1;
        }
      }

      // Additions (cap at max)
      const toAdd = [...wantOnPage].filter((id) => !currentlyOnPageIds.has(id));
      let blocked = false;
      for (const id of toAdd) {
        if (selectedCount >= compare.max) {
          blocked = true;
          break;
        }
        const row = data.find((r) => r.id === id);
        if (row) {
          compare.add({ id: row.id, name: row.name });
          selectedCount += 1;
        }
      }
      if (blocked) {
        setSelectionNotice(
          `Compare is limited to ${compare.max} models. Remove one before adding another.`,
        );
      } else {
        setSelectionNotice(null);
      }
    },
    [compare, data, rowSelection],
  );

  const columns = useMemo(
    () => buildModelColumns(visibleColumns),
    [visibleColumns],
  );

  const total = pageInfo.total ?? data.length;
  const pageSize = pageInfo.pageSize ?? limit;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openModel = useCallback(
    (model: ModelTableRow) => {
      openDrawer({
        title: model.name,
        size: "md",
        body: <ModelDrawerBody model={model} />,
        footer: (
          <div style={{ display: "flex", gap: "var(--space-2)", width: "100%" }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (
                  !compare.isSelected(model.id) &&
                  compare.selectedIds.length >= compare.max
                ) {
                  setSelectionNotice(
                    `Compare is limited to ${compare.max} models. Remove one before adding another.`,
                  );
                  return;
                }
                compare.toggle({ id: model.id, name: model.name });
              }}
            >
              {compare.isSelected(model.id) ? "Remove compare" : "Compare"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                router.push(`/models/${encodeURIComponent(model.id)}`)
              }
            >
              Open full page
            </Button>
          </div>
        ),
      });
    },
    [openDrawer, compare, router],
  );

  const toggleSelectModel = useCallback(
    (model: ModelTableRow) => {
      if (compare.isSelected(model.id)) {
        compare.remove(model.id);
        setSelectionNotice(null);
        return;
      }
      if (compare.selectedIds.length >= compare.max) {
        setSelectionNotice(
          `Compare is limited to ${compare.max} models. Remove one before adding another.`,
        );
        return;
      }
      compare.add({ id: model.id, name: model.name });
      setSelectionNotice(null);
    },
    [compare],
  );

  const compareModel = useCallback(
    (model: ModelTableRow) => {
      if (
        !compare.isSelected(model.id) &&
        compare.selectedIds.length >= compare.max
      ) {
        setSelectionNotice(
          `Compare is limited to ${compare.max} models. Remove one before adding another.`,
        );
        return;
      }
      compare.toggle({ id: model.id, name: model.name });
      setSelectionNotice(null);
    },
    [compare],
  );

  const favouriteModel = useCallback(
    async (model: ModelTableRow) => {
      setActionBusyId(model.id);
      try {
        const res = await fetch(`/api/v1/models/${encodeURIComponent(model.id)}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isFavourite: !model.isFavourite }),
        });
        if (!res.ok) throw new Error("Favourite update failed");
        setData((prev) =>
          prev.map((r) =>
            r.id === model.id ? { ...r, isFavourite: !model.isFavourite } : r,
          ),
        );
      } catch {
        setError("Could not update favourite");
      } finally {
        setActionBusyId(null);
      }
    },
    [],
  );

  const editModel = useCallback(
    (model: ModelTableRow) => {
      router.push(`/models/${encodeURIComponent(model.id)}/edit`);
    },
    [router],
  );

  const archiveModel = useCallback(
    async (model: ModelTableRow) => {
      setActionBusyId(model.id);
      try {
        const res = await fetch(`/api/v1/models/${encodeURIComponent(model.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Archive failed");
        setData((prev) => prev.filter((r) => r.id !== model.id));
        if (compare.isSelected(model.id)) compare.remove(model.id);
      } catch {
        setError("Could not archive model");
      } finally {
        setActionBusyId(null);
      }
    },
    [compare],
  );

  const changeViewMode = useCallback(
    (v: ModelsViewMode) => {
      setViewMode(v);
      persistModelsViewMode(v);
      if (v === "compact") setDensity("compact");
      else if (v === "cards") setDensity("comfortable");
      else setDensity("standard");
      // Only patch view chrome — filters, sort, page, selection stay.
      replaceQuery(viewModeQueryPatch(v));
    },
    [replaceQuery, setDensity],
  );

  const toggleColumn = (id: ModelColumnId) => {
    if (id === "model") return; // identity always on
    setVisibleColumns((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((c) => c !== id) : [...prev, id];
      // Keep default order then optional order
      const order = [...DEFAULT_COLUMN_IDS, ...OPTIONAL_COLUMN_IDS];
      next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      try {
        window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const footer: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-3) var(--space-4)",
    border: "1px solid var(--border)",
    borderTop: "none",
    background: "var(--bg-card)",
    borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
    fontSize: "var(--text-meta-size)",
    color: "var(--text-muted)",
    fontFamily: "var(--font-sans)",
    flexWrap: "wrap",
  };

  const head: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--space-3)",
    marginBottom: "var(--space-3)",
    flexWrap: "wrap",
  };

  return (
    <div data-testid="models-table-root">
      <div style={head}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--text-page-size)",
              fontWeight: 600,
              lineHeight: "var(--text-page-line)",
              color: "var(--text)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Models
          </h1>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: "var(--text-meta-size)",
              fontWeight: 400,
            }}
            data-testid="models-count"
          >
            {total} models
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <SegmentedControl
            label="Models view mode"
            size="sm"
            value={viewMode}
            onChange={(v) => {
              if (v === "table" || v === "cards" || v === "compact") {
                changeViewMode(v);
              }
            }}
            options={[
              { value: "table", label: "Table" },
              { value: "cards", label: "Cards" },
              { value: "compact", label: "Compact" },
            ]}
          />

          <Popover
            align="end"
            trigger={
              <Button variant="ghost" size="sm" data-testid="column-picker-trigger">
                Columns
              </Button>
            }
          >
            <div
              data-testid="column-picker"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
                minWidth: 200,
                maxHeight: 320,
                overflow: "auto",
              }}
            >
              <div
                style={{
                  fontSize: "var(--text-meta-size)",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-1)",
                }}
              >
                Default
              </div>
              {DEFAULT_COLUMN_IDS.map((id) => (
                <label
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    fontSize: "var(--text-meta-size)",
                    color: "var(--text)",
                    cursor: id === "model" ? "default" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(id)}
                    disabled={id === "model"}
                    onChange={() => toggleColumn(id)}
                  />
                  {COLUMN_LABELS[id]}
                </label>
              ))}
              <div
                style={{
                  fontSize: "var(--text-meta-size)",
                  color: "var(--text-muted)",
                  margin: "var(--space-2) 0 var(--space-1)",
                }}
              >
                Optional
              </div>
              {OPTIONAL_COLUMN_IDS.map((id) => (
                <label
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    fontSize: "var(--text-meta-size)",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(id)}
                    onChange={() => toggleColumn(id)}
                  />
                  {COLUMN_LABELS[id]}
                </label>
              ))}
            </div>
          </Popover>
        </div>
      </div>

      <FilterBar />

      {selectionNotice ? (
        <div
          role="status"
          data-testid="compare-cap-notice"
          style={{
            marginBottom: "var(--space-2)",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--warn-bg)",
            background: "var(--warn-bg)",
            color: "var(--warn)",
            fontSize: "var(--text-meta-size)",
          }}
        >
          {selectionNotice}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          style={{
            marginBottom: "var(--space-2)",
            color: "var(--danger)",
            fontSize: "var(--text-meta-size)",
          }}
        >
          {error}
        </div>
      ) : null}

      {viewMode === "cards" ? (
        <div style={{ marginBottom: 0 }}>
          <ModelsCardsGrid
            models={data}
            selectedIds={compare.selectedIds}
            loading={loading}
            busyId={actionBusyId}
            onOpen={openModel}
            onToggleSelect={toggleSelectModel}
            onCompare={compareModel}
            onFavourite={(m) => {
              void favouriteModel(m);
            }}
            onEdit={editModel}
            onArchive={(m) => {
              void archiveModel(m);
            }}
          />
        </div>
      ) : viewMode === "compact" ? (
        <ModelsCompact
          models={data}
          selectedIds={compare.selectedIds}
          loading={loading}
          onOpen={openModel}
          onToggleSelect={toggleSelectModel}
        />
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <DataTable<ModelTableRow>
            data={data}
            columns={columns}
            density={density}
            enableSelection
            stickySelection
            manualSorting
            sorting={sorting}
            onSortingChange={onSortingChange}
            rowSelection={rowSelection}
            onRowSelectionChange={onRowSelectionChange}
            getRowId={(row) => row.id}
            onRowClick={openModel}
            emptyMessage={loading ? "Loading…" : "No models found"}
            data-testid="models-data-table"
            style={{
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            }}
          />
        </div>
      )}

      <div
        style={{
          ...footer,
          borderTop:
            viewMode === "cards" ? "1px solid var(--border)" : footer.borderTop,
          borderRadius:
            viewMode === "cards"
              ? "var(--radius-lg)"
              : "0 0 var(--radius-lg) var(--radius-lg)",
          marginTop: viewMode === "cards" ? "var(--space-3)" : 0,
        }}
        data-testid="models-table-footer"
      >
        <span>{compare.selected.length} selected</span>
        <span style={{ color: "var(--text-faint)" }}>
          Select up to {compare.max} models to compare
        </span>
        <span style={{ flex: 1 }} />
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          Rows per page:
          <Select
            aria-label="Rows per page"
            options={PAGE_SIZE_OPTIONS.map((v) => ({
              value: v,
              label: v,
            }))}
            value={String(limit)}
            onChange={(v) => replaceQuery({ limit: v, page: "1" })}
            style={{ width: 72 }}
          />
        </label>
        <span data-testid="models-page-range">
          {from}–{to} of {total}
        </span>
        <div style={{ display: "inline-flex", gap: "var(--space-1)" }}>
          <IconButton
            label="Previous page"
            disabled={page <= 1 || loading}
            onClick={() =>
              replaceQuery({ page: String(Math.max(1, page - 1)) })
            }
          >
            ‹
          </IconButton>
          <IconButton
            label="Next page"
            disabled={page >= totalPages || loading}
            onClick={() =>
              replaceQuery({
                page: String(Math.min(totalPages, page + 1)),
              })
            }
          >
            ›
          </IconButton>
        </div>
      </div>
    </div>
  );
}
