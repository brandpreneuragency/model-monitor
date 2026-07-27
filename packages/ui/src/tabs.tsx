"use client";

import {
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { fastTransition, fontBody } from "./styles";

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`${component} must be used within <Tabs>`);
  return ctx;
}

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Tabs({
  value: controlled,
  defaultValue,
  onValueChange,
  children,
  className,
  style,
}: TabsProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const value = controlled ?? uncontrolled;
  const setValue = (v: string) => {
    if (controlled === undefined) setUncontrolled(v);
    onValueChange?.(v);
  };
  const baseId = useId();
  const ctx = useMemo(
    () => ({ value, setValue, baseId }),
    [value, baseId],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn("mm-tabs", className)} style={style} data-value={value}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  style,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  const base: CSSProperties = {
    display: "flex",
    gap: "var(--space-4)",
    borderBottom: "1px solid var(--border-subtle)",
    ...style,
  };
  return (
    <div
      role="tablist"
      className={cn("mm-tabs-list", className)}
      style={base}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps
  extends HTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabsTrigger({
  value,
  className,
  style,
  children,
  ...rest
}: TabsTriggerProps) {
  const ctx = useTabsContext("TabsTrigger");
  const selected = ctx.value === value;
  const base: CSSProperties = {
    ...fontBody,
    appearance: "none",
    background: "transparent",
    border: "none",
    borderBottom: selected
      ? "2px solid var(--accent)"
      : "2px solid transparent",
    color: selected ? "var(--text)" : "var(--text-muted)",
    padding: "var(--space-2) 0",
    marginBottom: "-1px",
    cursor: "pointer",
    fontWeight: selected ? 600 : 400,
    transition: fastTransition,
    boxShadow: "none",
    ...style,
  };

  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      className={cn("mm-tabs-trigger", className)}
      style={base}
      onClick={() => ctx.setValue(value)}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({
  value,
  className,
  style,
  children,
  ...rest
}: TabsContentProps) {
  const ctx = useTabsContext("TabsContent");
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${value}`}
      aria-labelledby={`${ctx.baseId}-tab-${value}`}
      className={cn("mm-tabs-content", className)}
      style={{ paddingTop: "var(--space-4)", ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
