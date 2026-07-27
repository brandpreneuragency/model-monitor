"use client";

import { Boxes, Menu, Settings, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const navItems = [
  { href: "/models", label: "Models", icon: Boxes },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({
  onNavigate,
  linkTestIdPrefix,
}: {
  onNavigate?: () => void;
  linkTestIdPrefix?: string;
}) {
  return (
    <nav className="flex-1 space-y-1 p-3" aria-label="Primary">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          data-testid={
            linkTestIdPrefix
              ? `${linkTestIdPrefix}-${item.label.toLowerCase().replace(/\s+/g, "-")}`
              : undefined
          }
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <item.icon className="h-4 w-4" aria-hidden />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mobileOpen) {
      if (!dialog.open) dialog.showModal();
      // Move focus into the dialog.
      queueMicrotask(() => closeBtnRef.current?.focus());
    } else if (dialog.open) {
      dialog.close();
    }
  }, [mobileOpen]);

  function closeMobileNav() {
    setMobileOpen(false);
    queueMicrotask(() => toggleRef.current?.focus());
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            MM
          </div>
          <span className="text-sm font-semibold text-foreground">Model Monitor</span>
        </div>
        <NavLinks />
      </aside>

      {/* Mobile navigation as native modal dialog for focus trap + inert background */}
      <dialog
        ref={dialogRef}
        id={panelId}
        className="fixed inset-y-0 left-0 m-0 h-full w-72 max-w-[85vw] border-r border-border bg-card p-0 shadow-lg open:flex open:flex-col md:hidden"
        aria-label="Mobile navigation"
        data-testid="mobile-nav-dialog"
        onClose={() => {
          setMobileOpen(false);
          queueMicrotask(() => toggleRef.current?.focus());
        }}
        onCancel={(e) => {
          e.preventDefault();
          closeMobileNav();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const focusable = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])",
            ),
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold">Model Monitor</span>
          <button
            ref={closeBtnRef}
            type="button"
            className="rounded-md border border-border p-2"
            aria-label="Close menu"
            data-testid="mobile-nav-close"
            onClick={closeMobileNav}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <NavLinks onNavigate={closeMobileNav} linkTestIdPrefix="mobile-nav" />
      </dialog>

      <main className="min-w-0 flex-1 overflow-x-auto" data-testid="app-main">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
          <div className="flex items-center gap-2">
            <button
              ref={toggleRef}
              type="button"
              className="rounded-md border border-border p-2 md:hidden"
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
              aria-controls={panelId}
              data-testid="mobile-nav-toggle"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-sm text-muted-foreground">Model Monitor</div>
          </div>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
