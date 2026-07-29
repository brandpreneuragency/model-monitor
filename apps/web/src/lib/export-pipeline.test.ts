import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { exportRequestSchema, type ExportAccessRow, type ExportBenchmarkRow, type ExportModelRow, type ExportScoreRow, type ExportSourceRow, type ExportSubscriptionRow, type ImportProvenanceDto } from "@model-monitor/schemas";
import { buildExportPayload, preparePayload, serializeBackupArchive, serializeCsv, serializeXlsx } from "./export-pipeline";
import { applyExportScope } from "./export-scope";

function centralDirectoryNames(bytes: Uint8Array): string[] {
  const names: string[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i + 46 <= bytes.length; i += 1) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x01 || bytes[i + 3] !== 0x02) continue;
    const nameLength = bytes[i + 28] | (bytes[i + 29] << 8);
    names.push(decoder.decode(bytes.slice(i + 46, i + 46 + nameLength)));
  }
  return names;
}

function zipFiles(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i + 46 <= bytes.length; i += 1) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x01 || bytes[i + 3] !== 0x02) continue;
    const nameLength = bytes[i + 28] | (bytes[i + 29] << 8);
    const extraLength = bytes[i + 30] | (bytes[i + 31] << 8);
    const compressedSize = (bytes[i + 20] | (bytes[i + 21] << 8) | (bytes[i + 22] << 16) | (bytes[i + 23] << 24)) >>> 0;
    const offset = (bytes[i + 42] | (bytes[i + 43] << 8) | (bytes[i + 44] << 16) | (bytes[i + 45] << 24)) >>> 0;
    const name = decoder.decode(bytes.slice(i + 46, i + 46 + nameLength));
    const localNameLength = bytes[offset + 26] | (bytes[offset + 27] << 8);
    const localExtraLength = bytes[offset + 28] | (bytes[offset + 29] << 8);
    const compressed = bytes.slice(offset + 30 + localNameLength + localExtraLength, offset + 30 + localNameLength + localExtraLength + compressedSize);
    files.set(name, new Uint8Array(inflateRawSync(compressed)));
    i += nameLength + extraLength;
  }
  return files;
}

