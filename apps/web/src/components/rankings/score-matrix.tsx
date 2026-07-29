"use client";

import { useMemo, useState } from "react";
import {
  Button,
  SegmentedControl,
  ScoreCell,
  scoreBandFromTen,
} from "@model-monitor/ui";
import type { RatingCell, SkillDto } from "./types";
import { LogoTile } from "./utils";

export type MatrixMode = "heatmap" | "numbers";

const SCALE_LEGEND: Array<{
  band: "exceptional" | "strong" | "average" | "below" | "weak";
  label: string;
  range: string;
}> = [
  { band: "exceptional", label: "Exceptional", range: "9–10" },
  { band: "strong", label: "Strong", range: "7–8" },
  { band: "average", label: "Average", range: "5–6" },
  { band: "below", label: "Below Avg", range: "3–4" },
  { band: "weak", label: "Weak", range: "0–2" },
];

function cellTen(
  personal: number | null,
  external: number | null,
  prefer: "personal" | "external" | "auto",
): number | null {
  if (prefer === "personal") return personal;
  if (prefer === "external") {
    return external == null ? null : external / 10;
  }
  if (personal != null) return personal;
  if (external != null) return external / 10;
  return null;
}

export function ScoreMatrix({
  skills,
  modelNames,
  ratings,
  prefer = "auto",
}: {
  skills: SkillDto[];
  modelNames: Array<{ id: string; name: string }>;
  ratings: RatingCell[];
  prefer?: "personal" | "external" | "auto";
}) {
  const [mode, setMode] = useState<MatrixMode>("heatmap");
  const [fullscreen, setFullscreen] = useState(false);

  const byKey = useMemo(() => {
    const map = new Map<string, RatingCell>();
    for (const r of ratings) {
      map.set(`${r.modelId}:${r.skillId}`, r);
    }
    return map;
  }, [ratings]);

  const skillCols = skills.slice(0, 16);

  const body = (
    <div data-testid="score-matrix" data-mode={mode} data-fullscreen={fullscreen || undefined}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--text-section-size)",
            fontWeight: "var(--text-section-weight)" as unknown as number,
          }}
        >
          Score Matrix Across Skills
        </h2>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <SegmentedControl
            label="Matrix mode"
            size="sm"
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { value: "heatmap", label: "Heatmap" },
              { value: "numbers", label: "Numbers" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            data-testid="matrix-fullscreen"
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen ? "Exit full screen" : "⛶ Full screen"}
          </Button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          className="mm-heat"
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 4,
            fontSize: "var(--text-body-size)",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  color: "var(--text-muted)",
                  fontWeight: 500,
                  fontSize: "var(--text-meta-size)",
                  padding: "var(--space-2)",
                }}
              >
                Model
              </th>
              {skillCols.map((s) => (
                <th
                  key={s.id}
                  style={{
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    fontSize: "var(--text-meta-size)",
                    padding: "var(--space-2)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modelNames.map((m) => (
              <tr key={m.id} data-testid={`matrix-row-${m.id}`}>
                <td
                  style={{
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    padding: "4px var(--space-2)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <LogoTile label={m.name} />
                    {m.name}
                  </div>
                </td>
                {skillCols.map((s) => {
                  const cell = byKey.get(`${m.id}:${s.id}`);
                  const ten = cellTen(
                    cell?.personalScore ?? null,
                    cell?.externalScore ?? null,
                    prefer,
                  );
                  const band = ten == null ? "empty" : scoreBandFromTen(ten);
                  const bg =
                    mode === "heatmap" && ten != null
                      ? `var(--score-${band}-bg)`
                      : "transparent";
                  const color =
                    mode === "heatmap" && ten != null
                      ? `var(--score-${band})`
                      : "var(--text)";

                  return (
                    <td
                      key={s.id}
                      data-testid={`matrix-cell-${m.id}-${s.id}`}
                      data-band={band}
                      style={{
                        textAlign: "center",
                        fontWeight: 600,
                        fontSize: 12,
                        borderRadius: "var(--radius-sm)",
                        height: 36,
                        padding: 4,
                        background: bg,
                        color,
                      }}
                    >
                      {mode === "numbers" ? (
                        <ScoreCell
                          value={
                            prefer === "external" ||
                            (prefer === "auto" &&
                              cell?.personalScore == null &&
                              cell?.externalScore != null)
                              ? cell?.externalScore ?? null
                              : ten
                          }
                          scale={
                            prefer === "external" ||
                            (prefer === "auto" &&
                              cell?.personalScore == null &&
                              cell?.externalScore != null)
                              ? "hundred"
                              : "ten"
                          }
                        />
                      ) : ten == null ? (
                        <span style={{ color: "var(--score-empty)" }}>—</span>
                      ) : (
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {Number.isInteger(ten) ? ten : Math.round(ten * 10) / 10}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        data-testid="score-matrix-legend"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-3)",
          alignItems: "center",
          marginTop: "var(--space-3)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--border-subtle)",
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        <span>Score Scale:</span>
        {SCALE_LEGEND.map((item) => (
          <span key={item.band} style={{ display: "inline-flex", alignItems: "center" }}>
            <i
              aria-hidden
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: "var(--radius-sm)",
                marginRight: 4,
                background: `var(--score-${item.band})`,
              }}
            />
            {item.range} {item.label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", color: "var(--text-faint)" }}>
          Skills: {skillCols.length}
        </span>
      </div>
    </div>
  );

  if (!fullscreen) return body;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="score-matrix-fullscreen"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "var(--bg-app)",
        padding: "var(--space-6)",
        overflow: "auto",
      }}
    >
      {body}
    </div>
  );
}
