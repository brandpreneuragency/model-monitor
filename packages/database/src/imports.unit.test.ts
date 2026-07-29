/**
 * Unit tests for import service pure logic.
 * Tests validation schemas and helper functions.
 */
import { describe, expect, it } from "vitest";
import {
  importJobResponseSchema,
  importPreviewSummarySchema,
  importCommitSummarySchema,
  importBatchResolutionSchema,
  importConflictTypeSchema,
  importResolutionActionSchema,
  neutralizeExportRow,
  neutralizeFormulaText,
  isFormulaLike,
  type ImportJobResponse,
} from "@model-monitor/schemas";
import { importPlanSchema, restoreSevenTableSections } from "./services/imports";
import type { ExportSection } from "@model-monitor/csv-import";

describe("Import schemas", () => {
  it("importPlanSchema rejects unknown, missing, and malformed fields", () => {
    expect(importPlanSchema.safeParse({ modelRows: [], benchmarkRows: [], extra: true }).success).toBe(false);
    expect(importPlanSchema.safeParse({ benchmarkRows: [] }).success).toBe(false);
    expect(importPlanSchema.safeParse({ modelRows: [{ classification: "create" }], benchmarkRows: [] }).success).toBe(false);
  });
  it("importJobResponseSchema parses valid data", () => {
    const data: ImportJobResponse = {
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      filename: "test.xlsx",
      storedPath: "/tmp/test.xlsx",
      sha256: "a".repeat(64),
      parserVersion: "1.0.0",
      status: "uploaded",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed = importJobResponseSchema.safeParse(data);
    expect(parsed.success).toBe(true);
  });

  it("importJobResponseSchema rejects missing required fields", () => {
    const parsed = importJobResponseSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("importPreviewSummarySchema defaults zero values", () => {
    const parsed = importPreviewSummarySchema.parse({});
    expect(parsed.unchangedCount).toBe(0);
    expect(parsed.createCount).toBe(0);
    expect(parsed.totalSourceRows).toBeUndefined();
  });

  it("importCommitSummarySchema defaults zero values", () => {
    const parsed = importCommitSummarySchema.parse({});
    expect(parsed.modelsCreated).toBe(0);
    expect(parsed.committedAt).toBeUndefined();
  });

  it("importBatchResolutionSchema rejects empty resolutions", () => {
    const parsed = importBatchResolutionSchema.safeParse({
      importJobId: crypto.randomUUID(),
      resolutions: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("importConflictTypeSchema has expected values", () => {
    expect(importConflictTypeSchema.options).toContain("canonical_identity_collision");
    expect(importConflictTypeSchema.options).toContain("destructive_blank_overwrite");
    expect(importConflictTypeSchema.options.length).toBe(13);
  });

  it("importResolutionActionSchema has expected values", () => {
    expect(importResolutionActionSchema.options).toContain("keep_existing");
    expect(importResolutionActionSchema.options).toContain("defer");
    expect(importResolutionActionSchema.options.length).toBe(6);
  });
});

describe("Formula neutralization", () => {
  it("isFormulaLike detects formula prefixes", () => {
    expect(isFormulaLike("=SUM(A1)")).toBe(true);
    expect(isFormulaLike("+FORMULA")).toBe(true);
    expect(isFormulaLike("-FORMULA")).toBe(true);
    expect(isFormulaLike("@FORMULA")).toBe(true);
    expect(isFormulaLike("plain text")).toBe(false);
    expect(isFormulaLike("")).toBe(false);
  });

  it("neutralizeFormulaText prepends quote to formula-like text", () => {
    expect(neutralizeFormulaText("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(neutralizeFormulaText("plain")).toBe("plain");
    expect(neutralizeFormulaText(null)).toBeNull();
    expect(neutralizeFormulaText(undefined)).toBeNull();
  });

  it("neutralizeExportRow recursively neutrallizes", () => {
    const result = neutralizeExportRow({ name: "Test", value: "=DANGER", nested: { formula: "+EVIL" } });
    expect(result.name).toBe("Test");
    expect(result.value).toBe("'=DANGER");
    expect((result.nested as Record<string, unknown>).formula).toBe("'+EVIL");
  });
});

describe("seven-table backup restore validation", () => {
  const tables = ["models", "access_providers", "plans", "model_access", "plan_quotas", "model_skill_ratings", "tags"] as const;
  const headers = ["id", "enabled", "count", "amount", "happened_on", "payload", "name"];
  const metadata = [
    { column_name: "id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "enabled", data_type: "boolean", udt_name: "bool", is_nullable: "YES" },
    { column_name: "count", data_type: "integer", udt_name: "int4", is_nullable: "YES" },
    { column_name: "amount", data_type: "numeric", udt_name: "numeric", is_nullable: "YES" },
    { column_name: "happened_on", data_type: "date", udt_name: "date", is_nullable: "YES" },
    { column_name: "payload", data_type: "jsonb", udt_name: "jsonb", is_nullable: "YES" },
    { column_name: "name", data_type: "text", udt_name: "text", is_nullable: "NO" },
  ];
  const validRow = { id: "11111111-1111-4111-8111-111111111111", enabled: "true", count: "2", amount: "1.25", happened_on: "2026-07-29", payload: "{}", name: "valid" };
  const validSections = (): ExportSection[] => tables.map((table) => ({ table, headers: [...headers], rows: table === "models" ? [{ ...validRow }] : [] }));
  const client = { unsafe: async (query: string) => query.startsWith("SELECT column_name") ? metadata : [] };

  it.each([
    ["one missing table", () => validSections().slice(0, 6)],
    ["duplicate table", () => [...validSections(), validSections()[0]]],
    ["unknown table", () => validSections().map((section, index) => index === 0 ? { ...section, table: "unknown" } : section)],
  ])("rejects %s", async (_, makeSections) => expect(restoreSevenTableSections(client, makeSections())).rejects.toThrow());

  it.each([
    ["missing column", (sections: ExportSection[]) => { sections[0].headers = headers.slice(1); delete sections[0].rows[0].id; return sections; }],
    ["extra column", (sections: ExportSection[]) => { sections[0].headers = [...headers, "extra"]; sections[0].rows[0].extra = "x"; return sections; }],
    ["malformed UUID", (sections: ExportSection[]) => { sections[0].rows[0].id = "not-a-uuid"; return sections; }],
    ["malformed numeric", (sections: ExportSection[]) => { sections[0].rows[0].amount = "NaN"; return sections; }],
    ["malformed boolean", (sections: ExportSection[]) => { sections[0].rows[0].enabled = "maybe"; return sections; }],
    ["malformed date", (sections: ExportSection[]) => { sections[0].rows[0].happened_on = "not-a-date"; return sections; }],
    ["malformed JSON", (sections: ExportSection[]) => { sections[0].rows[0].payload = "{"; return sections; }],
    ["null in non-null column", (sections: ExportSection[]) => { sections[0].rows[0].name = null; return sections; }],
  ])("rejects %s", async (_, mutate) => expect(restoreSevenTableSections(client, mutate(validSections()))).rejects.toThrow());
});
