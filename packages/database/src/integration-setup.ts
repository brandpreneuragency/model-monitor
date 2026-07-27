import { applyTestDatabaseEnv, assertNotProductionDatabase } from "./test-database-url";

// Runs before every database integration test file.
const url = applyTestDatabaseEnv();
assertNotProductionDatabase(url);
