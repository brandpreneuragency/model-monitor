import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { fontBody, fontSection } from "./styles";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  message: string;
  action?: ReactNode;
  title?: string;
}

export function EmptyState({
  icon,
  message,
  action,
  title,
  className,
  style,
  ...rest
}: EmptyStateProps) {
  const base: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: "var(--space-3)",
    padding: "var(--space-8) var(--space-6)",
    color: "var(--text-muted)",
    ...style,
  };

  return (
    <div className={cn("mm-empty-state", className)} style={base} {...rest}>
      {icon ? (
        <div
          aria-hidden="true"
          style={{ color: "var(--text-faint)", fontSize: 28, lineHeight: 1 }}
        >
          {icon}
        </div>
      ) : null}
      {title ? (
        <div style={{ ...fontSection, color: "var(--text)" }}>{title}</div>
      ) : null}
      <p style={{ ...fontBody, margin: 0, maxWidth: 360 }}>{message}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
