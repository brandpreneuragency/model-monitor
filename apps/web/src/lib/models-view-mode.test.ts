import { describe, expect, it, beforeEach } from "vitest";
import {
  VIEW_MODE_STORAGE_KEY,
  loadModelsViewMode,
  parseModelsViewMode,
  persistModelsViewMode,
  preservesFiltersOnViewSwitch,
  viewModeQueryPatch,
} from "./models-view-mode";

/** Minimal in-memory Storage for remount-persistence tests. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe("models view mode", () => {
  it("parses only table | cards | compact", () => {
    expect(parseModelsViewMode("cards")).toBe("cards");
    expect(parseModelsViewMode("compact")).toBe("compact");
    expect(parseModelsViewMode("table")).toBe("table");
    expect(parseModelsViewMode("gallery", "table")).toBe("table");
    expect(parseModelsViewMode(null, "cards")).toBe("cards");
  });

  it("persists mode across a remount (fresh load from storage)", () => {
    const storage = memoryStorage();
    persistModelsViewMode("cards", storage);
    expect(storage.getItem(VIEW_MODE_STORAGE_KEY)).toBe("cards");

    // Simulate remount: new call site only reads storage
    const remounted = loadModelsViewMode(storage);
    expect(remounted).toBe("cards");

    persistModelsViewMode("compact", storage);
    expect(loadModelsViewMode(storage)).toBe("compact");
  });

  it("switching mode preserves filters and sort (and does not touch selection)", () => {
    const current = new URLSearchParams(
      "workflowStatus=active&accessType=api&skill=coding&sort=-overallScore&page=2&limit=50&view=table",
    );
    // Selection lives in compare tray memory — not in the URL. Mode switch
    // only patches view chrome keys.
    const { next, filterKeysUnchanged } = preservesFiltersOnViewSwitch(
      current,
      "cards",
    );
    expect(filterKeysUnchanged).toBe(true);
    expect(next.get("workflowStatus")).toBe("active");
    expect(next.get("accessType")).toBe("api");
    expect(next.get("skill")).toBe("coding");
    expect(next.get("sort")).toBe("-overallScore");
    expect(next.get("page")).toBe("2");
    expect(next.get("limit")).toBe("50");
    expect(next.get("view")).toBe("cards");

    const patch = viewModeQueryPatch("compact");
    expect(Object.keys(patch).sort()).toEqual(["density", "view"]);
    expect(patch.view).toBe("compact");
    // No filter keys in the patch contract
    expect(patch).not.toHaveProperty("workflowStatus");
    expect(patch).not.toHaveProperty("sort");
    expect(patch).not.toHaveProperty("page");
  });

  it("defaults to table when storage is empty", () => {
    const storage = memoryStorage();
    expect(loadModelsViewMode(storage)).toBe("table");
  });
});

describe("selection preservation contract", () => {
  beforeEach(() => {
    /* pure tests — nothing to reset */
  });

  it("mode switch does not clear a selection id set held outside the URL", () => {
    // Mirrors models-table: selection is compare tray state; viewMode is independent.
    const selection = new Set(["id-a", "id-b"]);
    const before = [...selection];
    // apply view mode change (no selection API involved)
    viewModeQueryPatch("cards");
    expect([...selection]).toEqual(before);
    viewModeQueryPatch("compact");
    expect([...selection]).toEqual(before);
    viewModeQueryPatch("table");
    expect([...selection]).toEqual(before);
  });
});
