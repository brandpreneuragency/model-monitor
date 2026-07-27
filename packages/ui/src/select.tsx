"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "./cn";
import { fastTransition, fontBody } from "./styles";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function Select({
  options,
  value,
  defaultValue,
  onChange,
  placeholder,
  className,
  style,
  disabled,
  id,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const base: CSSProperties = {
    ...fontBody,
    height: "32px",
    padding: "0 var(--space-3)",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-input)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    outline: "none",
    transition: fastTransition,
    boxShadow: "none",
    width: "100%",
    appearance: "auto",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    ...style,
  };

  return (
    <select
      id={selectId}
      className={cn("mm-select", className)}
      style={base}
      disabled={disabled}
      value={value}
      defaultValue={defaultValue}
      onChange={(e) => onChange?.(e.target.value)}
      {...rest}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/** Controlled searchable combobox companion is separate (`Combobox`). */
export function useSelectOpenState(defaultOpen = false) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return { open, setOpen, ref };
}
