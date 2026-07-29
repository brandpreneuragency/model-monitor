"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@model-monitor/ui";

export type CompareModelRef = {
  id: string;
  name: string;
};

export const COMPARE_TRAY_MAX = 4;

export const COMPARE_LIMIT_MESSAGE = `Compare is limited to ${COMPARE_TRAY_MAX} models. Remove one before adding another.`;

type CompareTrayContextValue = {
  selected: CompareModelRef[];
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  /** Returns false when the model was refused (already at max). */
  toggle: (model: CompareModelRef) => boolean;
  /** Returns false when the model was refused (already at max). */
  add: (model: CompareModelRef) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  max: number;
  /** Set when a fifth (or beyond) selection is refused. */
  limitNotice: string | null;
  clearLimitNotice: () => void;
};

const CompareTrayContext = createContext<CompareTrayContextValue | null>(null);

const MAX_COMPARE = COMPARE_TRAY_MAX;

export function CompareTrayProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<CompareModelRef[]>([]);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  /** Mirror of selected for sync decisions inside event handlers. */
  const selectedRef = useRef<CompareModelRef[]>([]);

  const commit = useCallback((next: CompareModelRef[]) => {
    selectedRef.current = next;
    setSelected(next);
  }, []);

  const clearLimitNotice = useCallback(() => setLimitNotice(null), []);

  const add = useCallback(
    (model: CompareModelRef): boolean => {
      const prev = selectedRef.current;
      if (prev.some((m) => m.id === model.id)) {
        setLimitNotice(null);
        return true;
      }
      if (prev.length >= MAX_COMPARE) {
        setLimitNotice(COMPARE_LIMIT_MESSAGE);
        return false;
      }
      commit([...prev, model]);
      setLimitNotice(null);
      return true;
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      commit(selectedRef.current.filter((m) => m.id !== id));
      setLimitNotice(null);
    },
    [commit],
  );

  const toggle = useCallback(
    (model: CompareModelRef): boolean => {
      const prev = selectedRef.current;
      if (prev.some((m) => m.id === model.id)) {
        commit(prev.filter((m) => m.id !== model.id));
        setLimitNotice(null);
        return true;
      }
      if (prev.length >= MAX_COMPARE) {
        setLimitNotice(COMPARE_LIMIT_MESSAGE);
        return false;
      }
      commit([...prev, model]);
      setLimitNotice(null);
      return true;
    },
    [commit],
  );

  const clear = useCallback(() => {
    commit([]);
    setLimitNotice(null);
  }, [commit]);

  const isSelected = useCallback(
    (id: string) => selected.some((m) => m.id === id),
    [selected],
  );

  const value = useMemo(
    () => ({
      selected,
      selectedIds: selected.map((m) => m.id),
      isSelected,
      toggle,
      add,
      remove,
      clear,
      max: MAX_COMPARE,
      limitNotice,
      clearLimitNotice,
    }),
    [
      selected,
      isSelected,
      toggle,
      add,
      remove,
      clear,
      limitNotice,
      clearLimitNotice,
    ],
  );

  return (
    <CompareTrayContext.Provider value={value}>
      {children}
      <CompareTrayMount />
    </CompareTrayContext.Provider>
  );
}

function CompareTrayMount() {
  const { selected, clear, remove, limitNotice, clearLimitNotice } =
    useCompareTray();
  const router = useRouter();

  if (selected.length === 0 && !limitNotice) return null;

  const bar: CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: "var(--space-6)",
    transform: "translateX(-50%)",
    zIndex: 30,
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
    padding: "var(--space-2) var(--space-4)",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    color: "var(--text)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-meta-size)",
    minWidth: 280,
    maxWidth: "min(720px, calc(100vw - 48px))",
  };

  const row: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
  };

  const countLabel =
    selected.length === 0
      ? "No models selected"
      : selected.length === 1
        ? "1 model selected"
        : `${selected.length} models selected`;

  return (
    <div
      role="region"
      aria-label="Compare selection"
      data-testid="compare-tray"
      style={bar}
    >
      {limitNotice ? (
        <div
          role="status"
          data-testid="compare-limit-notice"
          style={{
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-strong)",
            background: "var(--bg-card-hover)",
            color: "var(--text)",
            fontSize: "var(--text-meta-size)",
          }}
        >
          <span>{limitNotice}</span>
          <button
            type="button"
            data-testid="compare-limit-notice-dismiss"
            onClick={clearLimitNotice}
            style={{
              marginLeft: "var(--space-3)",
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "var(--text-meta-size)",
              textDecoration: "underline",
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {selected.length > 0 ? (
        <div style={row}>
          <span style={{ color: "var(--text-muted)", flex: 1 }}>
            {countLabel}
          </span>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-1)",
              maxWidth: 320,
            }}
          >
            {selected.map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`compare-tray-chip-${m.id}`}
                onClick={() => remove(m.id)}
                title={`Remove ${m.name}`}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-full)",
                  background: "var(--bg-input)",
                  color: "var(--text)",
                  padding: "2px 8px",
                  fontSize: "var(--text-meta-size)",
                  cursor: "pointer",
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.name} ×
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            size="sm"
            data-testid="compare-tray-compare"
            onClick={() => {
              const ids = selected.map((m) => m.id).join(",");
              router.push(`/models/compare?ids=${encodeURIComponent(ids)}`);
            }}
            disabled={selected.length < 2}
          >
            Compare
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="compare-tray-clear"
            onClick={clear}
          >
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function useCompareTray(): CompareTrayContextValue {
  const ctx = useContext(CompareTrayContext);
  if (!ctx) {
    throw new Error("useCompareTray must be used within CompareTrayProvider");
  }
  return ctx;
}
