// Pool name moderation: a folded denylist, reserved names, an allow list for
// tolerated false positives, and the operator's list of hidden names.
//
// "Fold before you match": both the visitor's name and every listed term pass
// through the same foldName(), and only folded forms are compared. The original
// name is kept for display.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAME_RE = /^[A-Za-z0-9-]{3,20}$/;
/** Folded blocked terms at least this long also match inside a longer name; shorter ones only exactly. */
export const MIN_SUBSTRING_TERM_LENGTH = 4;
export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

const LEET = Object.freeze({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's' });
const LEET_RE = /[01345789@$]/g;
const PREPARED = Symbol('preparedNameLists');

/**
 * Unicode NFKD, drop combining marks, lowercase, map leetspeak digits and symbols
 * to letters, remove hyphens, collapse runs of the same letter to one.
 */
export function foldName(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(LEET_RE, (ch) => LEET[ch] ?? ch)
    .replace(/-/g, '')
    .replace(/(\p{L})\1+/gu, '$1');
}

const codePointLength = (text) => [...text].length;

function foldAll(terms) {
  const folded = new Set();
  for (const term of terms ?? []) {
    const f = foldName(term);
    if (f !== '') folded.add(f);
  }
  return folded;
}

/** Folds the term lists once; checkName() accepts the result without folding again. */
export function prepareNameLists(lists = {}) {
  if (lists[PREPARED]) return lists;
  const blocked = [...foldAll(lists.blocked)];
  return Object.freeze({
    [PREPARED]: true,
    blockedSubstrings: Object.freeze(blocked.filter((t) => codePointLength(t) >= MIN_SUBSTRING_TERM_LENGTH)),
    blockedExact: blocked.filter((t) => codePointLength(t) < MIN_SUBSTRING_TERM_LENGTH),
    reserved: foldAll(lists.reserved),
    allowed: foldAll(lists.allowed),
  });
}

/**
 * @returns {{ ok: true } | { ok: false, reason: 'format' | 'unavailable' }}
 */
export function checkName(name, lists = {}) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) return { ok: false, reason: 'format' };
  const { blockedSubstrings, blockedExact, reserved, allowed } = prepareNameLists(lists);
  const folded = foldName(name);
  if (allowed.has(folded)) return { ok: true };
  const unavailable =
    reserved.has(folded) ||
    blockedExact.includes(folded) ||
    blockedSubstrings.some((term) => folded.includes(term));
  return unavailable ? { ok: false, reason: 'unavailable' } : { ok: true };
}

/** One term per line; text after `#` is a comment; whitespace inside a term is removed. */
export function parseTermList(text) {
  const terms = [];
  for (const line of String(text).split(/\r?\n/)) {
    const term = line.split('#')[0].replace(/\s+/g, '');
    if (term !== '') terms.push(term);
  }
  return terms;
}

/** Reads a term file. A list that yields no usable term is an error, not a pass. */
export function loadTermFile(file, { allowEmpty = false } = {}) {
  const terms = parseTermList(readFileSync(file, 'utf8'));
  if (!allowEmpty && foldAll(terms).size === 0) {
    throw new Error(`name list ${file} contains no terms; refusing to start with an empty list`);
  }
  return terms;
}

/** Loads and folds blocked-names.txt, reserved-names.txt and allowed-names.txt (which may be empty). */
export function loadNameLists(dir = DEFAULT_DATA_DIR) {
  return prepareNameLists({
    blocked: loadTermFile(path.join(dir, 'blocked-names.txt')),
    reserved: loadTermFile(path.join(dir, 'reserved-names.txt')),
    allowed: loadTermFile(path.join(dir, 'allowed-names.txt'), { allowEmpty: true }),
  });
}

/** Names an operator hid, stored by folded form so lookalike spellings are hidden too. */
export function createHiddenNames(db) {
  db.exec('CREATE TABLE IF NOT EXISTS hidden_names (folded TEXT PRIMARY KEY, hidden_at INTEGER)');
  const insert = db.prepare('INSERT INTO hidden_names (folded, hidden_at) VALUES (?, ?) ON CONFLICT (folded) DO NOTHING');
  const remove = db.prepare('DELETE FROM hidden_names WHERE folded = ?');
  const select = db.prepare('SELECT 1 AS hidden FROM hidden_names WHERE folded = ?');
  const selectAll = db.prepare('SELECT folded, hidden_at AS hiddenAt FROM hidden_names ORDER BY hidden_at ASC, folded ASC');
  return {
    hide: (name, at) => insert.run(foldName(name), at).changes > 0,
    unhide: (name) => remove.run(foldName(name)).changes > 0,
    isHidden: (name) => select.get(foldName(name)) !== undefined,
    list: () => selectAll.all().map((row) => ({ ...row })),
  };
}
