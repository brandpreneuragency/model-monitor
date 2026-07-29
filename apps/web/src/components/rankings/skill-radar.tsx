"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { EmptyState, Select } from "@model-monitor/ui";
import { useChartChrome, useChartColors } from "./chart-tokens";
import type { ProfileDto, RankingType, RatingCell, SkillDto } from "./types";
import { faintText } from "./utils";

export type RadarModelOption = { id: string; name: string };

export type SkillRadarProps = {
  skills: SkillDto[];
  ratings: RatingCell[];
  /** Ordered candidate models (typically current leaderboard top). */
  candidates: RadarModelOption[];
  profile?: ProfileDto | null;
  type?: RankingType;
  /** Controlled selection (model ids). When omitted, component manages Top-N. */
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  title?: string;
  /** Optional live refresh of ratings (defaults to /api/v1/ratings). */
  fetchImpl?: typeof fetch;
  live?: boolean;
};

const MAX_MODELS = 4;
const MIN_MODELS = 2;

/** Score on 0–10 scale. External ratings are 0–100. Never coerce null → 0. */
export function radarScoreTen(
  personal: number | null | undefined,
  external: number | null | undefined,
  type: RankingType = "combined",
): number | null {
  if (type === "personal") return personal ?? null;
  if (type === "external") {
    return external == null ? null : external / 10;
  }
  if (personal != null) return personal;
  if (external != null) return external / 10;
  return null;
}

