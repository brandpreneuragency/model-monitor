"use client";

import { useState, type CSSProperties } from "react";
import type { DrawerBenchmark, DrawerModel, DrawerSource } from "./types";
import { displayUrlText, safeHref } from "@/lib/safe-link";

const muted: CSSProperties = {
  fontSize: 11,
  color: "var(--text-faint)",
  lineHeight: 1.45,
};

const label: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
  marginBottom: 2,
};

const body: CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
};

const section: CSSProperties = {
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-card)",
  overflow: "hidden",
};

/**
 * Research tab — visually secondary, collapsed by default.
 * Benchmarks, sources, QC notes, recheck status.
 */
export function ResearchTab({
  benchmarks,
  sources,
  model,
  defaultOpen = false,
}: {
  benchmarks: DrawerBenchmark[];
  sources: DrawerSource[];
  model: DrawerModel;
  /** Tests may force open; product default is collapsed. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div data-testid="drawer-tab-research" style={{ ...muted }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="research-toggle"
        style={{
          appearance: "none",
          background: "var(--bg-input)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-muted)",
          width: "100%",
          textAlign: "left",
          padding: "var(--space-2) var(--space-3)",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>External research (secondary)</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>

      {!open ? (
        <p
          data-testid="research-collapsed-hint"
          style={{ ...muted, margin: "var(--space-2) 0 0" }}
        >
          Collapsed by default — benchmarks and sources stay out of the way of
          the first four tabs.
        </p>
      ) : (
        <div
          data-testid="research-content"
          style={{
            marginTop: "var(--space-3)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={section}>
            <div
              style={{
                padding: "var(--space-2) var(--space-3)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <div style={label}>Quality control</div>
              <div style={body}>
                Needs recheck: {model.needsRecheck ? "Yes" : "No"}
                {model.verificationStatus
                  ? ` · Verification: ${model.verificationStatus}`
                  : ""}
                {model.needsReview ? " · Needs review" : ""}
              </div>
            </div>
          </div>

          <div>
            <div style={label}>Benchmarks</div>
            {benchmarks.length === 0 ? (
              <p style={{ ...body, margin: "var(--space-1) 0 0" }}>
                No external benchmarks recorded.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "var(--space-1) 0 0",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {benchmarks.map((b) => (
                  <li
                    key={b.id}
                    style={{
                      ...section,
                      padding: "var(--space-2) var(--space-3)",
                    }}
                    data-testid="research-benchmark"
                  >
                    <div style={{ ...body, fontWeight: 600, color: "var(--text-muted)" }}>
                      {b.benchmarkName}
                      {b.scoreDisplay ? ` · ${b.scoreDisplay}` : ""}
                      {b.scoreUnit ? ` ${b.scoreUnit}` : ""}
                    </div>
                    <div style={muted}>
                      {[
                        b.setting ? `Setting: ${b.setting}` : null,
                        b.harness ? `Harness: ${b.harness}` : null,
                        b.comparableGroup
                          ? `Group: ${b.comparableGroup}`
                          : null,
                        b.verifiedAt
                          ? `Verified: ${b.verifiedAt.slice(0, 10)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No setting/harness metadata"}
                    </div>
                    {b.notes ? (
                      <div style={{ ...muted, marginTop: 4 }}>{b.notes}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div style={label}>Sources</div>
            {sources.length === 0 ? (
              <p style={{ ...body, margin: "var(--space-1) 0 0" }}>
                No sources linked.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "var(--space-1) 0 0",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {sources.map((s) => {
                  const href = s.url ? safeHref(s.url) : null;
                  return (
                    <li
                      key={s.id}
                      style={{
                        ...section,
                        padding: "var(--space-2) var(--space-3)",
                      }}
                      data-testid="research-source"
                    >
                      <div style={{ ...body, fontWeight: 600 }}>
                        {s.title ?? s.sourceType ?? "Source"}
                      </div>
                      <div style={muted}>
                        {[
                          s.sourceType,
                          s.publisher,
                          s.verifiedAt
                            ? `verified ${s.verifiedAt.slice(0, 10)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {s.url ? (
                        href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              ...muted,
                              color: "var(--accent)",
                              wordBreak: "break-all",
                            }}
                          >
                            {displayUrlText(s.url)}
                          </a>
                        ) : (
                          <span style={muted}>{displayUrlText(s.url)}</span>
                        )
                      ) : null}
                      {s.notes ? (
                        <div style={{ ...muted, marginTop: 4 }}>{s.notes}</div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
