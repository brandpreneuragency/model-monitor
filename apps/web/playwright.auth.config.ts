import { defineConfig, devices } from "@playwright/test";
import { playwrightLdPath, playwrightPort } from "./e2e/helpers";
import { applyTestDatabaseEnv } from "./e2e/test-database-url";

/**
 * Anonymous auth-boundary suite with AUTH_DEV_BYPASS=false.
 * Separate server lifetime from the bypassed workflow suite.
 */
const port = playwrightPort(3111);
const baseURL = process.env.PLAYWRIGHT_AUTH_BASE_URL ?? `http://127.0.0.1:${port}`;
const ldPath = playwrightLdPath();
const testDatabaseUrl = applyTestDatabaseEnv();

export default defineConfig({
  testDir: "./e2e",
  testMatch: /auth-boundary\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        POSTGRES_DB: "modelmonitor_test",
        LD_LIBRARY_PATH: ldPath,
      },
    },
  },
  projects: [
    {
      name: "chromium-auth",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      POSTGRES_DB: "modelmonitor_test",
      AUTH_DEV_BYPASS: "false",
      NODE_ENV: "development",
      LD_LIBRARY_PATH: ldPath,
    },
  },
});
