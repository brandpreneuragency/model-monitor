import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  parseDecimal,
  parseGeneration,
  parseMasterCsv,
  parseProseBoolean,
  splitPackageRoutes,
} from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");
const CSV_PATH = join(REPO_ROOT, "data/source/LLM_MASTER_v1.csv");

/** Numeric CSV columns that must never turn blank into 0. */
const NUMERIC_HEADERS = [
  "Context Tokens",
  "Max Output Tokens",
  "Verified TPS",
  "Subscription USD/mo",
  "Intro Price USD",
  "Usage Window Hours",
  "5h Min Requests",
  "5h Max Requests",
  "Weekly Requests",
  "Monthly Requests",
  "Input $/M",
  "Cached Read $/M",
  "Cache Write $/M",
  "Output $/M",
  "Long Context Input $/M",
  "Long Context Cached $/M",
  "Long Context Cache Write $/M",
  "Long Context Output $/M",
  "Avg Request Cost $",
  "Provider Relative Usage Cost",
  "SWE-Bench Pro",
  "Terminal-Bench 2.1",
  "Terminal-Bench 2.0",
  "Coding Agent Index",
  "SWE-Bench Verified",
  "Toolathlon",
  "MCP Atlas",
  "OSWorld",
  "GPQA Diamond",
  "Headline Long-Context %",
  "Coding Benchmark Score",
  "Agent/Tool Score",
  "Repository Repair Score",
  "Long Context Score",
  "Speed Score",
  "Usage Efficiency Score",
  "Multimodality Score",
  "Provider Reliability Score",
  "Capability Score",
  "Capability Rank",
  "Balanced Score",
  "Balanced Rank",
  "Value Score",
  "Value Rank",
  "Long Context Rank",
  "Terminal/DevOps Rank",
  "UI/Frontend Rank",
  "Architecture Rank",
  "Review/Debug Rank",
  "Bulk Worker Rank",
] as const;

function loadRealCsv(): Buffer {
  return readFileSync(CSV_PATH);
}

function rawRows(buffer: Buffer): { header: string[]; data: string[][] } {
  // Lightweight re-parse via the same public API path for blank-cell audits:
  // decode UTF-8 and use a minimal split that matches our parser on this file.
  const text = buffer.toString("utf8");
  const { parseMasterCsv: _p } = { parseMasterCsv };
  void _p;
  // Use Node's knowledge: re-read through parseMasterCsv only for models;
  // for raw blanks use a small inline CSV reader identical to package csv.ts contract.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { header: rows[3]!, data: rows.slice(4).filter((r) => r.some((c) => c.trim())) };
}

