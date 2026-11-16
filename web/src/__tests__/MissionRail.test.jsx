// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissionRail } from '../components/workbench/MissionRail';
import { CHAPTERS, MISSIONS, initialProgress, textOf } from '../lib/missions';

beforeEach(() => {
  // jsdom has no native dialog methods; browser checks cover the real modal.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(cleanup);

const at = (missionNumber, step = 0) => ({
  ...initialProgress(), completed: MISSIONS.slice(0, missionNumber - 1).map(mission => mission.id), step,
});
const MISSION_1 = at(1);         // The copy problem, the first Basics scene
const MISSION_10 = at(10, 1);    // Win a mining race, miner backed
const MISSION_11 = at(11, 1);    // Forge a block, tamper done
const ALL_DONE = { ...initialProgress(), completed: MISSIONS.map(mission => mission.id) };
const SKIPS = ['see-a-fingerprint', 'change-one-letter'];
// "I know what a hash is": the two fingerprint scenes skipped, the copy problem done.
const SKIPPED = { ...initialProgress(), completed: ['copy-problem'], skipped: SKIPS };

const missionItems = () => within(screen.getByRole('complementary', { name: 'Missions' }))
  .getAllByRole('listitem').filter(item => item.classList.contains('mission-rail-mission'));
const stats = () => document.querySelector('.mission-rail-xp').textContent;
const statuses = () => missionItems().map(item => item.className.match(/is-(done|skipped|active|locked)/)[1]);

describe('open rail', () => {
  it('mission 1: nothing done, the first Basics scene active with its steps', () => {
    const onShowMe = vi.fn();
    render(<MissionRail progress={MISSION_1} onShowMe={onShowMe} onToggle={() => {}} />);
    expect(stats()).toBe('0 XP0 badges0 of 17 done');
    expect(statuses()).toEqual(['active', ...Array(MISSIONS.length - 1).fill('locked')]);
    expect(screen.getByText('Mission 1 · in progress')).toBeTruthy();
    expect(screen.getByText('0 of 3 steps')).toBeTruthy();
    expect(screen.getByText(MISSIONS[0].hint.technical)).toBeTruthy();
    expect(screen.getByText('Reward: +10 XP')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    expect(onShowMe).toHaveBeenCalledWith(expect.objectContaining({ view: 'basics', target: 'basics.copy-photo' }));
  });

  it('mission 10: nine done, the current step ringed and earlier steps struck through', () => {
    const onShowMe = vi.fn();
    render(<MissionRail progress={MISSION_10} onShowMe={onShowMe} />);
    const rail = screen.getByRole('complementary', { name: 'Missions' });
    expect(stats()).toBe('240 XP3 badges9 of 17 done');
    expect(statuses()).toEqual([...Array(9).fill('done'), 'active', ...Array(MISSIONS.length - 10).fill('locked')]);
    expect(screen.getByText('Mission 9 · done')).toBeTruthy();
    expect(screen.getByText('Mission 11 · locked')).toBeTruthy();
    const steps = [...rail.querySelectorAll('.mission-rail-step')];
    expect(steps.map(step => step.className.match(/is-(done|current|next)/)[1])).toEqual(['done', 'current', 'next']);
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(steps[0].textContent).toContain('(done)');
    expect(screen.getByRole('progressbar', { name: '1 of 3 steps' })).toBeTruthy();
    expect(screen.getByText('Reward: +60 XP · Backer badge')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    expect(onShowMe).toHaveBeenCalledWith(expect.objectContaining({ view: 'workbench', target: 'workbench.mine' }));
  });

  it('mission 11: forge a block at the re-mine step', () => {
    render(<MissionRail progress={MISSION_11} onShowMe={() => {}} />);
    expect(statuses()).toEqual([...Array(10).fill('done'), 'active', ...Array(MISSIONS.length - 11).fill('locked')]);
    expect(stats()).toBe('300 XP4 badges10 of 17 done');
    const active = missionItems()[10];
    expect(within(active).getByText('Forge a block without getting caught')).toBeTruthy();
    expect(within(active).getByText('1 of 3 steps')).toBeTruthy();
    expect(within(active).getByText('Reward: +80 XP · Forger badge')).toBeTruthy();
    const current = active.querySelector('.mission-rail-step.is-current');
    expect(current.textContent).toContain('Re-mine the changed block.');
  });

  it('all done: every mission done, no Show me, completion note', () => {
    render(<MissionRail progress={ALL_DONE} onShowMe={() => {}} />);
    expect(statuses()).toEqual(Array(MISSIONS.length).fill('done'));
    expect(screen.queryByRole('button', { name: 'Show me' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('All 17 missions done. Free play is open.');
    expect(stats()).toBe('840 XP11 badges17 of 17 done');
  });

  it('collapses through onToggle and selects missions when asked', () => {
    const onToggle = vi.fn();
    const onSelectMission = vi.fn();
    render(<MissionRail progress={MISSION_10} onToggle={onToggle} onSelectMission={onSelectMission} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse mission rail' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Send your first coin' }));
    expect(onSelectMission).toHaveBeenCalledWith('send-first-coin');
    expect(screen.queryByRole('button', { name: 'Survive a halving' })).toBeNull();
  });
});

describe('chapters', () => {
  it('groups the track under small chapter headings with continuous numbers', () => {
    render(<MissionRail progress={MISSION_1} onShowMe={() => {}} />);
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map(heading => heading.textContent)).toEqual(CHAPTERS.map(chapter => chapter.title));
    expect(headings.map(heading => heading.textContent)).toEqual(['Basics', 'Proof of work', 'The simulator', 'Going deeper']);
    const chapters = headings.map(heading => heading.parentElement);
    expect(chapters.map(chapter => within(chapter).getAllByRole('listitem')
      .filter(item => item.classList.contains('mission-rail-mission')).length)).toEqual([6, 2, 5, 4]);
    // Numbering runs on: the first mission of "Proof of work" is Mission 7, the last of the track Mission 17.
    expect(within(chapters[1]).getByText('Mission 7 · locked')).toBeTruthy();
    expect(within(chapters[1]).getByText('Earn a proof of work')).toBeTruthy();
    expect(within(chapters[3]).getByText('Mission 17 · locked')).toBeTruthy();
    expect(missionItems()).toHaveLength(17);
  });
});

describe('skipped missions', () => {
  it('names a skipped mission with a word and its own icon, apart from done and locked', () => {
    render(<MissionRail progress={SKIPPED} onShowMe={() => {}} />);
    expect(statuses()).toEqual(['done', 'skipped', 'skipped', 'active', ...Array(MISSIONS.length - 4).fill('locked')]);
    expect(screen.getByText('Mission 2 · skipped')).toBeTruthy();
    expect(screen.getByText('Mission 3 · skipped')).toBeTruthy();
    expect(screen.getByText('Mission 4 · in progress')).toBeTruthy();
    expect(stats()).toBe('10 XP0 badges1 of 17 done');
    const [done, skipped, , , locked] = missionItems().map(item => item.querySelector('.mission-rail-ic').innerHTML);
    expect(skipped).toContain('<svg');
    expect(skipped).not.toBe(done);
    expect(skipped).not.toBe(locked);
  });

  it('keeps a skipped mission selectable, not locked', () => {
    const onSelectMission = vi.fn();
    render(<MissionRail progress={SKIPPED} onSelectMission={onSelectMission} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take a fingerprint' }));
    expect(onSelectMission).toHaveBeenCalledWith('see-a-fingerprint');
    expect(screen.queryByRole('button', { name: 'Why would anyone guess?' })).toBeNull();
  });

  it('ends the track with the skipped count instead of claiming all done', () => {
    const progress = { ...initialProgress(), completed: MISSIONS.map(mission => mission.id).filter(id => !SKIPS.includes(id)), skipped: SKIPS };
    render(<MissionRail progress={progress} onShowMe={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('15 of 17 missions done, 2 skipped. Free play is open.');
    expect(stats()).toBe('820 XP11 badges15 of 17 done');
  });
});

describe('tone', () => {
  const guess = at(4); // Guess a fingerprint: its step text has both variants.
  const step = MISSIONS[3].steps[0].text;

  it('defaults to the technical texts', () => {
    render(<MissionRail progress={guess} onShowMe={() => {}} />);
    expect(screen.getByText(step.technical)).toBeTruthy();
    expect(screen.queryByText(step.plain)).toBeNull();
  });

  it('shows the plain texts to a newcomer', () => {
    render(<MissionRail progress={guess} tone="plain" onShowMe={() => {}} />);
    expect(screen.getByText(step.plain)).toBeTruthy();
    expect(screen.queryByText(step.technical)).toBeNull();
  });

  it('applies the tone to the hint and in the sheet', () => {
    const { rerender } = render(<MissionRail progress={MISSION_1} tone="plain" variant="bar" />);
    fireEvent.click(screen.getByRole('button', { name: /^Mission 1, The copy problem/ }));
    const sheet = screen.getByRole('dialog', { name: 'Missions' });
    expect(within(sheet).getByText(textOf(MISSIONS[0].hint, 'plain'))).toBeTruthy();
    rerender(<MissionRail progress={MISSION_1} tone="technical" variant="bar" />);
    expect(within(screen.getByRole('dialog', { name: 'Missions' })).getByText(MISSIONS[0].hint.technical)).toBeTruthy();
  });
});

describe('collapsed rail', () => {
  it('hides the mission list, tasks and XP behind one clearly named entry', () => {
    const onToggle = vi.fn();
    render(<MissionRail progress={MISSION_10} collapsed onToggle={onToggle} />);
    const access = screen.getByRole('button', { name: 'Expand mission rail' });
    expect(access.textContent).toBe('Missions');
    expect(access.getAttribute('aria-expanded')).toBe('false');
    expect(access.className).not.toContain('invitation');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show me' })).toBeNull();
    expect(screen.queryByLabelText('240 XP')).toBeNull();
    expect(document.querySelector('.mission-rail-xp')).toBeNull();
    fireEvent.click(access);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('keeps the same entry when the track is complete', () => {
    render(<MissionRail progress={ALL_DONE} collapsed onToggle={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Expand mission rail' }).textContent).toBe('Missions');
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('mission bar', () => {
  it('shows neutral access when collapsed, without the current task or progress', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<MissionRail progress={MISSION_11} variant="bar" collapsed onToggle={onToggle} />);
    const access = screen.getByRole('button', { name: 'Open missions' });
    expect(access.textContent).toBe('Missions');
    expect(document.querySelector('.mission-rail-bar-prog')).toBeNull();
    fireEvent.click(access);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Missions' })).toBeTruthy();
    rerender(<MissionRail progress={MISSION_11} variant="bar" collapsed={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close missions' }));
    expect(onToggle).toHaveBeenCalledTimes(1); // Sheet close preserves guidance.
    fireEvent.click(screen.getByRole('button', { name: 'Hide missions' }));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('reads "Mission N · k of m steps" and opens the full list as a dialog', () => {
    const onShowMe = vi.fn();
    render(<MissionRail progress={MISSION_11} variant="bar" onShowMe={onShowMe} />);
    const bar = screen.getByRole('button', { name: 'Mission 11, Forge a block without getting caught, 1 of 3 steps. Open missions' });
    expect(bar.textContent).toBe('11Mission 11 · Forge a block without getting caught · 1 of 3 steps');
    expect(bar.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(bar);
    const sheet = screen.getByRole('dialog', { name: 'Missions' });
    expect(bar.getAttribute('aria-expanded')).toBe('true');
    expect(within(sheet).getByText('Mission 11 · in progress')).toBeTruthy();
    expect(within(sheet).getAllByRole('heading', { level: 3 })).toHaveLength(CHAPTERS.length);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Show me' }));
    expect(onShowMe).toHaveBeenCalledWith(expect.objectContaining({ target: 'workbench.remine' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the sheet with its close button and on Escape', () => {
    render(<MissionRail progress={MISSION_1} variant="bar" />);
    fireEvent.click(screen.getByRole('button', { name: /^Mission 1, The copy problem, 0 of 3 steps/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close missions' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Mission 1/ }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says when the whole track is done', () => {
    render(<MissionRail progress={ALL_DONE} variant="bar" />);
    expect(screen.getByRole('button', { name: 'All 17 missions done. Open missions' }).textContent).toContain('840 XP');
  });
});
