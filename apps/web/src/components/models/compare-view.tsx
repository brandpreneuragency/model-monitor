"use client";

import type { CSSProperties, ReactNode } from "react";

/** Display string used when a field has no recorded value. */
export const NOT_RECORDED = "not recorded";

export const COMPARE_MAX_MODELS = 4;

/** Minimum models required to open a useful comparison. */
export const COMPARE_MIN_MODELS = 2;

/**
 * Input shape for one model column. Prefer preferred / primary access fields
 * when multiple routes exist. Null/undefined/empty → "not recorded".
 */
export type CompareModelInput = {
  id: string;
  name: string;
  // Access
  accessProvider?: string | null;
  accessType?: string | null;
  availability?: string | null;
  accessMethod?: string | null;
  // Plans
  planName?: string | null;
  // Pricing
  pricing?: string | null;
  // Quotas
  quota?: string | null;
  // Specifications
  family?: string | null;
  generation?: string | null;
  releaseDate?: string | null;
  knowledgeCutoff?: string | null;
  contextTokens?: number | null;
  maxOutputTokens?: number | null;
  speed?: string | null;
  modelType?: string | null;
  lifecycle?: string | null;
  codingSpecialization?: string | null;
  // Capabilities (null = unknown)
  vision?: boolean | null;
  reasoning?: boolean | null;
  toolUse?: boolean | null;
  parallelAgents?: boolean | null;
  computerUse?: boolean | null;
  functionCalling?: boolean | null;
  structuredOutput?: boolean | null;
  // Ratings — personal and external stay separate when both present
  overallScore?: number | null;
  scoreBasis?: string | null;
  personalOverall?: number | null;
  externalOverall?: number | null;
  // Best-use notes
  bestUse?: string | null;
  // Weaknesses
  avoidFor?: string | null;
  weaknesses?: string | null;
};

export type CompareRowDef = {
  id: string;
  label: string;
  getValue: (model: CompareModelInput) => string;
};

export type CompareGroupDef = {
  id: string;
  label: string;
  rows: CompareRowDef[];
};

function trimOrNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** Format a scalar for a compare cell. Never blank; never invent 0/false. */
export function formatCompareValue(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) return NOT_RECORDED;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return NOT_RECORDED;
    return Number.isInteger(value)
      ? value.toLocaleString()
      : String(value);
  }
  const t = value.trim();
  return t.length === 0 ? NOT_RECORDED : t;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return NOT_RECORDED;
  return n.toLocaleString();
}

function formatScore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return NOT_RECORDED;
  return Number.isInteger(n) ? String(n) : String(n);
}

