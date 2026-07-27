import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl, assertNotProductionDatabase } from "./e2e/test-database-url";

const testDatabaseUrl = resolveTestDatabaseUrl();
assertNotProductionDatabase(testDatabaseUrl);
process.env.DATABASE_URL = testDatabaseUrl;
process.env.POSTGRES_DB = "modelmonitor_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./src/test/integration-setup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl,
      POSTGRES_DB: "modelmonitor_test",
    },
  },
});
