// The color of a wallet or miner: fixed when it is created (its first name, lowercased),
// so a rename keeps it. Only the default participants have a color token.
export const COLOR_KEYS = Object.freeze(['hal', 'dorian', 'laszlo', 'alice', 'bob', 'chris']);

export function colorKeyOf(key) {
  const lower = String(key ?? '').toLowerCase();
  return COLOR_KEYS.includes(lower) ? lower : null;
}

// A CSS color for a color key, or null for a participant without one.
export function colorOf(key) {
  const known = colorKeyOf(key);
  return known ? `var(--${known})` : null;
}
