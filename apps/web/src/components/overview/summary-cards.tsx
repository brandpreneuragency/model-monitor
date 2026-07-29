"use client";

import type { CSSProperties } from "react";
import { Card, Sparkline } from "@model-monitor/ui";
import type { OverviewSummary } from "./types";
import { formatMoney, trendDelta } from "./utils";

export type SummaryCardsProps = {
  summary: OverviewSummary | null;
};

const icoBase: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "var(--radius-lg)",
  display: "grid",
  placeItems: "center",
  fontSize: 14,
  marginBottom: "var(--space-3)",
  border: "1px solid var(--border)",
  fontWeight: 700,
};

function KpiCard({
  label,
  value,
  subtitle,
  subtitleTone = "muted",
  series,
  icon,
  iconStyle,
  sparkSeries,
  testId,
}: {
  label: string;
  value: number | null;
  subtitle: string;
  subtitleTone?: "muted" | "ok" | "faint";
  series: number[] | null | undefined;
  icon: string;
  iconStyle: CSSProperties;
  sparkSeries: 1 | 2 | 3 | 4;
  testId: string;
}) {
  const values = series && series.length > 0 ? series : [];
  const subColor =
    subtitleTone === "ok"
      ? "var(--ok)"
      : subtitleTone === "faint"
        ? "var(--text-faint)"
        : "var(--text-muted)";

  return (
    <Card
      padding="md"
      data-testid={testId}
      style={{ position: "relative", overflow: "hidden", minWidth: 0 }}
    >
      <div style={{ ...icoBase, ...iconStyle }} aria-hidden="true">
        {icon}
      </div>
      <div
        style={{
          fontSize: "var(--text-meta-size)",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </div>
      <div
        data-testid={`${testId}-value`}
        style={{
          fontSize: "var(--text-stat-size)",
          fontWeight: "var(--text-stat-weight)" as unknown as number,
          lineHeight: "var(--text-stat-line)",
          margin: "var(--space-1) 0",
          color: "var(--text)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value == null ? "—" : value}
      </div>
      <div
        data-testid={`${testId}-subtitle`}
        style={{
          fontSize: "var(--text-meta-size)",
          color: subColor,
        }}
      >
        {subtitle}
      </div>
      <div style={{ marginTop: "var(--space-3)", width: "100%" }}>
        <Sparkline
          values={values}
          width={200}
          height={36}
          series={sparkSeries}
          fill
          label={`${label} trend`}
          style={{ width: "100%", height: 36 }}
          data-testid={`${testId}-spark`}
        />
      </div>
    </Card>
  );
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const empty = !summary;

  const activeDelta = summary ? trendDelta(summary.activeModels.trend) : null;
  const activeSub =
    activeDelta != null && activeDelta !== 0
      ? `${activeDelta > 0 ? "+" : ""}${activeDelta} this month`
      : "Active directory";

  const providersSub = summary
    ? `${summary.providers.active ?? summary.providers.value} active`
    : "—";

  const paidSub =
    summary?.paidPlans.subtitle ??
    (summary?.paidPlans.monthlyTotal != null
      ? `${formatMoney(summary.paidPlans.monthlyTotal, summary.paidPlans.currency)} / month`
      : "No paid plans");

  const reviewSub = summary?.needsReview.subtitle ?? "Models";

  return (
    <div
      data-testid="overview-summary-cards"
      data-empty={empty || undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "var(--space-3)",
      }}
    >
      <KpiCard
        testId="kpi-active-models"
        label="Active Models"
        value={summary?.activeModels.value ?? null}
        subtitle={empty ? "No data" : activeSub}
        subtitleTone={activeDelta != null && activeDelta > 0 ? "ok" : "muted"}
        series={summary?.activeModels.trend}
        icon="◈"
        iconStyle={{ background: "var(--info-bg)", color: "var(--info)" }}
        sparkSeries={1}
      />
      <KpiCard
        testId="kpi-providers"
        label="Providers"
        value={summary?.providers.value ?? null}
        subtitle={empty ? "No data" : providersSub}
        series={summary?.providers.trend}
        icon="▣"
        iconStyle={{ background: "var(--fast-bg)", color: "var(--fast)" }}
        sparkSeries={2}
      />
      <KpiCard
        testId="kpi-paid-plans"
        label="Paid Plans"
        value={summary?.paidPlans.value ?? null}
        subtitle={empty ? "No data" : paidSub}
        series={summary?.paidPlans.trend}
        icon="$"
        iconStyle={{ background: "var(--ok-bg)", color: "var(--ok)" }}
        sparkSeries={3}
      />
      <KpiCard
        testId="kpi-needs-review"
        label="Needs Review"
        value={summary?.needsReview.value ?? null}
        subtitle={empty ? "No data" : reviewSub}
        series={summary?.needsReview.trend}
        icon="!"
        iconStyle={{ background: "var(--warn-bg)", color: "var(--warn)" }}
        sparkSeries={4}
      />
    </div>
  );
}
