"use client";

import type { CSSProperties } from "react";
import { Drawer, StatusChip, Tag } from "@model-monitor/ui";
import type { PlanDto, ProviderDto } from "./types";
import {
  formatDate,
  formatMonthly,
  formatMoney,
  initials,
  NOT_RECORDED,
  relativeDays,
} from "./utils";
import { QuotaProgress } from "./quota-progress";

export interface ProviderDetailProps {
  open: boolean;
  onClose: () => void;
  provider: ProviderDto | null;
  plans: PlanDto[];
  onOpenPlan?: (plan: PlanDto) => void;
}

export function ProviderDetail({
  open,
  onClose,
  provider,
  plans,
  onOpenPlan,
}: ProviderDetailProps) {
  if (!provider) return null;

  const providerPlans = plans.filter((p) => p.accessProviderId === provider.id);
  const models = uniqueModels(providerPlans);
  const quotas = providerPlans.flatMap((p) => p.quotas);
  const renewals = providerPlans
    .filter((p) => p.renewalDate)
    .map((p) => ({ plan: p.name, date: p.renewalDate!, cost: p.monthlyCost }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={provider.name}
      size="lg"
      data-testid="provider-detail"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <section style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
          <span
            aria-hidden
            style={{
              width: 48,
              height: 48,
              borderRadius: "var(--radius-lg)",
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              color: "var(--text-muted)",
            }}
          >
            {initials(provider.name)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
              <StatusChip
                color={provider.status === "active" ? "ok" : "neutral"}
                label={provider.status === "active" ? "Active" : "Archived"}
              />
              <span style={{ fontSize: "var(--text-meta-size)", color: "var(--text-faint)" }}>
                {provider.providerType ?? "Provider"}
              </span>
            </div>
            {provider.websiteUrl ? (
              <a
                href={provider.websiteUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: "var(--space-1)",
                  color: "var(--accent)",
                  fontSize: "var(--text-meta-size)",
                }}
              >
                {provider.websiteUrl}
              </a>
            ) : null}
            {provider.notes ? (
              <p
                style={{
                  margin: "var(--space-2) 0 0",
                  color: "var(--text-muted)",
                  fontSize: "var(--text-meta-size)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {provider.notes}
              </p>
            ) : null}
          </div>
        </section>

        <section>
          <h3 style={sectionTitle}>Summary</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            <Metric label="Active plans" value={String(provider.activePlansCount)} />
            <Metric label="Accessible models" value={String(provider.accessibleModelsCount)} />
            <Metric label="Monthly total" value={formatMonthly(provider.monthlyTotal)} />
          </div>
        </section>

        {provider.capabilityTags.length > 0 ? (
          <section>
            <h3 style={sectionTitle}>Capability tags</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {provider.capabilityTags.map((t) => (
                <Tag key={t} name={t} />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h3 style={sectionTitle}>Active plans</h3>
          {providerPlans.length === 0 ? (
            <p style={muted}>{NOT_RECORDED}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
              {providerPlans.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPlan?.(p)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: "var(--space-3)",
                      color: "inherit",
                      cursor: onOpenPlan ? "pointer" : "default",
                      font: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
                      <strong>{p.name}</strong>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatMonthly(p.monthlyCost)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                      Renewal: {formatDate(p.renewalDate)}
                      {relativeDays(p.renewalDate) ? ` · ${relativeDays(p.renewalDate)}` : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 style={sectionTitle}>Accessible models</h3>
          {models.length === 0 ? (
            <p style={muted}>{NOT_RECORDED}</p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-1)",
              }}
            >
              {models.map((m) => (
                <li key={m.id}>
                  <Tag name={m.name} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 style={sectionTitle}>Pricing summary</h3>
          <div style={{ fontSize: "var(--text-meta-size)", color: "var(--text-muted)" }}>
            Combined monthly estimate:{" "}
            <strong style={{ color: "var(--text)" }}>{formatMonthly(provider.monthlyTotal)}</strong>
          </div>
          <ul style={{ listStyle: "none", margin: "var(--space-2) 0 0", padding: 0 }}>
            {providerPlans.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "var(--space-1) 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontSize: "var(--text-meta-size)",
                }}
              >
                <span>{p.name}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(p.actualPrice ?? p.regularPrice, p.currency)}
                  {p.billingPeriod || p.billingInterval
                    ? ` / ${(p.billingPeriod ?? p.billingInterval ?? "").replace(/_/g, " ")}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 style={sectionTitle}>Quotas</h3>
          {quotas.length === 0 ? (
            <p style={muted}>{NOT_RECORDED}</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {quotas.map((q) => (
                <QuotaProgress key={q.id} quota={q} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 style={sectionTitle}>Renewal dates</h3>
          {renewals.length === 0 ? (
            <p style={muted}>{NOT_RECORDED}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {renewals.map((r) => (
                <li
                  key={`${r.plan}-${r.date}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "var(--space-2) 0",
                    borderBottom: "1px solid var(--border-subtle)",
                    fontSize: "var(--text-meta-size)",
                  }}
                >
                  <span>{r.plan}</span>
                  <span style={{ color: "var(--text-muted)", textAlign: "right" }}>
                    {formatDate(r.date)}
                    {relativeDays(r.date) ? (
                      <span style={{ display: "block", fontSize: 11, color: "var(--text-faint)" }}>
                        {relativeDays(r.date)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function uniqueModels(plans: PlanDto[]) {
  const map = new Map<string, { id: string; name: string; slug: string }>();
  for (const p of plans) {
    for (const m of p.includedModels) {
      if (!map.has(m.id)) map.set(m.id, m);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>{value}</div>
    </div>
  );
}

const sectionTitle: CSSProperties = {
  margin: "0 0 var(--space-2)",
  fontSize: "var(--text-section-size)",
  fontWeight: 600,
};

const muted: CSSProperties = {
  margin: 0,
  color: "var(--text-faint)",
  fontSize: "var(--text-meta-size)",
};
