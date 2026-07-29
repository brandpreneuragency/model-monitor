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
import { EmptyState, Select } from "@model-monitor/ui";
import { useChartChrome, useChartColors } from "./chart-tokens";
import { faintText, readApiError } from "./utils";

/** Axis pairs from redesign brief / PLAN scatter contract. */
export const SCATTER_AXIS_PAIRS = [
  {
    id: "capability-vs-cost",
    label: "Capability vs Cost",
    x: "cost",
    y: "capability",
    logX: true,
  },
  {
    id: "personal-score-vs-cost",
    label: "Personal Score vs Cost",
    x: "cost",
    y: "personalScore",
    logX: true,
  },
  {
    id: "coding-vs-speed",
    label: "Coding vs Speed",
    x: "coding",
    y: "speed",
    logX: false,
  },
  {
    id: "context-vs-price",
    label: "Context vs Price",
    x: "cost",
    y: "context",
    logX: true,
  },
  {
    id: "value-vs-capability",
    label: "Value vs Capability",
    x: "capability",
    y: "value",
    logX: false,
  },
] as const;

export type ScatterAxisPairId = (typeof SCATTER_AXIS_PAIRS)[number]["id"];

export type ScatterPoint = {
  modelId: string;
  modelName: string;
  modelSlug?: string;
  x: number | null | undefined;
  y: number | null | undefined;
  provider?: { id: string; name: string; slug: string } | null;
  modelType?: string | null;
};

export type RankingScatterProps = {
  fetchImpl?: typeof fetch;
  /** Inject points (skips fetch) — used by unit tests. */
  points?: ScatterPoint[];
  pairId?: ScatterAxisPairId;
  onPairIdChange?: (id: ScatterAxisPairId) => void;
  providerFilter?: string;
  planFilter?: string;
  modelTypeFilter?: string;
  accessTypeFilter?: string;
  providerOptions?: Array<{ value: string; label: string }>;
  planOptions?: Array<{ value: string; label: string }>;
  modelTypeOptions?: Array<{ value: string; label: string }>;
  accessTypeOptions?: Array<{ value: string; label: string }>;
};

/**
 * A model missing either axis value is omitted — never plotted at zero.
 */
export function omitIncompleteScatterPoints<T extends ScatterPoint>(
  points: T[],
): Array<T & { x: number; y: number }> {
  return points.filter(
    (p): p is T & { x: number; y: number } =>
      p.x != null &&
      p.y != null &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y),
  );
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
      return "Context tokens";
    case "value":
      return "Value";
    default:
      return axis;
  }
}

const LOG_TICKS = [0.01, 0.1, 1, 10, 100];

