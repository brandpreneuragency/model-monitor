"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { cn } from "./cn";
import { fastTransition, fontBody, fontMeta } from "./styles";
import type { SelectOption } from "./select";

export interface ComboboxProps {
  options: SelectOption[];
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
  emptyMessage?: string;
}

export function Combobox({
  options,
  value = null,
  onChange,
  placeholder = "Search…",
  disabled,
  className,
  style,
  "data-testid": testId = "combobox",
  emptyMessage = "No matches",
}: ComboboxProps) {
  const listId = useId();
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.filter((o) => !o.disabled);
    return options.filter(
      (o) => !o.disabled && o.label.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const pick = (opt: SelectOption) => {
    onChange?.(opt.value);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) pick(opt);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const inputStyle: CSSProperties = {
    ...fontBody,
    height: "32px",
    width: "100%",
    padding: "0 var(--space-3)",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-input)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    outline: "none",
    transition: fastTransition,
    boxShadow: "none",
    ...style,
  };

  const listStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: "calc(100% + var(--space-1))",
    maxHeight: "240px",
    overflow: "auto",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-drawer)",
    zIndex: 30,
    padding: "var(--space-1)",
  };

  return (
    <div
      ref={rootRef}
      className={cn("mm-combobox", className)}
      style={{ position: "relative", width: "100%" }}
      data-testid={testId}
    >
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder={selected && !open ? selected.label : placeholder}
        value={open ? query : selected?.label ?? ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange?.(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        style={inputStyle}
      />
      {open ? (
        <ul id={listId} role="listbox" style={listStyle}>
          {filtered.length === 0 ? (
            <li
              style={{
                ...fontMeta,
                padding: "var(--space-2)",
                color: "var(--text-muted)",
                listStyle: "none",
              }}
            >
              {emptyMessage}
            </li>
          ) : (
            filtered.map((opt, i) => {
              const active = i === activeIndex;
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={value === opt.value}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(opt);
                  }}
                  style={{
                    ...fontBody,
                    listStyle: "none",
                    padding: "var(--space-2)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    background: active ? "var(--accent-bg)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {opt.label}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
