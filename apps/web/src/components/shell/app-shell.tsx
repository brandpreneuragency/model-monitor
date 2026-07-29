"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DensityProvider } from "./density-provider";
import { DrawerHostProvider } from "./drawer-host";
import { CompareTrayProvider } from "./compare-tray";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

function ShellChrome({ children }: { children: ReactNode }) {
  const app: CSSProperties = {
    display: "flex",
    minHeight: "100vh",
    background: "var(--bg-app)",
    color: "var(--text)",
    fontFamily: "var(--font-sans)",
  };

  const mainCol: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  };

  const content: CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: "var(--space-6)",
  };

  return (
    <div style={app} data-testid="app-shell">
      <Sidebar />
      <div style={mainCol}>
        <TopBar />
        <main style={content} data-testid="app-main">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const bare = pathname === "/login" || pathname.startsWith("/login/");

  if (bare) {
    return (
      <div
        data-testid="app-shell-bare"
        style={{
          minHeight: "100vh",
          background: "var(--bg-app)",
          color: "var(--text)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <DensityProvider>
      <DrawerHostProvider>
        <CompareTrayProvider>
          <ShellChrome>{children}</ShellChrome>
        </CompareTrayProvider>
      </DrawerHostProvider>
    </DensityProvider>
  );
}

export { useDensity } from "./density-provider";
export { useDrawerHost } from "./drawer-host";
export { useCompareTray } from "./compare-tray";
