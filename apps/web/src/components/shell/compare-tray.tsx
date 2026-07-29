"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

type CompareTrayContextValue = {
  selected: CompareModelRef[];
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  toggle: (model: CompareModelRef) => void;
  add: (model: CompareModelRef) => void;
  remove: (id: string) => void;
  clear: () => void;
  max: number;
};

const CompareTrayContext = createContext<CompareTrayContextValue | null>(null);

const MAX_COMPARE = 4;

export function CompareTrayProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<CompareModelRef[]>([]);

  const add = useCallback((model: CompareModelRef) => {
    setSelected((prev) => {
      if (prev.some((m) => m.id === model.id)) return prev;
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, model];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSelected((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const toggle = useCallback((model: CompareModelRef) => {
    setSelected((prev) => {
      if (prev.some((m) => m.id === model.id)) {
        return prev.filter((m) => m.id !== model.id);
      }
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, model];
    });
  }, []);

  const clear = useCallback(() => setSelected([]), []);

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
    }),
    [selected, isSelected, toggle, add, remove, clear],
  );

  return (
    <CompareTrayContext.Provider value={value}>
      {children}
      <CompareTrayMount />
    </CompareTrayContext.Provider>
  );
}

function CompareTrayMount() {
  const { selected, clear } = useCompareTray();
  const router = useRouter();

  if (selected.length === 0) return null;

  const bar: CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: "var(--space-6)",
    transform: "translateX(-50%)",
    zIndex: 30,
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-2) var(--space-4)",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-full)",
    color: "var(--text)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-meta-size)",
    minWidth: 280,
    maxWidth: "min(720px, calc(100vw - 48px))",
  };

  const countLabel =
    selected.length === 1
      ? "1 model selected"
      : `${selected.length} models selected`;

  return (
    <div
      role="region"
      aria-label="Compare selection"
      data-testid="compare-tray"
      style={bar}
    >
      <span style={{ color: "var(--text-muted)", flex: 1 }}>{countLabel}</span>
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
  );
}

export function useCompareTray(): CompareTrayContextValue {
  const ctx = useContext(CompareTrayContext);
  if (!ctx) {
    throw new Error("useCompareTray must be used within CompareTrayProvider");
  }
  return ctx;
}