export function RankingScatter({
  fetchImpl = fetch,
  points: injectedPoints,
  pairId: controlledPair,
  onPairIdChange,
  providerFilter: controlledProvider,
  planFilter: controlledPlan,
  modelTypeFilter: controlledModelType,
  accessTypeFilter: controlledAccessType,
  providerOptions = [{ value: "all", label: "All providers" }],
  planOptions = [{ value: "all", label: "All plans" }],
  modelTypeOptions = [
    { value: "all", label: "All types" },
    { value: "chat", label: "Chat" },
    { value: "reasoning", label: "Reasoning" },
    { value: "code", label: "Code" },
    { value: "embedding", label: "Embedding" },
  ],
  accessTypeOptions = [
    { value: "all", label: "All access" },
    { value: "api", label: "API" },
    { value: "subscription", label: "Subscription" },
    { value: "free", label: "Free" },
  ],
}: RankingScatterProps) {
  const [pairId, setPairId] = useState<ScatterAxisPairId>(
    controlledPair ?? "capability-vs-cost",
  );
  const [provider, setProvider] = useState(controlledProvider ?? "all");
  const [plan, setPlan] = useState(controlledPlan ?? "all");
  const [modelType, setModelType] = useState(controlledModelType ?? "all");
  const [accessType, setAccessType] = useState(controlledAccessType ?? "all");
  const [rawPoints, setRawPoints] = useState<ScatterPoint[]>(injectedPoints ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (controlledPair) setPairId(controlledPair);
  }, [controlledPair]);

  useEffect(() => {
    if (injectedPoints) setRawPoints(injectedPoints);
  }, [injectedPoints]);

  const pair =
    SCATTER_AXIS_PAIRS.find((p) => p.id === pairId) ?? SCATTER_AXIS_PAIRS[0];

  const load = useCallback(async () => {
    if (injectedPoints) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("x", pair.x);
      qs.set("y", pair.y);
      if (provider !== "all") qs.set("provider", provider);
      if (plan !== "all") qs.set("plan", plan);
      if (modelType !== "all") qs.set("modelType", modelType);
      if (accessType !== "all") qs.set("accessType", accessType);

      const res = await fetchImpl(`/api/v1/overview/scatter?${qs.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as {
        data?: ScatterPoint[];
      };
      setRawPoints(Array.isArray(body.data) ? body.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scatter");
      setRawPoints([]);
    } finally {
      setLoading(false);
    }
  }, [
    accessType,
    fetchImpl,
    injectedPoints,
    modelType,
    pair.x,
    pair.y,
    plan,
    provider,
  ]);

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

  const logX = "logX" in pair ? Boolean(pair.logX) : false;
  const logY = "logY" in pair ? Boolean(pair.logY) : false;

  function changePair(id: string) {
    const next = id as ScatterAxisPairId;
    setPairId(next);
    onPairIdChange?.(next);
  }

  return (
    <div
      data-testid="ranking-scatter"
      data-point-count={points.length}
      data-pair={pair.id}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        minWidth: 0,
        maxWidth: "100%",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
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
          Scatter comparison
        </h2>
        <label style={{ display: "grid", gap: 2, minWidth: 200 }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Axes</span>
          <Select
            options={SCATTER_AXIS_PAIRS.map((p) => ({
              value: p.id,
              label: p.label,
            }))}
            value={pairId}
            onChange={changePair}
            data-testid="scatter-pair-select"
          />
        </label>
      </div>

      <div
        data-testid="scatter-filters"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)",
        }}
      >
        <label style={{ display: "grid", gap: 2, minWidth: 120, flex: "1 1 120px" }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Provider</span>
          <Select
            options={providerOptions}
            value={provider}
            onChange={setProvider}
            data-testid="scatter-provider"
          />
        </label>
        <label style={{ display: "grid", gap: 2, minWidth: 120, flex: "1 1 120px" }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Plan</span>
          <Select
            options={planOptions}
            value={plan}
            onChange={setPlan}
            data-testid="scatter-plan"
          />
        </label>
        <label style={{ display: "grid", gap: 2, minWidth: 120, flex: "1 1 120px" }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Model type</span>
          <Select
            options={modelTypeOptions}
            value={modelType}
            onChange={setModelType}
            data-testid="scatter-model-type"
          />
        </label>
        <label style={{ display: "grid", gap: 2, minWidth: 120, flex: "1 1 120px" }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Access type</span>
          <Select
            options={accessTypeOptions}
            value={accessType}
            onChange={setAccessType}
            data-testid="scatter-access-type"
          />
        </label>
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ ...faintText, margin: 0 }}>Loading scatter…</p>
      ) : null}

      {points.length === 0 && !loading ? (
        <EmptyState
          data-testid="ranking-scatter-empty"
          title="No models to plot"
          message="No models have both axis values for this pair and filter set. Models missing a value are omitted rather than plotted at zero."
        />
      ) : (
        <div
          style={{ width: "100%", maxWidth: "100%", height: 320, minWidth: 0 }}
          data-testid="scatter-chart-wrap"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid stroke={chrome.grid} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name={axisLabel(pair.x)}
                stroke={chrome.axis}
                tick={{ fill: chrome.axis, fontSize: 10 }}
                scale={logX ? "log" : "auto"}
                domain={logX ? ["auto", "auto"] : ["auto", "auto"]}
                ticks={logX ? LOG_TICKS : undefined}
                allowDataOverflow
                label={{
                  value: axisLabel(pair.x),
                  position: "insideBottom",
                  offset: -2,
                  fill: chrome.axis,
                  fontSize: 11,
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={axisLabel(pair.y)}
                stroke={chrome.axis}
                tick={{ fill: chrome.axis, fontSize: 10 }}
                scale={logY ? "log" : "auto"}
                domain={["auto", "auto"]}
                label={{
                  value: axisLabel(pair.y),
                  angle: -90,
                  position: "insideLeft",
                  fill: chrome.axis,
                  fontSize: 11,
                }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text)",
                  fontSize: 12,
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as ScatterPoint | undefined;
                  if (!row) return null;
                  return (
                    <div
                      data-testid="scatter-tooltip"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        color: "var(--text)",
                        fontSize: 12,
                        padding: "6px 10px",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {row.modelName}
                      </div>
                      <div style={{ color: "var(--text-muted)" }}>
                        {axisLabel(pair.x)}:{" "}
                        {typeof row.x === "number" ? row.x.toLocaleString() : "—"}
                      </div>
                      <div style={{ color: "var(--text-muted)" }}>
                        {axisLabel(pair.y)}:{" "}
                        {typeof row.y === "number" ? row.y.toLocaleString() : "—"}
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter
                name="Models"
                data={points}
                fill={fill}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hidden list for tests / a11y — labels on hover also surface here */}
      <ul data-testid="scatter-point-list" hidden>
        {points.map((p) => (
          <li key={p.modelId} data-testid={`scatter-point-${p.modelId}`} data-x={p.x} data-y={p.y}>
            {p.modelName}
          </li>
        ))}
      </ul>
      {points.length > 0 ? (
        <p style={{ ...faintText, margin: 0 }}>
          Hover a point to see the model name. Models missing an axis value are omitted.
        </p>
      ) : null}
    </div>
  );
}
