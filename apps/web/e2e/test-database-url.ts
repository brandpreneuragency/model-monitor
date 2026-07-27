/** Isolated E2E database — never the live production name. */
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.MODELMONITOR_TEST_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    if (fromEnv.endsWith("/modelmonitor_test")) return fromEnv;
    if (fromEnv.endsWith("/modelmonitor")) {
      return `${fromEnv.slice(0, -"/modelmonitor".length)}/modelmonitor_test`;
    }
    try {
      const u = new URL(fromEnv);
      const path = u.pathname.replace(/\/$/, "") || "";
      if (path === "/modelmonitor") {
        u.pathname = "/modelmonitor_test";
        return u.toString();
      }
      if (path === "/modelmonitor_test") return fromEnv;
    } catch {
      // fall through
    }
  }

  const user = process.env.POSTGRES_USER ?? "modelmonitor";
  const pass = process.env.POSTGRES_PASSWORD ?? user;
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_PORT ?? "5433";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/modelmonitor_test`;
}

export function assertNotProductionDatabase(url: string = process.env.DATABASE_URL ?? ""): void {
  if (url.trim().endsWith("/modelmonitor")) {
    throw new Error(
      "Refusing to run E2E against the production database (DATABASE_URL ends with /modelmonitor). " +
        "Use modelmonitor_test.",
    );
  }
}

export function applyTestDatabaseEnv(): string {
  const url = resolveTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.POSTGRES_DB = "modelmonitor_test";
  assertNotProductionDatabase(url);
  return url;
}
