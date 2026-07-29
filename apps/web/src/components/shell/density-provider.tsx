"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Density } from "@model-monitor/ui";

const STORAGE_KEY = "mm.density";
const DEFAULT_DENSITY: Density = "standard";

type DensityContextValue = {
  density: Density;
  setDensity: (density: Density) => void;
};

const DensityContext = createContext<DensityContextValue | null>(null);

function isDensity(value: string | null): value is Density {
  return value === "comfortable" || value === "standard" || value === "compact";
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>(DEFAULT_DENSITY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isDensity(stored)) setDensityState(stored);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.density = density;
  }, [density, hydrated]);

  const value = useMemo(
    () => ({ density, setDensity }),
    [density, setDensity],
  );

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
}

export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  if (!ctx) {
    throw new Error("useDensity must be used within DensityProvider");
  }
  return ctx;
}
