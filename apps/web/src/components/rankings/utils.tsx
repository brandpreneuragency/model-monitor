import type { CSSProperties } from "react";
import type { Confidence } from "./types";

export function logoInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function LogoTile({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        display: "inline-grid",
        placeItems: "center",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--text-muted)",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {logoInitials(label)}
    </span>
  );
}

export function confidenceColor(
  value: Confidence | null | undefined,
): "ok" | "warn" | "danger" | "neutral" {
  if (value === "high") return "ok";
  if (value === "medium") return "warn";
  if (value === "low") return "danger";
  return "neutral";
}

export function confidenceLabel(value: Confidence | null | undefined): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const mutedText: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-meta-size)",
  fontFamily: "var(--font-sans)",
};

export const faintText: CSSProperties = {
  color: "var(--text-faint)",
  fontSize: "var(--text-meta-size)",
  fontFamily: "var(--font-sans)",
};

export async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; code?: string };
    };
    return body.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** Prefer skill-scoped personal/external; fall back to overall for profile boards. */
export function displayPersonal(entry: {
  personalScore: number | null;
  overallScore: number | null;
  scoreBasis: string | null;
}): number | null {
  if (entry.personalScore != null) return entry.personalScore;
  if (entry.scoreBasis === "personal" && entry.overallScore != null) {
    return entry.overallScore;
  }
  return null;
}

export function displayExternal(entry: {
  externalScore: number | null;
  overallScore: number | null;
  scoreBasis: string | null;
}): number | null {
  if (entry.externalScore != null) return entry.externalScore;
  if (entry.scoreBasis === "external" && entry.overallScore != null) {
    // overall is 0–10 scale from external/10
    return Math.round(entry.overallScore * 10);
  }
  return null;
}
