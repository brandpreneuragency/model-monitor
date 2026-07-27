import type { CSSProperties, ReactNode } from "react";

/** Semantic colours from tokens.css — always pair with visible text. */
export type SemanticColor =
  | "ok"
  | "info"
  | "fast"
  | "advanced"
  | "warn"
  | "danger"
  | "neutral";

export type Density = "comfortable" | "standard" | "compact";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type DrawerSize = "sm" | "md" | "lg";

export interface BaseProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  "data-testid"?: string;
}

export function semanticVars(color: SemanticColor): {
  color: string;
  bg: string;
} {
  return {
    color: `var(--${color})`,
    bg: `var(--${color}-bg)`,
  };
}

export function densityRowHeight(density: Density): string {
  switch (density) {
    case "comfortable":
      return "var(--row-comfortable)";
    case "compact":
      return "var(--row-compact)";
    default:
      return "var(--row-standard)";
  }
}
