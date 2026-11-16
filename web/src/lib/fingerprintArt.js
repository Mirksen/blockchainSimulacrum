// A drawn fingerprint for a SHA-256 hash (Basics course, components/basics/Fingerprint.jsx).
// Pure module: the 32 hash bytes decide a hue, a center and 17 dashed, rotated rings.
// Equal hashes give equal drawings; any other hash gives a visibly different one.
// The drawing is decoration on top of the 64 characters, never a replacement for them.

export const RING_COUNT = 17;
// The outline every ring is clipped to, centered at (0, 0).
export const OUTLINE = Object.freeze({ rx: 80, ry: 104 });

function bytesOf(hash) {
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw new RangeError('A fingerprint needs a 64-character hex hash.');
  return Array.from({ length: 32 }, (_, index) => parseInt(hash.slice(index * 2, index * 2 + 2), 16));
}

/**
 * fingerprintOf(hash) -> { hue, cx, cy, rings: [{ rx, ry, rotate, dash, offset, width, ox }] }
 * hue in 0..359; (cx, cy) is the center every ring rotates around; each ring is an
 * ellipse centered at (ox, cy) with a four-part dash pattern.
 */
export function fingerprintOf(hash) {
  const b = bytesOf(hash);
  const hue = ((b[0] << 8) | b[1]) % 360;
  const cx = (b[2] % 15) - 7;
  const cy = (b[3] % 19) - 6;
  const rings = Array.from({ length: RING_COUNT }, (_, i) => {
    const p = b[(4 + 2 * i) % 32];
    const q = b[(5 + 2 * i) % 32];
    const r = b[(7 * i + 11) % 32];
    const rx = 4 + i * 6.1;
    return {
      rx,
      ry: rx * 1.3 + 2,
      rotate: (r % 51) - 25,
      dash: [5 + (p % 30), 2 + (p >> 5) * 1.5, 2 + (q % 20), 2 + (q >> 6) * 2.4],
      offset: (p * 3 + q + i * 17) % 80,
      width: 1.4 + (q % 4) * 0.6,
      ox: cx + ((r >> 4) % 5) - 2
    };
  });
  return { hue, cx, cy, rings };
}
