"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Dialog, Input, Popover } from "@model-monitor/ui";
import { useDensity } from "@/components/shell";
import {
  normalizeViewFilters,
  serializeModelFilters,
  sortParamFromViewSort,
  useModelFilters,
  viewSortFromSortParam,
  type ModelFilterState,
} from "@/lib/use-model-filters";
import {
  DEFAULT_COLUMN_IDS,
  OPTIONAL_COLUMN_IDS,
  type ModelColumnId,
} from "./models-columns";
import {
  VIEW_MODE_STORAGE_KEY,
  type ModelsViewMode,
} from "@/lib/models-view-mode";

const COLUMNS_STORAGE_KEY = "mm.models.columns";

export type SavedViewRecord = {
  id: string;
  name: string;
  slug: string;
  filters: Record<string, unknown>;
  sort: Record<string, unknown> | unknown[];
  visibleColumns: string[];
  viewMode: ModelsViewMode;
  density: "comfortable" | "standard" | "compact";
  isDefault: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

type DialogMode = null | "save" | "rename" | "delete";

function mapApiColumnsToTable(ids: string[]): ModelColumnId[] {
  const alias: Record<string, ModelColumnId> = {
    name: "model",
    model: "model",
    creator: "creator",
    accessProvider: "accessProvider",
    plan: "plan",
    workflowStatus: "status",
    status: "status",
    context: "context",
    speed: "speed",
    overallScore: "overallScore",
    bestSkill: "bestSkill",
    costQuota: "costOrQuota",
    costOrQuota: "costOrQuota",
    tags: "tags",
    updated: "updated",
    updatedAt: "updated",
    family: "family",
    generation: "generation",
    lifecycle: "lifecycle",
    modelType: "modelType",
    maxOutput: "maxOutput",
    accessType: "accessType",
    scoreBasis: "scoreBasis",
    canonicalId: "canonicalId",
    verifiedTps: "verifiedTps",
  };
  const allowed = new Set<string>([
    ...DEFAULT_COLUMN_IDS,
    ...OPTIONAL_COLUMN_IDS,
  ]);
  const out: ModelColumnId[] = [];
  for (const raw of ids) {
    const mapped = alias[raw] ?? (raw as ModelColumnId);
    if (allowed.has(mapped) && !out.includes(mapped)) out.push(mapped);
  }
  if (!out.includes("model")) out.unshift("model");
  return out.length > 0 ? out : [...DEFAULT_COLUMN_IDS];
}

function tableColumnsToApi(ids: ModelColumnId[]): string[] {
  const reverse: Partial<Record<ModelColumnId, string>> = {
    model: "name",
    status: "workflowStatus",
    updated: "updatedAt",
    costOrQuota: "costQuota",
  };
  return ids.map((id) => reverse[id] ?? id);
}

function loadVisibleColumns(): ModelColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_COLUMN_IDS];
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_COLUMN_IDS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_COLUMN_IDS];
    return mapApiColumnsToTable(parsed.map(String));
  } catch {
    return [...DEFAULT_COLUMN_IDS];
  }
}