const model = (canonicalId: string, name: string) => ({ canonicalId, name, slug: canonicalId, lifecycle: "current" } as ExportModelRow);
const related = (modelCanonicalId: string) => ({ modelCanonicalId } as ExportAccessRow);
describe("export pipeline", () => {
  const payload = buildExportPayload({ format: "json", scope: "models", formulasNeutralized: false, models: [{ canonicalId: "m", name: "=SUM(1,2)", slug: "m", lifecycle: "current", contextTokens: null }] });
  it("validates typed payloads and preserves nulls", () => expect(payload.models?.[0]?.contextTokens).toBeNull());
  it("emits section headers as separate CSV cells", () => expect(serializeCsv(payload).split("\r\n")[0]).toBe("models,canonicalId,name,slug,lifecycle,contextTokens"));
  it("escapes CSV fields and neutralizes formula text", () => {
    const csv = serializeCsv(preparePayload(payload));
    expect(csv).toContain("'=SUM(1,2)");
    expect(csv).toContain('"\'=SUM(1,2)"');
  });
  it("serializes provenance in JSON and CSV exports", () => {
    const provenance = {
      id: "11111111-1111-4111-8111-111111111111",
      importJobId: "22222222-2222-4222-8222-222222222222",
      entityType: "model",
      entityId: "33333333-3333-4333-8333-333333333333",
      sourceSheet: "Models",
      sourceRow: 7,
      sourceColumn: "B",
      rawValue: "raw model value",
      createdAt: "2026-07-23T00:00:00.000Z",
    };
    const withProvenance = buildExportPayload({ ...payload, provenance: [provenance] });
    expect(JSON.stringify(withProvenance)).toContain('"provenance"');
    expect(serializeCsv(withProvenance)).toContain("provenance,id,importJobId,entityType,entityId,sourceSheet,sourceRow,sourceColumn,rawValue,createdAt");
    expect(serializeCsv(withProvenance)).toContain("raw model value");
  });
  it("emits XLSX zip bytes", async () => expect(Array.from((await serializeXlsx(payload)).slice(0, 2))).toEqual([80, 75]));
  it("serializes real CSV bytes with all formula prefixes neutralized", () => {
    const formulaPayload = buildExportPayload({ ...payload, models: [{ canonicalId: "m", name: "=x", slug: "+y", lifecycle: "-z", description: "@w" }] });
    const csv = serializeCsv(preparePayload(formulaPayload));
    const csvBytes = new TextEncoder().encode(csv);
    expect(new TextDecoder().decode(csvBytes)).toContain("'=x");
    expect(csv).toContain("'+y");
    expect(csv).toContain("'-z");
    expect(csv).toContain("'@w");
  });
  it("creates a parseable backup with manifest and exactly seven table members", () => {
    const tables = {
      models: [{ id: "m" }], access_providers: [], plans: [{ id: "p" }], model_access: [],
      plan_quotas: [], model_skill_ratings: [], tags: [],
    };
    const archive = serializeBackupArchive(tables, "2026-07-29T00:00:00.000Z");
    expect(Array.from(archive.slice(0, 4))).toEqual([80, 75, 3, 4]);
    expect(centralDirectoryNames(archive).sort()).toEqual([
      "manifest.json", "tables/access_providers.csv", "tables/model_access.csv", "tables/model_skill_ratings.csv",
      "tables/models.csv", "tables/plan_quotas.csv", "tables/plans.csv", "tables/tags.csv",
    ].sort());
    const files = zipFiles(archive);
    const manifestBytes = files.get("manifest.json");
    if (!manifestBytes) throw new Error("Backup manifest missing");
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as { tables: Record<string, number> };
    for (const [table, expected] of Object.entries(manifest.tables)) {
      const member = files.get(`tables/${table}.csv`);
      if (!member) throw new Error(`Backup member missing: ${table}`);
      const dataRows = new TextDecoder().decode(member).trimEnd().split("\r\n").slice(1).filter((line) => line.length > 0);
      expect(dataRows).toHaveLength(expected);
    }
  });

  it("inflates backup members and neutralizes all formula prefixes without changing manifest counts", () => {
    const tables = {
      models: [{ ordinary: "plain", equals: "=SUM(A1)", plus: "+danger", minus: "-danger", at: "@danger" }],
      access_providers: [], plans: [], model_access: [], plan_quotas: [], model_skill_ratings: [], tags: [],
    };
    const files = zipFiles(serializeBackupArchive(tables, "2026-07-29T00:00:00.000Z"));
    const csv = new TextDecoder().decode(files.get("tables/models.csv"));
    expect(csv).toContain("plain");
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain("'+danger");
    expect(csv).toContain("'-danger");
    expect(csv).toContain("'@danger");
    const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json"))) as { tables: Record<string, number> };
    expect(manifest.tables.models).toBe(1);
    expect(Object.values(manifest.tables)).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });


  it("selected scope rejects invalid UUIDs and returns only selected related model rows", () => {
    expect(exportRequestSchema.safeParse({ scope: "selected", format: "json", modelIds: ["not-a-uuid"] }).success).toBe(false);
    const scoped = applyExportScope({ scope: "selected", selectedCanonicalIds: new Set(["m1"]), models: [model("m1", "One"), model("m2", "Two")], access: [related("m1"), related("m2")], benchmarks: [], scores: [], subscriptions: [{} as ExportSubscriptionRow], sources: [{} as ExportSourceRow], provenance: [{} as ImportProvenanceDto] });
    expect(scoped.models.map((row) => row.canonicalId)).toEqual(["m1"]);
    expect(scoped.access).toEqual([related("m1")]);
    expect(scoped.subscriptions).toHaveLength(0);
    expect(scoped.sources).toHaveLength(0);
    expect(scoped.provenance).toHaveLength(0);
  });

  it("current scope applies search, developer, and access-provider-filtered model rows together", () => {
    const scoped = applyExportScope({ scope: "current", search: "alpha", models: [model("m1", "Alpha")], access: [related("m1"), related("m2")], benchmarks: [], scores: [], subscriptions: [], sources: [], provenance: [] });
    expect(scoped.models.map((row) => row.canonicalId)).toEqual(["m1"]);
    expect(scoped.access).toEqual([related("m1")]);
  });

  it("all scope retains the complete allowed dataset", () => {
    const scoped = applyExportScope({ scope: "all", models: [model("m1", "One"), model("m2", "Two")], access: [related("m1"), related("m2")], benchmarks: [{} as ExportBenchmarkRow], scores: [{} as ExportScoreRow], subscriptions: [{} as ExportSubscriptionRow], sources: [{} as ExportSourceRow], provenance: [{} as ImportProvenanceDto] });
    expect(scoped.models).toHaveLength(2);
    expect(scoped.access).toHaveLength(2);
    expect(scoped.benchmarks).toHaveLength(1);
    expect(scoped.scores).toHaveLength(1);
    expect(scoped.subscriptions).toHaveLength(1);
    expect(scoped.sources).toHaveLength(1);
    expect(scoped.provenance).toHaveLength(1);
  });
});
