"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { Card, EmptyState, StatusChip } from "@model-monitor/ui";
import type { PlanDto } from "./types";
import { QuotaProgress } from "./quota-progress";
import {
  accessTypeColor,
  accessTypeLabel,
  formatDate,
  formatMonthly,
  formatMoney,
  initials,
  NOT_RECORDED,
  relativeDays,
} from "./utils";

export interface PlansTabProps {
  plans: PlanDto[];
  search: string;
  onSearchChange: (v: string) => void;
  providerFilter: string;
  onProviderFilterChange: (v: string) => void;
  providerOptions: { value: string; label: string }[];
  onOpenPlan: (plan: PlanDto) => void;
}

export function PlansTab({
  plans,
  search,
  onSearchChange,
  providerFilter,
  onProviderFilterChange,
  providerOptions,
  onOpenPlan,
}: PlansTabProps) {
  const filtered = plans.filter((p) => {
    if (providerFilter !== "all" && p.accessProviderId !== providerFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.accessProvider.name.toLowerCase().includes(q) ||
      (p.notes ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div data-testid="plans-tab">
      <Card padding="md">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            flexWrap: "wrap",
            marginBottom: "var(--space-3)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "var(--text-section-size)",
              fontWeight: 600,
            }}
          >
            Plans ({filtered.length})
          </h2>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <select
              aria-label="Filter by provider"
              value={providerFilter}
              onChange={(e) => onProviderFilterChange(e.target.value)}
              style={selectStyle}
            >
              {providerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="Search plans…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search plans"
              style={searchStyle}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No plans" message="No plans match the current filters." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle} data-testid="plans-table">
              <thead>
                <tr>
                  <th style={th}>Plan</th>
                  <th style={th}>Access Type</th>
                  <th style={th}>Monthly Cost</th>
                  <th style={th}>Intro Cost</th>
                  <th style={th}>Billing</th>
                  <th style={th}>Models</th>
                  <th style={th}>Quota Summary</th>
                  <th style={th}>Renewal Date</th>
                  <th style={th}>Status</th>
                  <th style={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((plan) => (
                  <PlanRow key={plan.id} plan={plan} onOpen={onOpenPlan} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: "var(--space-3)",
            fontSize: "var(--text-meta-size)",
            color: "var(--text-muted)",
          }}
        >
          <span>
            Showing {filtered.length === 0 ? 0 : 1} to {filtered.length} of {filtered.length}{" "}
            plans
          </span>
        </div>
      </Card>
    </div>
  );
}

function PlanRow({ plan, onOpen }: { plan: PlanDto; onOpen: (p: PlanDto) => void }) {
  const open = () => onOpen(plan);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  return (
    <tr
      onClick={open}
      onKeyDown={onKey}
      tabIndex={0}
      role="button"
      aria-label={`Open plan ${plan.name}`}
      data-testid="plan-row"
      data-plan-id={plan.id}
      style={{ cursor: "pointer" }}
    >
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--radius-lg)",
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              display: "grid",
              placeItems: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            {initials(plan.accessProvider.name)}
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>{plan.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {plan.accessProvider.name}
            </div>
          </div>
        </div>
      </td>
      <td style={td}>
        <StatusChip
          color={accessTypeColor(plan.accessType)}
          label={accessTypeLabel(plan.accessType)}
        />
      </td>
      <td style={td}>
        <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {formatMonthly(plan.monthlyCost)}
        </div>
        {plan.accessType === "api" ? (
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Est. spend</div>
        ) : null}
      </td>
      <td style={td}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {plan.introductoryPrice == null
            ? NOT_RECORDED
            : formatMoney(plan.introductoryPrice, plan.currency)}
        </span>
      </td>
      <td style={td}>
        {(plan.billingPeriod ?? plan.billingInterval ?? NOT_RECORDED).replace(/_/g, " ")}
      </td>
      <td style={td}>
        <div>{plan.includedModels.length} models</div>
      </td>
      <td style={td}>
        {plan.quotas.length === 0 ? (
          <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{NOT_RECORDED}</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
            {plan.quotas.slice(0, 3).map((q) => (
              <QuotaProgress key={q.id} quota={q} compact />
            ))}
          </div>
        )}
      </td>
      <td style={td}>
        {plan.renewalDate ? (
          <>
            <div>{formatDate(plan.renewalDate)}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {relativeDays(plan.renewalDate) ?? ""}
            </div>
          </>
        ) : (
          <>
            <div style={{ color: "var(--text-faint)" }}>—</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>No renewal</div>
          </>
        )}
      </td>
      <td style={td}>
        <StatusChip
          color={plan.status === "active" ? "ok" : "neutral"}
          label={plan.status === "active" ? "Active" : "Archived"}
        />
      </td>
      <td style={td}>
        <span
          style={{
            display: "block",
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: plan.notes ? "var(--text-muted)" : "var(--text-faint)",
            fontSize: "var(--text-meta-size)",
          }}
          title={plan.notes ?? undefined}
        >
          {plan.notes?.trim() || NOT_RECORDED}
        </span>
      </td>
    </tr>
  );
}

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "var(--text-body-size)",
};

const th: CSSProperties = {
  textAlign: "left",
  color: "var(--text-muted)",
  fontWeight: 500,
  fontSize: "var(--text-meta-size)",
  padding: "var(--space-2)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const td: CSSProperties = {
  padding: "var(--space-2)",
  borderBottom: "1px solid var(--border-subtle)",
  verticalAlign: "middle",
};

const selectStyle: CSSProperties = {
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "6px 10px",
  color: "var(--text)",
  fontSize: "var(--text-meta-size)",
};

const searchStyle: CSSProperties = {
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "6px 10px",
  color: "var(--text)",
  fontSize: "var(--text-meta-size)",
  minWidth: 180,
};
