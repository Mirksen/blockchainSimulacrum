// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissionRail } from '../components/workbench/MissionRail';
import { MISSIONS, initialProgress } from '../lib/missions';

beforeEach(() => {
  // jsdom has no native dialog methods; browser checks cover the real modal.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(cleanup);

const at = (missionNumber, step = 0) => ({
  ...initialProgress(), completed: MISSIONS.slice(0, missionNumber - 1).map(mission => mission.id), step,
});
const MISSION_1 = at(1);
const MISSION_4 = at(4, 1);     // Win a mining race, miner backed
const MISSION_6 = at(6, 1);     // Forge a block, tamper done
const ALL_DONE = { ...initialProgress(), completed: MISSIONS.map(mission => mission.id) };

const missionItems = () => within(screen.getByRole('complementary', { name: 'Missions' }))
  .getAllByRole('listitem').filter(item => item.classList.contains('mission-rail-mission'));
const stats = () => document.querySelector('.mission-rail-xp').textContent;
const statuses = () => missionItems().map(item => item.className.match(/is-(done|active|locked)/)[1]);

describe('open rail', () => {
  it('mission 1: nothing done, first mission active with its single step', () => {
    const onShowMe = vi.fn();
    render(<MissionRail progress={MISSION_1} onShowMe={onShowMe} onToggle={() => {}} />);
    expect(stats()).toBe('0 XP0 badges0 of 8 done');
    expect(statuses()).toEqual(['active', ...Array(7).fill('locked')]);
    expect(screen.getByText('Mission 1 · in progress')).toBeTruthy();
    expect(screen.getByText('0 of 1 steps')).toBeTruthy();
    expect(screen.getByText(MISSIONS[0].hint)).toBeTruthy();
    expect(screen.getByText('Reward: +20 XP')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    expect(onShowMe).toHaveBeenCalledWith(expect.objectContaining({ view: 'hash-lab', target: 'hash-lab.message' }));
  });

  it('mission 4: three done, the current step ringed and earlier steps struck through', () => {
    const onShowMe = vi.fn();
    render(<MissionRail progress={MISSION_4} onShowMe={onShowMe} />);
    const rail = screen.getByRole('complementary', { name: 'Missions' });
    expect(stats()).toBe('100 XP1 badge3 of 8 done');
    expect(statuses()).toEqual(['done', 'done', 'done', 'active', 'locked', 'locked', 'locked', 'locked']);
    expect(screen.getByText('Mission 3 · done')).toBeTruthy();
    expect(screen.getByText('Mission 5 · locked')).toBeTruthy();
    const steps = [...rail.querySelectorAll('.mission-rail-step')];
    expect(steps.map(step => step.className.match(/is-(done|current|next)/)[1])).toEqual(['done', 'current', 'next']);
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(steps[0].textContent).toContain('(done)');
    expect(screen.getByRole('progressbar', { name: '1 of 3 steps' })).toBeTruthy();
    expect(screen.getByText('Reward: +60 XP · Backer badge')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    expect(onShowMe).toHaveBeenCalledWith(expect.objectContaining({ view: 'workbench', target: 'workbench.mine' }));
  });

  it('mission 6: forge a block at the re-mine step', () => {
    render(<MissionRail progress={MISSION_6} onShowMe={() => {}} />);
    expect(statuses()).toEqual(['done', 'done', 'done', 'done', 'done', 'active', 'locked', 'locked']);
    expect(stats()).toBe('220 XP3 badges5 of 8 done');
    const active = missionItems()[5];
    expect(within(active).getByText('Forge a block without getting caught')).toBeTruthy();
    expect(within(active).getByText('1 of 3 steps')).toBeTruthy();
    expect(within(active).getByText('Reward: +80 XP · Forger badge')).toBeTruthy();
    const current = active.querySelector('.mission-rail-step.is-current');
    expect(current.textContent).toContain('Re-mine the changed block.');
  });

  it('all done: every mission done, no Show me, completion note', () => {
    render(<MissionRail progress={ALL_DONE} onShowMe={() => {}} />);
    expect(statuses()).toEqual(Array(8).fill('done'));
    expect(screen.queryByRole('button', { name: 'Show me' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('All 8 missions done. Free play is open.');
    expect(stats()).toBe('460 XP6 badges8 of 8 done');
  });

  it('collapses through onToggle and selects missions when asked', () => {
    const onToggle = vi.fn();
    const onSelectMission = vi.fn();
    render(<MissionRail progress={MISSION_4} onToggle={onToggle} onSelectMission={onSelectMission} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse mission rail' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Send your first coin' }));
    expect(onSelectMission).toHaveBeenCalledWith('send-first-coin');
    expect(screen.queryByRole('button', { name: 'Survive a halving' })).toBeNull();
  });
});

describe('collapsed rail', () => {
  it('hides the mission list, tasks and XP behind one clearly named entry', () => {
    const onToggle = vi.fn();
    render(<MissionRail progress={MISSION_4} collapsed onToggle={onToggle} />);
    const access = screen.getByRole('button', { name: 'Expand mission rail' });
    expect(access.textContent).toBe('Missions');
    expect(access.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show me' })).toBeNull();
    expect(screen.queryByLabelText('100 XP')).toBeNull();
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
    const { rerender } = render(<MissionRail progress={MISSION_6} variant="bar" collapsed onToggle={onToggle} />);
    const access = screen.getByRole('button', { name: 'Open missions' });
    expect(access.textContent).toBe('Missions');
    expect(document.querySelector('.mission-rail-bar-prog')).toBeNull();
    fireEvent.click(access);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Missions' })).toBeTruthy();
    rerender(<MissionRail progress={MISSION_6} variant="bar" collapsed={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close missions' }));
    expect(onToggle).toHaveBeenCalledTimes(1); // Sheet close preserves guidance.
    fireEvent.click(screen.getByRole('button', { name: 'Hide missions' }));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('reads "Mission N · k of m steps" and opens the full list as a dialog', () => {
    const onShowMe = vi.fn();
    render(<MissionRail progress={MISSION_6} variant="bar" onShowMe={onShowMe} />);
    const bar = screen.getByRole('button', { name: 'Mission 6, Forge a block without getting caught, 1 of 3 steps. Open missions' });
    expect(bar.textContent).toBe('6Mission 6 · Forge a block without getting caught · 1 of 3 steps');
    expect(bar.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(bar);
    const sheet = screen.getByRole('dialog', { name: 'Missions' });
    expect(bar.getAttribute('aria-expanded')).toBe('true');
    expect(within(sheet).getByText('Mission 6 · in progress')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Show me' }));
    expect(onShowMe).toHaveBeenCalledWith(expect.objectContaining({ target: 'workbench.remine' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the sheet with its close button and on Escape', () => {
    render(<MissionRail progress={MISSION_1} variant="bar" />);
    fireEvent.click(screen.getByRole('button', { name: /^Mission 1, Change a fingerprint, 0 of 1 steps/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close missions' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Mission 1/ }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says when the whole track is done', () => {
    render(<MissionRail progress={ALL_DONE} variant="bar" />);
    expect(screen.getByRole('button', { name: 'All 8 missions done. Open missions' }).textContent).toContain('460 XP');
  });
});
