"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ResultKind = "model" | "provider" | "plan" | "skill";

type SearchResult = {
  id: string;
  kind: ResultKind;
  label: string;
  href: string;
  meta?: string;
};

const KIND_ORDER: ResultKind[] = ["model", "provider", "plan", "skill"];

const KIND_LABEL: Record<ResultKind, string> = {
  model: "Models",
  provider: "Providers",
  plan: "Plans",
  skill: "Skills",
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function extractList(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data;
  if (root.data && typeof root.data === "object") {
    const data = root.data as Record<string, unknown>;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.data)) return data.data;
  }
  if (Array.isArray(root.items)) return root.items;
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  }, [onOpenChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const q = query.trim();
    const handle = window.setTimeout(() => {
      void (async () => {
      setLoading(true);
      const search = encodeURIComponent(q);
      const [modelsPayload, providersPayload, plansPayload, skillsPayload] =
        await Promise.all([
          fetchJson<unknown>(
            `/api/v1/models?search=${search}&limit=8&page=1`,
          ),
          fetchJson<unknown>(
            `/api/v1/access-providers?search=${search}&archived=false`,
          ),
          fetchJson<unknown>(`/api/v1/plans?search=${search}&limit=8`),
          fetchJson<unknown>(`/api/v1/skills?search=${search}`),
        ]);
      if (cancelled) return;

      const next: SearchResult[] = [];

      for (const item of extractList(modelsPayload)) {
        const row = asRecord(item);
        if (!row) continue;
        const id = str(row.id);
        const name = str(row.name) ?? str(row.displayName);
        if (!id || !name) continue;
        next.push({
          id: `model:${id}`,
          kind: "model",
          label: name,
          href: `/models?highlight=${encodeURIComponent(id)}`,
          meta: str(row.developerName) ?? str(row.family),
        });
      }

      for (const item of extractList(providersPayload)) {
        const row = asRecord(item);
        if (!row) continue;
        const id = str(row.id);
        const name = str(row.name);
        if (!id || !name) continue;
        next.push({
          id: `provider:${id}`,
          kind: "provider",
          label: name,
          href: `/providers?provider=${encodeURIComponent(id)}`,
          meta: str(row.providerType) ?? "Provider",
        });
      }

      for (const item of extractList(plansPayload)) {
        const row = asRecord(item);
        if (!row) continue;
        const id = str(row.id);
        const name = str(row.name);
        if (!id || !name) continue;
        next.push({
          id: `plan:${id}`,
          kind: "plan",
          label: name,
          href: `/providers?plan=${encodeURIComponent(id)}`,
          meta: str(row.providerName) ?? "Plan",
        });
      }

      for (const item of extractList(skillsPayload)) {
        const row = asRecord(item);
        if (!row) continue;
        const id = str(row.id) ?? str(row.slug);
        const name = str(row.name) ?? str(row.label);
        if (!id || !name) continue;
        next.push({
          id: `skill:${id}`,
          kind: "skill",
          label: name,
          href: `/rankings?skill=${encodeURIComponent(id)}`,
          meta: "Skill",
        });
      }

      setResults(next);
      setActiveIndex(0);
      setLoading(false);
      })();
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query]);

  const flat = useMemo(() => results, [results]);

  const select = useCallback(
    (item: SearchResult) => {
      close();
      router.push(item.href);
    },
    [close, router],
  );

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[activeIndex];
      if (item) select(item);
    }
  };

  if (!open) return null;

  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "var(--bg-overlay)",
    zIndex: 70,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "12vh",
    paddingLeft: "var(--space-4)",
    paddingRight: "var(--space-4)",
  };

  const panel: CSSProperties = {
    width: "100%",
    maxWidth: 560,
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    overflow: "hidden",
    fontFamily: "var(--font-sans)",
  };

  const inputWrap: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    padding: "var(--space-3) var(--space-4)",
    borderBottom: "1px solid var(--border-subtle)",
    background: "var(--bg-input)",
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: "var(--text-body-size)",
    fontFamily: "var(--font-sans)",
  };

  const listStyle: CSSProperties = {
    maxHeight: 360,
    overflow: "auto",
    padding: "var(--space-2)",
  };

  const sectionLabel: CSSProperties = {
    fontSize: 10,
    letterSpacing: "0.08em",
    fontWeight: 600,
    color: "var(--text-faint)",
    padding: "var(--space-2) var(--space-3)",
    textTransform: "uppercase",
  };

  const rowBase: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    width: "100%",
    textAlign: "left",
    border: "none",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-2) var(--space-3)",
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-body-size)",
  };

  let runningIndex = -1;

  return (
    <div
      style={overlay}
      data-testid="command-palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={panel}
      >
        <div style={inputWrap}>
          <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search models, providers, plans, skills…"
            aria-controls={listId}
            aria-autocomplete="list"
            style={inputStyle}
            data-testid="command-palette-input"
          />
          <kbd
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "0 6px",
              fontSize: 10,
              color: "var(--text-faint)",
            }}
          >
            esc
          </kbd>
        </div>
        <div id={listId} role="listbox" style={listStyle}>
          {loading && flat.length === 0 ? (
            <div
              style={{
                padding: "var(--space-4)",
                color: "var(--text-muted)",
                fontSize: "var(--text-meta-size)",
              }}
            >
              Searching…
            </div>
          ) : null}
          {!loading && flat.length === 0 ? (
            <div
              style={{
                padding: "var(--space-4)",
                color: "var(--text-muted)",
                fontSize: "var(--text-meta-size)",
              }}
            >
              {query.trim()
                ? "No matches"
                : "Type to search models, providers, plans, and skills"}
            </div>
          ) : null}
          {KIND_ORDER.map((kind) => {
            const group = flat.filter((r) => r.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <div style={sectionLabel}>{KIND_LABEL[kind]}</div>
                {group.map((item) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      style={{
                        ...rowBase,
                        background: active
                          ? "var(--bg-row-hover)"
                          : "transparent",
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(item)}
                    >
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.meta ? (
                        <span
                          style={{
                            color: "var(--text-faint)",
                            fontSize: "var(--text-meta-size)",
                          }}
                        >
                          {item.meta}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
