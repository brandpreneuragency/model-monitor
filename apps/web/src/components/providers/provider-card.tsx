"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { Card, StatusChip, Tag } from "@model-monitor/ui";
import type { ProviderDto } from "./types";
import { formatMonthly, initials } from "./utils";

export interface ProviderCardProps {
  provider: ProviderDto;
  mode?: "grid" | "list";
  onOpen: (provider: ProviderDto) => void;
}

export function ProviderCard({ provider, mode = "grid", onOpen }: ProviderCardProps) {
  const logoLetter = initials(provider.name);

  const open = () => onOpen(provider);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  if (mode === "list") {
    const row: CSSProperties = {
      display: "grid",
      gridTemplateColumns: "minmax(160px, 1.4fr) 100px 90px 100px 110px 120px minmax(120px, 1fr)",
      gap: "var(--space-3)",
      alignItems: "center",
      padding: "var(--space-3) var(--space-4)",
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      cursor: "pointer",
      textAlign: "left",
      width: "100%",
      font: "inherit",
      color: "inherit",
    };
    return (
      <button
        type="button"
        style={row}
        onClick={open}
        onKeyDown={onKey}
        data-testid="provider-card"
        data-mode="list"
        data-provider-id={provider.id}
        aria-label={`Open ${provider.name}`}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
          <LogoTile letter={logoLetter} colour={provider.colour} />
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: "block",
                fontWeight: 600,
                fontSize: "var(--text-card-size)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {provider.name}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>
              {provider.providerType ?? "Provider"}
            </span>
          </span>
        </span>
        <StatusChip color={provider.status === "active" ? "ok" : "neutral"} label={labelStatus(provider.status)} />
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{provider.activePlansCount}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{provider.accessibleModelsCount}</span>
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {formatMonthly(provider.monthlyTotal)}
        </span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {provider.capabilityTags.slice(0, 4).map((t) => (
            <Tag key={t} name={t} />
          ))}
        </span>
      </button>
    );
  }

  return (
    <Card
      hoverable
      padding="md"
      data-testid="provider-card"
      data-mode="grid"
      data-provider-id={provider.id}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKey}
      aria-label={`Open ${provider.name}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        cursor: "pointer",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
        <LogoTile letter={logoLetter} colour={provider.colour} large />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--text-card-size)",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {provider.name}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>
            {provider.providerType ?? "Provider"}
          </div>
        </div>
      </div>

      <div style={{ alignSelf: "flex-start" }}>
        <StatusChip
          color={provider.status === "active" ? "ok" : "neutral"}
          label={labelStatus(provider.status)}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: "var(--space-2)",
          paddingTop: "var(--space-2)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <Stat label="Active Plans" value={String(provider.activePlansCount)} />
        <Stat label="Accessible Models" value={String(provider.accessibleModelsCount)} />
        <Stat label="Monthly Total" value={formatMonthly(provider.monthlyTotal)} />
      </div>

      {provider.capabilityTags.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: "auto" }}>
          {provider.capabilityTags.slice(0, 6).map((t) => (
            <Tag key={t} name={t} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function labelStatus(status: string): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function LogoTile({
  letter,
  colour,
  large = false,
}: {
  letter: string;
  colour: string | null;
  large?: boolean;
}) {
  const size = large ? 36 : 28;
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        display: "grid",
        placeItems: "center",
        fontSize: large ? 13 : 11,
        fontWeight: 700,
        color: colour && colour.startsWith("var(") ? colour : "var(--text-muted)",
        flexShrink: 0,
      }}
    >
      {letter}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{label}</div>
      <div
        style={{
          fontSize: "var(--text-card-size)",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
