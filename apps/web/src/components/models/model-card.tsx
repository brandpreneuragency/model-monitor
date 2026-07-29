"use client";

import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import {
  Badge,
  Button,
  Card,
  ScoreCell,
  StatusChip,
  Tag,
} from "@model-monitor/ui";
import {
  costOrQuotaText,
  creatorName,
  formatContextTokens,
  mainCapabilityLabels,
  planName,
  providerName,
  speedColor,
  workflowColor,
  workflowLabel,
  type ModelTableRow,
} from "./models-columns";

export type ModelCardProps = {
  model: ModelTableRow;
  selected?: boolean;
  onOpen?: (model: ModelTableRow) => void;
  onToggleSelect?: (model: ModelTableRow) => void;
  onCompare?: (model: ModelTableRow) => void;
  onFavourite?: (model: ModelTableRow) => void;
  onEdit?: (model: ModelTableRow) => void;
  onArchive?: (model: ModelTableRow) => void;
  favouriteBusy?: boolean;
  archiveBusy?: boolean;
  actionBusy?: boolean;
};

const meta: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-meta-size)",
  lineHeight: "var(--text-meta-line)",
};

const labelStyle: CSSProperties = {
  ...meta,
  color: "var(--text-faint)",
};

function stop(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
}

/**
 * Card summary for Models → Cards view.
 * Shows identity, access, status, key stats, capabilities, score, cost, best-use, tags.
 * Actions: favourite, compare, edit, archive, open details.
 */
