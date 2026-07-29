"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  LayoutList,
  Settings,
  Trophy,
} from "lucide-react";

const STORAGE_KEY = "mm.sidebar.collapsed";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  match: (path: string) => boolean;
};

type ShortcutProvider = {
  id: string;
  name: string;
  initials: string;
};

const PRIMARY: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    icon: <Home size={16} aria-hidden />,
    match: (p) => p === "/",
  },
  {
    href: "/models",
    label: "Models",
    icon: <Boxes size={16} aria-hidden />,
    match: (p) => p === "/models" || p.startsWith("/models/"),
  },
  {
    href: "/rankings",
    label: "Rankings",
    icon: <Trophy size={16} aria-hidden />,
    match: (p) => p === "/rankings" || p.startsWith("/rankings/"),
  },
  {
    href: "/providers",
    label: "Providers & Plans",
    icon: <LayoutList size={16} aria-hidden />,
    match: (p) => p === "/providers" || p.startsWith("/providers/"),
  },
];

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0] ?? "?";
    return w.slice(0, 2).toUpperCase();
  }
  const a = parts[0] ?? "";
  const b = parts[1] ?? "";
  return `${a.charAt(0)}${b.charAt(0)}`.toUpperCase();
}

function extractProviders(payload: unknown): ShortcutProvider[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  let list: unknown[] = [];
  if (Array.isArray(root.data)) list = root.data;
  else if (root.data && typeof root.data === "object") {
    const data = root.data as Record<string, unknown>;
    if (Array.isArray(data.items)) list = data.items;
  }
  const out: ShortcutProvider[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const name = typeof row.name === "string" ? row.name : null;
    if (!id || !name) continue;
    const archived = row.archived === true || row.status === "archived";
    if (archived) continue;
    out.push({ id, name, initials: initialsFromName(name) });
  }
  return out.slice(0, 8);
}

