import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readSeed = async <T>(filename: string): Promise<T> => JSON.parse(await readFile(new URL(`../../../data/${filename}`, import.meta.url), 'utf8')) as T;

describe('authoritative seed fixtures', () => {
  it('retain the locked counts and regular monthly cost', async () => {
    const [models, subscriptions, access, benchmarks] = await Promise.all([
      readSeed<Array<{ canonicalId: string }>>('canonical-models.seed.json'),
      readSeed<Array<{ regularPrice: number }>>('subscriptions.seed.json'),
      readSeed<Array<{ modelCanonicalId: string }>>('model-access.seed.json'),
      readSeed<Array<{ Model: string }>>('benchmarks.seed.json'),
    ]);
    expect(new Set(models.map((model) => model.canonicalId)).size).toBe(51);
    expect(subscriptions).toHaveLength(4);
    expect(access).toHaveLength(19);
    expect(benchmarks).toHaveLength(276);
    expect(subscriptions.reduce((total, subscription) => total + subscription.regularPrice, 0)).toBe(61);
  });
});