export function ModelCard({
  model,
  selected = false,
  onOpen,
  onToggleSelect,
  onCompare,
  onFavourite,
  onEdit,
  onArchive,
  favouriteBusy = false,
  archiveBusy = false,
  actionBusy = false,
}: ModelCardProps) {
  const creator = creatorName(model);
  const provider = providerName(model);
  const plan = planName(model);
  const status = model.workflowStatus ?? model.status ?? null;
  const context = formatContextTokens(model.context ?? model.contextTokens);
  const speed = model.speed ?? model.speedRating ?? null;
  const caps = mainCapabilityLabels(model.capabilities).slice(0, 5);
  const cost = costOrQuotaText(model.costOrQuota);
  const bestUse = model.bestUse?.trim() || null;
  const tags = (model.tags ?? []).slice(0, 4);
  const isFavourite = Boolean(model.isFavourite);
  const busy = actionBusy || favouriteBusy || archiveBusy;

  const grid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "var(--space-2)",
    alignItems: "start",
  };

  return (
    <Card
      hoverable
      padding="md"
      data-testid="model-card"
      data-model-id={model.id}
      data-selected={selected || undefined}
      role="article"
      aria-label={model.name}
      onClick={() => onOpen?.(model)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(model);
        }
      }}
      tabIndex={0}
      style={{
        cursor: onOpen ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        outline: selected ? "1px solid var(--accent)" : undefined,
        background: selected ? "var(--bg-card-hover)" : undefined,
        minHeight: 0,
      }}
    >
      <div style={grid}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              minWidth: 0,
            }}
          >
            <input
              type="checkbox"
              checked={selected}
              aria-label={`Select ${model.name}`}
              data-testid="model-card-select"
              onClick={stop}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect?.(model);
              }}
              style={{ margin: 0, flexShrink: 0 }}
            />
            <h3
              style={{
                margin: 0,
                fontSize: "var(--text-card-size)",
                fontWeight: 600,
                lineHeight: "var(--text-card-line)",
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {model.name}
            </h3>
            {isFavourite ? (
              <span
                aria-label="Favourite"
                title="Favourite"
                style={{ color: "var(--warn)", fontSize: 12, lineHeight: 1 }}
              >
                ★
              </span>
            ) : null}
          </div>
          <div style={{ ...meta, marginTop: "var(--space-1)" }}>
            {creator === "—" ? "Unknown creator" : creator}
            {provider !== "—" ? ` · ${provider}` : ""}
            {plan !== "—" ? ` · ${plan}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1)" }}>
          <StatusChip color={workflowColor(status)} label={workflowLabel(status)} />
          <ScoreCell
            value={model.overallScore}
            label="Overall"
            data-testid="model-card-score"
          />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--space-2)",
        }}
      >
        <div>
          <div style={labelStyle}>Context</div>
          <div style={{ ...meta, color: "var(--text)" }}>{context}</div>
        </div>
        <div>
          <div style={labelStyle}>Speed</div>
          <div style={{ ...meta, color: speedColor(speed) }}>{speed ?? "—"}</div>
        </div>
        <div>
          <div style={labelStyle}>Best skill</div>
          <div style={{ ...meta, color: "var(--text)" }}>
            {model.bestSkill?.name ?? "—"}
            {model.bestSkill?.score != null
              ? ` ${model.bestSkill.score}`
              : ""}
          </div>
        </div>
      </div>

      {caps.length > 0 ? (
        <div
          data-testid="model-card-capabilities"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-1)",
          }}
        >
          {caps.map((c) => (
            <Badge key={c} color="neutral">
              {c}
            </Badge>
          ))}
        </div>
      ) : (
        <div style={meta} data-testid="model-card-capabilities-empty">
          Capabilities not recorded
        </div>
      )}

      <div>
        <div style={labelStyle}>Cost / quota</div>
        <div
          style={{
            ...meta,
            color: cost === "not recorded" ? "var(--text-faint)" : "var(--text)",
          }}
          data-testid="model-card-cost"
        >
          {cost}
        </div>
      </div>

      {bestUse ? (
        <div data-testid="model-card-best-use">
          <div style={labelStyle}>Best use</div>
          <div
            style={{
              ...meta,
              color: "var(--text)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {bestUse}
          </div>
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div
          data-testid="model-card-tags"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-1)",
          }}
        >
          {tags.map((t) => (
            <Tag key={t.id ?? t.slug ?? t.name} name={t.name} />
          ))}
        </div>
      ) : null}

      <div
        role="group"
        aria-label="Model actions"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-1)",
          marginTop: "auto",
          paddingTop: "var(--space-1)",
          borderTop: "1px solid var(--border-subtle)",
        }}
        onClick={stop}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          data-testid="model-card-favourite"
          aria-pressed={isFavourite}
          onClick={(e) => {
            stop(e);
            onFavourite?.(model);
          }}
        >
          {isFavourite ? "Unfavourite" : "Favourite"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="model-card-compare"
          onClick={(e) => {
            stop(e);
            onCompare?.(model);
          }}
        >
          Compare
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="model-card-edit"
          onClick={(e) => {
            stop(e);
            onEdit?.(model);
          }}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          data-testid="model-card-archive"
          onClick={(e) => {
            stop(e);
            onArchive?.(model);
          }}
        >
          Archive
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="model-card-details"
          onClick={(e) => {
            stop(e);
            onOpen?.(model);
          }}
        >
          Details
        </Button>
      </div>
    </Card>
  );
}

export type ModelsCardsGridProps = {
  models: ModelTableRow[];
  selectedIds: ReadonlySet<string> | string[];
  onOpen?: (model: ModelTableRow) => void;
  onToggleSelect?: (model: ModelTableRow) => void;
  onCompare?: (model: ModelTableRow) => void;
  onFavourite?: (model: ModelTableRow) => void;
  onEdit?: (model: ModelTableRow) => void;
  onArchive?: (model: ModelTableRow) => void;
  loading?: boolean;
  emptyMessage?: string;
  busyId?: string | null;
};

export function ModelsCardsGrid({
  models,
  selectedIds,
  onOpen,
  onToggleSelect,
  onCompare,
  onFavourite,
  onEdit,
  onArchive,
  loading = false,
  emptyMessage = "No models found",
  busyId = null,
}: ModelsCardsGridProps) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);

  if (models.length === 0) {
    return (
      <div
        data-testid="models-cards-empty"
        style={{
          padding: "var(--space-8)",
          textAlign: "center",
          color: "var(--text-muted)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-card)",
        }}
      >
        {loading ? "Loading…" : emptyMessage}
      </div>
    );
  }

  return (
    <div
      data-testid="models-cards-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "var(--space-3)",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {models.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          selected={selected.has(model.id)}
          actionBusy={busyId === model.id}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
          onCompare={onCompare}
          onFavourite={onFavourite}
          onEdit={onEdit}
          onArchive={onArchive}
        />
      ))}
    </div>
  );
}
