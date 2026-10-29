import { useId, useLayoutEffect, useRef, useState } from 'react';
import { MISSIONS, activeStep, earnedBadges, missionStatus, totalXp } from '../../lib/missions';
import './MissionRail.css';

// Mission rail (web/DESIGN.md, "Mission rail").
// variant="rail": open form (248 px) or, with `collapsed`, one 56 px missions entry.
// variant="bar": the slim mission bar for < 1024 px that opens the full list as a sheet.
// onShowMe receives activeStep(progress) ({ mission, step, view, target }); the parent switches
// to that view and scrolls to the coach target.

const TOTAL = MISSIONS.length;

const Icon = {
  check: size => <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  lock: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1.2" fill="currentColor" /><path d="M4 5.5V4a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg>,
  flag: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5v13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M4.5 2.5h8l-2 3 2 3h-8z" fill="currentColor" /></svg>,
  collapse: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3L4.5 7l4 4M12 2v10" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  expand: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 3l4 4-4 4M2 2v10" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  arrow: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 6h8M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  chevron: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 8.5L7 5l3.5 3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  close: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
};

const STATUS_WORD = { done: 'done', active: 'in progress', locked: 'locked' };

function rewardText(reward) {
  return `Reward: +${reward.xp} XP${reward.badge ? ` · ${reward.badge} badge` : ''}`;
}

// Everything the open form, the icon form and the bar need, derived once from progress.
function summarize(progress) {
  const current = activeStep(progress);
  const index = current ? MISSIONS.indexOf(current.mission) : -1;
  const stepsDone = current ? progress.step : 0;
  const stepCount = current ? current.mission.steps.length : 0;
  const badges = earnedBadges(progress).length;
  return {
    current, index, stepsDone, stepCount, badges,
    xp: totalXp(progress), done: progress.completed.length,
    fraction: stepCount ? stepsDone / stepCount : 0,
  };
}

function Stats({ info }) {
  return (
    <div className="mission-rail-xp">
      <span><b>{info.xp}</b> XP</span>
      <span><b>{info.badges}</b> {info.badges === 1 ? 'badge' : 'badges'}</span>
      <span><b>{info.done}</b> of {TOTAL} done</span>
    </div>
  );
}

