"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Badge,
  ScoreCell,
  StatusChip,
  Tag,
  type SemanticColor,
} from "@model-monitor/ui";
import type { CSSProperties, ReactNode } from "react";

/** List-item shape returned by GET /api/v1/models (enriched). */
export type ModelTableRow = {
  id: string;
  name: string;
  canonicalId?: string | null;
  slug?: string | null;
  isFavourite?: boolean | null;
  workflowStatus?: string | null;
  status?: string | null;
  context?: number | null;
  contextTokens?: number | null;
  speed?: string | null;
  speedRating?: string | null;
  overallScore?: number | null;
  scoreBasis?: string | null;
  bestSkill?: {
    id?: string;
    name: string;
    slug?: string;
    score?: number;
    basis?: string;
  } | null;
  costOrQuota?: string | null;
  tags?: Array<{
    id?: string;
    name: string;
    slug?: string;
    color?: string | null;
  }>;
  updatedAt?: string | null;
  createdAt?: string | null;
  releaseDate?: string | null;
  family?: string | null;
  generation?: string | null;
  lifecycle?: string | null;
  modelType?: string | null;
  maxOutputTokens?: number | null;
  verifiedTps?: number | null;
  verificationStatus?: string | null;
  creator?: {
    id?: string | null;
    name?: string | null;
    slug?: string | null;
  } | null;
  developerName?: string | null;
  preferredAccess?: {
    accessId?: string;
    providerId?: string;
    providerName?: string | null;
    providerSlug?: string | null;
    planId?: string;
    planName?: string | null;
    planSlug?: string | null;
    accessType?: string | null;
  } | null;
  preferredAccessProvider?: {
    id?: string;
    name?: string | null;
    slug?: string | null;
  } | null;
  preferredPlan?: {
    id?: string;
    name?: string | null;
    slug?: string | null;
    accessType?: string | null;
  } | null;
  accessProviders?: string[];
  bestUse?: string | null;
  avoidFor?: string | null;
  description?: string | null;
  codingSpecialization?: string | null;
  capabilities?: {
    vision?: boolean | null;
    reasoning?: boolean | null;
    toolUse?: boolean | null;
    parallelAgents?: boolean | null;
    computerUse?: boolean | null;
    audioInput?: boolean | null;
    videoInput?: boolean | null;
    imageInput?: boolean | null;
    structuredOutput?: boolean | null;
    functionCalling?: boolean | null;
    details?: unknown;
    display?: {
      vision?: string;
      reasoning?: string;
      toolUse?: string;
    };
  } | null;
};

export type ModelColumnId =
  | "model"
  | "creator"
  | "accessProvider"
  | "plan"
  | "status"
  | "context"
  | "speed"
  | "overallScore"
  | "bestSkill"
  | "costOrQuota"
  | "tags"
  | "updated"
  | "family"
  | "generation"
  | "lifecycle"
  | "modelType"
  | "maxOutput"
  | "accessType"
  | "scoreBasis"
  | "canonicalId"
  | "verifiedTps";

export const DEFAULT_COLUMN_IDS: ModelColumnId[] = [
  "model",
  "creator",
  "accessProvider",
  "plan",
  "status",
  "context",
  "speed",
  "overallScore",
  "bestSkill",
  "costOrQuota",
  "tags",
  "updated",
];

export const OPTIONAL_COLUMN_IDS: ModelColumnId[] = [
  "family",
  "generation",
  "lifecycle",
  "modelType",
  "maxOutput",
  "accessType",
  "scoreBasis",
  "canonicalId",
  "verifiedTps",
];

export const COLUMN_LABELS: Record<ModelColumnId, string> = {
  model: "Model",
  creator: "Creator",
  accessProvider: "Access Provider",
  plan: "Plan",
  status: "Status",
  context: "Context",
  speed: "Speed",
  overallScore: "Overall Score",
  bestSkill: "Best Skill",
  costOrQuota: "Cost / Quota",
  tags: "Tags",
  updated: "Updated",
  family: "Family",
  generation: "Generation",
  lifecycle: "Lifecycle",
  modelType: "Model Type",
  maxOutput: "Max Output",
  accessType: "Access Type",
  scoreBasis: "Score Basis",
  canonicalId: "Canonical ID",
  verifiedTps: "Verified TPS",
};

/** Sort keys accepted by GET /api/v1/models */
export const COLUMN_SORT_KEYS: Partial<Record<ModelColumnId, string>> = {
  model: "name",
  creator: "creator",
  status: "workflowStatus",
  context: "context",
  speed: "speed",
  overallScore: "overallScore",
  updated: "updatedAt",
};

const muted: CSSProperties = { color: "var(--text-muted)" };
const faint: CSSProperties = { color: "var(--text-faint)" };

function logoInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function LogoTile({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        display: "inline-grid",
        placeItems: "center",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--text-muted)",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {logoInitials(label)}
    </span>
  );
}