function persistVisibleColumns(ids: ModelColumnId[]) {
  try {
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function persistViewMode(mode: "table" | "cards" | "compact") {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Saved-view selector for the top bar: pick a view (applies filters, sort,
 * columns, view mode, density) plus save / rename / update / delete.
 */
export function SavedViews() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filters } = useModelFilters();
  const { density, setDensity } = useDensity();

  const [views, setViews] = useState<SavedViewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);

  const activeViewId = searchParams.get("viewId");

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId],
  );

  const defaultView = useMemo(
    () => views.find((v) => v.isDefault) ?? views[0] ?? null,
    [views],
  );

  const label = activeView?.name ?? defaultView?.name ?? "Saved Views";

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/saved-views", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Failed to load views (${res.status})`);
      const json = (await res.json()) as {
        data?: SavedViewRecord[];
      };
      const list = Array.isArray(json.data) ? json.data : [];
      setViews(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load saved views");
      setViews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const replaceQuery = useCallback(
    (next: URLSearchParams) => {
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const applyView = useCallback(
    (view: SavedViewRecord) => {
      const normalized = normalizeViewFilters(view.filters ?? {});
      const sortParam =
        sortParamFromViewSort(view.sort) ??
        searchParams.get("sort") ??
        "name";

      const cols = mapApiColumnsToTable(view.visibleColumns ?? []);
      persistVisibleColumns(cols);
      persistViewMode(view.viewMode ?? "table");
      setDensity(view.density ?? "standard");

      const next = serializeModelFilters(normalized, searchParams);
      next.set("sort", sortParam);
      next.set("view", view.viewMode ?? "table");
      next.set("density", view.density ?? "standard");
      next.set("cols", cols.join(","));
      next.set("viewId", view.id);
      next.delete("page");
      replaceQuery(next);

      // Notify same-tab listeners (models table watches storage + custom event)
      try {
        window.dispatchEvent(
          new CustomEvent("mm:saved-view-applied", {
            detail: {
              viewId: view.id,
              viewMode: view.viewMode,
              density: view.density,
              columns: cols,
            },
          }),
        );
      } catch {
        /* ignore */
      }
    },
    [searchParams, replaceQuery, setDensity],
  );

  const captureCurrent = useCallback((): {
    filters: ModelFilterState;
    sort: { field: string; dir: "asc" | "desc" };
    visibleColumns: string[];
    viewMode: "table" | "cards" | "compact";
    density: "comfortable" | "standard" | "compact";
  } => {
    const sort = viewSortFromSortParam(searchParams.get("sort"));
    const viewModeRaw = searchParams.get("view") ?? "table";
    const viewMode =
      viewModeRaw === "cards" || viewModeRaw === "compact"
        ? viewModeRaw
        : "table";
    const cols = loadVisibleColumns();
    return {
      filters: { ...filters },
      sort,
      visibleColumns: tableColumnsToApi(cols),
      viewMode,
      density,
    };
  }, [filters, searchParams, density]);

  const openSave = () => {
    setNameInput("");
    setDialog("save");
  };

  const openRename = () => {
    if (!activeView) return;
    setNameInput(activeView.name);
    setDialog("rename");
  };

  const openDelete = () => {
    if (!activeView) return;
    setDialog("delete");
  };

  const onUpdate = async () => {
    if (!activeView) return;
    setBusy(true);
    setError(null);
    try {
      const snap = captureCurrent();
      const res = await fetch(`/api/v1/saved-views/${activeView.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: snap.filters,
          sort: snap.sort,
          visibleColumns: snap.visibleColumns,
          viewMode: snap.viewMode,
          density: snap.density,
        }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const onConfirmDialog = async () => {
    if (dialog === "save") {
      const name = nameInput.trim();
      if (!name) return;
      setBusy(true);
      setError(null);
      try {
        const snap = captureCurrent();
        const res = await fetch("/api/v1/saved-views", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            filters: snap.filters,
            sort: snap.sort,
            visibleColumns: snap.visibleColumns,
            viewMode: snap.viewMode,
            density: snap.density,
          }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        const created = (await res.json()) as SavedViewRecord;
        await reload();
        setDialog(null);
        if (created?.id) {
          const next = new URLSearchParams(searchParams.toString());
          next.set("viewId", created.id);
          replaceQuery(next);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (dialog === "rename" && activeView) {
      const name = nameInput.trim();
      if (!name) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/saved-views/${activeView.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(`Rename failed (${res.status})`);
        await reload();
        setDialog(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Rename failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (dialog === "delete" && activeView) {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/saved-views/${activeView.id}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Delete failed (${res.status})`);
        const next = new URLSearchParams(searchParams.toString());
        next.delete("viewId");
        replaceQuery(next);
        await reload();
        setDialog(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setBusy(false);
      }
    }
  };

  const selectPill: CSSProperties = {
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-1_5) var(--space-3)",
    color: "var(--text-muted)",
    fontSize: "var(--text-meta-size)",
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    maxWidth: 220,
  };

  const menuItem: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "var(--space-1_5) var(--space-2)",
    border: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: "var(--text-meta-size)",
    fontFamily: "var(--font-sans)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  };

  return (
    <div data-testid="saved-views-root" style={{ display: "inline-flex", gap: "var(--space-1)" }}>
      <Popover
        align="end"
        data-testid="saved-view-selector"
        trigger={
          <button
            type="button"
            style={selectPill}
            aria-haspopup="listbox"
            aria-label="Saved views"
            title={error ?? "Saved view"}
            data-testid="saved-view-selector-trigger"
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "Saved Views…" : label}
            </span>
            <span aria-hidden style={{ color: "var(--text-faint)" }}>
              ▾
            </span>
          </button>
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 240,
            maxHeight: 360,
            overflow: "auto",
          }}
        >
          <div
            style={{
              fontSize: "var(--text-meta-size)",
              color: "var(--text-muted)",
              padding: "var(--space-1) var(--space-2)",
            }}
            data-testid="saved-views-count"
            data-count={views.length}
          >
            {views.length} views
          </div>

          {views.map((view) => {
            const selected = view.id === activeViewId;
            return (
              <button
                key={view.id}
                type="button"
                role="option"
                aria-selected={selected}
                data-testid={`saved-view-option-${view.slug}`}
                data-default={view.isDefault ? "true" : "false"}
                style={{
                  ...menuItem,
                  background: selected ? "var(--accent-bg)" : "transparent",
                  color: selected ? "var(--accent)" : "var(--text)",
                  fontWeight: view.isDefault ? 600 : 400,
                }}
                onClick={() => applyView(view)}
              >
                {view.name}
                {view.isDefault ? " · default" : ""}
              </button>
            );
          })}

          <div
            style={{
              borderTop: "1px solid var(--border-subtle)",
              marginTop: "var(--space-1)",
              paddingTop: "var(--space-1)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <button
              type="button"
              style={menuItem}
              data-testid="saved-view-save"
              onClick={openSave}
            >
              Save current as…
            </button>
            <button
              type="button"
              style={menuItem}
              data-testid="saved-view-update"
              disabled={!activeView || busy}
              onClick={() => void onUpdate()}
            >
              Update current view
            </button>
            <button
              type="button"
              style={menuItem}
              data-testid="saved-view-rename"
              disabled={!activeView}
              onClick={openRename}
            >
              Rename…
            </button>
            <button
              type="button"
              style={{ ...menuItem, color: "var(--danger)" }}
              data-testid="saved-view-delete"
              disabled={!activeView}
              onClick={openDelete}
            >
              Delete…
            </button>
          </div>
        </div>
      </Popover>

      <Dialog
        open={dialog === "save" || dialog === "rename"}
        onClose={() => !busy && setDialog(null)}
        title={dialog === "rename" ? "Rename view" : "Save view"}
        data-testid="saved-view-name-dialog"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !nameInput.trim()}
              onClick={() => void onConfirmDialog()}
              data-testid="saved-view-name-confirm"
            >
              {dialog === "rename" ? "Rename" : "Save"}
            </Button>
          </>
        }
      >
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
            fontSize: "var(--text-meta-size)",
            color: "var(--text-muted)",
          }}
        >
          Name
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="My view"
            data-testid="saved-view-name-input"
            autoFocus
          />
        </label>
        {error ? (
          <p style={{ color: "var(--danger)", fontSize: "var(--text-meta-size)" }}>
            {error}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={dialog === "delete"}
        onClose={() => !busy && setDialog(null)}
        title="Delete view"
        data-testid="saved-view-delete-dialog"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => void onConfirmDialog()}
              data-testid="saved-view-delete-confirm"
            >
              Delete
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: "var(--text)", fontSize: "var(--text-meta-size)" }}>
          Delete “{activeView?.name}”? This cannot be undone.
        </p>
        {error ? (
          <p style={{ color: "var(--danger)", fontSize: "var(--text-meta-size)" }}>
            {error}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}

/** Default view count helper for evidence / tests (seeded catalogue size). */
export const SEEDED_DEFAULT_VIEW_SLUGS = [
  "all-models",
  "favourites",
  "needs-review",
  "active",
  "testing-preview",
  "legacy",
  "coding-specialists",
  "vision-capable",
  "reasoning",
  "open-weights",
  "api-access",
  "subscription-access",
  "missing-personal-rating",
  "missing-cost",
  "card-gallery",
] as const;
