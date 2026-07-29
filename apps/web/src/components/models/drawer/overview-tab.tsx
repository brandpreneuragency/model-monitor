"use client";

import type { CSSProperties } from "react";
import { ScoreCell, StatusChip, Tag } from "@model-monitor/ui";
import {
  workflowColor,
  workflowLabel,
} from "@/components/models/models-columns";
import type { DrawerModel, DrawerSkillRating } from "./types";

function capLabel(value: boolean | null | undefined, display?: string): string {
  if (display && display.trim()) {
    const d = display.trim();
    return d.charAt(0).toUpperCase() + d.slice(1);
  }
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Unknown";
}

function isMultimodal(caps: DrawerModel["capabilities"]): boolean | null {
  if (!caps) return null;
  const flags = [
    caps.vision,
    caps.imageInput,
    caps.audioInput,
    caps.videoInput,
  ];
  if (flags.some((f) => f === true)) return true;
  if (flags.every((f) => f === false)) return false;
  return null;
}

const sectionGap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

const sectionBody: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-meta-size)",
  lineHeight: 1.5,
};

function SectionLabel({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "best" | "avoid" | "notes";
}) {
  const color =
    tone === "best"
      ? "var(--ok)"
      : tone === "avoid"
        ? "var(--danger)"
        : tone === "notes"
          ? "var(--info)"
          : "var(--text)";
  return (
    <div
      style={{
        fontSize: "var(--text-meta-size)",
        fontWeight: 600,
        marginBottom: "var(--space-1)",
        color,
      }}
    >
      {children}
    </div>
  );
}

export function OverviewTab({
  model,
  previewRatings = [],
}: {
  model: DrawerModel;
  /** Top personal ratings preview (optional). */
  previewRatings?: DrawerSkillRating[];
}) {
  const caps = model.capabilities;
  const notes =
    model.personalNotes?.trim() ||
    model.description?.trim() ||
    null;
  const tags = model.tags ?? [];
  const status = model.workflowStatus ?? model.status;
  const multimodal = isMultimodal(caps);

  const capItems: Array<{ name: string; value: string; icon: string }> = [
    {
      name: "Reasoning",
      value: capLabel(caps?.reasoning, caps?.display?.reasoning),
      icon: "⬡",
    },
    {
      name: "Vision",
      value: capLabel(caps?.vision, caps?.display?.vision),
      icon: "◎",
    },
    {
      name: "Tool Use",
      value: capLabel(caps?.toolUse, caps?.display?.toolUse),
      icon: "⚒",
    },
    {
      name: "Multimodal",
      value: capLabel(multimodal),
      icon: "✦",
    },
    {
      name: "Agents",
      value: capLabel(caps?.parallelAgents),
      icon: "⚑",
    },
  ];

  return (
    <div data-testid="drawer-tab-overview" style={sectionGap}>
      <div>
        <SectionLabel tone="best">Best for</SectionLabel>
        <div style={sectionBody}>{model.bestUse?.trim() || "—"}</div>
      </div>

      <div>
        <SectionLabel tone="avoid">Avoid for</SectionLabel>
        <div style={sectionBody}>{model.avoidFor?.trim() || "—"}</div>
      </div>

      <div>
        <SectionLabel tone="notes">Personal notes</SectionLabel>
        <div style={sectionBody}>{notes || "No personal notes yet."}</div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          alignItems: "center",
        }}
      >
        <SectionLabel>Status</SectionLabel>
        <StatusChip color={workflowColor(status)} label={workflowLabel(status)} />
        {model.lifecycle ? (
          <StatusChip
            color="info"
            label={
              model.lifecycle.charAt(0).toUpperCase() + model.lifecycle.slice(1)
            }
          />
        ) : null}
        {model.needsReview ? (
          <StatusChip color="warn" label="Needs review" />
        ) : null}
      </div>

      {tags.length > 0 ? (
        <div>
          <SectionLabel>Tags</SectionLabel>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-1_5)",
            }}
          >
            {tags.map((t) => (
              <Tag key={t.id ?? t.name} name={t.name} />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <SectionLabel>Key Capabilities</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: "var(--space-2)",
          }}
          data-testid="drawer-capabilities-grid"
        >
          {capItems.map((c) => (
            <div
              key={c.name}
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-3) var(--space-2)",
                textAlign: "center",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  margin: "0 auto var(--space-2)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                {c.icon}
              </div>
              <div
                style={{ fontSize: 11, color: "var(--text-muted)" }}
              >
                {c.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--ok)",
                  marginTop: 2,
                }}
              >
                {c.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--space-2)",
          }}
        >
          <SectionLabel>Overall rating</SectionLabel>
          <ScoreCell
            value={model.overallScore}
            label="Overall"
            data-testid="drawer-overall-score"
          />
        </div>
        {model.scoreBasis ? (
          <div
            style={{
              fontSize: "var(--text-meta-size)",
              color: "var(--text-faint)",
            }}
          >
            Basis: {model.scoreBasis}
          </div>
        ) : model.overallScore == null ? (
          <div
            style={{
              fontSize: "var(--text-meta-size)",
              color: "var(--text-faint)",
            }}
          >
            Untested — no overall score yet.
          </div>
        ) : null}
      </div>

      {previewRatings.length > 0 ? (
        <div>
          <SectionLabel>Personal Ratings (My Rankings)</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {previewRatings.slice(0, 3).map((r) => (
              <div
                key={r.skillId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: "var(--space-2)",
                  alignItems: "center",
                  padding: "var(--space-2) 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontSize: "var(--text-meta-size)",
                }}
              >
                <span>{r.skillName}</span>
                <ScoreCell value={r.personalScore} label={r.skillName} />
                {r.personalConfidence ? (
                  <StatusChip
                    color={
                      r.personalConfidence === "high"
                        ? "ok"
                        : r.personalConfidence === "medium"
                          ? "warn"
                          : "neutral"
                    }
                    label={
                      r.personalConfidence.charAt(0).toUpperCase() +
                      r.personalConfidence.slice(1)
                    }
                  />
                ) : (
                  <span style={{ color: "var(--text-faint)" }}>untested</span>
                )}
                <span style={{ color: "var(--text-faint)" }}>
                  {r.rankingPosition ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
