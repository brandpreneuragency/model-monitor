"use client";

import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { ScoreCell } from "@model-monitor/ui";
import {
  costOrQuotaText,
  creatorName,
  providerName,
  type ModelTableRow,
} from "./models-columns";

export type ModelsCompactProps = {
  models: ModelTableRow[];
  selectedIds: ReadonlySet<string> | string[];
  onOpen?: (model: ModelTableRow) => void;
  onToggleSelect?: (model: ModelTableRow) => void;
  loading?: boolean;
  emptyMessage?: string;
};

const ROW_H = 32; // denser than compact table density (36px)

/**
 * One-line-per-model list for fast scanning.
 * Columns: select · name · creator · provider · overall · best skill · cost
 */
export function ModelsCompact({
  models,
  selectedIds,
  onOpen,
  onToggleSelect,
  loading = false,
  emptyMessage = "No models found",
}: ModelsCompactProps) {
  const selected =
    selectedIds instanceof Set ? selectedIds : new Set(selectedIds);

  const shell: CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
    background: "var(--bg-card)",
    overflow: "hidden",
    fontFamily: "var(--font-sans)",
    opacity: loading ? 0.6 : 1,
  };

  const head: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "28px minmax(140px, 1.4fr) minmax(90px, 0.9fr) minmax(90px, 0.9fr) 52px minmax(90px, 0.9fr) minmax(100px, 1fr)",
    gap: "var(--space-2)",
    alignItems: "center",
    height: ROW_H,
    padding: "0 var(--space-3)",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text-muted)",
    fontSize: "var(--text-meta-size)",
    fontWeight: 500,
    position: "sticky",
    top: 0,
    zIndex: 1,
  };

  const rowBase: CSSProperties = {
    display: "grid",
    gridTemplateColumns: head.gridTemplateColumns,
    gap: "var(--space-2)",
    alignItems: "center",
    height: ROW_H,
    padding: "0 var(--space-3)",
    borderBottom: "1px solid var(--border-subtle)",
    fontSize: "var(--text-meta-size)",
    color: "var(--text)",
    cursor: onOpen ? "pointer" : "default",
  };

  if (models.length === 0) {
    return (
      <div data-testid="models-compact-root" style={shell}>
        <div
          data-testid="models-compact-empty"
          style={{
            padding: "var(--space-6)",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
          }}
        >
          {loading ? "Loading…" : emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="models-compact-root" style={shell}>
      <div style={head} role="row">
        <span />
        <span>Model</span>
        <span>Creator</span>
        <span>Provider</span>
        <span>Score</span>
        <span>Best skill</span>
        <span>Cost</span>
      </div>
      <div role="list" data-testid="models-compact-list">
        {models.map((model) => {
          const isSel = selected.has(model.id);
          const creator = creatorName(model);
          const provider = providerName(model);
          const cost = costOrQuotaText(model.costOrQuota);
          return (
            <div
              key={model.id}
              role="listitem"
              data-testid="models-compact-row"
              data-model-id={model.id}
              data-selected={isSel || undefined}
              tabIndex={0}
              style={{
                ...rowBase,
                background: isSel ? "var(--bg-card-hover)" : undefined,
              }}
              onClick={() => onOpen?.(model)}
              onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen?.(model);
                }
              }}
              onMouseEnter={(e) => {
                if (!isSel) {
                  e.currentTarget.style.background = "var(--bg-card-hover)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isSel
                  ? "var(--bg-card-hover)"
                  : "transparent";
              }}
            >
              <input
                type="checkbox"
                checked={isSel}
                aria-label={`Select ${model.name}`}
                data-testid="models-compact-select"
                onClick={(e: MouseEvent) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect?.(model);
                }}
                style={{ margin: 0 }}
              />
              <span
                style={{
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  minWidth: 0,
                }}
                title={model.name}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {model.name}
                </span>
                {model.isFavourite ? (
                  <span
                    aria-label="Favourite"
                    style={{ color: "var(--warn)", flexShrink: 0 }}
                  >
                    ★
                  </span>
                ) : null}
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={creator}
              >
                {creator}
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={provider}
              >
                {provider}
              </span>
              <ScoreCell
                value={model.overallScore}
                label="Overall"
                data-testid="models-compact-score"
                style={{ minWidth: 28, height: 20, fontSize: 11 }}
              />
              <span
                style={{
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={model.bestSkill?.name ?? undefined}
              >
                {model.bestSkill?.name ?? "—"}
              </span>
              <span
                style={{
                  color:
                    cost === "not recorded"
                      ? "var(--text-faint)"
                      : "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={cost}
              >
                {cost}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
