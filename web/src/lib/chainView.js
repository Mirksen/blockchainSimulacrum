// Below 1024 px: does the chain show as the compact band's row or as the vertical list?
// The choice stays in this browser only; blocked storage falls back to the row.

const KEY = 'proofofwork-chain-view';

export function readChainView() {
  try {
    return globalThis.localStorage?.getItem(KEY) === 'list' ? 'list' : 'row';
  } catch {
    return 'row';
  }
}

export function storeChainView(view) {
  try {
    globalThis.localStorage?.setItem(KEY, view);
  } catch {
    // private mode or blocked storage: the switch still works for this visit
  }
}
