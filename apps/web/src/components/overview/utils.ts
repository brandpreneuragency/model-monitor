/** Shared formatters for Overview — no hard-coded chart or card series. */

export const NOT_RECORDED = "not recorded";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0] ?? "";
    return w.slice(0, 2).toUpperCase();
  }
  const a = parts[0] ?? "";
  const b = parts[1] ?? "";
  return `${a.charAt(0)}${b.charAt(0)}`.toUpperCase();
}

export function formatMoney(
  amount: number | null | undefined,
  currency: string | null = "USD",
): string {
  if (amount == null || Number.isNaN(amount)) return NOT_RECORDED;
  const cur = (currency ?? "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur.length === 3 ? cur : "USD",
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

export function formatMonthly(
  amount: number | null | undefined,
  currency: string | null = "USD",
): string {
  if (amount == null || Number.isNaN(amount)) return NOT_RECORDED;
  return `${formatMoney(amount, currency)} / month`;
}

export function periodLabel(period: string | null | undefined): string {
  if (!period) return NOT_RECORDED;
  switch (period) {
    case "five_hour_window":
      return "5-hr window";
    case "hourly":
      return "Hourly";
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "billing_cycle":
      return "Billing cycle";
    case "sliding_window":
      return "Sliding window";
    case "one_time":
      return "One-time";
    default:
      return period.replace(/_/g, " ");
  }
}

export function unitLabel(unit: string, customUnit?: string | null): string {
  if (unit === "custom" && customUnit) return customUnit;
  return unit.replace(/_/g, " ");
}

export function formatCompactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (Math.abs(n) >= 1_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return String(n);
}

export function formatResetLine(opts: {
  resetsAt: string | null | undefined;
  resetBehaviour: string | null | undefined;
  period: string | null | undefined;
  isUnlimited?: boolean;
  now?: Date;
}): string {
  const now = opts.now ?? new Date();
  if (opts.resetsAt) {
    const d = new Date(
      opts.resetsAt.length === 10 ? `${opts.resetsAt}T00:00:00Z` : opts.resetsAt,
    );
    if (!Number.isNaN(d.getTime())) {
      const ms = d.getTime() - now.getTime();
      if (ms <= 0) return "Reset due";
      const hours = ms / 3_600_000;
      if (hours < 48) {
        const h = Math.floor(hours);
        const m = Math.floor((hours - h) * 60);
        return `Resets in ${h}h ${m}m`;
      }
      const days = Math.round(hours / 24);
      return `Resets in ${days} day${days === 1 ? "" : "s"}`;
    }
  }
  if (opts.resetBehaviour?.trim()) {
    return opts.resetBehaviour.trim();
  }
  if (opts.isUnlimited) {
    return periodLabel(opts.period) === "Monthly"
      ? "Resets monthly"
      : `Resets ${periodLabel(opts.period).toLowerCase()}`;
  }
  if (opts.period) {
    return `Resets ${periodLabel(opts.period).toLowerCase()}`;
  }
  return NOT_RECORDED;
}

export function formatRecentWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

export function entityTypeLabel(type: string): string {
  switch (type) {
    case "model":
      return "Model updated";
    case "provider":
      return "Provider updated";
    case "plan":
      return "Plan updated";
    case "quota":
      return "Quota updated";
    case "rating":
      return "Rating updated";
    default:
      return "Updated";
  }
}

/** Prefer overall → personal → external for skill leader score box. */
export function leaderDisplayScore(leader: {
  overallScore: number | null;
  personalScore: number | null;
  externalScore: number | null;
}): number | null {
  if (leader.overallScore != null) return leader.overallScore;
  if (leader.personalScore != null) return leader.personalScore;
  if (leader.externalScore != null) return leader.externalScore;
  return null;
}

/**
 * Month-over-month delta from a cumulative trend series (last − previous).
 * Returns null when the series is too short.
 */
export function trendDelta(trend: number[] | null | undefined): number | null {
  if (!trend || trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  if (last == null || prev == null) return null;
  return last - prev;
}

export async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return body.error?.message ?? body.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
