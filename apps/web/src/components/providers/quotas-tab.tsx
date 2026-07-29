"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { Card, EmptyState, StatusChip } from "@model-monitor/ui";
import type { PlanDto, QuotaDto } from "./types";
import { QuotaProgress } from "./quota-progress";
import {
  formatDateTime,
  NOT_RECORDED,
  periodLabel,
  quotaMax,
  readApiError,
  unitLabel,
} from "./utils";

export interface QuotasTabProps {
  plans: PlanDto[];
  onQuotaPatched: (quota: QuotaDto) => void;
  fetchImpl?: typeof fetch;
}

export function QuotasTab({
  plans,
  onQuotaPatched,
  fetchImpl = fetch,
}: QuotasTabProps) {
  const groups = plans
    .map((p) => ({ plan: p, quotas: p.quotas }))
    .filter((g) => g.quotas.length > 0);

  if (groups.length === 0) {
    return (
      <div data-testid="quotas-tab">
        <EmptyState title="No quotas" message="No plan quotas are recorded yet." />
      </div>
    );
  }

  return (
    <div data-testid="quotas-tab" style={{ display: "grid", gap: "var(--space-4)" }}>
      {groups.map(({ plan, quotas }) => (
        <Card key={plan.id} padding="md" data-testid="quota-plan-group">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "var(--space-2)",
              marginBottom: "var(--space-3)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "var(--text-section-size)",
                  fontWeight: 600,
                }}
              >
                {plan.name}
              </h2>
              <div style={{ fontSize: "var(--text-meta-size)", color: "var(--text-faint)" }}>
                {plan.accessProvider.name}
              </div>
            </div>
            <span style={{ fontSize: "var(--text-meta-size)", color: "var(--text-muted)" }}>
              {quotas.length} quota{quotas.length === 1 ? "" : "s"}
            </span>
          </div>

          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {quotas.map((q) => (
              <QuotaEditor
                key={q.id}
                quota={q}
                onPatched={onQuotaPatched}
                fetchImpl={fetchImpl}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function QuotaEditor({
  quota,
  onPatched,
  fetchImpl,
}: {
  quota: QuotaDto;
  onPatched: (q: QuotaDto) => void;
  fetchImpl: typeof fetch;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    quota.remainingAmount == null ? "" : String(quota.remainingAmount),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const max = quotaMax(quota);

  const startEdit = () => {
    setDraft(quota.remainingAmount == null ? "" : String(quota.remainingAmount));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const trimmed = draft.trim();
    let remainingAmount: number | null;
    if (trimmed === "") {
      remainingAmount = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        setError("Enter a number or leave blank");
        return;
      }
      remainingAmount = n;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetchImpl(`/api/v1/quotas/${quota.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remainingAmount }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as QuotaDto & { data?: QuotaDto };
      const next = body.data ?? body;
      onPatched({ ...quota, ...next, planId: next.planId ?? quota.planId });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div
      data-testid="quota-row"
      data-quota-id={quota.id}
      data-unlimited={quota.isUnlimited || undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
        gap: "var(--space-4)",
        padding: "var(--space-3)",
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ display: "grid", gap: "var(--space-2)", minWidth: 0 }}>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "var(--text-card-size)" }}>{quota.name}</strong>
          {quota.isUnlimited ? <StatusChip color="ok" label="Unlimited" /> : null}
        </div>

        <dl style={{ margin: 0, display: "grid", gap: 4, fontSize: "var(--text-meta-size)" }}>
          <Meta
            label="Maximum allowance"
            value={
              quota.isUnlimited
                ? "Unlimited"
                : max == null
                  ? NOT_RECORDED
                  : `${max} ${unitLabel(quota.unit, quota.customUnit)}`
            }
          />
          <Meta
            label="Remaining allowance"
            value={
              quota.isUnlimited
                ? "Unlimited"
                : quota.remainingAmount == null
                  ? NOT_RECORDED
                  : `${quota.remainingAmount} ${unitLabel(quota.unit, quota.customUnit)}`
            }
          />
          <Meta label="Usage period" value={periodLabel(quota.period)} />
          <Meta
            label="Reset behaviour"
            value={quota.resetBehaviour?.trim() || NOT_RECORDED}
          />
          <Meta
            label="Last manual update"
            value={formatDateTime(quota.remainingUpdatedAt)}
          />
          <Meta
            label="Unlimited status"
            value={quota.isUnlimited ? "Yes" : "No"}
          />
        </dl>

        {!quota.isUnlimited ? (
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            {editing ? (
              <>
                <label
                  style={{
                    fontSize: "var(--text-meta-size)",
                    color: "var(--text-muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  Remaining
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKey}
                    aria-label={`Edit remaining for ${quota.name}`}
                    data-testid="quota-remaining-input"
                    autoFocus
                    disabled={saving}
                    style={inputStyle}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  data-testid="quota-remaining-save"
                  style={btnPrimary}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={saving}
                  style={btnGhost}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                data-testid="quota-remaining-edit"
                style={btnGhost}
              >
                Edit remaining
              </button>
            )}
            {error ? (
              <span style={{ color: "var(--warn)", fontSize: "var(--text-meta-size)" }}>
                {error}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ minWidth: 0, alignSelf: "center" }}>
        <QuotaProgress quota={quota} />
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "var(--space-2)" }}>
      <dt style={{ margin: 0, color: "var(--text-faint)" }}>{label}</dt>
      <dd style={{ margin: 0, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</dd>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: 100,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "4px 8px",
  color: "var(--text)",
  font: "inherit",
  fontVariantNumeric: "tabular-nums",
};

const btnPrimary: CSSProperties = {
  appearance: "none",
  border: "1px solid transparent",
  background: "var(--accent)",
  color: "var(--text)",
  borderRadius: "var(--radius-md)",
  padding: "4px 10px",
  fontSize: "var(--text-meta-size)",
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  borderRadius: "var(--radius-md)",
  padding: "4px 10px",
  fontSize: "var(--text-meta-size)",
  fontWeight: 600,
  cursor: "pointer",
};
