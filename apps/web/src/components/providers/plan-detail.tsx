"use client";

import type { CSSProperties } from "react";
import { Drawer, StatusChip, Tag } from "@model-monitor/ui";
import type { PlanDto } from "./types";
import { QuotaProgress } from "./quota-progress";
import {
  accessTypeColor,
  accessTypeLabel,
  formatDate,
  formatMoney,
  formatMonthly,
  NOT_RECORDED,
  relativeDays,
} from "./utils";

export interface PlanDetailProps {
  open: boolean;
  onClose: () => void;
  plan: PlanDto | null;
}

export function PlanDetail({ open, onClose, plan }: PlanDetailProps) {
  if (!plan) return null;

  return (
    <Drawer open={open} onClose={onClose} title={plan.name} size="lg" data-testid="plan-detail">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
          <StatusChip
            color={plan.status === "active" ? "ok" : "neutral"}
            label={plan.status === "active" ? "Active" : "Archived"}
          />
          <StatusChip color={accessTypeColor(plan.accessType)} label={accessTypeLabel(plan.accessType)} />
          <span style={{ fontSize: "var(--text-meta-size)", color: "var(--text-faint)" }}>
            {plan.accessProvider.name}
          </span>
        </div>

        <section>
          <h3 style={h3}>Commercial terms</h3>
          <dl style={dl}>
            <Row label="Monthly cost" value={formatMonthly(plan.monthlyCost)} />
            <Row
              label="Regular price"
              value={formatMoney(plan.regularPrice, plan.currency)}
            />
            <Row
              label="Introductory cost"
              value={
                plan.introductoryPrice == null
                  ? NOT_RECORDED
                  : formatMoney(plan.introductoryPrice, plan.currency)
              }
            />
            <Row
              label="Billing period"
              value={(plan.billingPeriod ?? plan.billingInterval ?? NOT_RECORDED).replace(
                /_/g,
                " ",
              )}
            />
            <Row
              label="Auto-renews"
              value={
                plan.autoRenews == null ? NOT_RECORDED : plan.autoRenews ? "Yes" : "No"
              }
            />
            <Row
              label="Renewal date"
              value={
                plan.renewalDate
                  ? `${formatDate(plan.renewalDate)}${
                      relativeDays(plan.renewalDate) ? ` (${relativeDays(plan.renewalDate)})` : ""
                    }`
                  : NOT_RECORDED
              }
            />
            <Row
              label="Intro expires"
              value={plan.introPriceExpiresAt ? formatDate(plan.introPriceExpiresAt) : NOT_RECORDED}
            />
          </dl>
        </section>

        <section>
          <h3 style={h3}>Included models ({plan.includedModels.length})</h3>
          {plan.includedModels.length === 0 ? (
            <p style={muted}>{NOT_RECORDED}</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {plan.includedModels.map((m) => (
                <Tag key={m.id} name={m.name} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 style={h3}>Quotas</h3>
          {plan.quotas.length === 0 ? (
            <p style={muted}>{NOT_RECORDED}</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {plan.quotas.map((q) => (
                <QuotaProgress key={q.id} quota={q} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 style={h3}>Notes</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
            {plan.notes?.trim() || NOT_RECORDED}
          </p>
        </section>
      </div>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: "var(--space-2)",
        padding: "var(--space-1_5) 0",
        borderBottom: "1px solid var(--border-subtle)",
        fontSize: "var(--text-meta-size)",
      }}
    >
      <dt style={{ color: "var(--text-faint)", margin: 0 }}>{label}</dt>
      <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{value}</dd>
    </div>
  );
}

const h3: CSSProperties = {
  margin: "0 0 var(--space-2)",
  fontSize: "var(--text-section-size)",
  fontWeight: 600,
};

const dl: CSSProperties = { margin: 0 };

const muted: CSSProperties = {
  margin: 0,
  color: "var(--text-faint)",
  fontSize: "var(--text-meta-size)",
};
