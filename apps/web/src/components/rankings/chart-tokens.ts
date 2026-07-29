"use client";

import { useEffect, useState } from "react";

/** Chart series CSS custom properties from packages/ui tokens. */
export const CHART_COLOR_VARS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
] as const;

export const CHART_GRID_VAR = "--chart-grid";
export const CHART_AXIS_VAR = "--chart-axis";

/**
 * Resolve CSS custom properties to concrete colour values for Recharts props.
 * Never hard-code hex in components — tokens.css is the only colour source.
 */
export function readCssVar(name: string, fallback = ""): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function readChartColors(count: number): string[] {
  const n = Math.max(0, Math.min(count, CHART_COLOR_VARS.length));
  return CHART_COLOR_VARS.slice(0, n).map((v) => readCssVar(v, `var(${v})`));
}

/** Hook: re-read chart colours after mount (SSR-safe). */
export function useChartColors(count: number): string[] {
  const [colors, setColors] = useState<string[]>(() =>
    CHART_COLOR_VARS.slice(0, Math.max(0, Math.min(count, CHART_COLOR_VARS.length))).map(
      (v) => `var(${v})`,
    ),
  );

  useEffect(() => {
    setColors(readChartColors(count));
  }, [count]);

  return colors;
}

export function useChartChrome(): { grid: string; axis: string } {
  const [chrome, setChrome] = useState({
    grid: `var(${CHART_GRID_VAR})`,
    axis: `var(${CHART_AXIS_VAR})`,
  });

  useEffect(() => {
    setChrome({
      grid: readCssVar(CHART_GRID_VAR, `var(${CHART_GRID_VAR})`),
      axis: readCssVar(CHART_AXIS_VAR, `var(${CHART_AXIS_VAR})`),
    });
  }, []);

  return chrome;
}
