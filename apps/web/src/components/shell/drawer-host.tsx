"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Drawer } from "@model-monitor/ui";

export type DrawerContent = {
  title?: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

type DrawerHostContextValue = {
  open: boolean;
  content: DrawerContent | null;
  openDrawer: (content: DrawerContent) => void;
  closeDrawer: () => void;
  setContent: (content: DrawerContent | null) => void;
};

const DrawerHostContext = createContext<DrawerHostContextValue | null>(null);

export function DrawerHostProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [content, setContentState] = useState<DrawerContent | null>(null);

  const openDrawer = useCallback((next: DrawerContent) => {
    setContentState(next);
    setOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setOpen(false);
  }, []);

  const setContent = useCallback((next: DrawerContent | null) => {
    setContentState(next);
    if (!next) setOpen(false);
  }, []);

  const value = useMemo(
    () => ({ open, content, openDrawer, closeDrawer, setContent }),
    [open, content, openDrawer, closeDrawer, setContent],
  );

  return (
    <DrawerHostContext.Provider value={value}>
      {children}
      <DrawerHostMount />
    </DrawerHostContext.Provider>
  );
}

function DrawerHostMount() {
  const { open, content, closeDrawer } = useDrawerHost();
  return (
    <div data-testid="drawer-host" aria-live="polite">
      <Drawer
        open={open}
        onClose={closeDrawer}
        title={content?.title}
        footer={content?.footer}
        size={content?.size ?? "md"}
      >
        {content?.body}
      </Drawer>
    </div>
  );
}

export function useDrawerHost(): DrawerHostContextValue {
  const ctx = useContext(DrawerHostContext);
  if (!ctx) {
    throw new Error("useDrawerHost must be used within DrawerHostProvider");
  }
  return ctx;
}
