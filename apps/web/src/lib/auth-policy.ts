/** Parse comma-separated allow-list into normalized emails. */
export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Dev/E2E auth bypass is allowed only outside production.
 * Even if AUTH_DEV_BYPASS=true, production must deny bypass.
 */
export function isDevAuthBypassEnabled(
  env: {
    nodeEnv?: string | undefined;
    authDevBypass?: string | undefined;
  } = {},
): boolean {
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV;
  const flag = env.authDevBypass ?? process.env.AUTH_DEV_BYPASS;
  if (flag !== "true") return false;
  if (nodeEnv === "production") return false;
  return nodeEnv === "development" || nodeEnv === "test";
}

/**
 * Decide whether a sign-in email is permitted.
 * - empty allow-list denies by default (unless non-production bypass)
 * - production never honors AUTH_DEV_BYPASS
 */
export function isEmailAllowed(
  email: string | null | undefined,
  options: {
    allowedEmails: string[];
    devBypass: boolean;
    nodeEnv?: string;
  },
): boolean {
  if (!email) return false;
  const bypass =
    options.devBypass &&
    isDevAuthBypassEnabled({
      nodeEnv: options.nodeEnv ?? process.env.NODE_ENV,
      authDevBypass: options.devBypass ? "true" : "false",
    });
  if (bypass) return true;
  if (options.allowedEmails.length === 0) return false;
  return options.allowedEmails.includes(email.toLowerCase());
}

/** Collapse . and .. segments so /api/auth/../v1/... cannot bypass checks. */
function normalizePathname(pathname: string): string {
  try {
    return new URL(pathname, "http://local.invalid").pathname;
  } catch {
    return pathname;
  }
}

/**
 * Explicit narrow public allow-list.
 * - auth/login/health only for app routes
 * - Next framework static/image asset prefixes only (not arbitrary /_next/*)
 * - favicon only at root
 */
export function isPublicPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === "/login") return true;
  if (path.startsWith("/api/auth/") || path === "/api/auth") return true;
  if (path === "/api/v1/health") return true;
  if (path === "/favicon.ico") return true;
  if (path.startsWith("/_next/static/")) return true;
  // Exact image optimizer path only (query string is not part of pathname).
  if (path === "/_next/image") return true;
  return false;
}

/**
 * Only allow same-origin relative callback paths.
 * Rejects protocol-relative, backslashes, controls, encoded separators, and auth loops.
 */
export function safeCallbackUrl(raw: string | null | undefined, fallback = "/models"): string {
  if (!raw) return fallback;
  if (typeof raw !== "string") return fallback;

  const hasUnsafeChars = (value: string): boolean => {
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code <= 0x1f || code === 0x7f || value[i] === "\\") return true;
    }
    return false;
  };

  // Reject controls and backslashes before any decoding ambiguity.
  if (hasUnsafeChars(raw)) return fallback;
  let value = raw.trim();
  if (!value) return fallback;
  // Decode repeatedly to catch double-encoded separators.
  try {
    let decoded = value;
    for (let i = 0; i < 3; i += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      if (hasUnsafeChars(next)) return fallback;
      if (next.includes("://")) return fallback;
      decoded = next;
    }
    value = decoded;
  } catch {
    return fallback;
  }
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/login")) return fallback;
  // Collapse dot segments via URL parser on a fixed origin.
  try {
    const normalized = new URL(value, "http://local.invalid");
    if (normalized.origin !== "http://local.invalid") return fallback;
    if (normalized.username || normalized.password) return fallback;
    const path = normalized.pathname + normalized.search + normalized.hash;
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    if (path.startsWith("/login")) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
