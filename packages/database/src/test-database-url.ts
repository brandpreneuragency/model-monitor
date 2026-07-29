/**
 * Resolve the isolated integration/E2E database URL.
 * Never defaults to the production database name `modelmonitor`.
 */
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.MODELMONITOR_TEST_DATABASE_URL?.trim();
  if (explicit) {
    assertNotProductionDatabase(explicit);
    return explicit;
  }

  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    try {
      const u = new URL(fromEnv);
      const database = databaseName(u);
      if (database === "modelmonitor") {
        u.pathname = "/modelmonitor_test";
      } else if (database !== "modelmonitor_test") {
        throw new Error("Refusing to run tests against an unexpected database name. Use modelmonitor_test.");
      }
      const resolved = u.toString();
      assertNotProductionDatabase(resolved);
      return resolved;
    } catch (error) {
      if (error instanceof Error && error.message.includes("unexpected database")) throw error;
      throw new Error("Refusing to run tests with an invalid database URL. Use a valid modelmonitor_test URL.");
    }
  }

  const user = process.env.POSTGRES_USER ?? "modelmonitor";
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_PORT ?? "5433";
  const resolved = `postgresql://${encodeURIComponent(user)}:***@${host}:${port}/modelmonitor_test`;
  assertNotProductionDatabase(resolved);
  return resolved;
}

function databaseName(url: URL): string {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error("Invalid encoded database URL path");
  }
  const normalized = decodedPath.replace(/\/+$/, "");
  if (!normalized.startsWith("/") || normalized.length <= 1 || normalized.includes("/", 1)) {
    throw new Error("Database URL must contain exactly one database path segment");
  }
  return normalized.slice(1);
}

/** Throw unless a URL targets exactly the isolated test database name. */
export function assertNotProductionDatabase(url: string = process.env.DATABASE_URL ?? ""): void {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("unsupported protocol");
    if (databaseName(parsed) !== "modelmonitor_test") {
      throw new Error("Refusing to run tests against a non-test database. Use modelmonitor_test.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("non-test database")) throw error;
    throw new Error("Refusing to run tests with an invalid database URL. Use a valid modelmonitor_test URL.");
  }
}

/** Apply test DB URL to process.env and guard against production. */
export function applyTestDatabaseEnv(): string {
  const url = resolveTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.POSTGRES_DB = "modelmonitor_test";
  assertNotProductionDatabase(url);
  return url;
}
