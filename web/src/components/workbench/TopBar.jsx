import { useEffect, useRef, useState } from 'react';
import { AnalyticsControl } from '../AnalyticsControl';
import './TopBar.css';

// Top bar of the rebuilt shell (web/DESIGN.md, "Information architecture"):
// brand, the four views, coin label, chain pill and the overflow menu.
// Presentational: the parent owns the view (and the URL hash), theme, sound and
// settings. Navigation links carry their hash for "open in new tab"; a plain
// click calls onNavigate(view) and leaves the hash to the parent.
const VIEWS = [
  { id: 'workbench', label: 'Workbench', href: '#/' },
  { id: 'hash-lab', label: 'Hash lab', href: '#/hash-lab' },
  { id: 'chain-lab', label: 'Chain lab', href: '#/chain-lab' },
  { id: 'pool', label: 'Mining pool', href: '#/pool' },
];

const FOCUSABLE = 'a[href], button:not([disabled]), summary, input:not([disabled])';

function Logo() {
  return (
    <svg className="top-bar-logo" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <defs>
        <linearGradient id="top-bar-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="top-bar-logo-a" />
          <stop offset="1" className="top-bar-logo-b" />
        </linearGradient>
      </defs>
      <rect x="2" y="5" width="12" height="12" rx="2" fill="url(#top-bar-logo-gradient)" />
      <path className="top-bar-logo-side" d="M14 7.5l4-3v12l-4 3z" />
    </svg>
  );
}

const Icon = {
  more: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="12.5" cy="8" r="1.4" fill="currentColor" /></svg>,
  menu: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  reset: <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.5h2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  settings: <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="11" cy="4.5" r="1.6" stroke="currentColor" strokeWidth="1.4" fill="none" /><circle cx="5" cy="11.5" r="1.6" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg>,
  soundOn: <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor" /><path d="M10.8 5.5a3.5 3.5 0 0 1 0 5M12.6 3.8a6 6 0 0 1 0 8.4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg>,
  soundOff: <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor" /><path d="M10.5 6l3.5 4M14 6l-3.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  sun: <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor" /><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  moon: <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 9.8A5.5 5.5 0 0 1 6.2 3a5.5 5.5 0 1 0 6.8 6.8z" fill="currentColor" /></svg>,
};

function plainClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function NavLinks({ view, onSelect, className }) {
  return (
    <ul className={className}>
      {VIEWS.map(item => (
        <li key={item.id}>
          <a href={item.href} className={item.id === view ? 'is-current' : undefined}
            aria-current={item.id === view ? 'page' : undefined}
            onClick={event => { if (!plainClick(event)) return; event.preventDefault(); onSelect(item.id); }}>
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function TopBar({
  view = 'workbench', onNavigate, coinName = 'powfyicoin', chainValid = true,
  theme = 'dark', onTheme, muted = false, onMuted, onReset, onOpenSettings, compact = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = 'top-bar-menu';

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector(FOCUSABLE)?.focus();
    const onPointerDown = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = event => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(menuRef.current?.querySelectorAll(FOCUSABLE) ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length].focus();
  };

  const onBlur = event => {
    if (open && event.relatedTarget && !rootRef.current?.contains(event.relatedTarget)) setOpen(false);
  };

  const navigate = id => {
    if (open) close();
    onNavigate?.(id);
  };
  const nextTheme = theme === 'light' ? 'dark' : 'light';
  const coinLabel = `${coinName} · virtual`;

  return (
    <header className={`top-bar${compact ? ' is-compact' : ''}`}>
      <div className="top-bar-brand"><Logo />proofofwork.fyi</div>
      {!compact && (
        <nav className="top-bar-nav" aria-label="Main">
          <NavLinks view={view} onSelect={navigate} className="top-bar-tabs" />
        </nav>
      )}
      <div className="top-bar-end" ref={rootRef} onKeyDown={onKeyDown} onBlur={onBlur}>
        {!compact && <span className="top-bar-pill top-bar-coin">{coinLabel}</span>}
        <span className={`top-bar-pill top-bar-chain ${chainValid ? 'is-ok' : 'is-bad'}`}>
          <i aria-hidden="true" />{chainValid ? 'Chain valid' : 'Chain invalid'}
        </span>
        <button ref={buttonRef} type="button" className="top-bar-more"
          aria-label={compact ? 'Menu' : 'More'} title={compact ? 'Menu' : 'More: Reset, Settings, sound, theme'}
          aria-expanded={open} aria-controls={open ? menuId : undefined}
          onClick={() => (open ? close() : setOpen(true))}>
          {compact ? Icon.menu : Icon.more}
        </button>
        {open && (
          <div className="top-bar-menu" id={menuId} ref={menuRef} role="group" aria-label={compact ? 'Menu' : 'More'}>
            {compact && (
              <nav className="top-bar-menu-section" aria-label="Main">
                <NavLinks view={view} onSelect={navigate} className="top-bar-menu-nav" />
              </nav>
            )}
            <div className="top-bar-menu-section">
              <button type="button" className="top-bar-item" onClick={() => { close(); onReset?.(); }}>
                {Icon.reset}<span>Reset</span>
              </button>
              <button type="button" className="top-bar-item" onClick={() => { close(); onOpenSettings?.(); }}>
                {Icon.settings}<span>Settings</span>
              </button>
              <button type="button" className="top-bar-item" aria-pressed={!muted} onClick={() => onMuted?.(!muted)}>
                {muted ? Icon.soundOff : Icon.soundOn}<span>Sound</span>
                <span className="top-bar-item-state">{muted ? 'off' : 'on'}</span>
              </button>
              <button type="button" className="top-bar-item" onClick={() => onTheme?.(nextTheme)}>
                {nextTheme === 'light' ? Icon.sun : Icon.moon}
                <span>{nextTheme === 'light' ? 'Light theme' : 'Dark theme'}</span>
              </button>
            </div>
            <div className="top-bar-menu-section top-bar-usage">
              <AnalyticsControl />
            </div>
            <p className={`top-bar-menu-coin${compact ? '' : ' is-narrow-only'}`}>{coinLabel}</p>
          </div>
        )}
      </div>
    </header>
  );
}
