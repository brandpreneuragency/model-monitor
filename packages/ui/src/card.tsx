import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";
import { fastTransition } from "./styles";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padding?: "none" | "sm" | "md";
}

export function Card({
  hoverable = false,
  padding = "md",
  className,
  style,
  children,
  ...rest
}: CardProps) {
  const pad =
    padding === "none"
      ? 0
      : padding === "sm"
        ? "var(--space-3)"
        : "var(--space-4)";

  const base: CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: pad,
    boxShadow: "none",
    transition: fastTransition,
    ...style,
  };

  return (
    <div
      className={cn("mm-card", className)}
      style={base}
      data-hoverable={hoverable || undefined}
      onMouseEnter={
        hoverable
          ? (e) => {
              e.currentTarget.style.background = "var(--bg-card-hover)";
            }
          : undefined
      }
      onMouseLeave={
        hoverable
          ? (e) => {
              e.currentTarget.style.background = "var(--bg-card)";
            }
          : undefined
      }
      {...rest}
    >
      {children}
    </div>
  );
}
