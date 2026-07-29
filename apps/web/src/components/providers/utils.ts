import type { QuotaDto, RenewalKind } from "./types";

export const NOT_RECORDED = "not recorded";

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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function formatMonthly(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return NOT_RECORDED;
  return `${formatMoney(amount)} /mo`;
}

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

export function accessTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "subscription":
      return "Subscription";
    case "api":
      return "API";
    case "free_tier":
      return "Free tier";
    case "trial":
      return "Trial";
    case "open_weights":
      return "Open weights";
    case "local":
      return "Local";
    case "included":
      return "Included";
    default:
      return type?.trim() ? String(type) : NOT_RECORDED;
  }
}

export function accessTypeColor(
  type: string | null | undefined,
): "info" | "ok" | "advanced" | "neutral" | "warn" {
  switch (type) {
    case "subscription":
      return "info";
    case "api":
      return "ok";
    case "trial":
      return "warn";
    case "open_weights":
    case "local":
      return "advanced";
    default:
      return "neutral";
  }
}

export function statusColor(status: string | null | undefined): "ok" | "neutral" | "warn" {
  if (status === "active") return "ok";
  if (status === "archived") return "neutral";
  return "warn";
}

export function quotaMax(q: Pick<QuotaDto, "amount" | "amountMax" | "amountMin">): number | null {
  if (q.amount != null) return q.amount;
  if (q.amountMax != null) return q.amountMax;
  if (q.amountMin != null) return q.amountMin;
  return null;
}

export function unitLabel(unit: string, customUnit: string | null | undefined): string {
  if (unit === "custom" && customUnit) return customUnit;
  return unit.replace(/_/g, " ");
}

export function periodLabel(period: string): string {
  return period.replace(/_/g, " ");
}

export function renewalKindLabel(kind: RenewalKind): string {
  switch (kind) {
    case "subscription_renewal":
      return "Subscription renewal";
    case "trial_expiration":
      return "Trial expiration";
    case "promotional_price_expiration":
      return "Promotional price expiration";
    case "manual_review":
      return "Manual review";
    default:
      return kind;
  }
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return NOT_RECORDED;
  const d = new Date(date.length === 10 ? `${date}T00:00:00Z` : date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function relativeDays(date: string | null | undefined, now = new Date()): string | null {
  if (!date) return null;
  const d = new Date(date.length === 10 ? `${date}T00:00:00Z` : date);
  if (Number.isNaN(d.getTime())) return null;
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((target - start) / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  const ago = Math.abs(days);
  return `${ago} day${ago === 1 ? "" : "s"} ago`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return NOT_RECORDED;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Sort renewals by date ascending, then kind, then title — pure helper for tests. */
export function sortRenewals<T extends { date: string; kind: string; title: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    const k = a.kind.localeCompare(b.kind);
    if (k !== 0) return k;
    return a.title.localeCompare(b.title);
  });
}

export async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