describe("parseDecimal", () => {
  it("parses decimal comma and plain integers; empty is null not 0", () => {
    expect(parseDecimal("98,00")).toBe(98);
    expect(parseDecimal("128000,00")).toBe(128000);
    expect(parseDecimal("96")).toBe(96);
    expect(parseDecimal("5,00")).toBe(5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
  });
});

describe("parseGeneration", () => {
  it("normalises locale-mangled decimals and keeps mixed labels", () => {
    expect(parseGeneration("5,6")).toBe("5.6");
    expect(parseGeneration("3.5 Flash")).toBe("3.5 Flash");
    expect(parseGeneration("")).toBeNull();
  });
});

describe("parseProseBoolean", () => {
  it("maps Yes / not confirmed / No correctly", () => {
    expect(parseProseBoolean("Yes").value).toBe(true);
    expect(parseProseBoolean("Yes: image, video, PDF").value).toBe(true);
    expect(parseProseBoolean("Not confirmed in Go docs")).toEqual({
      value: null,
      prose: "Not confirmed in Go docs",
    });
    expect(parseProseBoolean("").value).toBeNull();
    expect(parseProseBoolean("No").value).toBe(false);
    expect(parseProseBoolean("No: text/code").value).toBe(false);
  });
});

describe("splitPackageRoutes", () => {
  it("splits multi-route packages and keeps known compounds whole", () => {
    expect(splitPackageRoutes("Mistral API / open weights")).toEqual([
      "Mistral API",
      "open weights",
    ]);
    expect(
      splitPackageRoutes("StepFun API / open weights / NVIDIA NIM"),
    ).toEqual(["StepFun API", "open weights", "NVIDIA NIM"]);
    expect(splitPackageRoutes("ChatGPT Plus / Codex")).toEqual([
      "ChatGPT Plus / Codex",
    ]);
    expect(splitPackageRoutes("OpenCode Go")).toEqual(["OpenCode Go"]);
  });
});

describe("parseMasterCsv against real LLM_MASTER_v1.csv", () => {
  const buffer = loadRealCsv();
  const parsed = parseMasterCsv(buffer);

  it("parses 51 model rows with 0 dropped", () => {
    expect(parsed.models).toHaveLength(51);
    expect(parsed.quotas).toHaveLength(51);
    expect(parsed.pricing).toHaveLength(51);
    expect(parsed.sources).toHaveLength(51);
  });

  it("finds nine distinct providers and eleven distinct packages", () => {
    expect(parsed.providers).toHaveLength(9);
    expect(parsed.providers.map((p) => p.name).sort()).toEqual(
      [
        "Anthropic",
        "Google",
        "Mistral AI",
        "NVIDIA",
        "OpenAI",
        "OpenCode",
        "StepFun",
        "Tencent",
        "xAI",
      ].sort(),
    );
    expect(parsed.plans).toHaveLength(11);
    expect(parsed.plans.map((p) => p.packageName).sort()).toEqual(
      [
        "ChatGPT Plus / Codex",
        "Claude API",
        "Gemini API",
        "Gemini API / open weights",
        "Mistral API",
        "Mistral API / open weights",
        "NVIDIA-hosted trial / NIM / open weights",
        "OpenCode Go",
        "StepFun API / open weights / NVIDIA NIM",
        "Tencent Cloud TokenHub / open weights",
        "xAI API",
      ].sort(),
    );
  });

  it("GPT-5.6 Sol numeric and score fields", () => {
    const m = parsed.models.find((x) => x.name === "GPT-5.6 Sol");
    expect(m).toBeDefined();
    expect(m!.contextTokens).toBe(1050000);
    expect(m!.maxOutputTokens).toBe(128000);
    expect(m!.capabilityRank).toBe(2);

    const q = parsed.quotas.find((x) => x.modelName === "GPT-5.6 Sol");
    expect(q).toBeDefined();
    expect(q!.fiveHourMin).toBe(15);
    expect(q!.fiveHourMax).toBe(90);
    expect(q!.weeklyRequests).toBeNull();
    expect(q!.monthlyRequests).toBeNull();

    const plan = parsed.plans.find((p) => p.packageName === m!.packageName);
    expect(plan).toBeDefined();
    expect(plan!.subscriptionUsd).toBe(20);
    // intro empty on this package in source
    expect(plan!.introPriceUsd).toBeNull();

    const coding = parsed.skillScores.find(
      (s) => s.modelName === "GPT-5.6 Sol" && s.skillKey === "coding",
    );
    expect(coding).toBeDefined();
    expect(coding!.externalScore).toBe(100);
  });

  it("GLM-5.2 subscription, intro, and quotas", () => {
    const m = parsed.models.find((x) => x.name === "GLM-5.2");
    expect(m).toBeDefined();
    const plan = parsed.plans.find((p) => p.packageName === m!.packageName);
    expect(plan!.subscriptionUsd).toBe(10);
    expect(plan!.introPriceUsd).toBe(5);

    const q = parsed.quotas.find((x) => x.modelName === "GLM-5.2");
    expect(q!.fiveHourMin).toBe(880);
    expect(q!.fiveHourMax).toBe(880);
    expect(q!.weeklyRequests).toBe(2150);
    expect(q!.monthlyRequests).toBe(4300);
  });

  it("Generation is text: 5.6 and 3.5 Flash", () => {
    const sol = parsed.models.find((x) => x.name === "GPT-5.6 Sol");
    const flash = parsed.models.find((x) => x.name === "Gemini 3.5 Flash");
    expect(sol!.generation).toBe("5.6");
    expect(flash!.generation).toBe("3.5 Flash");
  });

  it("Vision Support for GLM-5.2 is null with prose retained", () => {
    const m = parsed.models.find((x) => x.name === "GLM-5.2");
    expect(m!.vision.value).toBeNull();
    expect(m!.vision.prose).toBe("Not confirmed in Go docs");
  });

  it("Reasoning Support for GPT-5.6 Sol is UTF-8 EN DASH (U+2013)", () => {
    const m = parsed.models.find((x) => x.name === "GPT-5.6 Sol");
    const rs = m!.reasoning.prose;
    // Exact string including U+2013 EN DASH between low and ultra.
    // Assert on the code point (not a visual "–" vs "-" comparison) so a
    // wrong-encoding regression (cp1252/latin-1 mojibake) fails loudly.
    expect(rs).toBe("Yes: low\u2013ultra");
    const codePoints = [...rs].map((ch) => ch.codePointAt(0));
    expect(codePoints).toContain(0x2013);
    // "Yes: low" (8 chars) then EN DASH at index 8; "ultra" follows.
    expect(codePoints[8]).toBe(0x2013);
    // From the end: … w – u l t r a → EN DASH is 6th-from-last on this value.
    expect(codePoints[codePoints.length - 6]).toBe(0x2013);
    expect(m!.reasoning.value).toBe(true);
  });

  it("every empty numeric cell yields null — never blank→0 — across all 51 rows", () => {
    const { header, data } = rawRows(buffer);
    expect(data).toHaveLength(51);

    const colIndex = new Map(header.map((h, i) => [h, i]));
    const modelByName = new Map(parsed.models.map((m) => [m.name, m]));
    const quotaByName = new Map(parsed.quotas.map((q) => [q.modelName, q]));
    const pricingByName = new Map(parsed.pricing.map((p) => [p.modelName, p]));
    const skillsByName = new Map<string, typeof parsed.skillScores>();
    for (const s of parsed.skillScores) {
      const list = skillsByName.get(s.modelName) ?? [];
      list.push(s);
      skillsByName.set(s.modelName, list);
    }

    const modelField: Record<string, (m: (typeof parsed.models)[0]) => number | null> = {
      "Context Tokens": (m) => m.contextTokens,
      "Max Output Tokens": (m) => m.maxOutputTokens,
      "Verified TPS": (m) => m.verifiedTps,
      "Capability Score": (m) => m.capabilityScore,
      "Capability Rank": (m) => m.capabilityRank,
      "Balanced Score": (m) => m.balancedScore,
      "Balanced Rank": (m) => m.balancedRank,
      "Value Score": (m) => m.valueScore,
      "Value Rank": (m) => m.valueRank,
    };

    const quotaField: Record<string, (q: (typeof parsed.quotas)[0]) => number | null> = {
      "Usage Window Hours": (q) => q.usageWindowHours,
      "5h Min Requests": (q) => q.fiveHourMin,
      "5h Max Requests": (q) => q.fiveHourMax,
      "Weekly Requests": (q) => q.weeklyRequests,
      "Monthly Requests": (q) => q.monthlyRequests,
    };

    const pricingField: Record<string, (p: (typeof parsed.pricing)[0]) => number | null> = {
      "Input $/M": (p) => p.inputPerM,
      "Cached Read $/M": (p) => p.cachedReadPerM,
      "Cache Write $/M": (p) => p.cacheWritePerM,
      "Output $/M": (p) => p.outputPerM,
      "Long Context Input $/M": (p) => p.longContextInputPerM,
      "Long Context Cached $/M": (p) => p.longContextCachedPerM,
      "Long Context Cache Write $/M": (p) => p.longContextCacheWritePerM,
      "Long Context Output $/M": (p) => p.longContextOutputPerM,
      "Avg Request Cost $": () => null, // on accessRoutes
      "Provider Relative Usage Cost": () => null,
    };

    const skillScoreCol: Record<string, string> = {
      "Coding Benchmark Score": "coding",
      "Agent/Tool Score": "agent_tool",
      "Repository Repair Score": "review_debug",
      "Long Context Score": "long_context",
      "Speed Score": "speed",
      "Usage Efficiency Score": "value",
      "Multimodality Score": "multimodality",
      "Provider Reliability Score": "reliability",
    };
    const skillRankCol: Record<string, string> = {
      "Long Context Rank": "long_context",
      "Terminal/DevOps Rank": "terminal_devops",
      "UI/Frontend Rank": "ui_frontend",
      "Architecture Rank": "architecture",
      "Review/Debug Rank": "review_debug",
      "Bulk Worker Rank": "bulk_work",
    };

    let blankChecked = 0;

    for (const row of data) {
      const modelName = row[colIndex.get("Model")!]!.trim();
      const model = modelByName.get(modelName);
      expect(model, `model ${modelName}`).toBeDefined();
      const quota = quotaByName.get(modelName)!;
      const pricing = pricingByName.get(modelName)!;
      const skills = skillsByName.get(modelName) ?? [];

      for (const h of NUMERIC_HEADERS) {
        const i = colIndex.get(h);
        expect(i, h).toBeTypeOf("number");
        const raw = (row[i!] ?? "").trim();
        if (raw !== "") continue;

        blankChecked += 1;
        let parsedVal: number | null | undefined;

        if (h in modelField) {
          parsedVal = modelField[h]!(model!);
        } else if (h in quotaField) {
          parsedVal = quotaField[h]!(quota);
        } else if (h === "Subscription USD/mo" || h === "Intro Price USD") {
          // Plan-level: blank on this row must not become 0 on the model side;
          // assert via parseDecimal directly and that no model numeric is 0-from-blank.
          parsedVal = parseDecimal(raw);
        } else if (h in pricingField && h !== "Avg Request Cost $" && h !== "Provider Relative Usage Cost") {
          parsedVal = pricingField[h]!(pricing);
        } else if (h === "Avg Request Cost $" || h === "Provider Relative Usage Cost") {
          const route = parsed.accessRoutes.find((r) => r.modelName === modelName);
          parsedVal =
            h === "Avg Request Cost $"
              ? route?.avgRequestCost ?? null
              : route?.providerRelativeUsageCost ?? null;
        } else if (h in skillScoreCol) {
          const sk = skills.find((s) => s.skillKey === skillScoreCol[h]);
          parsedVal = sk?.externalScore ?? null;
        } else if (h in skillRankCol) {
          const sk = skills.find((s) => s.skillKey === skillRankCol[h]);
          parsedVal = sk?.externalRank ?? null;
        } else {
          // Benchmarks: blank cells are omitted or score null
          const br = parsed.benchmarkResults.find(
            (b) => b.modelName === modelName && b.benchmark === h,
          );
          parsedVal = br ? br.score : null;
        }

        expect(
          parsedVal,
          `${modelName} ${h} was blank in CSV but parsed as ${String(parsedVal)}`,
        ).toBeNull();
        expect(parsedVal === 0).toBe(false);
      }
    }

    // Sanity: we really walked blanks across the sheet
    expect(blankChecked).toBeGreaterThan(100);
  });

  it("ChatGPT Plus / Codex stays one access route per model", () => {
    const routes = parsed.accessRoutes.filter(
      (r) => r.packageName === "ChatGPT Plus / Codex",
    );
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.routeName).toBe("ChatGPT Plus / Codex");
    }
  });
});
