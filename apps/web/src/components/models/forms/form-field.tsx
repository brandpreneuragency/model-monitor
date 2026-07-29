"use client";

import type { CSSProperties, ReactNode } from "react";

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "var(--space-1)",
  color: "var(--text-muted)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-meta-size)",
  fontWeight: 500,
  lineHeight: "var(--text-meta-line)",
};

const errorStyle: CSSProperties = {
  color: "var(--danger)",
  marginTop: "var(--space-1)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-meta-size)",
  lineHeight: "var(--text-meta-line)",
};

const hintStyle: CSSProperties = {
  color: "var(--text-muted)",
  marginTop: "var(--space-1)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-meta-size)",
  lineHeight: "var(--text-meta-line)",
};

const fieldWrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  minWidth: 0,
};

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={fieldWrap}>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
        {optional ? (
          <span
            style={{
              color: "var(--text-muted)",
              marginLeft: 6,
              fontSize: "var(--text-meta-size)",
            }}
          >
            optional
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} style={hintStyle}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          role="alert"
          style={errorStyle}
          data-testid={htmlFor ? `${htmlFor}-error` : undefined}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: "var(--space-3)",
};

export const formStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

export const groupTitleStyle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-size)",
  fontWeight: 600,
  color: "var(--text)",
  margin: "0 0 var(--space-2)",
};

export const groupBoxStyle: CSSProperties = {
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
  background: "var(--bg-card)",
};

export function emptyToNull(value: unknown): unknown {
  if (value === "" || value === undefined) return null;
  return value;
}

export function emptyToUndefined(value: unknown): unknown {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}

export function numOrNull(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function triToSelect(v: boolean | null | undefined): string {
  if (v === true) return "true";
  if (v === false) return "false";
  return "";
}

export function selectToTri(v: string): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export async function readApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? `Request failed (${res.status})`;
}

export function bodyJson(init?: RequestInit): Record<string, unknown> {
  const raw = init?.body;
  if (typeof raw === "string") {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  throw new Error("Expected JSON string body");
}
