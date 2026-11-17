import { describe, expect, it } from 'vitest';
import { markSeen, seen, STOPS, stopsFor, TOUR_KEY } from '../lib/tour';

// A Storage stand-in; `blocked` throws like a browser that refuses storage.
function memoryStorage(initial = {}, { blocked = false } = {}) {
  const data = new Map(Object.entries(initial));
  const guard = () => { if (blocked) throw new Error('SecurityError'); };
  return {
    getItem: key => { guard(); return data.has(key) ? data.get(key) : null; },
    setItem: (key, value) => { guard(); data.set(key, String(value)); },
    data
  };
}

describe('seen and markSeen', () => {
  it('uses its own key', () => {
    expect(TOUR_KEY).toBe('proofofwork-tour-seen');
  });

  it('is not seen in fresh storage, and seen after markSeen', () => {
    const storage = memoryStorage();
    expect(seen(storage)).toBe(false);
    expect(markSeen(storage)).toBe(true);
    expect(storage.data.get(TOUR_KEY)).toBe('1');
    expect(seen(storage)).toBe(true);
  });

  it('ignores any other stored value', () => {
    expect(seen(memoryStorage({ [TOUR_KEY]: 'yes' }))).toBe(false);
    expect(seen(memoryStorage({ [TOUR_KEY]: '0' }))).toBe(false);
  });

  it('treats missing or blocked storage as not seen and cannot mark it', () => {
    expect(seen(null)).toBe(false);
    expect(seen(undefined)).toBe(false);
    expect(markSeen(null)).toBe(false);
    const blocked = memoryStorage({}, { blocked: true });
    expect(seen(blocked)).toBe(false);
    expect(markSeen(blocked)).toBe(false);
  });
});

describe('the stops', () => {
  it('are five, in the order of the workbench', () => {
    expect(STOPS.map(stop => stop.id)).toEqual(['chain', 'block', 'next', 'mempool', 'wallets']);
    expect(Object.isFrozen(STOPS)).toBe(true);
  });

  it('speak in the course’s pictures in the plain tone', () => {
    const plain = stopsFor('plain');
    expect(plain.map(stop => stop.title)).toEqual(['The notebook', 'One page, opened', 'The draw', 'The waiting room', 'Who owns what']);
    expect(plain[0].text).toBe('Each tile is a page linked to the previous page by its seal. Bitcoin calls these pages blocks. The first, Genesis, is already written.');
    expect(plain[1].text).toContain('Nonce is the lucky number');
    expect(plain[2].text).toContain('Choose Start demo to run your first draw.');
    expect(plain[3].text).toBe('Payments wait here until a miner writes them into a block.');
    expect(plain[4].text).toContain('Miners earn theirs block by block.');
  });

  it('name the terms in the technical tone', () => {
    const technical = stopsFor('technical');
    expect(technical.map(stop => stop.title)).toEqual(['The chain', 'The selected block', 'The next block', 'The mempool', 'Wallets']);
    expect(technical[0].text).toBe('Every tile is a block that commits to its predecessor’s hash. Genesis is already mined.');
    expect(technical[2].text).toBe('The candidate block and its mining race. Choose Start demo to mine block #1.');
    expect(technical[4].text).toBe('Balances derived from the chain’s unspent outputs.');
  });

  it('fall back to the technical tone and give plain strings only', () => {
    expect(stopsFor()).toEqual(stopsFor('technical'));
    for (const tone of ['plain', 'technical']) {
      for (const stop of stopsFor(tone)) {
        expect(typeof stop.title).toBe('string');
        expect(typeof stop.text).toBe('string');
        expect(stop.title).not.toMatch(/\.$/); // Titles carry no full stop (web/DESIGN.md).
        expect(stop.text.length).toBeLessThanOrEqual(320);
      }
    }
  });
});
