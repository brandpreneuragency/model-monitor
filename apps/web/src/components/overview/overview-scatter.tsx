"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Card, EmptyState, Select } from "@model-monitor/ui";
import {
  omitIncompleteScatterPoints,
  SCATTER_AXIS_PAIRS,
  type ScatterAxisPairId,
  type ScatterPoint,
} from "@/components/rankings/ranking-scatter";
import {
  useChartChrome,
  useChartColors,
} from "@/components/rankings/chart-tokens";
import type { OverviewScatterPoint } from "./types";
import { readApiError } from "./utils";

export type OverviewScatterProps = {
  /** Initial points (server-loaded default axes). */
  initialPoints?: OverviewScatterPoint[];
  initialX?: string;
  initialY?: string;
  fetchImpl?: typeof fetch;
  /** Controlled pair for tests. */
  pairId?: ScatterAxisPairId;
  onPairIdChange?: (id: ScatterAxisPairId) => void;
  /** Inject points and skip fetch (unit tests). */
  points?: OverviewScatterPoint[];
};

function pairFromAxes(x?: string, y?: string): ScatterAxisPairId {
  if (!x || !y) return "capability-vs-cost";
  const found = SCATTER_AXIS_PAIRS.find((p) => p.x === x && p.y === y);
  if (found) return found.id;
  // cost/price alias
  const foundAlias = SCATTER_AXIS_PAIRS.find(
    (p) =>
      (p.x === x || (x === "price" && p.x === "cost")) &&
      (p.y === y ||
        (y === "personal-score" && p.y === "personalScore") ||
        (y === "personalScore" && p.y === "personalScore")),
  );
  return foundAlias?.id ?? "capability-vs-cost";
}

function axisLabel(axis: string): string {
  switch (axis) {
    case "cost":
    case "price":
      return "Cost ($ / 1M tok)";
    case "personalScore":
    case "personal-score":
      return "Personal score";
    case "capability":
      return "Capability";
    case "coding":
      return "Coding";
    case "speed":
      return "Speed";
    case "context":
      return "Context";
    case "value":
      return "Value";
    default:
      return axis;
  }
}

type TipProps = {
  active?: boolean;
  payload?: Array<{ payload?: ScatterPoint & { x: number; y: number } }>;
};

function ScatterTip({ active, payload }: TipProps) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-2) var(--space-3)",
        fontSize: "var(--text-meta-size)",
        color: "var(--text)",
        boxShadow: "none",
      }}
    >
      <div style={{ fontWeight: 600 }}>{p.modelName}</div>
      <div style={{ color: "var(--text-muted)" }}>
        x={p.x} · y={p.y}
      </div>
    </div>
  );
}

export function OverviewScatter({
  initialPoints = [],
  initialX = "cost",
  initialY = "capability",
  fetchImpl = fetch,
  pairId: controlledPair,
  onPairIdChange,
  points: injectedPoints,
}: OverviewScatterProps) {
  const defaultPair = pairFromAxes(initialX, initialY);
  const [pairId, setPairId] = useState<ScatterAxisPairId>(
    controlledPair ?? defaultPair,
  );
  const [rawPoints, setRawPoints] = useState<OverviewScatterPoint[]>(
    injectedPoints ?? initialPoints,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUserChanged, setHasUserChanged] = useState(false);

  useEffect(() => {
    if (controlledPair) setPairId(controlledPair);
  }, [controlledPair]);

  useEffect(() => {
    if (injectedPoints !== undefined) setRawPoints(injectedPoints);
  }, [injectedPoints]);

  const pair =
    SCATTER_AXIS_PAIRS.find((p) => p.id === pairId) ?? SCATTER_AXIS_PAIRS[0];

  const load = useCallback(async () => {
    // Explicit points prop (including []) — tests / controlled mode; never fetch.
    if (injectedPoints !== undefined) {
      setRawPoints(injectedPoints);
      return;
    }
    // Server-provided snapshot until the user changes axes.
    if (!hasUserChanged) {
      setRawPoints(initialPoints);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("x", pair.x);
      qs.set("y", pair.y);
      const res = await fetchImpl(`/api/v1/overview/scatter?${qs.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as { data?: OverviewScatterPoint[] };
      setRawPoints(Array.isArray(body.data) ? body.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scatter");
      setRawPoints([]);
    } finally {
      setLoading(false);
    }
  }, [fetchImpl, hasUserChanged, initialPoints, injectedPoints, pair.x, pair.y]);

  useEffect(() => {
    void load();
  }, [load]);

  const points = useMemo(
    () => omitIncompleteScatterPoints(rawPoints),
    [rawPoints],
  );

  const colors = useChartColors(1);
  const chrome = useChartChrome();
  const fill = colors[0] ?? "var(--chart-1)";
  const logX = Boolean(pair.logX);

  function changePair(id: string) {
    const next = id as ScatterAxisPairId;
    setPairId(next);
    setHasUserChanged(true);
    onPairIdChange?.(next);
  }

  const subtitle =
    pair.id === "capability-vs-cost"
      ? "(Per 1M Tokens Input)"
      : "";

  return (
    <Card
      data-testid="overview-scatter"
      data-pair={pair.id}
      data-point-count={points.length}
      data-x={pair.x}
      data-y={pair.y}
      padding="md"
      style={{ minWidth: 0 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-3)",
          gap: "var(--space-2)",
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--text-section-size)",
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          Capability vs Cost{" "}
          {subtitle ? (
            <span
              style={{
                color: "var(--text-faint)",
                fontWeight: 400,
                fontSize: "var(--text-meta-size)",
              }}
            >
              {subtitle}
            </span>
          ) : null}
        </h2>
        <label style={{ display: "grid", gap: 2, minWidth: 160 }}>
          <span className="sr-only">Axis pair</span>
          <Select
            options={SCATTER_AXIS_PAIRS.map((p) => ({
              value: p.id,
              label: p.label,
            }))}
            value={pairId}
            onChange={changePair}
            data-testid="overview-scatter-axis-select"
          />
        </label>
      </div>

      {error ? (
        <div
          data-testid="overview-scatter-error"
          style={{ color: "var(--danger)", fontSize: "var(--text-meta-size)" }}
        >
          {error}
        </div>
      ) : null}

      {loading && points.length === 0 ? (
        <div
          data-testid="overview-scatter-loading"
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
            padding: "var(--space-6)",
            textAlign: "center",
          }}
        >
          Loading…
        </div>
      ) : points.length === 0 ? (
        <EmptyState
          data-testid="overview-scatter-empty"
          title="No scatter points"
          message="Models missing either axis value are omitted — never plotted at zero."
          style={{ padding: "var(--space-4)" }}
        />
      ) : (
        <div style={{ width: "100%", height: 200 }} data-testid="overview-scatter-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid
                stroke={chrome.grid}
                strokeDasharray="2 3"
                vertical={false}
              />
              <XAxis
                type="number"
                dataKey="x"
                name={axisLabel(pair.x)}
                stroke={chrome.axis}
                tick={{ fill: chrome.axis, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: chrome.grid }}
                scale={logX ? "log" : "auto"}
                domain={logX ? [0.01, "auto"] : ["auto", "auto"]}
                allowDataOverflow={logX}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={axisLabel(pair.y)}
                stroke={chrome.axis}
                tick={{ fill: chrome.axis, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: chrome.grid }}
                width={36}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                content={<ScatterTip />}
                cursor={{ stroke: chrome.grid }}
              />
              <Scatter
                data={points}
                fill={fill}
                isAnimationActive={false}
                name="Models"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