function ActiveBody({ info, onShowMe }) {
  const { current, stepsDone, stepCount } = info;
  const mission = current.mission;
  const stepTextId = useId();
  return (
    <>
      <div className="mission-rail-progress" role="progressbar" aria-label={`${stepsDone} of ${stepCount} steps`}
        aria-valuemin={0} aria-valuemax={stepCount} aria-valuenow={stepsDone}>
        <i style={{ width: `${info.fraction * 100}%` }} />
      </div>
      <div className="mission-rail-n">{stepsDone} of {stepCount} steps</div>
      <ol className="mission-rail-steps">
        {mission.steps.map((step, index) => {
          const state = index < stepsDone ? 'done' : index === stepsDone ? 'current' : 'next';
          return (
            <li key={step.id} className={`mission-rail-step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="mission-rail-step-ck">{state === 'done' && Icon.check(10)}</span>
              <span className="mission-rail-step-txt">
                <span id={state === 'current' ? stepTextId : undefined}>{step.text}</span>
                {state === 'done' && <span className="mission-rail-sr"> (done)</span>}
                {state === 'current' && (
                  <button type="button" className="mission-rail-show" aria-describedby={stepTextId} onClick={() => onShowMe?.(current)}>
                    {Icon.arrow}Show me
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mission-rail-hint">{mission.hint}</div>
      <div className="mission-rail-reward">{rewardText(mission.reward)}</div>
    </>
  );
}

function MissionList({ progress, info, onShowMe, onSelectMission }) {
  return (
    <ol className="mission-rail-list">
      {MISSIONS.map((mission, index) => {
        const status = missionStatus(progress, mission.id);
        const title = onSelectMission && status !== 'locked'
          ? <button type="button" className="mission-rail-title is-button" onClick={() => onSelectMission(mission.id)}>{mission.title}</button>
          : <div className="mission-rail-title">{mission.title}</div>;
        return (
          <li key={mission.id} className={`mission-rail-mission is-${status}`} aria-current={status === 'active' ? 'step' : undefined}>
            <span className="mission-rail-ic">
              {status === 'done' ? Icon.check(12) : status === 'locked' ? Icon.lock : index + 1}
            </span>
            <div className="mission-rail-body">
              <div className="mission-rail-n">Mission {index + 1} · {STATUS_WORD[status]}</div>
              {title}
              {status === 'active' && <ActiveBody info={info} onShowMe={onShowMe} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Complete() {
  return (
    <div className="mission-rail-complete" role="status">
      {Icon.check(12)}<span>All {TOTAL} missions done. Free play is open.</span>
    </div>
  );
}

function CollapsedAccess({ onToggle, highlight }) {
  return (
    <div className="mission-rail-mini">
      <button type="button" className={`mission-rail-icon-btn mission-rail-access${highlight ? ' mission-rail-invitation' : ''}`}
        aria-label="Expand mission rail" aria-expanded="false" title="Open missions" onClick={() => onToggle?.()}>
        {Icon.flag}<span>Missions</span>
      </button>
    </div>
  );
}

function MissionSheet({ progress, info, onClose, onShowMe, onSelectMission }) {
  const ref = useRef(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="mission-rail-sheet" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mission-rail-full">
        <div className="mission-rail-head">
          <span className="mission-rail-flag">{Icon.flag}</span>
          <h2 id={titleId}>Missions</h2>
          <button type="button" className="mission-rail-icon-btn" aria-label="Close missions" onClick={onClose}>{Icon.close}</button>
        </div>
        <Stats info={info} />
        <div className="mission-rail-scroll">
          <MissionList progress={progress} info={info} onSelectMission={onSelectMission}
            onShowMe={step => { onClose(); onShowMe?.(step); }} />
          {!info.current && <Complete />}
        </div>
        <div className="mission-rail-foot">Free play never needs a mission. Your progress stays in this browser.</div>
      </div>
    </dialog>
  );
}

function Bar({ progress, info, onShowMe, onSelectMission, collapsed, onToggle, highlight }) {
  const [open, setOpen] = useState(false);
  const { current, index, stepsDone, stepCount } = info;
  const label = collapsed ? 'Open missions' : current
    ? `Mission ${index + 1}, ${current.mission.title}, ${stepsDone} of ${stepCount} steps. Open missions`
    : `All ${TOTAL} missions done. Open missions`;
  return (
    <div className={`mission-rail is-bar${collapsed ? ' is-free-play' : ''}`}>
      <button type="button" className={`mission-rail-bar${highlight ? ' mission-rail-invitation' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-label={label}
        onClick={() => { if (collapsed) onToggle?.(); setOpen(true); }}>
        <span className={`mission-rail-bar-n${!collapsed && !current ? ' is-done' : ''}`}>{collapsed ? Icon.flag : current ? index + 1 : Icon.check(12)}</span>
        {collapsed ? <span className="mission-rail-bar-txt"><b>Missions</b></span> : current ? (
          <span className="mission-rail-bar-txt">
            <b>Mission {index + 1}</b>
            <span className="mission-rail-bar-title"> · {current.mission.title}</span>
            {' · '}{stepsDone} of {stepCount} steps
          </span>
        ) : (
          <span className="mission-rail-bar-txt"><b>All {TOTAL} missions done</b> · {info.xp} XP</span>
        )}
        {!collapsed && current && <span className="mission-rail-bar-prog" aria-hidden="true"><i style={{ width: `${info.fraction * 100}%` }} /></span>}
        <span className="mission-rail-bar-chev">{Icon.chevron}</span>
      </button>
      {!collapsed && <button type="button" className="mission-rail-hide" onClick={() => { setOpen(false); onToggle?.(); }}>Hide missions</button>}
      {open && <MissionSheet progress={progress} info={info} onClose={() => setOpen(false)}
        onShowMe={onShowMe} onSelectMission={onSelectMission} />}
    </div>
  );
}

export function MissionRail({ progress, collapsed = false, onToggle, onShowMe, onSelectMission, variant = 'rail', highlight = false }) {
  const info = summarize(progress);
  if (variant === 'bar') return <Bar progress={progress} info={info} onShowMe={onShowMe} onSelectMission={onSelectMission}
    collapsed={collapsed} onToggle={onToggle} highlight={highlight} />;
  return (
    <aside className={`mission-rail${collapsed ? ' is-collapsed' : ''}`} aria-label="Missions">
      {collapsed ? (
        <CollapsedAccess onToggle={onToggle} highlight={highlight} />
      ) : (
        <div className="mission-rail-full">
          <div className="mission-rail-head">
            <span className="mission-rail-flag">{Icon.flag}</span>
            <h2>Missions</h2>
            <button type="button" className="mission-rail-icon-btn" aria-label="Collapse mission rail" aria-expanded="true"
              title="Collapse" onClick={() => onToggle?.()}>{Icon.collapse}</button>
          </div>
          <Stats info={info} />
          <div className="mission-rail-scroll">
            <MissionList progress={progress} info={info} onShowMe={onShowMe} onSelectMission={onSelectMission} />
            {!info.current && <Complete />}
          </div>
          <div className="mission-rail-foot">Collapse the rail for free play. Your progress stays in this browser.</div>
        </div>
      )}
    </aside>
  );
}
