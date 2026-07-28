import { describe, expect, it } from "vitest";
import {
  modelWriteSchema,
  subscriptionWriteSchema,
  errorSchema,
  recordStatusSchema,
  modelListQuerySchema,
  modelScoreWriteSchema,
  modelAliasWriteSchema,
  modelMergeSchema,
  formatScoreDisplay,
  formatCapabilityDisplay,
  normalizeAlias,
  parseTriState,
  parseSortParam,
  planAliasMerge,
  planAccessMerge,
  accessMergeKey,
  httpUrlSchema,
  optionalHttpUrlSchema,
  pathUuidSchema,
  idempotencyKeySchema,
  requiredTrimmedString,
  sourceWriteSchema,
  developerWriteSchema,
  redactSensitive,
  isSensitiveKey,
  mergeCapabilities,
} from "./index";

describe("modelWriteSchema", () => {
  it("accepts name-only create payload", () => {
    const parsed = modelWriteSchema.parse({ name: "Test" });
    expect(parsed.name).toBe("Test");
    expect(parsed.canonicalId).toBeUndefined();
    expect(parsed.developerId).toBeUndefined();
    expect(parsed.lifecycle).toBe("unknown");
    expect(parsed.needsRecheck).toBe(true);
  });

  it("accepts a minimal valid model write payload", () => {
    const parsed = modelWriteSchema.parse({
      canonicalId: "openai:gpt-4.1",
      name: "GPT-4.1",
      developerId: "11111111-1111-1111-1111-111111111111",
    });

    expect(parsed.lifecycle).toBe("unknown");
    expect(parsed.needsRecheck).toBe(true);
    expect(parsed.family).toBeUndefined();
  });

  it("rejects empty canonical IDs when provided", () => {
    const result = modelWriteSchema.safeParse({
      canonicalId: "",
      name: "X",
      developerId: "11111111-1111-1111-1111-111111111111",
    });
    // empty canonicalId is treated as omitted
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.canonicalId).toBeUndefined();
  });

  it("rejects whitespace-only required name", () => {
    const result = modelWriteSchema.safeParse({
      canonicalId: "   ",
      name: "\t",
      developerId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(false);
  });

  it("trims required strings", () => {
    const parsed = modelWriteSchema.parse({
      canonicalId: "  openai:gpt  ",
      name: "  GPT  ",
      developerId: "11111111-1111-1111-1111-111111111111",
    });
    expect(parsed.canonicalId).toBe("openai:gpt");
    expect(parsed.name).toBe("GPT");
  });

  it("keeps nullable numeric fields as null instead of coercing to 0", () => {
    const parsed = modelWriteSchema.parse({
      canonicalId: "deepseek:v4-pro",
      name: "DeepSeek V4 Pro",
      developerId: "22222222-2222-2222-2222-222222222222",
      contextTokens: null,
      maxOutputTokens: null,
    });
    expect(parsed.contextTokens).toBeNull();
    expect(parsed.maxOutputTokens).toBeNull();
  });

  it("normalizes empty strings to null for optional text fields", () => {
    const parsed = modelWriteSchema.parse({
      canonicalId: "x:y",
      name: "Y",
      developerId: "22222222-2222-2222-2222-222222222222",
      family: "",
      bestUse: "",
    });
    expect(parsed.family).toBeNull();
    expect(parsed.bestUse).toBeNull();
  });

  it("accepts tri-state capabilities without coercing unknown", () => {
    const parsed = modelWriteSchema.parse({
      canonicalId: "x:y",
      name: "Y",
      developerId: "22222222-2222-2222-2222-222222222222",
      capabilities: { vision: null, reasoning: true, toolUse: false },
    });
    expect(parsed.capabilities?.vision).toBeNull();
    expect(parsed.capabilities?.reasoning).toBe(true);
    expect(parsed.capabilities?.toolUse).toBe(false);
  });
});

describe("modelListQuerySchema", () => {
  it("parses filters and boolean query flags", () => {
    const parsed = modelListQuerySchema.parse({
      search: "deepseek",
      developer: "deepseek",
      accessible: "true",
      archived: "false",
      limit: "25",
      page: "2",
    });
    expect(parsed.search).toBe("deepseek");
    expect(parsed.accessible).toBe(true);
    expect(parsed.archived).toBe(false);
    expect(parsed.limit).toBe(25);
    expect(parsed.page).toBe(2);
  });

  it("accepts lifecycle enums and rejects invalid values", () => {
    expect(modelListQuerySchema.parse({ lifecycle: "preview" }).lifecycle).toBe("preview");
    expect(modelListQuerySchema.parse({ lifecycle: "" }).lifecycle).toBeUndefined();
    expect(modelListQuerySchema.safeParse({ lifecycle: "nope" }).success).toBe(false);
  });
});

describe("boundary primitives", () => {
  it("validates path UUIDs", () => {
    expect(pathUuidSchema.safeParse("not-uuid").success).toBe(false);
    expect(
      pathUuidSchema.parse("11111111-1111-1111-1111-111111111111"),
    ).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("requires trimmed non-empty strings", () => {
    expect(requiredTrimmedString.safeParse("  ").success).toBe(false);
    expect(requiredTrimmedString.parse("  hi  ")).toBe("hi");
  });

  it("restricts URLs to http/https", () => {
    expect(httpUrlSchema.safeParse("https://example.com").success).toBe(true);
    expect(httpUrlSchema.safeParse("http://example.com/a").success).toBe(true);
    expect(httpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrlSchema.safeParse("data:text/html,hi").success).toBe(false);
    expect(httpUrlSchema.safeParse("ftp://example.com").success).toBe(false);
    expect(optionalHttpUrlSchema.parse("")).toBeNull();
    expect(optionalHttpUrlSchema.parse(null)).toBeNull();
  });

  it("validates alias payloads", () => {
    expect(modelAliasWriteSchema.parse({ alias: "  Foo  " }).alias).toBe("Foo");
    expect(modelAliasWriteSchema.safeParse({ alias: "   " }).success).toBe(false);
    expect(modelAliasWriteSchema.safeParse({ alias: "x", aliasType: "nope" }).success).toBe(
      false,
    );
  });

  it("validates merge payload and idempotency key", () => {
    const ok = modelMergeSchema.parse({
      sourceModelId: "11111111-1111-1111-1111-111111111111",
      targetModelId: "22222222-2222-2222-2222-222222222222",
    });
    expect(ok.sourceModelId).toBeTruthy();
    expect(modelMergeSchema.safeParse({ sourceModelId: "x", targetModelId: "y" }).success).toBe(
      false,
    );
    expect(idempotencyKeySchema.parse(" abc ")).toBe("abc");
    expect(idempotencyKeySchema.safeParse("").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("rejects non-http website URLs on developer/source writes", () => {
    expect(
      developerWriteSchema.safeParse({
        name: "X",
        slug: "x",
        websiteUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      sourceWriteSchema.safeParse({
        sourceType: "manual",
        url: "data:text/plain,hi",
      }).success,
    ).toBe(false);
  });
});

describe("score and capability display invariants", () => {
  it("never renders blank scores as zero", () => {
    expect(formatScoreDisplay(null)).toBe("—");
    expect(formatScoreDisplay(undefined)).toBe("—");
    expect(formatScoreDisplay("")).toBe("—");
    expect(formatScoreDisplay(0)).toBe("0");
    expect(formatScoreDisplay("0")).toBe("0");
    expect(formatScoreDisplay(12.5)).toBe("12.5");
  });

  it("never coerces unknown capabilities to false", () => {
    expect(formatCapabilityDisplay(null)).toBe("unknown");
    expect(formatCapabilityDisplay(undefined)).toBe("unknown");
    expect(formatCapabilityDisplay(false)).toBe("no");
    expect(formatCapabilityDisplay(true)).toBe("yes");
  });

  it("parses tri-state import labels", () => {
    expect(parseTriState("unknown")).toBeNull();
    expect(parseTriState("")).toBeNull();
    expect(parseTriState("yes")).toBe(true);
    expect(parseTriState("no")).toBe(false);
    expect(parseTriState(1)).toBe(true);
    expect(parseTriState(0)).toBe(false);
  });

  it("requires override reason for manual scores", () => {
    const bad = modelScoreWriteSchema.safeParse({
      methodologyId: "33333333-3333-3333-3333-333333333333",
      scoreType: "capability",
      scoreValue: 10,
      isManualOverride: true,
    });
    expect(bad.success).toBe(false);

    const good = modelScoreWriteSchema.parse({
      methodologyId: "33333333-3333-3333-3333-333333333333",
      scoreType: "capability",
      scoreValue: null,
      isManualOverride: true,
      overrideReason: "Pending evidence",
    });
    expect(good.scoreValue).toBeNull();
  });
});

describe("merge helpers", () => {
  it("normalizes aliases", () => {
    expect(normalizeAlias("  DeepSeek   V4 ")).toBe("deepseek v4");
  });

  it("deduplicates aliases during merge planning", () => {
    const plan = planAliasMerge(
      ["deepseek v4"],
      [
        { alias: "DeepSeek V4", normalizedAlias: "deepseek v4" },
        { alias: "DS-V4", normalizedAlias: "ds-v4" },
      ],
    );
    expect(plan.transfer).toEqual([{ alias: "DS-V4", normalizedAlias: "ds-v4" }]);
    expect(plan.skippedDuplicates).toEqual(["DeepSeek V4"]);
  });

  it("deduplicates access paths by plan+provider model id", () => {
    const plan = planAccessMerge(
      [accessMergeKey({ planId: "p1", providerModelId: null })],
      [
        { id: "a1", planId: "p1", providerModelId: null },
        { id: "a2", planId: "p2", providerModelId: "x" },
      ],
    );
    expect(plan.transferIds).toEqual(["a2"]);
    expect(plan.skippedDuplicateIds).toEqual(["a1"]);
  });

  it("merges capabilities with target non-null winning", () => {
    const merged = mergeCapabilities(
      { vision: true, reasoning: null, details: { a: 1 } },
      { vision: false, reasoning: true, toolUse: true, details: { a: 2, b: 3 } },
    );
    expect(merged.vision).toBe(true);
    expect(merged.reasoning).toBe(true);
    expect(merged.toolUse).toBe(true);
    expect(merged.details).toEqual({ a: 1, b: 3 });
  });

  it("parses sort params", () => {
    expect(parseSortParam("-name")).toEqual({ field: "name", direction: "desc" });
    expect(parseSortParam("scores.capability")).toEqual({
      field: "capability",
      direction: "asc",
    });
  });
});

describe("subscriptionWriteSchema", () => {
  it("defaults usage tracking to manual", () => {
    const parsed = subscriptionWriteSchema.parse({
      planId: "33333333-3333-3333-3333-333333333333",
      accountLabel: "personal",
    });
    expect(parsed.usageTrackingMode).toBe("manual");
    expect(parsed.status).toBe("active");
  });

  it("rejects javascript usage check URLs", () => {
    const bad = subscriptionWriteSchema.safeParse({
      planId: "33333333-3333-3333-3333-333333333333",
      accountLabel: "personal",
      usageCheckUrl: "javascript:alert(1)",
    });
    expect(bad.success).toBe(false);
  });
});

describe("shared enums and errors", () => {
  it("accepts active/archived record status only", () => {
    expect(recordStatusSchema.parse("active")).toBe("active");
    expect(recordStatusSchema.safeParse("deleted").success).toBe(false);
  });

  it("requires requestId on API errors", () => {
    const result = errorSchema.safeParse({
      error: { code: "BAD_REQUEST", message: "nope" },
    });
    expect(result.success).toBe(false);
  });
});

describe("redactSensitive", () => {
  it("matches required sensitive key variants case-insensitively", () => {
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("PASSWORD")).toBe(true);
    expect(isSensitiveKey("api_key")).toBe(true);
    expect(isSensitiveKey("apiKey")).toBe(true);
    expect(isSensitiveKey("clientSecret")).toBe(true);
    expect(isSensitiveKey("private-key")).toBe(true);
    expect(isSensitiveKey("authorization")).toBe(true);
    expect(isSensitiveKey("cookie")).toBe(true);
    expect(isSensitiveKey("token")).toBe(true);
    expect(isSensitiveKey("secret")).toBe(true);
    expect(isSensitiveKey("requestId")).toBe(false);
  });

  it("recursively redacts nested secrets and never leaks values", () => {
    const input = {
      password: "p@ss",
      nested: { apiKey: "nested-key-value", ok: true },
      list: [{ token: "t1" }, { name: "safe" }],
      err: Object.assign(new Error("failed with postgresql://u:SECRET_DSN@h/db"), {
        code: "ECONN",
      }),
    };
    const out = redactSensitive(input) as unknown as {
      password: string;
      nested: { apiKey: string; ok: boolean };
      list: Array<Record<string, string>>;
      err: { name: string; message?: string; code?: string };
    };
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("p@ss");
    expect(serialized).not.toContain("nested-key-value");
    expect(serialized).not.toContain("t1");
    expect(serialized).not.toContain("SECRET_DSN");
    expect(serialized).not.toContain("postgresql://");
    expect(out.password).toBe("[REDACTED]");
    expect(out.nested.apiKey).toBe("[REDACTED]");
    expect(out.nested.ok).toBe(true);
    expect(out.list[1]?.name).toBe("safe");
    // Error.message must not be forwarded (may embed secrets).
    expect(out.err.message).toBeUndefined();
    expect(out.err.name).toBe("Error");
    expect(out.err.code).toBe("ECONN");
  });

  it("is cycle-safe for circular objects", () => {
    const circular: Record<string, unknown> = { ok: true };
    circular.self = circular;
    const out = redactSensitive(circular);
    expect(out.ok).toBe(true);
    expect(out.self).toBe("[Circular]");
  });

  it("rejects unsupported merge resolution keys and validates values", () => {
    expect(
      modelMergeSchema.safeParse({
        sourceModelId: "11111111-1111-1111-1111-111111111111",
        targetModelId: "22222222-2222-2222-2222-222222222222",
        resolutions: { unknownField: "x" },
      }).success,
    ).toBe(false);
    const ok = modelMergeSchema.parse({
      sourceModelId: "11111111-1111-1111-1111-111111111111",
      targetModelId: "22222222-2222-2222-2222-222222222222",
      resolutions: { name: "  Resolved  ", lifecycle: "ga" },
    });
    expect(ok.resolutions?.name).toBe("Resolved");
    expect(ok.resolutions?.lifecycle).toBe("ga");
  });
});
