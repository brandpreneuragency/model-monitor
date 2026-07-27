import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl, assertNotProductionDatabase } from "./src/test-database-url";

const testDatabaseUrl = resolveTestDatabaseUrl();
assertNotProductionDatabase(testDatabaseUrl);
process.env.DATABASE_URL = testDatabaseUrl;
process.env.POSTGRES_DB = "modelmonitor_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    setupFiles: ["./src/integration-setup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl,
      POSTGRES_DB: "modelmonitor_test",
    },
  },
});
