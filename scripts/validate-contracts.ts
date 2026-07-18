import { readFile } from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';
import YAML from 'yaml';

const main = async () => {
  const [openApiText, hermesText, sql] = await Promise.all([
    readFile(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8'),
    readFile(new URL('../contracts/hermes-catalog.schema.json', import.meta.url), 'utf8'),
    readFile(new URL('../contracts/postgresql-schema.sql', import.meta.url), 'utf8'),
  ]);
  const openApi = YAML.parse(openApiText) as { openapi?: string; paths?: object };
  if (openApi.openapi !== '3.1.0' || !openApi.paths) throw new Error('OpenAPI contract is invalid');
  const schema = JSON.parse(hermesText) as object;
  if (!new Ajv({ strict: false }).compile(schema)) throw new Error('Hermes schema is invalid');
  if ((sql.match(/CREATE TABLE/g) ?? []).length !== 25) throw new Error('Expected 25 tables in SQL contract');
  console.log('Contracts valid: OpenAPI 3.1, Hermes JSON Schema, 25-table PostgreSQL contract.');
};
void main();