export function skillsForRadar(
  skills: SkillDto[],
  profile?: ProfileDto | null,
): SkillDto[] {
  if (profile?.weights?.length) {
    const byId = new Map(skills.map((s) => [s.id, s]));
    const ordered = [...profile.weights]
      .filter((w) => w.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .map((w) => byId.get(w.skillId))
      .filter((s): s is SkillDto => Boolean(s));
    if (ordered.length >= 3) return ordered.slice(0, 8);
  }
  return [...skills]
    .filter((s) => s.status === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .slice(0, 8);
}

export function buildRadarChartData(
  axes: SkillDto[],
  models: RadarModelOption[],
  ratings: RatingCell[],
  type: RankingType,
): Array<Record<string, string | number | null>> {
  const byKey = new Map<string, RatingCell>();
  for (const r of ratings) {
    byKey.set(`${r.modelId}:${r.skillId}`, r);
  }

  return axes.map((skill) => {
    const row: Record<string, string | number | null> = {
      skill: skill.name,
      skillId: skill.id,
    };
    for (const m of models) {
      const cell = byKey.get(`${m.id}:${skill.id}`);
      const ten = radarScoreTen(cell?.personalScore, cell?.externalScore, type);
      // Missing scores stay null — Recharts skips; we never substitute 0.
      row[m.id] = ten;
    }
    return row;
  });
}

export function defaultTopIds(candidates: RadarModelOption[], n: number): string[] {
  const take = Math.min(Math.max(n, 0), MAX_MODELS, candidates.length);
  return candidates.slice(0, take).map((c) => c.id);
}

export function SkillRadar({
  skills,
  ratings: ratingsProp,
  candidates,
  profile = null,
  type = "combined",
  selectedIds: controlledIds,
  onSelectedIdsChange,
  title = "Skill Radar",
  fetchImpl = fetch,
  live = false,
}: SkillRadarProps) {
  const [internalIds, setInternalIds] = useState<string[]>(() =>
    defaultTopIds(candidates, MAX_MODELS),
  );
  const [topN, setTopN] = useState<string>(String(MAX_MODELS));
  const [ratings, setRatings] = useState<RatingCell[]>(ratingsProp);

  useEffect(() => {
    setRatings(ratingsProp);
  }, [ratingsProp]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchImpl("/api/v1/ratings", { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { data?: RatingCell[] };
        if (!cancelled && Array.isArray(body.data)) setRatings(body.data);
      } catch {
        /* keep prop data */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchImpl, live]);

  const selectedIds = controlledIds ?? internalIds;

  function setSelectedIds(next: string[]) {
    const clipped = next.slice(0, MAX_MODELS);
    if (onSelectedIdsChange) onSelectedIdsChange(clipped);
    else setInternalIds(clipped);
  }

  // Keep selection valid when candidates change
  useEffect(() => {
    if (controlledIds) return;
    const valid = new Set(candidates.map((c) => c.id));
    setInternalIds((prev) => {
      const kept = prev.filter((id) => valid.has(id));
      if (kept.length >= MIN_MODELS) return kept;
      return defaultTopIds(candidates, MAX_MODELS);
    });
  }, [candidates, controlledIds]);

  const axes = useMemo(() => skillsForRadar(skills, profile), [skills, profile]);
  const selectedModels = useMemo(() => {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((m): m is RadarModelOption => Boolean(m));
  }, [candidates, selectedIds]);

  const chartData = useMemo(
    () => buildRadarChartData(axes, selectedModels, ratings, type),
    [axes, selectedModels, ratings, type],
  );

  const colors = useChartColors(selectedModels.length);
  const chrome = useChartChrome();

  function applyTopN(nRaw: string) {
    setTopN(nRaw);
    const n = Number(nRaw);
    if (!Number.isFinite(n)) return;
    setSelectedIds(defaultTopIds(candidates, n));
  }

  function toggleModel(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
      return;
    }
    if (selectedIds.length >= MAX_MODELS) return;
    setSelectedIds([...selectedIds, id]);
  }

  const tooFew = selectedModels.length < MIN_MODELS;

  return (
    <div
      data-testid="skill-radar"
      data-series-count={selectedModels.length}
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
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "var(--text-section-size)",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {title}
            {profile ? (
              <span style={{ ...faintText, fontWeight: 400, marginLeft: 8 }}>
                ({profile.name})
              </span>
            ) : null}
          </h2>
        </div>
        <label style={{ display: "grid", gap: 2, minWidth: 140 }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Top-N shortcut</span>
          <Select
            options={[
              { value: "2", label: "Top 2 models" },
              { value: "3", label: "Top 3 models" },
              { value: "4", label: "Top 4 models" },
            ]}
            value={topN}
            onChange={applyTopN}
            data-testid="radar-topn"
          />
        </label>
      </div>

      <div
        data-testid="radar-model-selector"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-1_5)",
        }}
      >
        {candidates.slice(0, 12).map((m) => {
          const on = selectedIds.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              data-testid={`radar-model-toggle-${m.id}`}
              data-selected={on || undefined}
              aria-pressed={on}
              onClick={() => toggleModel(m.id)}
              style={{
                border: `1px solid ${on ? "var(--accent-border)" : "var(--border)"}`,
                background: on ? "var(--accent-bg)" : "var(--bg-input)",
                color: "var(--text)",
                borderRadius: "var(--radius-full)",
                padding: "4px 10px",
                fontSize: "var(--text-meta-size)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              {m.name}
            </button>
          );
        })}
      </div>

      {tooFew ? (
        <EmptyState
          data-testid="skill-radar-empty"
          title="Select at least two models"
          message="Pick two to four models above (or use Top-N) to compare skill scores on the radar."
        />
      ) : (
        <>
          <div
            data-testid="radar-legend"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-2)",
              alignItems: "center",
            }}
          >
            {selectedModels.map((m, i) => (
              <span
                key={m.id}
                data-testid={`radar-series-${m.id}`}
                data-series-index={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "var(--text-meta-size)",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-sans)",
                }}
              >
                <i
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: colors[i] ?? `var(--chart-${i + 1})`,
                    display: "inline-block",
                  }}
                />
                {m.name}
              </span>
            ))}
          </div>

          <div
            style={{ width: "100%", maxWidth: "100%", height: 280, minWidth: 0 }}
            data-testid="radar-chart-wrap"
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke={chrome.grid} />
                <PolarAngleAxis
                  dataKey="skill"
                  tick={{ fill: chrome.axis, fontSize: 10 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 10]}
                  tick={{ fill: chrome.axis, fontSize: 9 }}
                  stroke={chrome.grid}
                />
                {selectedModels.map((m, i) => (
                  <Radar
                    key={m.id}
                    name={m.name}
                    dataKey={m.id}
                    stroke={colors[i] ?? `var(--chart-${i + 1})`}
                    fill={colors[i] ?? `var(--chart-${i + 1})`}
                    fillOpacity={i === 0 ? 0.12 : 0}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                ))}
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--text)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ display: "none" }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p style={{ ...faintText, margin: 0 }}>
            Radar shows scores for the active skill set. Higher is better.
          </p>
        </>
      )}
    </div>
  );
}
