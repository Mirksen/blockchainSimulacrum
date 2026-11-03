import { describe, expect, it } from 'vitest';
import { COLOR_KEYS, colorKeyOf, colorOf } from '../components/workbench/minerColors';

describe('minerColors', () => {
  it('knows the default miners and wallets and the spare miner color', () => {
    expect(COLOR_KEYS).toEqual(['hal', 'dorian', 'laszlo', 'spare', 'alice', 'bob', 'chris']);
  });

  it('maps a known key regardless of letter case to its color token', () => {
    expect(colorKeyOf('Laszlo')).toBe('laszlo');
    expect(colorOf('DORIAN')).toBe('var(--dorian)');
    expect(colorOf('hal')).toBe('var(--hal)');
  });

  it('has no color for other names', () => {
    expect(colorKeyOf('Quill')).toBeNull();
    expect(colorOf('Quill')).toBeNull();
    expect(colorOf(undefined)).toBeNull();
    expect(colorOf(null)).toBeNull();
  });
});
