"use client";

import { Suspense, useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Filter, Plus, Search } from "lucide-react";
import { Button } from "@model-monitor/ui";
import { SavedViews } from "@/components/models/saved-views";
import { AddModelDialog, type OptionItem } from "@/components/models/forms";
import { CommandPalette } from "./command-palette";

function SavedViewsFallback() {
  return (
    <div
      data-testid="saved-view-selector"
      style={{
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-1_5) var(--space-3)",
        color: "var(--text-muted)",
        fontSize: "var(--text-meta-size)",
        height: 34,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      Saved Views…
    </div>
  );
}

export function TopBar() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [developers, setDevelopers] = useState<OptionItem[]>([]);
  const [providers, setProviders] = useState<OptionItem[]>([]);
  const [plans, setPlans] = useState<OptionItem[]>([]);
  const pathname = usePathname();
  const router = useRouter();

  const loadFormOptions = useCallback(async () => {
    try {
      const [devRes, provRes, planRes] = await Promise.all([
        fetch("/api/v1/developers"),
        fetch("/api/v1/access-providers"),
        fetch("/api/v1/plans"),
      ]);
      if (devRes.ok) {
        const body = (await devRes.json()) as {
          data?: Array<{ id: string; name: string }>;
        };
        setDevelopers(
          (body.data ?? []).map((d) => ({ id: d.id, name: d.name })),
        );
      }
      if (provRes.ok) {
        const body = (await provRes.json()) as {
          data?: Array<{ id: string; name: string }>;
        };
        setProviders(
          (body.data ?? []).map((p) => ({ id: p.id, name: p.name })),
        );
      }
      if (planRes.ok) {
        const body = (await planRes.json()) as {
          data?: Array<{
            id: string;
            name: string;
            accessProviderId?: string;
          }>;
        };
        setPlans(
          (body.data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            accessProviderId: p.accessProviderId,
          })),
        );
      }
    } catch {
      // options stay empty — form still works name-only
    }
  }, []);

  useEffect(() => {
    if (addOpen) void loadFormOptions();
  }, [addOpen, loadFormOptions]);

  const topbar: CSSProperties = {
    height: "var(--topbar-height)",
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "0 var(--space-6)",
    borderBottom: "1px solid var(--border-subtle)",
    background: "var(--bg-surface)",
    position: "sticky",
    top: 0,
    zIndex: 20,
    fontFamily: "var(--font-sans)",
  };

  const search: CSSProperties = {
    flex: 1,
    maxWidth: 480,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-full)",
    padding: "var(--space-2) var(--space-4)",
    color: "var(--text-muted)",
    fontSize: "var(--text-meta-size)",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
  };

  const hint: CSSProperties = {
    marginLeft: "auto",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "0 6px",
    fontSize: 10,
    color: "var(--text-muted)",
  };

  const actions: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    marginLeft: "auto",
    flexShrink: 0,
  };

  const iconBtn: CSSProperties = {
    width: 34,
    height: 34,
    padding: 0,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-muted)",
    cursor: "pointer",
  };

  const avatar: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: "var(--radius-full)",
    background: "var(--advanced-bg)",
    border: "1px solid var(--border)",
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--advanced)",
  };

  const focusFilters = () => {
    if (pathname === "/models" || pathname.startsWith("/models?")) {
      const el = document.querySelector("[data-testid='models-filter-bar']");
      if (el && "scrollIntoView" in el) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    router.push("/models");
  };

  return (
    <>
      <header style={topbar} data-testid="app-topbar">
        <button
          type="button"
          style={search}
          onClick={() => setPaletteOpen(true)}
          data-testid="global-search-trigger"
          aria-label="Open command palette"
        >
          <Search size={14} aria-hidden />
          <span style={{ flex: 1 }}>
            Search models, providers, plans, tags…
          </span>
          <span style={hint}>⌘K</span>
        </button>

        <div style={actions}>
          <Suspense fallback={<SavedViewsFallback />}>
            <SavedViews />
          </Suspense>

          <button
            type="button"
            style={iconBtn}
            aria-label="Filters"
            data-testid="topbar-filter"
            title="Filters"
            onClick={focusFilters}
          >
            <Filter size={14} />
          </button>

          <Link href="/models/new" style={{ textDecoration: "none" }} data-testid="topbar-add-model-page">
            <span className="sr-only">Full page create</span>
          </Link>
          <Button
            variant="primary"
            size="sm"
            data-testid="topbar-add-model"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={14} aria-hidden />
            Add Model
          </Button>

          <button
            type="button"
            style={iconBtn}
            aria-label="Theme (dark only)"
            title="Dark mode"
            data-testid="topbar-theme"
            disabled
          >
            ◐
          </button>

          <div
            style={avatar}
            role="img"
            aria-label="User menu"
            data-testid="user-menu"
            title="Signed in"
          >
            BP
          </div>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      <AddModelDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        developers={developers}
        providers={providers}
        plans={plans}
        onCreated={() => {
          setAddOpen(false);
          router.refresh();
          if (!pathname?.startsWith("/models")) {
            router.push("/models");
          }
        }}
      />
    </>
  );
}
