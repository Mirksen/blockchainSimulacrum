// Below 1024 px the chain shows either as the compact band's sideways row or as the
// vertical list (web/DESIGN.md, "Screen sizes"). One small button switches between them;
// the browser remembers the choice for the next visit (lib/chainView.js).
import { hint } from '../../lib/hints';

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M5 4h8M5 8h8M5 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function RowIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="1" y="5" width="4" height="6" rx="1" fill="currentColor" />
      <rect x="6" y="5" width="4" height="6" rx="1" fill="currentColor" />
      <rect x="11" y="5" width="4" height="6" rx="1" fill="none" stroke="currentColor" strokeDasharray="2 1.5" />
    </svg>
  );
}

export function ChainViewSwitch({ view = 'row', onChange }) {
  const list = view === 'list';
  return (
    <button type="button" className="chain-view-switch" aria-label={list ? 'Show the blocks as a row' : 'Show the blocks as a list'}
      {...hint('chain.view', list)} onClick={() => onChange?.(list ? 'row' : 'list')}>
      {list ? <RowIcon /> : <ListIcon />}
      <span>{list ? 'Row' : 'List'}</span>
    </button>
  );
}
