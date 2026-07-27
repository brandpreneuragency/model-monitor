import type { CSSProperties } from "react";

/** Colour / background / border only — no layout animation. */
export const fastTransition =
  "color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out)";

export const focusRingStyle: CSSProperties = {
  outline: "none",
  boxShadow: "var(--focus-ring)",
};

export const fontBody: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-size)",
  fontWeight: "var(--text-body-weight)",
  lineHeight: "var(--text-body-line)",
};

export const fontMeta: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-meta-size)",
  fontWeight: "var(--text-meta-weight)",
  lineHeight: "var(--text-meta-line)",
};

export const fontCard: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-card-size)",
  fontWeight: "var(--text-card-weight)",
  lineHeight: "var(--text-card-line)",
};

export const fontSection: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-section-size)",
  fontWeight: "var(--text-section-weight)",
  lineHeight: "var(--text-section-line)",
};