function accessTypeLabel(raw: string | null | undefined): string {
  const t = trimOrNull(raw);
  if (!t) return NOT_RECORDED;
  return t
    .split(/[_-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function weaknessText(model: CompareModelInput): string {
  return formatCompareValue(
    trimOrNull(model.avoidFor) ?? trimOrNull(model.weaknesses),
  );
}

function overallRatingText(model: CompareModelInput): string {
  // Prefer explicit personal/external pair when either is set; else overall + basis.
  const hasSplit =
    model.personalOverall != null || model.externalOverall != null;
  if (hasSplit) {
    const personal = formatScore(model.personalOverall ?? null);
    const external = formatScore(model.externalOverall ?? null);
    return `Personal ${personal} · External ${external}`;
  }
  const overall = formatScore(model.overallScore ?? null);
  const basis = trimOrNull(model.scoreBasis);
  if (overall === NOT_RECORDED) return NOT_RECORDED;
  return basis ? `${overall} (${basis})` : overall;
}

/** Row groups shown in the compare matrix (stable ids for tests/evidence). */
export const COMPARE_GROUPS: CompareGroupDef[] = [
  {
    id: "access",
    label: "Access",
    rows: [
      {
        id: "accessProvider",
        label: "Access provider",
        getValue: (m) => formatCompareValue(m.accessProvider),
      },
      {
        id: "accessType",
        label: "Access type",
        getValue: (m) => accessTypeLabel(m.accessType),
      },
      {
        id: "availability",
        label: "Availability",
        getValue: (m) => formatCompareValue(m.availability),
      },
      {
        id: "accessMethod",
        label: "Access method",
        getValue: (m) => formatCompareValue(m.accessMethod),
      },
    ],
  },
  {
    id: "plans",
    label: "Plans",
    rows: [
      {
        id: "planName",
        label: "Plan",
        getValue: (m) => formatCompareValue(m.planName),
      },
    ],
  },
  {
    id: "pricing",
    label: "Pricing",
    rows: [
      {
        id: "pricing",
        label: "Pricing",
        getValue: (m) => formatCompareValue(m.pricing),
      },
    ],
  },
  {
    id: "quotas",
    label: "Quotas",
    rows: [
      {
        id: "quota",
        label: "Quota",
        getValue: (m) => formatCompareValue(m.quota),
      },
    ],
  },
  {
    id: "specifications",
    label: "Specifications",
    rows: [
      {
        id: "family",
        label: "Family",
        getValue: (m) => formatCompareValue(m.family),
      },
      {
        id: "generation",
        label: "Generation",
        getValue: (m) => formatCompareValue(m.generation),
      },
      {
        id: "releaseDate",
        label: "Release",
        getValue: (m) => formatCompareValue(m.releaseDate),
      },
      {
        id: "knowledgeCutoff",
        label: "Knowledge cutoff",
        getValue: (m) => formatCompareValue(m.knowledgeCutoff),
      },
      {
        id: "contextTokens",
        label: "Context",
        getValue: (m) => formatTokens(m.contextTokens),
      },
      {
        id: "maxOutputTokens",
        label: "Max output",
        getValue: (m) => formatTokens(m.maxOutputTokens),
      },
      {
        id: "speed",
        label: "Speed",
        getValue: (m) => formatCompareValue(m.speed),
      },
      {
        id: "modelType",
        label: "Model type",
        getValue: (m) => formatCompareValue(m.modelType),
      },
      {
        id: "lifecycle",
        label: "Lifecycle",
        getValue: (m) => formatCompareValue(m.lifecycle),
      },
      {
        id: "codingSpecialization",
        label: "Coding specialization",
        getValue: (m) => formatCompareValue(m.codingSpecialization),
      },
    ],
  },
  {
    id: "capabilities",
    label: "Capabilities",
    rows: [
      {
        id: "vision",
        label: "Vision",
        getValue: (m) => formatCompareValue(m.vision),
      },
      {
        id: "reasoning",
        label: "Reasoning",
        getValue: (m) => formatCompareValue(m.reasoning),
      },
      {
        id: "toolUse",
        label: "Tool use",
        getValue: (m) => formatCompareValue(m.toolUse),
      },
      {
        id: "parallelAgents",
        label: "Parallel agents",
        getValue: (m) => formatCompareValue(m.parallelAgents),
      },
      {
        id: "computerUse",
        label: "Computer use",
        getValue: (m) => formatCompareValue(m.computerUse),
      },
      {
        id: "functionCalling",
        label: "Function calling",
        getValue: (m) => formatCompareValue(m.functionCalling),
      },
      {
        id: "structuredOutput",
        label: "Structured output",
        getValue: (m) => formatCompareValue(m.structuredOutput),
      },
    ],
  },
  {
    id: "ratings",
    label: "Ratings",
    rows: [
      {
        id: "overallScore",
        label: "Overall score",
        getValue: overallRatingText,
      },
      {
        id: "scoreBasis",
        label: "Score basis",
        getValue: (m) => formatCompareValue(m.scoreBasis),
      },
    ],
  },
  {
    id: "best-use",
    label: "Best-use notes",
    rows: [
      {
        id: "bestUse",
        label: "Best use",
        getValue: (m) => formatCompareValue(m.bestUse),
      },
    ],
  },
  {
    id: "weaknesses",
    label: "Weaknesses",
    rows: [
      {
        id: "avoidFor",
        label: "Avoid / weaknesses",
        getValue: weaknessText,
      },
    ],
  },
];

export const COMPARE_GROUP_LABELS = COMPARE_GROUPS.map((g) => g.label);

/** True when every model displays the same cell text for this row. */
export function rowValuesAgree(values: string[]): boolean {
  if (values.length <= 1) return true;
  const first = values[0];
  return values.every((v) => v === first);
}

export type CompareViewProps = {
  models: CompareModelInput[];
  /** Optional heading override. */
  title?: string;
  emptyMessage?: string;
};

const shell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
  fontFamily: "var(--font-sans)",
  color: "var(--text)",
  fontSize: "var(--text-body-size)",
  lineHeight: "var(--text-body-line)",
};

const tableWrap: CSSProperties = {
  overflowX: "auto",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-card)",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 480,
};

const thModel: CSSProperties = {
  textAlign: "left",
  padding: "var(--space-3)",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-surface)",
  fontSize: "var(--text-card-size)",
  fontWeight: "var(--text-card-weight)",
  color: "var(--text)",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const thAttr: CSSProperties = {
  ...thModel,
  width: 160,
  color: "var(--text-muted)",
  fontWeight: 500,
};

const groupHeader: CSSProperties = {
  textAlign: "left",
  padding: "var(--space-2) var(--space-3)",
  background: "var(--bg-surface)",
  borderTop: "1px solid var(--border)",
  borderBottom: "1px solid var(--border-subtle)",
  color: "var(--text-muted)",
  fontSize: "var(--text-meta-size)",
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};

const cellBase: CSSProperties = {
  padding: "var(--space-2) var(--space-3)",
  borderBottom: "1px solid var(--border-subtle)",
  verticalAlign: "top",
  wordBreak: "break-word",
};

/** Agreeing rows: de-emphasised text, no strong border. */
const rowAgree: CSSProperties = {
  color: "var(--text-faint)",
  background: "transparent",
};

/**
 * Differing rows: left border + surface token (not colour-only; avoids semantic
 * ok/warn/danger/info palette).
 */
const rowDiffer: CSSProperties = {
  color: "var(--text)",
  background: "var(--bg-card-hover)",
  borderLeft: "3px solid var(--border-strong)",
};

const labelCell: CSSProperties = {
  ...cellBase,
  color: "var(--text-muted)",
  fontSize: "var(--text-meta-size)",
  width: 160,
  whiteSpace: "nowrap",
};

function EmptyState({ message }: { message: string }) {
  return (
    <div
      data-testid="compare-view-empty"
      style={{
        padding: "var(--space-6)",
        color: "var(--text-muted)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-card)",
      }}
    >
      {message}
    </div>
  );
}

/**
 * Side-by-side model comparison matrix.
 * Columns = models (2–4); rows = attributes grouped by domain.
 */
export function CompareView({
  models,
  title = "Compare models",
  emptyMessage = "Select two to four models to compare.",
}: CompareViewProps) {
  const columns = models.slice(0, COMPARE_MAX_MODELS);

  if (columns.length === 0) {
    return (
      <div data-testid="compare-view" style={shell}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-page-size)",
            fontWeight: "var(--text-page-weight)",
            lineHeight: "var(--text-page-line)",
          }}
        >
          {title}
        </h1>
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  const colCount = columns.length;

  return (
    <div
      data-testid="compare-view"
      data-model-count={colCount}
      style={shell}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-page-size)",
            fontWeight: "var(--text-page-weight)",
            lineHeight: "var(--text-page-line)",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
          }}
          data-testid="compare-view-count"
        >
          {colCount} model{colCount === 1 ? "" : "s"}
        </p>
      </header>

      <div style={tableWrap}>
        <table
          style={tableStyle}
          data-testid="compare-table"
          aria-label="Model comparison"
        >
          <thead>
            <tr data-testid="compare-header-row">
              <th scope="col" style={thAttr}>
                Attribute
              </th>
              {columns.map((m) => (
                <th
                  key={m.id}
                  scope="col"
                  style={thModel}
                  data-testid={`compare-col-${m.id}`}
                  data-model-id={m.id}
                >
                  {m.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_GROUPS.map((group) => (
              <GroupBlock
                key={group.id}
                group={group}
                models={columns}
                colCount={colCount}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupBlock({
  group,
  models,
  colCount,
}: {
  group: CompareGroupDef;
  models: CompareModelInput[];
  colCount: number;
}) {
  return (
    <>
      <tr data-testid={`compare-group-${group.id}`} data-group={group.id}>
        <th
          colSpan={colCount + 1}
          scope="colgroup"
          style={groupHeader}
        >
          {group.label}
        </th>
      </tr>
      {group.rows.map((row) => {
        const values = models.map((m) => row.getValue(m));
        const agrees = rowValuesAgree(values);
        const rowStyle: CSSProperties = agrees ? rowAgree : rowDiffer;

        return (
          <tr
            key={row.id}
            data-testid={`compare-row-${row.id}`}
            data-row={row.id}
            data-agree={agrees ? "true" : "false"}
            data-differ={agrees ? "false" : "true"}
            style={rowStyle}
            aria-label={
              agrees
                ? `${row.label}: all models agree`
                : `${row.label}: models differ`
            }
          >
            <th scope="row" style={{ ...labelCell, ...rowStyle }}>
              {row.label}
            </th>
            {models.map((m, i) => (
              <td
                key={m.id}
                style={{ ...cellBase, ...rowStyle }}
                data-testid={`compare-cell-${row.id}-${m.id}`}
                data-value={values[i]}
              >
                <CellText value={values[i]} />
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}

function CellText({ value }: { value: string }) {
  if (value === NOT_RECORDED) {
    return (
      <span
        data-testid="compare-not-recorded"
        style={{
          color: "var(--text-faint)",
          fontStyle: "italic",
          fontSize: "var(--text-meta-size)",
        }}
      >
        {NOT_RECORDED}
      </span>
    );
  }
  return <span>{value}</span>;
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

/** Map a loose API/detail object into CompareModelInput. */
export function toCompareModelInput(
  raw: Record<string, unknown>,
  extras?: Partial<CompareModelInput>,
): CompareModelInput {
  const caps = (raw.capabilities ?? null) as
    | Record<string, unknown>
    | null
    | undefined;
  const preferred = (raw.preferredAccess ?? null) as
    | Record<string, unknown>
    | null
    | undefined;
  const preferredPlan = (raw.preferredPlan ?? null) as
    | Record<string, unknown>
    | null
    | undefined;
  const preferredProvider = (raw.preferredAccessProvider ?? null) as
    | Record<string, unknown>
    | null
    | undefined;

  const accessProvider =
    (preferred?.providerName as string | null | undefined) ??
    (preferredProvider?.name as string | null | undefined) ??
    (raw.accessProvider as string | null | undefined) ??
    null;

  const planName =
    (preferred?.planName as string | null | undefined) ??
    (preferredPlan?.name as string | null | undefined) ??
    (raw.planName as string | null | undefined) ??
    null;

  const accessType =
    (preferred?.accessType as string | null | undefined) ??
    (preferredPlan?.accessType as string | null | undefined) ??
    (raw.accessType as string | null | undefined) ??
    null;

  const boolCap = (key: string): boolean | null => {
    if (!caps || !(key in caps)) return null;
    const v = caps[key];
    if (v === true) return true;
    if (v === false) return false;
    return null;
  };

  return {
    id: asString(raw.id, asString(extras?.id, "")),
    name: asString(raw.name, asString(extras?.name, "Model")),
    accessProvider,
    accessType,
    availability: (raw.availability as string | null | undefined) ?? null,
    accessMethod: (raw.accessMethod as string | null | undefined) ?? null,
    planName,
    pricing:
      (raw.pricing as string | null | undefined) ??
      (raw.costOrQuota as string | null | undefined) ??
      null,
    quota: (raw.quota as string | null | undefined) ?? null,
    family: (raw.family as string | null | undefined) ?? null,
    generation: (raw.generation as string | null | undefined) ?? null,
    releaseDate: (raw.releaseDate as string | null | undefined) ?? null,
    knowledgeCutoff:
      (raw.knowledgeCutoff as string | null | undefined) ?? null,
    contextTokens:
      (raw.contextTokens as number | null | undefined) ??
      (raw.context as number | null | undefined) ??
      null,
    maxOutputTokens:
      (raw.maxOutputTokens as number | null | undefined) ?? null,
    speed:
      (raw.speed as string | null | undefined) ??
      (raw.speedRating as string | null | undefined) ??
      null,
    modelType: (raw.modelType as string | null | undefined) ?? null,
    lifecycle: (raw.lifecycle as string | null | undefined) ?? null,
    codingSpecialization:
      (raw.codingSpecialization as string | null | undefined) ?? null,
    vision: boolCap("vision"),
    reasoning: boolCap("reasoning"),
    toolUse: boolCap("toolUse") ?? boolCap("toolSupport"),
    parallelAgents: boolCap("parallelAgents") ?? boolCap("agent"),
    computerUse: boolCap("computerUse"),
    functionCalling: boolCap("functionCalling"),
    structuredOutput: boolCap("structuredOutput"),
    overallScore: (raw.overallScore as number | null | undefined) ?? null,
    scoreBasis: (raw.scoreBasis as string | null | undefined) ?? null,
    personalOverall:
      (raw.personalOverall as number | null | undefined) ?? null,
    externalOverall:
      (raw.externalOverall as number | null | undefined) ?? null,
    bestUse: (raw.bestUse as string | null | undefined) ?? null,
    avoidFor: (raw.avoidFor as string | null | undefined) ?? null,
    weaknesses: (raw.weaknesses as string | null | undefined) ?? null,
    ...extras,
  };
}

export function CompareViewLegend(): ReactNode {
  return (
    <p
      data-testid="compare-legend"
      style={{
        margin: 0,
        fontSize: "var(--text-meta-size)",
        color: "var(--text-faint)",
      }}
    >
      Rows where all models match are muted. Differing rows use a stronger
      border and background so differences are visible at a glance.
    </p>
  );
}
