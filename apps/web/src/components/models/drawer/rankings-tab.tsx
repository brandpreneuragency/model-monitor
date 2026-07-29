"use client";

import type { CSSProperties } from "react";
import { ScoreCell, StatusChip } from "@model-monitor/ui";
import type { DrawerSkillRating } from "./types";

const tableWrap: CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const th: CSSProperties = {
  textAlign: "left",
  fontSize: "var(--text-meta-size)",
  color: "var(--text-muted)",
  fontWeight: 600,
  padding: "var(--space-2)",
  borderBottom: "1px solid var(--border-subtle)",
  whiteSpace: "nowrap",
};

const td: CSSProperties = {
  fontSize: "var(--text-meta-size)",
  color: "var(--text)",
  padding: "var(--space-2)",
  borderBottom: "1px solid var(--border-subtle)",
  verticalAlign: "middle",
};

function confidenceChip(value: DrawerSkillRating["personalConfidence"]) {
  if (!value) {
    return (
      <span style={{ color: "var(--text-faint)" }} data-testid="confidence-empty">
        —
      </span>
    );
  }
  const color =
    value === "high" ? "ok" : value === "medium" ? "warn" : "neutral";
  return (
    <StatusChip
      color={color}
      label={value.charAt(0).toUpperCase() + value.slice(1)}
    />
  );
}

/**
 * Rankings tab — personal and external scores always in separate columns.
 * Never blends or averages the two.
 */
export function RankingsTab({ ratings }: { ratings: DrawerSkillRating[] }) {
  return (
    <div data-testid="drawer-tab-rankings">
      <p
        style={{
          margin: "0 0 var(--space-3)",
          fontSize: "var(--text-meta-size)",
          color: "var(--text-faint)",
        }}
      >
        Personal and external scores are shown side by side and never merged.
      </p>
      {ratings.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-meta-size)",
            color: "var(--text-muted)",
          }}
        >
          No skills configured.
        </p>
      ) : (
        <div style={tableWrap}>
          <table
            style={{ width: "100%", borderCollapse: "collapse" }}
            data-testid="drawer-rankings-table"
          >
            <thead>
              <tr>
                <th style={th} scope="col">
                  Skill
                </th>
                <th style={th} scope="col" data-testid="rankings-col-personal">
                  Personal
                </th>
                <th style={th} scope="col" data-testid="rankings-col-external">
                  External
                </th>
                <th style={th} scope="col">
                  Confidence
                </th>
                <th style={th} scope="col">
                  Ranking
                </th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((row) => {
                const untested =
                  row.personalScore == null && !row.tested;
                return (
                  <tr
                    key={row.skillId}
                    data-testid={`rankings-row-${row.skillSlug ?? row.skillId}`}
                    data-untested={untested || undefined}
                  >
                    <td style={td}>{row.skillName}</td>
                    <td style={td} data-testid="rankings-personal-cell">
                      <ScoreCell
                        value={row.personalScore}
                        label={`${row.skillName} personal`}
                      />
                      {untested ? (
                        <span
                          style={{
                            marginLeft: "var(--space-2)",
                            color: "var(--text-faint)",
                            fontSize: 11,
                          }}
                          data-testid="rankings-untested-label"
                        >
                          untested
                        </span>
                      ) : null}
                    </td>
                    <td style={td} data-testid="rankings-external-cell">
                      <ScoreCell
                        value={row.externalScore}
                        label={`${row.skillName} external`}
                      />
                    </td>
                    <td style={td}>{confidenceChip(row.personalConfidence)}</td>
                    <td
                      style={{ ...td, color: "var(--text-faint)" }}
                      data-testid="rankings-position-cell"
                    >
                      {row.rankingPosition ??
                        (row.externalRank != null
                          ? String(row.externalRank)
                          : "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Guard against accidental merged score rendering in this tab. */}
      <span data-testid="rankings-no-merged-score" hidden>
        personal-and-external-separate
      </span>
    </div>
  );
}
