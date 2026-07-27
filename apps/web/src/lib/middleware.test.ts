import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getToken = vi.hoisted(() => vi.fn());
const isDevAuthBypassEnabled = vi.hoisted(() => vi.fn(() => false));

vi.mock("next-auth/jwt", () => ({
  getToken: (args: unknown) => getToken(args) as Promise<unknown>,
}));

vi.mock("@/lib/auth-policy", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./auth-policy");
  return {
    ...actual,
    isDevAuthBypassEnabled: (...args: unknown[]) =>
      (isDevAuthBypassEnabled as unknown as (...a: unknown[]) => boolean)(...args),
  };
});

import { middleware } from "../middleware";

function makeRequest(path: string): NextRequest {
  const url = new URL(path, "http://127.0.0.1:3000");
  return {
    url: url.toString(),
    nextUrl: url,
    headers: new Headers(),
    method: "GET",
  } as unknown as NextRequest;
}

describe("middleware auth boundaries", () => {
  afterEach(() => {
    getToken.mockReset();
    isDevAuthBypassEnabled.mockReset();
    isDevAuthBypassEnabled.mockReturnValue(false);
  });

  it("allows public health without token", async () => {
    getToken.mockResolvedValue(null);
    const res = await middleware(makeRequest("/api/v1/health"));
    expect(res.status).toBe(200);
    expect(getToken).not.toHaveBeenCalled();
  });

  it("returns structured 401 JSON for anonymous protected APIs", async () => {
    getToken.mockResolvedValue(null);
    const res = await middleware(makeRequest("/api/v1/models"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Authentication required");
    expect(typeof body.error.requestId).toBe("string");
  });

  it("redirects anonymous page requests to /login", async () => {
    getToken.mockResolvedValue(null);
    const res = await middleware(makeRequest("/models"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("callbackUrl=%2Fmodels");
  });

  it("uses the configured public origin instead of an internal proxy URL", async () => {
    const previousAuthUrl = process.env.AUTH_URL;
    process.env.AUTH_URL = "https://models.brandpreneur.net";
    getToken.mockResolvedValue(null);

    try {
      const res = await middleware(makeRequest("/models"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        "https://models.brandpreneur.net/login?callbackUrl=%2Fmodels",
      );
    } finally {
      if (previousAuthUrl === undefined) delete process.env.AUTH_URL;
      else process.env.AUTH_URL = previousAuthUrl;
    }
  });

  it("reads the secure Auth.js session cookie for an HTTPS public origin", async () => {
    const previousAuthUrl = process.env.AUTH_URL;
    process.env.AUTH_URL = "https://models.brandpreneur.net";
    getToken.mockResolvedValue(null);

    try {
      await middleware(makeRequest("/models"));
      expect(getToken).toHaveBeenCalledWith(
        expect.objectContaining({ secureCookie: true }),
      );
    } finally {
      if (previousAuthUrl === undefined) delete process.env.AUTH_URL;
      else process.env.AUTH_URL = previousAuthUrl;
    }
  });

  it("allows authenticated requests through", async () => {
    const prev = process.env.ALLOWED_EMAILS;
    process.env.ALLOWED_EMAILS = "a@b.com";
    getToken.mockResolvedValue({ sub: "user-1", email: "a@b.com" });
    try {
      const res = await middleware(makeRequest("/models"));
      expect(res.status).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.ALLOWED_EMAILS;
      else process.env.ALLOWED_EMAILS = prev;
    }
  });

  it("rejects JWT/session for removed allow-list emails", async () => {
    const prev = process.env.ALLOWED_EMAILS;
    process.env.ALLOWED_EMAILS = "owner@example.com";
    getToken.mockResolvedValue({ sub: "user-1", email: "removed@example.com" });
    try {
      const res = await middleware(makeRequest("/api/v1/models"));
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toMatch(/allow-list/i);
    } finally {
      if (prev === undefined) delete process.env.ALLOWED_EMAILS;
      else process.env.ALLOWED_EMAILS = prev;
    }
  });

  it("allows authenticated allow-listed email", async () => {
    const prev = process.env.ALLOWED_EMAILS;
    process.env.ALLOWED_EMAILS = "a@b.com";
    getToken.mockResolvedValue({ sub: "user-1", email: "a@b.com" });
    try {
      const res = await middleware(makeRequest("/models"));
      expect(res.status).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.ALLOWED_EMAILS;
      else process.env.ALLOWED_EMAILS = prev;
    }
  });

  it("honors non-production dev bypass without token", async () => {
    isDevAuthBypassEnabled.mockReturnValue(true);
    getToken.mockResolvedValue(null);
    const res = await middleware(makeRequest("/api/v1/models"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-auth-bypass")).toBe("1");
    expect(getToken).not.toHaveBeenCalled();
  });
});
