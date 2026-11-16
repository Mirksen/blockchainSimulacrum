import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fingerprintOf, OUTLINE, RING_COUNT } from '../lib/fingerprintArt';

const digest = text => createHash('sha256').update(text).digest('hex');

describe('fingerprintOf', () => {
  it('is deterministic: the same hash always gives the same drawing', () => {
    const hash = digest('Alice pays Bob 10');
    expect(fingerprintOf(hash)).toEqual(fingerprintOf(hash));
  });

  it('draws 17 rings inside the outline', () => {
    const art = fingerprintOf(digest('abc'));
    expect(RING_COUNT).toBe(17);
    expect(art.rings).toHaveLength(17);
    expect(OUTLINE).toEqual({ rx: 80, ry: 104 });
    for (const ring of art.rings) {
      expect(ring.dash).toHaveLength(4);
      expect(ring.rotate).toBeGreaterThanOrEqual(-25);
      expect(ring.rotate).toBeLessThanOrEqual(25);
      expect(ring.offset).toBeGreaterThanOrEqual(0);
      expect(ring.offset).toBeLessThan(80);
      expect(Math.abs(ring.ox - art.cx)).toBeLessThanOrEqual(2);
    }
  });

  it('follows the byte recipe for a known hash', () => {
    // SHA-256("abc") = ba 78 16 bf 8f 01 cf ea 41 41 40 de …
    const hash = digest('abc');
    const art = fingerprintOf(hash);
    expect(art.hue).toBe(((0xba << 8) | 0x78) % 360);
    expect(art.cx).toBe((0x16 % 15) - 7);
    expect(art.cy).toBe((0xbf % 19) - 6);
    // Ring 0: p = b[4] = 0x8f, q = b[5] = 0x01, r = b[11] = 0xde.
    expect(art.rings[0]).toEqual({
      rx: 4, ry: 4 * 1.3 + 2, rotate: (0xde % 51) - 25,
      dash: [5 + (0x8f % 30), 2 + (0x8f >> 5) * 1.5, 2 + (0x01 % 20), 2 + (0x01 >> 6) * 2.4],
      offset: (0x8f * 3 + 0x01) % 80, width: 1.4 + (0x01 % 4) * 0.6, ox: art.cx + ((0xde >> 4) % 5) - 2
    });
    expect(art.rings[16].rx).toBeCloseTo(4 + 16 * 6.1);
  });

  it('gives different hashes different drawings', () => {
    const drawings = ['Alice pays Bob 10', 'Alice pays Bob 11', 'alice pays Bob 10', 'Learner A']
      .map(text => JSON.stringify(fingerprintOf(digest(text))));
    expect(new Set(drawings).size).toBe(drawings.length);
  });

  it('rejects anything but a 64-character hex hash', () => {
    expect(() => fingerprintOf('abc')).toThrow(RangeError);
    expect(() => fingerprintOf('G'.repeat(64))).toThrow(RangeError);
  });
});
