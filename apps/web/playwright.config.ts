import { defineConfig, devices } from "@playwright/test";
import { playwrightLdPath, playwrightPort } from "./e2e/helpers";
import { applyTestDatabaseEnv } from "./e2e/test-database-url";

/**
 * Bypassed model workflow suite (AUTH_DEV_BYPASS=true).
 * Runs after the auth-boundary suite via package.json test:e2e.
 */
const port = playwrightPort(3110);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const ldPath = playwrightLdPath();
const testDatabaseUrl = applyTestDatabaseEnv();

export default defineConfig({
  testDir: "./e2e",
  testMatch: /models\.spec\.ts|a11y\.spec\.ts|subscriptions\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    // retries=0 → capture on first failure without requiring a retry
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
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE === "1",
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      POSTGRES_DB: "modelmonitor_test",
      AUTH_DEV_BYPASS: "true",
      NODE_ENV: "development",
      LD_LIBRARY_PATH: ldPath,
    },
  },
});
