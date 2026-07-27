"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { fontSection } from "./styles";
import type { DrawerSize } from "./types";
import { IconButton } from "./icon-button";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DrawerSize;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
}

const widths: Record<DrawerSize, string> = {
  sm: "320px",
  md: "var(--drawer-width)",
  lg: "520px",
};

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  className,
  style,
  "data-testid": testId = "drawer",
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [open, onClose],
  );

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      const focusable = getFocusable(root);
      (focusable[0] ?? root).focus();
    }, 0);
    document.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "var(--bg-overlay)",
    zIndex: 40,
  };

  const panel: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: widths[size],
    maxWidth: "100vw",
    background: "var(--bg-drawer)",
    borderLeft: "1px solid var(--border)",
    boxShadow: "var(--shadow-drawer)",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    outline: "none",
    ...style,
  };

  return (
    <div className={cn("mm-drawer-root", className)} data-testid={testId}>
      <div
        style={overlay}
        aria-hidden="true"
        onClick={onClose}
        data-testid="drawer-overlay"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        style={panel}
        data-size={size}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <div
            id={titleId}
            style={{
              ...fontSection,
              color: "var(--text)",
              margin: 0,
              minWidth: 0,
            }}
          >
            {title}
          </div>
          <IconButton label="Close drawer" onClick={onClose} data-testid="drawer-close">
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
              ×
            </span>
          </IconButton>
        </div>
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "var(--space-4)",
          }}
        >
          {children}
        </div>
        {footer ? (
          <div
            style={{
              padding: "var(--space-4)",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              gap: "var(--space-2)",
              justifyContent: "flex-end",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
