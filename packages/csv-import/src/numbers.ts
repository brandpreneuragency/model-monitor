/**
 * Number and text cell helpers for LLM_MASTER_v1.csv hazards.
 */

/** Empty → null. Decimal comma ("98,00") and plain integers ("96") → number. Never blank→0. */
export function parseDecimal(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const t = raw.trim();
  if (t === "") return null;

  let normalized = t;
  // European locale export: digits + comma + digits (e.g. 128000,00 / 98,00 / 5,00)
  if (/^-?\d+,\d+$/.test(t)) {
    normalized = t.replace(",", ".");
  } else if (/^-?\d+(\.\d+)?$/.test(t)) {
    normalized = t;
  } else {
    return null;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Generation is text, never numeric.
 * Locale-mangled pure decimals like "5,6" round-trip to "5.6".
 * Mixed labels like "3.5 Flash" stay unchanged.
 */
export function parseGeneration(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const t = raw.trim();
  if (t === "") return null;
  if (/^\d+,\d+$/.test(t)) {
    return t.replace(",", ".");
  }
  return t;
}

export function emptyToNull(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const t = raw.trim();
  return t === "" ? null : t;
}
