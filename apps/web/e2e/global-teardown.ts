import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTestDatabaseEnv, assertNotProductionDatabase } from "./test-database-url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(here, "../../..");
const cleanupScript = path.resolve(
  repoRoot,
  "packages/database/src/cleanup-test-models.ts",
);

function removeGeneratedArtifacts() {
  for (const dir of ["test-results", "playwright-report", "blob-report", "coverage"]) {
    rmSync(path.join(webRoot, dir), { recursive: true, force: true });
  }
}

function runDbCleanup(label: string) {
  const output = execFileSync(
    "pnpm",
    ["--filter", "@model-monitor/database", "exec", "tsx", cleanupScript],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  console.log(`[e2e ${label}] ${output.trim()}`);
}

/**
 * Always clean DB fixtures. Preserve Playwright diagnostics on failure;
 * package.json removes artifacts only after a successful complete e2e chain.
 */
export default async function globalTeardown(_config: { quiet?: boolean } = {}) {
  const url = applyTestDatabaseEnv();
  assertNotProductionDatabase(url);
  runDbCleanup("globalTeardown");
  // Playwright sets process exit differently; only strip artifacts when explicitly requested.
  if (process.env.E2E_CLEAN_ARTIFACTS === "1") {
    removeGeneratedArtifacts();
    console.log("[e2e globalTeardown] removed local Playwright/coverage artifact dirs");
  } else {
    console.log("[e2e globalTeardown] preserved Playwright diagnostics (if any)");
  }
}
