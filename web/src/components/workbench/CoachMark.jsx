import './CoachMark.css';

// Marks the element the active mission step needs (web/DESIGN.md, "Mission rail").
// `target` is this element's stable id (e.g. "workbench.mine"); the mark shows only
// when it equals `coach?.target`. Without an active coach the children render as is.
export function CoachMark({ target, coach, children, placement = 'below', className = '' }) {
  const active = Boolean(coach && coach.target === target);
  return (
    <span className={`coach-mark${active ? ' is-active' : ''} ${className}`.trim()} data-coach-target={target}>
      {children}
      {active && coach.label && <span className={`coach-label coach-label-${placement}`} role="note">
        <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2v12M3 2h9l-2 3 2 3H3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
        {coach.label}
      </span>}
    </span>
  );
}
