"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Select } from "@model-monitor/ui";
import type { LeaderboardEntryDto, ProfileDto, RankingType, SkillDto } from "./types";
import { LogoTile, displayExternal, displayPersonal, faintText, mutedText, readApiError } from "./utils";

export type SideBySideProps = {
  skills: SkillDto[];
  profiles: ProfileDto[];
  type?: RankingType;
  fetchImpl?: typeof fetch;
  /** Initial left board: skill id or `profile:<id>`. */
  leftKey?: string;
  rightKey?: string;
  limit?: number;
};

type BoardKey = { mode: "skill" | "profile"; id: string };

function parseKey(raw: string): BoardKey | null {
  if (!raw) return null;
  if (raw.startsWith("profile:")) {
    return { mode: "profile", id: raw.slice("profile:".length) };
  }
  if (raw.startsWith("skill:")) {
    return { mode: "skill", id: raw.slice("skill:".length) };
  }
  return { mode: "skill", id: raw };
}

function toKey(mode: "skill" | "profile", id: string): string {
  return mode === "profile" ? `profile:${id}` : `skill:${id}`;
}

async function fetchBoard(
  fetchImpl: typeof fetch,
  type: RankingType,
  key: BoardKey,
): Promise<LeaderboardEntryDto[]> {
  const qs = new URLSearchParams();
  qs.set("type", type);
  if (key.mode === "skill") qs.set("skillId", key.id);
  else qs.set("profileId", key.id);

  const res = await fetchImpl(`/api/v1/leaderboard?${qs.toString()}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const body = (await res.json()) as { data?: LeaderboardEntryDto[] };
  return Array.isArray(body.data) ? body.data : [];
}

function BoardColumn({
  label,
  entries,
  type,
  loading,
  error,
  limit,
  testId,
}: {
  label: string;
  entries: LeaderboardEntryDto[];
  type: RankingType;
  loading: boolean;
  error: string | null;
  limit: number;
  testId: string;
}) {
  const slice = entries.slice(0, limit);
  return (
    <div
      data-testid={testId}
      style={{
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-3)",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: "var(--text-card-size)",
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        {label}
      </h3>
      {loading ? <p style={{ ...faintText, margin: 0 }}>Loading…</p> : null}
      {error ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 0, fontSize: 12 }}>
          {error}
        </p>
      ) : null}
      {!loading && !error && slice.length === 0 ? (
        <EmptyState
          data-testid={`${testId}-empty`}
          title="No rows"
          message="No leaderboard entries for this selection."
          style={{ padding: "var(--space-4)" }}
        />
      ) : null}
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {slice.map((e) => {
          const personal = displayPersonal(e);
          const external = displayExternal(e);
          let scoreLabel = "—";
          if (type === "personal") {
            scoreLabel = personal != null ? personal.toFixed(1) : "—";
          } else if (type === "external") {
            scoreLabel = external != null ? String(external) : "—";
          } else {
            const parts: string[] = [];
            if (personal != null) parts.push(`P ${personal.toFixed(1)}`);
            if (external != null) parts.push(`E ${external}`);
            scoreLabel = parts.length ? parts.join(" · ") : "—";
          }
          return (
            <li
              key={e.model.id}
              data-testid={`${testId}-row-${e.model.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr auto",
                gap: "var(--space-2)",
                alignItems: "center",
                padding: "6px 4px",
                borderBottom: "1px solid var(--border-subtle)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-body-size)",
                color: "var(--text)",
              }}
            >
              <span style={{ ...mutedText, fontVariantNumeric: "tabular-nums" }}>
                {e.rank}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <LogoTile label={e.model.name} />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={e.model.name}
                >
                  {e.model.name}
                </span>
              </span>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--text-muted)",
                  fontSize: "var(--text-meta-size)",
                }}
              >
                {scoreLabel}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function SideBySide({
  skills,
  profiles,
  type = "combined",
  fetchImpl = fetch,
  leftKey: initialLeft,
  rightKey: initialRight,
  limit = 10,
}: SideBySideProps) {
  const options = useMemo(() => {
    const skillOpts = skills.map((s) => ({
      value: toKey("skill", s.id),
      label: `Skill · ${s.name}`,
    }));
    const profileOpts = profiles.map((p) => ({
      value: toKey("profile", p.id),
      label: `Profile · ${p.name}`,
    }));
    return [...profileOpts, ...skillOpts];
  }, [skills, profiles]);

  const defaultLeft =
    initialLeft ??
    (profiles[0] ? toKey("profile", profiles[0].id) : skills[0] ? toKey("skill", skills[0].id) : "");
  const defaultRight =
    initialRight ??
    (profiles[1]
      ? toKey("profile", profiles[1].id)
      : profiles[0]
        ? toKey("profile", profiles[0].id)
        : skills[1]
          ? toKey("skill", skills[1].id)
          : defaultLeft);

  const [leftKey, setLeftKey] = useState(defaultLeft);
  const [rightKey, setRightKey] = useState(defaultRight);
  const [leftEntries, setLeftEntries] = useState<LeaderboardEntryDto[]>([]);
  const [rightEntries, setRightEntries] = useState<LeaderboardEntryDto[]>([]);
  const [leftLoading, setLeftLoading] = useState(false);
  const [rightLoading, setRightLoading] = useState(false);
  const [leftError, setLeftError] = useState<string | null>(null);
  const [rightError, setRightError] = useState<string | null>(null);

  const labelFor = useCallback(
    (key: string): string => {
      const parsed = parseKey(key);
      if (!parsed) return "—";
      if (parsed.mode === "skill") {
        return skills.find((s) => s.id === parsed.id)?.name ?? "Skill";
      }
      return profiles.find((p) => p.id === parsed.id)?.name ?? "Profile";
    },
    [skills, profiles],
  );

  const loadSide = useCallback(
    async (side: "left" | "right", key: string) => {
      const parsed = parseKey(key);
      if (!parsed || !parsed.id) {
        if (side === "left") {
          setLeftEntries([]);
          setLeftError(null);
        } else {
          setRightEntries([]);
          setRightError(null);
        }
        return;
      }
      if (side === "left") {
        setLeftLoading(true);
        setLeftError(null);
      } else {
        setRightLoading(true);
        setRightError(null);
      }
      try {
        const data = await fetchBoard(fetchImpl, type, parsed);
        if (side === "left") setLeftEntries(data);
        else setRightEntries(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load";
        if (side === "left") {
          setLeftError(msg);
          setLeftEntries([]);
        } else {
          setRightError(msg);
          setRightEntries([]);
        }
      } finally {
        if (side === "left") setLeftLoading(false);
        else setRightLoading(false);
      }
    },
    [fetchImpl, type],
  );

  useEffect(() => {
    void loadSide("left", leftKey);
  }, [leftKey, loadSide]);

  useEffect(() => {
    void loadSide("right", rightKey);
  }, [rightKey, loadSide]);

  return (
    <div
      data-testid="side-by-side"
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
          Side-by-side leaderboards
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-3)",
          minWidth: 0,
        }}
      >
        <label style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Left</span>
          <Select
            options={options}
            value={leftKey}
            onChange={setLeftKey}
            data-testid="side-left-select"
          />
        </label>
        <label style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Right</span>
          <Select
            options={options}
            value={rightKey}
            onChange={setRightKey}
            data-testid="side-right-select"
          />
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-3)",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <BoardColumn
          testId="side-left-board"
          label={labelFor(leftKey)}
          entries={leftEntries}
          type={type}
          loading={leftLoading}
          error={leftError}
          limit={limit}
        />
        <BoardColumn
          testId="side-right-board"
          label={labelFor(rightKey)}
          entries={rightEntries}
          type={type}
          loading={rightLoading}
          error={rightError}
          limit={limit}
        />
      </div>

      <p style={{ ...faintText, margin: 0 }}>
        Compare two profiles or skills directly. Personal and external scores stay labelled
        separately in Combined mode.
      </p>
    </div>
  );
}