export function Sidebar() {
  const pathname = usePathname() || "/";
  const [collapsed, setCollapsed] = useState(false);
  const [providers, setProviders] = useState<ShortcutProvider[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1" || stored === "true") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          "/api/v1/access-providers?archived=false",
          { credentials: "same-origin" },
        );
        if (!res.ok) return;
        const json: unknown = await res.json();
        if (!cancelled) setProviders(extractProviders(json));
      } catch {
        /* ignore — shortcuts optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const aside: CSSProperties = {
    width: collapsed ? 64 : "var(--sidebar-width)",
    flexShrink: 0,
    background: "var(--bg-sidebar)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    padding: collapsed
      ? "var(--space-4) var(--space-2)"
      : "var(--space-4) var(--space-3)",
    position: "sticky",
    top: 0,
    height: "100vh",
    transition:
      "width var(--duration-fast) var(--ease-out), padding var(--duration-fast) var(--ease-out)",
    fontFamily: "var(--font-sans)",
    overflow: "hidden",
  };

  const brand: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    padding: "var(--space-2)",
    marginBottom: "var(--space-4)",
    minHeight: 36,
  };

  const brandMark: CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: "var(--radius-lg)",
    background: "var(--accent)",
    display: "grid",
    placeItems: "center",
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
    flexShrink: 0,
  };

  const navLink = (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    padding: collapsed
      ? "var(--space-2)"
      : "var(--space-2) var(--space-3)",
    borderRadius: "var(--radius-lg)",
    color: active ? "var(--text)" : "var(--text-muted)",
    background: active ? "var(--accent-strong)" : "transparent",
    fontWeight: active ? 600 : 400,
    fontSize: "var(--text-body-size)",
    textDecoration: "none",
    justifyContent: collapsed ? "center" : "flex-start",
    whiteSpace: "nowrap",
  });

  const sectionLabel: CSSProperties = {
    marginTop: "var(--space-6)",
    paddingTop: "var(--space-3)",
    borderTop: "1px solid var(--border-subtle)",
    fontSize: 10,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    fontWeight: 600,
    paddingLeft: collapsed ? 0 : "var(--space-3)",
    marginBottom: "var(--space-2)",
    textAlign: collapsed ? "center" : "left",
  };

  const shortcut: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    padding: collapsed
      ? "var(--space-1_5)"
      : "var(--space-1_5) var(--space-3)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-muted)",
    fontSize: "var(--text-meta-size)",
    textDecoration: "none",
    justifyContent: collapsed ? "center" : "flex-start",
    whiteSpace: "nowrap",
  };

  const logoTile: CSSProperties = {
    width: 18,
    height: 18,
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    display: "grid",
    placeItems: "center",
    fontSize: 9,
    fontWeight: 700,
    color: "var(--text-muted)",
    flexShrink: 0,
  };

  const foot: CSSProperties = {
    marginTop: "auto",
    paddingTop: "var(--space-4)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
  };

  const promo: CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    padding: "var(--space-4)",
    fontSize: "var(--text-meta-size)",
    color: "var(--text-muted)",
  };

  const collapseBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 0,
    marginLeft: collapsed ? 0 : "auto",
  };

  return (
    <aside
      className="responsive-sidebar"
      style={aside}
      data-testid="app-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      aria-label="Primary"
    >
      <div style={brand}>
        <div style={brandMark} aria-hidden>
          ◇
        </div>
        {!collapsed ? (
          <span
            style={{
              fontSize: "var(--text-card-size)",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            Model Directory
          </span>
        ) : null}
        {!collapsed ? (
          <button
            type="button"
            style={collapseBtn}
            onClick={toggle}
            aria-label="Collapse sidebar"
            data-testid="sidebar-collapse"
          >
            <ChevronLeft size={14} />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <button
          type="button"
          style={{ ...collapseBtn, alignSelf: "center", marginBottom: 12 }}
          onClick={toggle}
          aria-label="Expand sidebar"
          data-testid="sidebar-expand"
        >
          <ChevronRight size={14} />
        </button>
      ) : null}

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
        }}
        aria-label="Primary destinations"
      >
        {PRIMARY.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={navLink(active)}
              aria-current={active ? "page" : undefined}
              title={item.label}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and")}`}
            >
              <span style={{ display: "inline-flex", flexShrink: 0 }}>
                {item.icon}
              </span>
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div style={sectionLabel}>{collapsed ? "···" : "SHORTCUTS"}</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflow: "auto",
          flex: "0 1 auto",
        }}
      >
        {providers.map((p) => (
          <Link
            key={p.id}
            href={`/providers?provider=${encodeURIComponent(p.id)}`}
            style={shortcut}
            title={p.name}
            data-testid={`shortcut-provider-${p.id}`}
          >
            <span style={logoTile} aria-hidden>
              {p.initials}
            </span>
            {!collapsed ? <span>{p.name}</span> : null}
          </Link>
        ))}
        <Link
          href="/providers"
          style={shortcut}
          title="View all providers"
          data-testid="shortcut-view-all"
        >
          <span style={logoTile} aria-hidden>
            +
          </span>
          {!collapsed ? <span>View all</span> : null}
        </Link>
      </div>

      <div
        style={{
          marginTop: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          borderTop: "1px solid var(--border-subtle)",
          paddingTop: "var(--space-3)",
        }}
      >
        <Link
          href="/settings"
          style={shortcut}
          title="Import / Export"
          data-testid="nav-import-export"
        >
          <Download size={16} aria-hidden />
          {!collapsed ? <span>Import / Export</span> : null}
        </Link>
        <Link
          href="/settings"
          style={shortcut}
          title="Settings"
          data-testid="nav-settings"
        >
          <Settings size={16} aria-hidden />
          {!collapsed ? <span>Settings</span> : null}
        </Link>
      </div>

      {!collapsed ? (
        <div style={foot}>
          <div style={promo}>
            <strong
              style={{
                display: "block",
                color: "var(--text)",
                marginBottom: "var(--space-1)",
                fontSize: "var(--text-card-size)",
              }}
            >
              Your rankings drive smarter choices
            </strong>
            Rank models across skills that matter to you. Scores stay private to
            your profile.
          </div>
        </div>
      ) : null}
    </aside>
  );
}
