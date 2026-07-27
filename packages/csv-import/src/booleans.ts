import type { ProseBoolean } from "./types.js";

/**
 * Map prose capability cells to boolean | null while preserving the full string.
 *
 * - affirmative ("Yes", "Yes: image, video, PDF", descriptive support text) → true
 * - "Not confirmed…" / empty → null (never false — repo null-vs-false rule)
 * - explicit negative ("No", "No: text/code", "No: dedicated…") → false
 */
export function parseProseBoolean(raw: string | undefined | null): ProseBoolean {
  const prose = raw === undefined || raw === null ? "" : raw;
  const t = prose.trim();
  if (t === "") {
    return { value: null, prose };
  }

  const lower = t.toLowerCase();

  // Unknown / unconfirmed — null, not false
  if (
    lower.startsWith("not confirmed") ||
    lower === "unknown" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "unconfirmed"
  ) {
    return { value: null, prose };
  }

  // Explicit negative: "No", "No: …", "No model-specific…"
  if (/^no\b/.test(lower)) {
    return { value: false, prose };
  }

  // Explicit affirmative
  if (/^yes\b/.test(lower)) {
    return { value: true, prose };
  }

  // Descriptive capability prose without Yes/No prefix (e.g. "Extended thinking",
  // "Adaptive thinking; always on", "Agent-capable", "Configurable: low–high").
  // These describe a supported mode, so map to true.
  return { value: true, prose };
}

/** Simple Yes/No eligibility flags; empty → null. */
export function parseYesNo(raw: string | undefined | null): boolean | null {
  if (raw === undefined || raw === null) return null;
  const t = raw.trim();
  if (t === "") return null;
  const lower = t.toLowerCase();
  if (lower === "yes") return true;
  if (lower === "no") return false;
  return null;
}
