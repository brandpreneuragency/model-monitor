"use client";

import { useState, type CSSProperties } from "react";
import { Badge, Button, StatusChip } from "@model-monitor/ui";
import type { DrawerAccessRoute } from "./types";

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-input)",
  padding: "var(--space-3)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "110px 1fr",
  gap: "var(--space-2)",
  fontSize: "var(--text-meta-size)",
};

const labelStyle: CSSProperties = { color: "var(--text-muted)" };
const valueStyle: CSSProperties = { color: "var(--text)", wordBreak: "break-word" };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value ?? "—"}</span>
    </div>
  );
}

function accessTypeDisplay(route: DrawerAccessRoute): string {
  const raw =
    route.accessType ??
    route.plan?.accessType ??
    route.accessMethod ??
    null;
  if (!raw) return "—";
  return raw
    .split(/[_-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function pricingText(route: DrawerAccessRoute): string {
  if (route.pricingSummary?.trim()) return route.pricingSummary.trim();
  const plan = route.plan;
  if (plan?.monthlyCost != null) {
    const cur = plan.currency ?? "USD";
    const interval = plan.billingInterval ?? "month";
    return `${cur} ${plan.monthlyCost}/${interval}`;
  }
  if (plan?.regularPrice != null) {
    const cur = plan.currency ?? "USD";
    return `${cur} ${plan.regularPrice}`;
  }
  return "not recorded";
}

export function AccessCostTab({
  routes,
  onSetPreferred,
  onArchive,
  onEditRoute,
  busyId = null,
}: {
  routes: DrawerAccessRoute[];
  /** Mutate preferred flag on the access route — never requires model edit. */
  onSetPreferred?: (accessId: string) => void | Promise<void>;
  onArchive?: (accessId: string) => void | Promise<void>;
  /** Open route editor (access-only). */
  onEditRoute?: (accessId: string) => void;
  busyId?: string | null;
}) {
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  if (routes.length === 0) {
    return (
      <div data-testid="drawer-tab-access" style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
        No access routes linked yet. Add a route without editing the model
        identity.
      </div>
    );
  }

  return (
    <div data-testid="drawer-tab-access" style={listStyle}>
      <p
        style={{
          margin: 0,
          fontSize: "var(--text-meta-size)",
          color: "var(--text-faint)",
        }}
      >
        Access routes are edited independently of the model record.
      </p>
      {routes.map((route) => {
        const preferred = Boolean(route.isPreferred);
        const busy = busyId === route.id;
        return (
          <article
            key={route.id}
            style={cardStyle}
            data-testid={`drawer-access-route-${route.id}`}
            data-preferred={preferred || undefined}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-2)",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--space-2)",
                  alignItems: "center",
                }}
              >
                <strong style={{ color: "var(--text)", fontSize: "var(--text-body-size)" }}>
                  {route.providerName ??
                    route.plan?.accessProviderName ??
                    "Provider"}
                </strong>
                {preferred ? (
                  <Badge color="ok" data-testid="access-preferred-badge">
                    Preferred
                  </Badge>
                ) : null}
                {route.availability ? (
                  <StatusChip
                    color={
                      route.availability === "available" ||
                      route.availability === "active"
                        ? "ok"
                        : "neutral"
                    }
                    label={
                      route.availability.charAt(0).toUpperCase() +
                      route.availability.slice(1)
                    }
                  />
                ) : null}
              </div>
              <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap" }}>
                {!preferred && onSetPreferred ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onSetPreferred(route.id)}
                    data-testid={`access-set-preferred-${route.id}`}
                  >
                    Set preferred
                  </Button>
                ) : null}
                {onEditRoute ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onEditRoute(route.id)}
                    data-testid={`access-edit-${route.id}`}
                  >
                    Edit route
                  </Button>
                ) : null}
                {onArchive ? (
                  confirmArchiveId === route.id ? (
                    <>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={() => void onArchive(route.id)}
                        data-testid={`access-archive-confirm-${route.id}`}
                      >
                        Confirm archive
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmArchiveId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirmArchiveId(route.id)}
                      data-testid={`access-archive-${route.id}`}
                    >
                      Archive
                    </Button>
                  )
                ) : null}
              </div>
            </div>

            <Field label="Plan" value={route.planName ?? route.plan?.name ?? "—"} />
            <Field label="Access type" value={accessTypeDisplay(route)} />
            <Field
              label="Provider model ID"
              value={
                route.providerModelId ? (
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-faint)",
                    }}
                  >
                    {route.providerModelId}
                  </code>
                ) : (
                  "—"
                )
              }
            />
            <Field label="Availability" value={route.availability ?? "—"} />
            <Field label="Pricing" value={pricingText(route)} />
            <Field
              label="Quotas"
              value={route.quotaSummary?.trim() || "not recorded"}
            />
            <Field
              label="Notes"
              value={
                route.notes?.trim() ||
                route.limitations?.trim() ||
                "—"
              }
            />
          </article>
        );
      })}
    </div>
  );
}
