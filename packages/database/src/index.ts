import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index";

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  const user = process.env.POSTGRES_USER ?? "modelmonitor";
  const pass = process.env.POSTGRES_PASSWORD ?? user;
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_PORT ?? "5433";
  const database = process.env.POSTGRES_DB ?? "modelmonitor";
  return ["postgresql://", user, ":", pass, "@", host, ":", port, "/", database].join("");
}

const client = postgres(resolveDatabaseUrl(), { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
export type Database = typeof db;

export * from "./services/models";
export * from "./services/idempotency";
export * from "./services/access";
export * from "./services/usage";
export * from "./services/plans";
export * from "./services/subscriptions";
export * from "./services/imports";
export * from "./services/admin";
export * from "./services/users";
export * from "./services/rankings";
export * from "./services/tags-views";
export { cleanupTestModels } from "./cleanup-test-models";
