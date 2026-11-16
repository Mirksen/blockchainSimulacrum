import { createHasher } from './powSearch';
import { textHash, textTargetMet } from './textHash';

// Sealed pages (Basics course, scene "Sealed pages"): a three-page notebook in which
// each page's seal is the SHA-256 of the seal before it, its text and its lucky number.
// Pure module: no React, no DOM. A page is { text, number, previous, seal }, where
// `previous` and `seal` are the values stored when the page was last sealed.
//
// With Guessing off (zeros 0) any lucky number gives a fitting seal, so sealing costs
// exactly one hash. With zeros > 0 the seal must also start with that many zeros, so
// sealing tries numbers 0, 1, 2… until one fits: the work.

export const PAGE_TEXTS = Object.freeze(['Alice pays Bob 10', 'Bob pays Carol 4', 'Carol pays Dave 2']);
// What page 1 builds on: there is no seal before it.
export const START_SEAL = '0'.repeat(64);
export const GUESSING = Object.freeze([0, 2, 3]);
// A safety stop far above the average (16^3 = 4,096 tries for three zeros).
const TRY_LIMIT = 2_000_000;

const checkZeros = zeros => {
  if (!GUESSING.includes(zeros)) throw new RangeError('Guessing must be off, 2 zeros or 3 zeros.');
  return zeros;
};

/** The seal of a page: SHA-256 of "<previous seal> <text> <lucky number>". */
export function sealOf(previous, text, number) {
  return textHash(`${previous} ${text} ${number}`);
}

// Seals one page on top of `previous`: one hash with zeros 0, otherwise the first lucky
// number from 0 whose seal starts with `zeros` zeros. Returns the page and its hash count.
function seal(text, previous, number, zeros) {
  if (zeros === 0) return { page: { text, number, previous, seal: sealOf(previous, text, number) }, hashes: 1 };
  // Same digest as sealOf, with the constant start hashed once (see powSearch.createHasher).
  const hashWith = createHasher(`${previous} ${text.toWellFormed()} `);
  for (let tries = 1, candidate = 0; tries <= TRY_LIMIT; tries++, candidate++) {
    const value = hashWith(candidate);
    if (textTargetMet(value, zeros)) return { page: { text, number: candidate, previous, seal: value }, hashes: tries };
  }
  throw new Error('No fitting seal found.');
}

// The fresh chain depends only on the setting, so each one is sealed once.
const fresh = new Map();

/** A fresh, valid three-page chain for the Guessing setting (0, 2 or 3 zeros). */
export function createPages(zeros) {
  checkZeros(zeros);
  if (!fresh.has(zeros)) {
    fresh.set(zeros, repairPages(PAGE_TEXTS.map(text => ({ text, number: 0, previous: START_SEAL, seal: '' })), zeros).pages);
  }
  return fresh.get(zeros).map(page => ({ ...page }));
}

/**
 * Checks every page against the stored values:
 * - 'fits': its stored seal is the hash of its stored previous seal, text and number,
 *   meets the Guessing rule, and its previous seal is the stored seal of the page before;
 * - 'broken': one of those checks fails (the page itself no longer fits its seal);
 * - 'built-on-broken': it fits, but a page before it is broken.
 * Returns { pages: [{ status, fits, current }], valid } where `current` is the seal the
 * page would get now.
 */
export function inspectPages(pages, zeros) {
  checkZeros(zeros);
  let brokenBefore = false;
  const checked = pages.map((page, index) => {
    const current = sealOf(page.previous, page.text, page.number);
    const link = index === 0 ? START_SEAL : pages[index - 1].seal;
    const fits = current === page.seal && textTargetMet(page.seal, zeros) && page.previous === link;
    const status = !fits ? 'broken' : brokenBefore ? 'built-on-broken' : 'fits';
    if (!fits) brokenBefore = true;
    return { status, fits, current };
  });
  return { pages: checked, valid: checked.every(page => page.status === 'fits') };
}

/**
 * Re-seals every page in order, each on top of the new seal before it.
 * Returns { pages, hashes: number[] (per page), total }; with zeros 0 exactly one hash per page.
 */
export function repairPages(pages, zeros) {
  checkZeros(zeros);
  const repaired = [];
  const hashes = [];
  for (const page of pages) {
    const previous = repaired.length ? repaired.at(-1).seal : START_SEAL;
    const result = seal(page.text, previous, page.number, zeros);
    repaired.push(result.page);
    hashes.push(result.hashes);
  }
  return { pages: repaired, hashes, total: hashes.reduce((sum, count) => sum + count, 0) };
}
