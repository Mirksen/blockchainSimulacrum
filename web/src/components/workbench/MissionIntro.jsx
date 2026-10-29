import { useId } from 'react';
import './MissionIntro.css';

// The first-visit invitation from PR16, kept in the page flow so free play stays usable.
export function MissionIntro({ onStart, onDismiss }) {
  const titleId = useId();
  return (
    <section className="mission-intro" aria-labelledby={titleId}>
      <svg className="mission-intro-arrow" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 12H4m6-6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mission-intro-copy">
        <h2 id={titleId}>Curious? Try a mission.</h2>
        <p>Learn by doing, one experiment at a time. Or explore freely — missions are always here when you want them.</p>
        <p className="mission-intro-storage">Progress stays in this browser.</p>
      </div>
      <div className="mission-intro-actions">
        <button type="button" className="btn-tinted" onClick={onStart}>Start missions</button>
        <button type="button" className="card-kit-btn is-ghost" onClick={onDismiss}>Don't show again</button>
      </div>
    </section>
  );
}
