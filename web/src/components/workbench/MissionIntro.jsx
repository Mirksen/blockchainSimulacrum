import { useId } from 'react';
import { MISSIONS } from '../../lib/missions';
import './MissionIntro.css';

// First-visit invitation to the mission track (web/DESIGN.md, "Mission rail"). The rail
// starts collapsed; this card points at it once. "Start missions" opens the rail, "Not now"
// only closes the card; either way the parent remembers it and never shows it again.
// Beside the collapsed rail on wide screens, under the mission bar below 1024 px.
const FIRST = MISSIONS.slice(0, 3).map(mission => mission.title);

export function MissionIntro({ onStart, onDismiss }) {
  const titleId = useId();
  return (
    <section className="mission-intro" aria-labelledby={titleId}>
      <span className="mission-intro-arrow" aria-hidden="true" />
      <p className="mission-intro-eyebrow">{MISSIONS.length} missions · progress stays in this browser</p>
      <h2 id={titleId} className="mission-intro-title">Learn proof of work by doing it</h2>
      <ol className="mission-intro-steps">
        {FIRST.map((title, index) => <li key={title}><span>{index + 1}</span>{title}</li>)}
        <li className="mission-intro-more"><span>…</span>up to forging a block without getting caught</li>
      </ol>
      <p className="mission-intro-text">Each mission points at the part of the page it needs. Free play stays open the whole time.</p>
      <div className="mission-intro-actions">
        <button type="button" className="btn-tinted mission-intro-start" onClick={onStart}>Start missions</button>
        <button type="button" className="card-kit-btn is-ghost" onClick={onDismiss}>Not now</button>
      </div>
    </section>
  );
}
