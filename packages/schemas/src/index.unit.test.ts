import { describe, expect, it } from 'vitest';
import { nullIfBlank, normalize, triStateSchema } from './index.js';

describe('shared normalization', () => {
  it('keeps unknown values null', () => {
    expect(triStateSchema.parse('Not confirmed')).toBeNull();
    expect(triStateSchema.parse('')).toBeNull();
    expect(nullIfBlank('   ')).toBeNull();
  });
  it('normalizes same-model aliases deterministically', () => {
    expect(normalize(' MiMo_V2.5 ')).toBe('mimo-v2.5');
  });
});
