// The name a visitor mines under until they choose their own: insider nods from Bitcoin's
// history, with a number so strangers rarely share one. Same rule as any name: 3–20 letters,
// digits or hyphens, so a base stays at 16 characters at most. Names are refused or allowed by
// the server: digits fold to letters there, so a rare number is refused and the browser draws
// again. server/test/miner-names.test.js keeps that rare.

export const MINER_NAME_BASES = Object.freeze([
  'Not-Satoshi', 'Hal-Finney', 'Adam-Back', 'Nick-Szabo', 'Wei-Dai', 'Pizza-Laszlo', 'Two-Pizzas', 'Hodl-Gang',
  'Cypherpunk', 'Block-Zero', 'Block-170', 'Chancellor', 'Hashcash-Fan', 'Nonce-Hunter', 'Sat-Stacker', 'Mempool-Diver',
  'Orange-Pill', 'Few-Understand', 'Tick-Tock', 'Halving-Baby',
]);
const MAX_NUMBER = 999;

export function generateMinerName(random = Math.random) {
  const base = MINER_NAME_BASES[Math.floor(random() * MINER_NAME_BASES.length)];
  return `${base}-${1 + Math.floor(random() * MAX_NUMBER)}`;
}

export function isGeneratedName(name) {
  const match = /^(.+)-(\d{1,3})$/.exec(name ?? '');
  return Boolean(match) && MINER_NAME_BASES.includes(match[1]) && Number(match[2]) >= 1;
}
