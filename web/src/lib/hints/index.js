import { WORKBENCH_HINTS } from './workbench';
import { DETAILS_HINTS } from './details';

// The explaining texts behind every hover and focus bubble (components/HintLayer.jsx).
// Written for someone who has never mined a block (web/DESIGN.md, "Hints"): say what the
// thing is, what a click does and why it matters, in two or three plain sentences.
//
// An entry is { title?, text } or a function of the arguments that returns one.
// `hint(key, ...args)` returns the props for a control (button, link, field);
// `term(key, ...args)` returns them for a word or label and adds the dotted underline
// that tells a learner "hover me". An unknown key throws, so a typo fails its test.
//
// A view that loads on demand keeps its catalog in its own chunk: it takes its `hint` and
// `term` from `createHints(catalog)` (the Basics course ./basics.js, the labs ./labs.js,
// the leaderboard page ./pool.js). HINTS holds only the catalogs of the first page.

export const HINTS = { ...WORKBENCH_HINTS, ...DETAILS_HINTS };

/** `hint` and `term` over one catalog of entries. */
export function createHints(catalog) {
  function resolve(key, args) {
    const entry = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
    if (!entry) throw new Error(`Unknown hint "${key}"`);
    const value = typeof entry === 'function' ? entry(...args) : entry;
    if (!value?.text) throw new Error(`Hint "${key}" has no text`);
    return value;
  }
  function hint(key, ...args) {
    const { title, text } = resolve(key, args);
    return title ? { 'data-hint': text, 'data-hint-title': title } : { 'data-hint': text };
  }
  const term = (key, ...args) => ({ ...hint(key, ...args), 'data-hint-term': '' });
  return { hint, term };
}

export const { hint, term } = createHints(HINTS);
