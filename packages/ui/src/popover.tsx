"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { fastTransition, fontBody } from "./styles";

export interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Trigger element; receives click to toggle. */
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
}

export function Popover({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  trigger,
  children,
  align = "start",
  className,
  style,
  "data-testid": testId = "popover",
}: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panel: CSSProperties = {
    position: "absolute",
    top: "calc(100% + var(--space-1))",
    [align === "end" ? "right" : "left"]: 0,
    minWidth: "160px",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-drawer)",
    padding: "var(--space-2)",
    zIndex: 30,
    ...fontBody,
    color: "var(--text)",
    ...style,
  };

  return (
    <div
      ref={rootRef}
      className={cn("mm-popover", className)}
      style={{ position: "relative", display: "inline-block" }}
      data-testid={testId}
    >
      <div
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        style={{ display: "inline-flex", transition: fastTransition }}
      >
        {trigger}
      </div>
      {open ? (
        <div id={panelId} role="dialog" style={panel}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
