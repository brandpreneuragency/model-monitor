import { afterEach, describe, expect, it } from "vitest";
import { assertNotProductionDatabase, resolveTestDatabaseUrl } from "./test-database-url";

const original = { database: process.env.DATABASE_URL, explicit: process.env.MODELMONITOR_TEST_DATABASE_URL };

afterEach(() => {
  if (original.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.database;
  if (original.explicit === undefined) delete process.env.MODELMONITOR_TEST_DATABASE_URL; else process.env.MODELMONITOR_TEST_DATABASE_URL = original.explicit;
});

describe("test database URL guard", () => {
  it.each([
    "postgresql://user:pass@localhost/modelmonitor?sslmode=require",
    "postgresql://user:pass@localhost/modelmonitor/",
    "postgresql://user:pass@localhost/modelmonitor%2F",
    "postgresql://user:pass@localhost/other_db",
    "not a url",
  ])("rejects unsafe or malformed URL %s", (url) => expect(() => assertNotProductionDatabase(url)).toThrow());

  it.each([
    "postgresql://user:pass@localhost/modelmonitor_test?sslmode=require",
    "postgresql://user:pass@localhost/modelmonitor_test/",
    "postgresql://user:pass@localhost/modelmonitor%5Ftest?connect_timeout=2",
  ])("accepts exact test URL %s", (url) => expect(() => assertNotProductionDatabase(url)).not.toThrow());

  it("rejects an explicit production override", () => {
    process.env.MODELMONITOR_TEST_DATABASE_URL = "postgresql://user:pass@localhost/modelmonitor?sslmode=require";
    expect(() => resolveTestDatabaseUrl()).toThrow();
  });

  it("fails closed for an arbitrary DATABASE_URL instead of falling back", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/arbitrary";
    delete process.env.MODELMONITOR_TEST_DATABASE_URL;
    expect(() => resolveTestDatabaseUrl()).toThrow();
  });

  it("derives modelmonitor_test from production while preserving options", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/modelmonitor?sslmode=require&connect_timeout=2";
    delete process.env.MODELMONITOR_TEST_DATABASE_URL;
    const resolved = resolveTestDatabaseUrl();
    expect(resolved).toContain("/modelmonitor_test");
    expect(resolved).toContain("sslmode=require");
    expect(resolved).toContain("connect_timeout=2");
    expect(() => assertNotProductionDatabase(resolved)).not.toThrow();
  });
});
