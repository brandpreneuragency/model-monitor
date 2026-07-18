import { readFile } from 'node:fs/promises';
import { sql } from './client.js';

const migrationName = '0000_contract_v1_1';
const migrationTable = await sql<{ applied: boolean }[]>`
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'drizzle_migrations') AS applied
`;
const applied = migrationTable[0]?.applied ?? false;
if (!applied) await sql.unsafe('CREATE TABLE drizzle_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
const existing = await sql<{ name: string }[]>`SELECT name FROM drizzle_migrations WHERE name = ${migrationName}`;
if (existing.length === 0) {
  const contract = await readFile(new URL('../../../contracts/postgresql-schema.sql', import.meta.url), 'utf8');
  await sql.begin(async (transaction) => {
    await transaction.unsafe(contract);
    await transaction`INSERT INTO drizzle_migrations (name) VALUES (${migrationName})`;
  });
  console.log(`Applied ${migrationName}.`);
} else console.log(`${migrationName} already applied.`);
await sql.end();
