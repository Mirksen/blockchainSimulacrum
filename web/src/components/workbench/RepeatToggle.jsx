import './RepeatToggle.css';

// The repeat add-on joined to the right of an action (web/DESIGN.md, "Repeat toggle"):
// Auto-mine beside Mining in the Next block card, Auto-transact beside New transaction in the
// Mempool. It is a setting: it shows "Auto", is tinted when on and never filled, so the action
// beside it stays the one filled or tinted invitation. `name` is the accessible name;
// `hint` the explaining props from hint() in src/lib/hints.

const RepeatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6V5a2 2 0 0 1 2-2h8m-2-2 2 2-2 2M13 10v1a2 2 0 0 1-2 2H3m2 2-2-2 2-2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export function RepeatToggle({ name, pressed = false, onToggle, hint = null, disabled = false }) {
  return (
    <button type="button" className="repeat-toggle" aria-label={name} aria-pressed={pressed} {...hint}
      disabled={disabled} onClick={() => onToggle?.(!pressed)}>
      <RepeatIcon /><span>Auto</span>
    </button>
  );
}
