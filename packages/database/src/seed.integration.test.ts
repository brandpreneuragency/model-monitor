import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://model_monitor:model_monitor@localhost:5433/model_monitor';
const client = postgres(databaseUrl, { max: 1 });

describe('seed integrity', () => {
  afterAll(async () => { await client.end(); });

  it('loads the authoritative roster and subscription totals', async () => {
    const [models] = await client<{ count: number }[]>`SELECT count(*)::int AS count FROM models WHERE status = 'active'`;
    const [subscriptions] = await client<{ count: number }[]>`SELECT count(*)::int AS count FROM subscriptions WHERE status = 'active'`;
    const [access] = await client<{ count: number }[]>`SELECT count(*)::int AS count FROM model_access WHERE availability = 'confirmed'`;
    const [benchmarks] = await client<{ count: number }[]>`SELECT count(*)::int AS count FROM model_benchmark_results`;
    const [definitions] = await client<{ count: number }[]>`SELECT count(*)::int AS count FROM benchmarks`;
    const [cost] = await client<{ total: string }[]>`SELECT sum(p.regular_price)::text AS total FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active'`;
    expect(models?.count).toBe(51);
    expect(subscriptions?.count).toBe(4);
    expect(access?.count).toBe(19);
    expect(benchmarks?.count).toBe(276);
    expect(definitions?.count).toBe(127);
    expect(cost?.total).toBe('61.0000');
  });

  it('keeps multiple access paths on one DeepSeek canonical model', async () => {
    const [result] = await client<{ count: number }[]>`SELECT count(*)::int AS count FROM model_access ma JOIN models m ON m.id = ma.model_id WHERE m.canonical_id = 'deepseek/v4-pro'`;
    expect(result?.count).toBe(2);
  });
});
