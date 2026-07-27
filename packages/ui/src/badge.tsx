import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { fontMeta } from "./styles";
import type { SemanticColor } from "./types";
import { semanticVars } from "./types";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visible label — colour is never the only signal. */
  children: ReactNode;
  color?: SemanticColor;
}

export function Badge({
  children,
  color = "neutral",
  className,
  style,
  ...rest
}: BadgeProps) {
  const { color: fg, bg } = semanticVars(color);
  const base: CSSProperties = {
    ...fontMeta,
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    padding: "0 var(--space-1_5)",
    height: "20px",
    borderRadius: "var(--radius-sm)",
    background: bg,
    color: fg,
    border: `1px solid ${bg}`,
    fontWeight: 500,
    whiteSpace: "nowrap",
    ...style,
  };

  return (
    <span
      className={cn("mm-badge", className)}
      style={base}
      data-color={color}
      {...rest}
    >
      {children}
    </span>
  );
}
