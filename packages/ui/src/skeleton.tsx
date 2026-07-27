import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: number | string;
  height?: number | string;
  radius?: "sm" | "md" | "lg" | "full";
}

export function Skeleton({
  width = "100%",
  height = 16,
  radius = "md",
  className,
  style,
  ...rest
}: SkeletonProps) {
  const radiusToken =
    radius === "full"
      ? "var(--radius-full)"
      : radius === "lg"
        ? "var(--radius-lg)"
        : radius === "sm"
          ? "var(--radius-sm)"
          : "var(--radius-md)";

  const base: CSSProperties = {
    display: "block",
    width,
    height,
    borderRadius: radiusToken,
    background: "var(--bg-input)",
    border: "1px solid var(--border-subtle)",
    boxShadow: "none",
    ...style,
  };

  return (
    <div
      className={cn("mm-skeleton", className)}
      style={base}
      aria-hidden="true"
      data-testid="skeleton"
      {...rest}
    />
  );
}
