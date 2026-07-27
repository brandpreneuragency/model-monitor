import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { fontSection } from "./styles";
import { Card } from "./card";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function Panel({
  title,
  action,
  children,
  className,
  style,
  ...rest
}: PanelProps) {
  const header: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--space-3)",
    marginBottom: children ? "var(--space-3)" : 0,
  };

  return (
    <Card className={cn("mm-panel", className)} style={style} {...rest}>
      <div style={header}>
        <h3
          style={{
            ...fontSection,
            margin: 0,
            color: "var(--text)",
          }}
        >
          {title}
        </h3>
        {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}