export function formatContextTokens(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${Math.round(m * 10) / 10}M`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return Number.isInteger(k) ? `${k}K` : `${Math.round(k * 10) / 10}K`;
  }
  return String(value);
}

export function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isRecentlyNew(row: ModelTableRow): boolean {
  const candidates = [row.releaseDate, row.createdAt].filter(Boolean) as string[];
  if (candidates.length === 0) return false;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return candidates.some((c) => {
    const t = new Date(c).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });
}

export function workflowColor(status: string | null | undefined): SemanticColor {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "preferred") return "ok";
  if (
    s === "testing" ||
    s === "evaluating" ||
    s === "trial" ||
    s === "preview"
  ) {
    return "info";
  }
  if (s === "deprecated" || s === "limited" || s === "legacy") return "warn";
  if (s === "retired" || s === "archived" || s === "blocked") return "danger";
  if (s === "candidate" || s === "watch") return "advanced";
  return "neutral";
}

export function workflowLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function speedColor(speed: string | null | undefined): string {
  const s = (speed ?? "").toLowerCase();
  if (s.includes("very") && s.includes("fast")) return "var(--fast)";
  if (s.includes("fast")) return "var(--ok)";
  if (s.includes("medium") || s.includes("moderate")) return "var(--warn)";
  if (s.includes("slow")) return "var(--danger)";
  return "var(--text-muted)";
}

export function creatorName(row: ModelTableRow): string {
  return row.creator?.name ?? row.developerName ?? "—";
}

export function providerName(row: ModelTableRow): string {
  return (
    row.preferredAccess?.providerName ??
    row.preferredAccessProvider?.name ??
    "—"
  );
}

export function planName(row: ModelTableRow): string {
  return row.preferredAccess?.planName ?? row.preferredPlan?.name ?? "—";
}

/** Main capability chips for cards — only affirmative capabilities. */
export function mainCapabilityLabels(
  caps: ModelTableRow["capabilities"],
): string[] {
  if (!caps) return [];
  const out: string[] = [];
  if (caps.vision === true) out.push("Vision");
  if (caps.reasoning === true) out.push("Reasoning");
  if (caps.toolUse === true) out.push("Tools");
  if (caps.parallelAgents === true) out.push("Agents");
  if (caps.computerUse === true) out.push("Computer use");
  if (caps.functionCalling === true && caps.toolUse !== true) {
    out.push("Functions");
  }
  if (caps.structuredOutput === true) out.push("Structured");
  if (caps.audioInput === true) out.push("Audio");
  if (caps.videoInput === true) out.push("Video");
  return out;
}

export function costOrQuotaText(value: string | null | undefined): string {
  if (value == null || value.trim() === "") return "not recorded";
  return value;
}

function accessTypeLabel(row: ModelTableRow): string {
  const t =
    row.preferredAccess?.accessType ?? row.preferredPlan?.accessType ?? null;
  if (!t) return "—";
  return t
    .split(/[_-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function costOrQuotaDisplay(value: string | null | undefined): ReactNode {
  if (value == null || value.trim() === "") {
    return <span style={faint}>not recorded</span>;
  }
  return <span style={muted}>{value}</span>;
}

function CellWithLogo({
  name,
  sub,
}: {
  name: string;
  sub?: string | null;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        minWidth: 0,
      }}
    >
      <LogoTile label={name === "—" ? "?" : name} />
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          gap: 1,
        }}
      >
        <span
          style={{
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </span>
        {sub ? (
          <span style={{ ...faint, fontSize: "var(--text-meta-size)" }}>
            {sub}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function buildModelColumns(
  visibleIds: ModelColumnId[],
): ColumnDef<ModelTableRow, unknown>[] {
  const all = createAllColumnDefs();
  const byId = new Map(all.map((c) => [c.id as ModelColumnId, c]));
  return visibleIds
    .map((id) => byId.get(id))
    .filter((c): c is ColumnDef<ModelTableRow, unknown> => Boolean(c));
}

function createAllColumnDefs(): ColumnDef<ModelTableRow, unknown>[] {
  return [
    {
      id: "model",
      accessorKey: "name",
      header: "Model",
      enableSorting: true,
      meta: {
        sticky: "left",
        minWidth: 220,
      },
      cell: ({ row }) => {
        const r = row.original;
        const creator = creatorName(r);
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              minWidth: 0,
            }}
          >
            <LogoTile label={r.name} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-1_5)",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.name}
                </span>
                {isRecentlyNew(r) ? <Badge color="info">New</Badge> : null}
                {r.isFavourite ? (
                  <span
                    title="Favourite"
                    aria-label="Favourite"
                    style={{ color: "var(--warn)", fontSize: 12, lineHeight: 1 }}
                  >
                    ★
                  </span>
                ) : null}
              </span>
              <span
                style={{
                  ...faint,
                  fontSize: "var(--text-meta-size)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {creator === "—" ? "Unknown creator" : creator}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: "creator",
      accessorFn: (r) => creatorName(r),
      header: "Creator",
      enableSorting: true,
      cell: ({ row }) => (
        <CellWithLogo name={creatorName(row.original)} />
      ),
    },
    {
      id: "accessProvider",
      accessorFn: (r) => providerName(r),
      header: "Access Provider",
      enableSorting: false,
      cell: ({ row }) => (
        <CellWithLogo name={providerName(row.original)} />
      ),
    },
    {
      id: "plan",
      accessorFn: (r) => planName(r),
      header: "Plan",
      enableSorting: false,
      cell: ({ row }) => (
        <span style={muted}>{planName(row.original)}</span>
      ),
    },
    {
      id: "status",
      accessorFn: (r) => r.workflowStatus ?? r.status ?? null,
      header: "Status",
      enableSorting: true,
      cell: ({ row }) => {
        const status = row.original.workflowStatus ?? row.original.status;
        return (
          <StatusChip
            color={workflowColor(status)}
            label={workflowLabel(status)}
          />
        );
      },
    },
    {
      id: "context",
      accessorFn: (r) => r.context ?? r.contextTokens ?? null,
      header: "Context",
      enableSorting: true,
      cell: ({ getValue }) =>
        formatContextTokens(getValue() as number | null | undefined),
    },
    {
      id: "speed",
      accessorFn: (r) => r.speed ?? r.speedRating ?? null,
      header: "Speed",
      enableSorting: true,
      cell: ({ getValue }) => {
        const speed = (getValue() as string | null) ?? null;
        if (!speed) return <span style={faint}>—</span>;
        return (
          <span style={{ color: speedColor(speed), fontWeight: 600 }}>
            {speed}
          </span>
        );
      },
    },
    {
      id: "overallScore",
      accessorKey: "overallScore",
      header: "Overall Score",
      enableSorting: true,
      cell: ({ row }) => (
        <ScoreCell
          value={row.original.overallScore}
          scale="ten"
          label="Overall score"
        />
      ),
    },
    {
      id: "bestSkill",
      accessorFn: (r) => r.bestSkill?.name ?? null,
      header: "Best Skill",
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? v : <span style={faint}>—</span>;
      },
    },
    {
      id: "costOrQuota",
      accessorKey: "costOrQuota",
      header: "Cost / Quota",
      enableSorting: false,
      cell: ({ row }) => costOrQuotaDisplay(row.original.costOrQuota),
    },
    {
      id: "tags",
      accessorFn: (r) => (r.tags ?? []).map((t) => t.name).join(", "),
      header: "Tags",
      enableSorting: false,
      cell: ({ row }) => {
        const tags = row.original.tags ?? [];
        if (tags.length === 0) return <span style={faint}>—</span>;
        const shown = tags.slice(0, 2);
        const extra = tags.length - shown.length;
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              alignItems: "flex-start",
            }}
          >
            {shown.map((t, i) => (
              <Tag
                key={t.id ?? `${t.name}-${i}`}
                name={
                  i === shown.length - 1 && extra > 0
                    ? `${t.name}`
                    : t.name
                }
              />
            ))}
            {extra > 0 ? (
              <span style={{ ...faint, fontSize: 10, fontWeight: 600 }}>
                +{extra}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "updated",
      accessorKey: "updatedAt",
      header: "Updated",
      enableSorting: true,
      cell: ({ row }) => (
        <span style={faint}>{formatUpdated(row.original.updatedAt)}</span>
      ),
    },
    {
      id: "family",
      accessorKey: "family",
      header: "Family",
      enableSorting: true,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? v : <span style={faint}>—</span>;
      },
    },
    {
      id: "generation",
      accessorKey: "generation",
      header: "Generation",
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? v : <span style={faint}>—</span>;
      },
    },
    {
      id: "lifecycle",
      accessorKey: "lifecycle",
      header: "Lifecycle",
      enableSorting: true,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? v : <span style={faint}>—</span>;
      },
    },
    {
      id: "modelType",
      accessorKey: "modelType",
      header: "Model Type",
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? v : <span style={faint}>—</span>;
      },
    },
    {
      id: "maxOutput",
      accessorKey: "maxOutputTokens",
      header: "Max Output",
      enableSorting: false,
      cell: ({ getValue }) =>
        formatContextTokens(getValue() as number | null | undefined),
    },
    {
      id: "accessType",
      accessorFn: (r) => accessTypeLabel(r),
      header: "Access Type",
      enableSorting: false,
      cell: ({ row }) => {
        const label = accessTypeLabel(row.original);
        return label === "—" ? (
          <span style={faint}>—</span>
        ) : (
          <span style={muted}>{label}</span>
        );
      },
    },
    {
      id: "scoreBasis",
      accessorKey: "scoreBasis",
      header: "Score Basis",
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? (
          <span style={muted}>{v}</span>
        ) : (
          <span style={faint}>—</span>
        );
      },
    },
    {
      id: "canonicalId",
      accessorKey: "canonicalId",
      header: "Canonical ID",
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? (
          <span
            style={{
              ...faint,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            {v}
          </span>
        ) : (
          <span style={faint}>—</span>
        );
      },
    },
    {
      id: "verifiedTps",
      accessorKey: "verifiedTps",
      header: "Verified TPS",
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v == null ? (
          <span style={faint}>—</span>
        ) : (
          <span style={muted}>{v}</span>
        );
      },
    },
  ];
}
