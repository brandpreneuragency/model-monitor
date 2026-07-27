import { describe, expect, it } from "vitest";
import {
  isDevAuthBypassEnabled,
  isEmailAllowed,
  isPublicPath,
  parseAllowedEmails,
  safeCallbackUrl,
} from "./auth-policy";

describe("parseAllowedEmails", () => {
  it("splits, trims, and lowercases", () => {
    expect(parseAllowedEmails(" Alice@Example.com, bob@test.com ")).toEqual([
      "alice@example.com",
      "bob@test.com",
    ]);
  });

  it("returns empty list for missing input", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails("")).toEqual([]);
  });
});

describe("isDevAuthBypassEnabled", () => {
  it("allows bypass only when flag is true and env is development", () => {
    expect(
      isDevAuthBypassEnabled({ nodeEnv: "development", authDevBypass: "true" }),
    ).toBe(true);
  });

  it("allows bypass in test", () => {
    expect(isDevAuthBypassEnabled({ nodeEnv: "test", authDevBypass: "true" })).toBe(
      true,
    );
  });

  it("denies bypass in production even when AUTH_DEV_BYPASS=true", () => {
    expect(
      isDevAuthBypassEnabled({ nodeEnv: "production", authDevBypass: "true" }),
    ).toBe(false);
  });

  it("denies when flag is not exactly true", () => {
    expect(
      isDevAuthBypassEnabled({ nodeEnv: "development", authDevBypass: "1" }),
    ).toBe(false);
    expect(
      isDevAuthBypassEnabled({ nodeEnv: "development", authDevBypass: "TRUE" }),
    ).toBe(false);
    expect(
      isDevAuthBypassEnabled({ nodeEnv: "development", authDevBypass: undefined }),
    ).toBe(false);
  });
});

describe("isEmailAllowed", () => {
  it("denies missing email", () => {
    expect(
      isEmailAllowed(null, { allowedEmails: ["a@b.com"], devBypass: false }),
    ).toBe(false);
  });

  it("denies when allow-list is empty and bypass is off", () => {
    expect(
      isEmailAllowed("a@b.com", { allowedEmails: [], devBypass: false }),
    ).toBe(false);
  });

  it("allows only listed emails", () => {
    expect(
      isEmailAllowed("a@b.com", {
        allowedEmails: ["a@b.com"],
        devBypass: false,
      }),
    ).toBe(true);
    expect(
      isEmailAllowed("other@b.com", {
        allowedEmails: ["a@b.com"],
        devBypass: false,
      }),
    ).toBe(false);
  });

  it("allows any email when non-production dev bypass is enabled", () => {
    expect(
      isEmailAllowed("anyone@example.com", {
        allowedEmails: [],
        devBypass: true,
        nodeEnv: "development",
      }),
    ).toBe(true);
  });

  it("never honors bypass in production", () => {
    expect(
      isEmailAllowed("anyone@example.com", {
        allowedEmails: [],
        devBypass: true,
        nodeEnv: "production",
      }),
    ).toBe(false);
    expect(
      isEmailAllowed("allowed@example.com", {
        allowedEmails: ["allowed@example.com"],
        devBypass: true,
        nodeEnv: "production",
      }),
    ).toBe(true);
  });
});

describe("isPublicPath", () => {
  it("allows login, auth, health, and real Next static/image assets", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/signin")).toBe(true);
    expect(isPublicPath("/api/auth/callback/google")).toBe(true);
    expect(isPublicPath("/api/v1/health")).toBe(true);
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicPath("/_next/image")).toBe(true);
    expect(isPublicPath("/favicon.ico")).toBe(true);
  });

  it("protects app pages and JSON APIs", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/models")).toBe(false);
    expect(isPublicPath("/api/v1/models")).toBe(false);
    expect(isPublicPath("/api/v1/developers")).toBe(false);
  });

  it("does not treat arbitrary protected paths or non-static /_next routes as public", () => {
    expect(isPublicPath("/api/v1/private.js")).toBe(false);
    expect(isPublicPath("/api/v1/models.css")).toBe(false);
    expect(isPublicPath("/models/secret.txt")).toBe(false);
    expect(isPublicPath("/dashboard/app.js")).toBe(false);
    expect(isPublicPath("/secret.txt")).toBe(false);
    expect(isPublicPath("/logo.png")).toBe(false);
    expect(isPublicPath("/_next/data/build/page.json")).toBe(false);
    expect(isPublicPath("/_next/anything-else")).toBe(false);
    expect(isPublicPath("/_next/image-private")).toBe(false);
    expect(isPublicPath("/_next/image/private")).toBe(false);
    expect(isPublicPath("/_next/staticx/private")).toBe(false);
    expect(isPublicPath("/favicon.ico/private")).toBe(false);
    expect(isPublicPath("/api/auth/../v1/models.js")).toBe(false);
  });
});

describe("safeCallbackUrl", () => {
  it("allows plain relative paths", () => {
    expect(safeCallbackUrl("/models")).toBe("/models");
    expect(safeCallbackUrl("/models?x=1")).toBe("/models?x=1");
  });

  it("rejects protocol-relative, backslashes, controls, and encoded separators", () => {
    expect(safeCallbackUrl("//evil.example")).toBe("/models");
    expect(safeCallbackUrl("/\\evil")).toBe("/models");
    expect(safeCallbackUrl("/models\n/x")).toBe("/models");
    expect(safeCallbackUrl("/%2f%2fevil.example")).toBe("/models");
    expect(safeCallbackUrl("%252f%252fevil.example")).toBe("/models");
    expect(safeCallbackUrl("https://evil.example")).toBe("/models");
    expect(safeCallbackUrl("/login?next=/models")).toBe("/models");
  });
});

describe("middleware matcher anchoring", () => {
  it("uses exported matcher and does not exclude lookalike private prefixes", async () => {
    const { config } = await import("../middleware");
    const matcher = config.matcher[0];
    expect(typeof matcher).toBe("string");
    // Next matcher patterns are path-to-regexp style; convert negative-lookahead form.
    const re = new RegExp(`^${matcher}$`);
    // Paths that must be matched (i.e. enter middleware / auth):
    expect(re.test("/_next/image/private")).toBe(true);
    expect(re.test("/_next/image-private")).toBe(true);
    expect(re.test("/_next/staticx/private")).toBe(true);
    expect(re.test("/favicon.ico/private")).toBe(true);
    expect(re.test("/models")).toBe(true);
    // Real framework assets may be excluded by negative lookahead:
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/_next/image")).toBe(false);
    expect(re.test("/favicon.ico")).toBe(false);
  });
});
