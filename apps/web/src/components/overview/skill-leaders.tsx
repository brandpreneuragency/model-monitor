"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, ScoreCell } from "@model-monitor/ui";
import type { OverviewSkillCategory } from "./types";
import { initials, leaderDisplayScore } from "./utils";

export type SkillLeadersProps = {
  categories: OverviewSkillCategory[];
};

export function SkillLeaders({ categories }: SkillLeadersProps) {
  const firstKey = categories[0]?.key ?? null;
  const [activeKey, setActiveKey] = useState<string | null>(firstKey);

  const active = useMemo(() => {
    if (categories.length === 0) return null;
    return (
      categories.find((c) => c.key === activeKey) ?? categories[0] ?? null
    );
  }, [activeKey, categories]);

  const leaders = active?.leaders ?? [];

  return (
    <Card data-testid="overview-skill-leaders" padding="md" style={{ minWidth: 0 }}>
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
          Skill Leaders{" "}
          <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
            (Top 3)
          </span>
        </h2>
        <Link
          href="/rankings"
          className="link-muted"
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
            textDecoration: "none",
          }}
        >
          View all rankings ›
        </Link>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          data-testid="overview-skill-leaders-empty"
          title="No skill leaders"
          message="Rate models or import external scores to populate leaders."
          style={{ padding: "var(--space-6) var(--space-4)" }}
        />
      ) : (
        <>
          <div
            data-testid="skill-leader-chips"
            role="tablist"
            aria-label="Skill categories"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-1_5)",
              marginBottom: "var(--space-3)",
            }}
          >
            {categories.map((cat) => {
              const on = cat.key === (active?.key ?? "");
              return (
                <button
                  key={cat.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-testid={`skill-chip-${cat.key}`}
                  data-active={on || undefined}
                  onClick={() => setActiveKey(cat.key)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-full)",
                    background: on ? "var(--accent)" : "var(--bg-input)",
                    border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                    color: on ? "var(--text)" : "var(--text-muted)",
                    fontSize: 11,
                    fontWeight: on ? 600 : 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {leaders.length === 0 ? (
            <EmptyState
              data-testid="overview-skill-leaders-empty-list"
              title="No leaders yet"
              message={`No ranked models for ${active?.label ?? "this skill"}.`}
              style={{ padding: "var(--space-4)" }}
            />
          ) : (
            <ol
              data-testid="skill-leaders-list"
              data-category={active?.key}
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
              }}
            >
              {leaders.slice(0, 3).map((leader, idx) => {
                const rank = leader.rank ?? idx + 1;
                const score = leaderDisplayScore(leader);
                const creator = leader.model.creator?.name;
                const rankStyle =
                  rank === 1
                    ? {
                        background: "var(--warn-bg)",
                        color: "var(--warn)",
                        borderColor: "transparent",
                      }
                    : rank === 2
                      ? {
                          background: "var(--neutral-bg)",
                          color: "var(--text-muted)",
                          borderColor: "var(--border)",
                        }
                      : {
                          background: "var(--warn-bg)",
                          color: "var(--warn)",
                          borderColor: "transparent",
                          opacity: 0.85,
                        };
                return (
                  <li
                    key={`${leader.model.id}-${rank}`}
                    data-testid="skill-leader-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      padding: "var(--space-2)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <span
                      aria-label={`Rank ${rank}`}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "var(--radius-full)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        border: "1px solid var(--border)",
                        flexShrink: 0,
                        ...rankStyle,
                      }}
                    >
                      {rank}
                    </span>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 9,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    >
                      {initials(creator ?? leader.model.name)}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--text)",
                        fontSize: "var(--text-body-size)",
                      }}
                      title={leader.model.name}
                    >
                      {leader.model.name}
                    </span>
                    <ScoreCell
                      value={score}
                      label={`${leader.model.name} score`}
                      scale="auto"
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </Card>
  );
}
