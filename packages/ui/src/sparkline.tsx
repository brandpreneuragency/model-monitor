import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";

export interface SparklineProps extends HTMLAttributes<SVGSVGElement> {
  /** Series values; empty renders a muted flat line. */
  values: number[];
  width?: number;
  height?: number;
  /** Chart token index 1–6. */
  series?: 1 | 2 | 3 | 4 | 5 | 6;
  fill?: boolean;
  /** Accessible name. */
  label?: string;
}

/**
 * Inline SVG sparkline. No chart library. Solid stroke; optional single-hue fill.
 */
export function Sparkline({
  values,
  width = 80,
  height = 24,
  series = 1,
  fill = false,
  label = "Sparkline",
  className,
  style,
  ...rest
}: SparklineProps) {
  const stroke = `var(--chart-${series})`;
  const pad = 1;
  const w = width;
  const h = height;

  let path = "";
  let area = "";

  if (values.length === 0) {
    const y = h / 2;
    path = `M ${pad} ${y} L ${w - pad} ${y}`;
  } else if (values.length === 1) {
    const y = h / 2;
    path = `M ${pad} ${y} L ${w - pad} ${y}`;
  } else {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return [x, y] as const;
    });
    path = pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ");
    if (fill && pts.length > 0) {
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      area = `${path} L ${last[0].toFixed(2)} ${h - pad} L ${first[0].toFixed(2)} ${h - pad} Z`;
    }
  }

  const svgStyle: CSSProperties = {
    display: "inline-block",
    verticalAlign: "middle",
    ...style,
  };

  return (
    <svg
      className={cn("mm-sparkline", className)}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
      style={svgStyle}
      {...rest}
    >
      {fill && area ? (
        <path d={area} fill={stroke} opacity={0.15} stroke="none" />
      ) : null}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
