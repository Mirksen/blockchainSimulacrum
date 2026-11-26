import { useEffect, useId, useRef, useState } from 'react';
import { MISSIONS, activeMission, initialProgress, missionStatus, textOf } from '../../lib/missions';
import { hint } from '../../lib/hints/basics';
import { CopyProblemScene } from './scenes/CopyProblemScene';
import { FingerprintScene } from './scenes/FingerprintScene';
import { OneLetterScene } from './scenes/OneLetterScene';
import { GuessScene } from './scenes/GuessScene';
import { WhyGuessScene } from './scenes/WhyGuessScene';
import { SealedPagesScene } from './scenes/SealedPagesScene';
import { Bridge } from './scenes/Bridge';
import './Basics.css';

// The Basics course: six one-screen scenes (the missions with view 'basics', in track
// order) and a closing Bridge. The learner opens any scene at any time from the stepper;
// the course never switches scenes on its own when progress changes. A done scene shows
// "What you learned" with the one filled Continue, which passes over skipped scenes, then opens the
// Bridge, whose Continue leaves the course (onContinue).
//
// Props: progress (mission progress), tone ('plain' | 'technical'), coach (for CoachMark),
// onLessonEvent(event) (optional), onContinue(), onClose() ("Back to simulator").

const SCENES = MISSIONS.filter(mission => mission.view === 'basics');
const BRIDGE = 'bridge';

// The scene for a mission id; the Bridge for anything else.
function SceneView({ id, ...props }) {
  switch (id) {
    case 'copy-problem': return <CopyProblemScene {...props} />;
    case 'see-a-fingerprint': return <FingerprintScene {...props} />;
    case 'change-one-letter': return <OneLetterScene {...props} />;
    case 'change-fingerprint': return <GuessScene {...props} />;
    case 'why-guess': return <WhyGuessScene {...props} />;
    case 'sealed-pages': return <SealedPagesScene {...props} />;
    default: return <Bridge />;
  }
}

const LEDES = {
  'copy-problem': {
    plain: 'You can send a photo and still keep it. Great for photos, a disaster for money.',
    technical: 'Sending digital data creates a copy. How can a digital coin change hands without being spent twice?'
  },
  'see-a-fingerprint': 'A hash is a fingerprint of data. Type anything and watch.',
  'change-one-letter': 'Two almost identical texts. How similar are their fingerprints?',
  'change-fingerprint': {
    plain: 'Can you find a text whose fingerprint starts with 0? Try different texts, like rolling a die.',
    technical: 'Find a text whose SHA-256 hash starts with 0. Try different inputs until you find a match.'
  },
  'why-guess': {
    plain: 'A notebook everyone may copy. Who writes the next page when nobody is in charge?',
    technical: 'Who appends the next block when there is no leader?'
  },
  'sealed-pages': {
    plain: 'Each page is sealed together with the seal before it.',
    technical: 'Each block commits to the hash of its predecessor.'
  }
};

const STATUS_WORD = { done: 'done', skipped: 'skipped', active: 'now', locked: 'later' };

function firstShown(progress) {
  const active = activeMission(progress);
  return active?.view === 'basics' ? active.id : SCENES[0].id;
}

export function BasicsCourse({ progress, tone = 'plain', coach = null, onLessonEvent, onContinue, onClose }) {
  const current = progress ?? initialProgress();
  const headingId = useId();
  const outlineId = useId();
  const outlineButton = useRef(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [shown, setShown] = useState(() => firstShown(current));
  const [generation, setGeneration] = useState(0);
  const heading = useRef(null);
  const navigated = useRef(false);

  // After the learner moves to another scene, focus its title so keyboard and screen
  // reader users start at the top of the new scene.
  useEffect(() => {
    if (navigated.current) heading.current?.focus();
  }, [shown]);

  function open(id) {
    setOutlineOpen(false);
    if (id === shown) heading.current?.focus();
    navigated.current = true;
    setShown(id);
  }
  function dismissOutline(event) {
    if (event.key === 'Escape' && outlineOpen && outlineButton.current?.offsetWidth) {
      setOutlineOpen(false);
      outlineButton.current.focus();
    }
  }

  function next() {
    const scene = SCENES.slice(index + 1).find(candidate => missionStatus(current, candidate.id) !== 'skipped');
    open(scene?.id ?? BRIDGE);
  }
  function reset() {
    setGeneration(count => count + 1);
    onLessonEvent?.({ type: 'lesson_reset' });
  }

  const index = SCENES.findIndex(mission => mission.id === shown);
  const mission = SCENES[index] ?? null;
  const done = mission ? missionStatus(current, mission.id) === 'done' : false;

  return (
    <section className="basics" aria-labelledby={headingId}>
      <nav className="basics-stepper" aria-label="Basics scenes" onKeyDown={dismissOutline}>
        <button type="button" ref={outlineButton} className="basics-outline-toggle"
          aria-expanded={outlineOpen} aria-controls={outlineId} {...hint('basics.outline')}
          onClick={() => setOutlineOpen(value => !value)}>
          Course outline <span aria-hidden="true">{outlineOpen ? '−' : '+'}</span>
        </button>
        <ol id={outlineId}>
          {SCENES.map((scene, at) => {
            const word = STATUS_WORD[missionStatus(current, scene.id)];
            return (
              <li key={scene.id}>
                <button type="button" className={`basics-step is-${word}`} aria-current={scene.id === shown ? 'step' : undefined}
                  aria-label={`Scene ${at + 1}: ${textOf(scene.title, tone)}, ${word}`}
                  {...hint('basics.scene', at + 1, textOf(scene.title, tone), word)} onClick={() => open(scene.id)}>
                  <span className="basics-step-number" aria-hidden="true">{at + 1}</span>
                  <span className="basics-visually-hidden">Scene {at + 1}: </span>
                  <span className="basics-step-title">{textOf(scene.title, tone)}</span>
                  <span className="basics-step-status">{word}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <header className="basics-header">
        <div>
          <p className="basics-kicker">{mission ? `Basics · Scene ${index + 1} of ${SCENES.length}` : 'Basics · The end'}</p>
          <h2 id={headingId} ref={heading} tabIndex={-1}>{mission ? textOf(mission.title, tone) : "Your words, Bitcoin's words"}</h2>
          {mission && <p className="basics-lede">{textOf(LEDES[mission.id], tone)}</p>}
        </div>
        <div className="basics-header-actions">
          {mission && <button type="button" className="btn btn-transparent" {...hint('basics.reset')} onClick={reset}>Reset scene</button>}
          <button type="button" className="btn btn-transparent" {...hint('basics.back')} onClick={() => onClose?.()}>Back to simulator</button>
        </div>
      </header>

      <SceneView key={`${shown}-${generation}`} id={shown} tone={tone} coach={coach} onEvent={onLessonEvent} done={done} />

      {mission?.id === 'sealed-pages' && <p><a className="btn btn-transparent" href="#/page-challenge">Try a fresh chain: predict which seals need replacing</a></p>}

      {mission && done && <section className="basics-result" aria-labelledby={`${headingId}-result`}>
        <h3 id={`${headingId}-result`}>What you learned</h3>
        <p>{textOf(mission.result, tone)}</p>
        <button type="button" className="btn btn-emphasized" {...hint('basics.continue')} onClick={next}>Continue</button>
      </section>}
      {!mission && <div className="basics-actions basics-bridge-actions">
        <button type="button" className="btn btn-emphasized" {...hint('basics.bridge.continue')} onClick={() => onContinue?.()}>Continue</button>
      </div>}
    </section>
  );
}
