import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTestDatabaseEnv, assertNotProductionDatabase } from "./test-database-url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const cleanupScript = path.resolve(
  repoRoot,
  "packages/database/src/cleanup-test-models.ts",
);

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

/** Ensure prior fixture residue does not affect seed integrity. Never deletes failure diagnostics. */
export default function globalSetup() {
  const url = applyTestDatabaseEnv();
  assertNotProductionDatabase(url);
  if (url.trim().endsWith("/modelmonitor")) {
    throw new Error("E2E global-setup guard: DATABASE_URL ends with /modelmonitor");
  }
  runDbCleanup("globalSetup");
}
