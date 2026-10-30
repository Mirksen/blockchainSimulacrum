// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextBlockCard } from '../components/workbench/NextBlockCard';

afterEach(cleanup);

const miners = [{ name: 'Lars', hashrate: 11133 }, { name: 'Minas', hashrate: 11000 }];
const lastRound = { index: 4, winner: 'Lars', nonce: 5775, attempts: 332, elapsedMs: 7100,
  perMiner: { Lars: { nonce: 5775, zeros: 2 }, Minas: { nonce: 905, zeros: 0 } } };
const race = { attempts: 148, elapsedMs: 3400, targetSeconds: 10, winner: null,
  perMiner: { Lars: { nonce: 3218, hash: 'd16d6eb1aa', zeros: 0, iterations: 74 }, Minas: { nonce: 1048, hash: '0b7e41c9bb', zeros: 1, iterations: 74 } } };
const base = { index: 5, txCount: 2, reward: 1.5625, difficulty: 2, miners };
const card = () => screen.getByRole('region', { name: /^Next block 5|^Next block 1/ });
const filledPrimaries = () => document.querySelectorAll('.btn-primary');

describe('NextBlockCard', () => {
  it('fresh: Start demo is the one filled primary', () => {
    const onStartDemo = vi.fn();
    render(<NextBlockCard {...base} mode="fresh" index={1} onStartDemo={onStartDemo} />);
    expect(filledPrimaries()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Start demo' }));
    expect(onStartDemo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Mining', exact: true })).toBeNull();
  });

  it('idle: Mine block #N, last round lanes with Back buttons and odds', () => {
    const onMine = vi.fn();
    const onBack = vi.fn();
    render(<NextBlockCard {...base} mode="idle" lastRound={lastRound} onMine={onMine} onBack={onBack} />);
    expect(filledPrimaries()).toHaveLength(1);
    const mine = screen.getByRole('button', { name: 'Mining' });
    expect(mine.classList.contains('btn-primary')).toBe(true);
    fireEvent.click(mine);
    expect(onMine).toHaveBeenCalledTimes(1);
    const text = card().textContent;
    expect(text).toContain('2 tx waiting · reward 1.5625');
    expect(text).toContain('Last round #4: Lars won at nonce 5,775 · 332 tries · 7.1 s');
    expect(text).toContain('nonce 905 · 0/2 zeros');
    expect(text).toContain('Lars 50.3 %');
    fireEvent.click(screen.getByRole('button', { name: 'Back Minas' }));
    expect(onBack).toHaveBeenCalledWith('Minas');
  });

  it('a backed miner is pressed and backing it again clears the backing', () => {
    const onBack = vi.fn();
    render(<NextBlockCard {...base} mode="idle" lastRound={lastRound} backedMiner="Minas" onBack={onBack} />);
    const back = screen.getByRole('button', { name: 'Back Minas' });
    expect(back.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Back Lars' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledWith(null);
  });

  it('difficulty stepper and Auto-mine report their new values', () => {
    const onDifficulty = vi.fn();
    const onAutoMine = vi.fn();
    const { rerender } = render(<NextBlockCard {...base} mode="idle" onDifficulty={onDifficulty} onAutoMine={onAutoMine} />);
    fireEvent.click(screen.getByRole('button', { name: 'Raise difficulty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lower difficulty' }));
    expect(onDifficulty.mock.calls).toEqual([[3], [1]]);
    const autoMine = screen.getByRole('button', { name: 'Auto-mine' });
    expect(autoMine.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(autoMine);
    expect(onAutoMine).toHaveBeenCalledWith(true);
    for (const difficulty of [5, 9]) {
      rerender(<NextBlockCard {...base} difficulty={difficulty} mode="idle" onDifficulty={onDifficulty} />);
      const raise = screen.getByRole('button', { name: 'Raise difficulty' });
      expect(raise.disabled).toBe(false);
      fireEvent.click(raise);
      expect(onDifficulty).toHaveBeenLastCalledWith(difficulty + 1);
    }
    rerender(<NextBlockCard {...base} difficulty={10} mode="idle" onDifficulty={onDifficulty} />);
    expect(screen.getByRole('button', { name: 'Raise difficulty' }).disabled).toBe(true);
  });

  it('keeps Play and Repeat together, with repeat off by default', () => {
    render(<NextBlockCard {...base} mode="idle" />);
    const controls = screen.getByRole('group', { name: 'Mining controls' });
    expect(within(controls).getByRole('button', { name: 'Mining' })).toBeTruthy();
    expect(within(controls).getByRole('button', { name: 'Auto-mine' }).getAttribute('aria-pressed')).toBe('false');
  });

  it.each(['fresh', 'idle', 'mining'])('auto-mine in %s stays visibly on and can be paused', mode => {
    const onPause = vi.fn();
    const onAutoMine = vi.fn();
    render(<NextBlockCard {...base} mode={mode} autoMine onPause={onPause} onAutoMine={onAutoMine} />);
    const repeat = screen.getByRole('button', { name: 'Auto-mine' });
    expect(repeat.getAttribute('aria-pressed')).toBe('true');
    expect(repeat.textContent).toBe('Auto-mine');
    expect(screen.queryByRole('button', { name: 'Mining' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPause).toHaveBeenCalledTimes(1);
    fireEvent.click(repeat);
    expect(onAutoMine).toHaveBeenCalledWith(false);
  });

  it('preserves keyboard focus when Play becomes Pause and back', () => {
    const { rerender } = render(<NextBlockCard {...base} mode="idle" />);
    const play = screen.getByRole('button', { name: 'Mining' });
    play.focus();
    rerender(<NextBlockCard {...base} mode="mining" race={race} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBe(play);
    expect(document.activeElement).toBe(play);
    rerender(<NextBlockCard {...base} mode="idle" />);
    expect(screen.getByRole('button', { name: 'Mining' })).toBe(play);
    expect(document.activeElement).toBe(play);
  });

  it('holds a delivered peak for one second and settles to the highest newer sample', () => {
    vi.useFakeTimers();
    try {
      const sample = (peakZeros, iterations) => ({ ...race, perMiner: { ...race.perMiner,
        Minas: { hash: 'f'.repeat(64), nonce: iterations, zeros: 0, peakZeros, iterations } } });
      const { rerender } = render(<NextBlockCard {...base} difficulty={4} mode="mining" race={sample(3, 100)} />);
      expect(screen.getByRole('img', { name: 'Minas recent peak 3 of 4 leading zeros' })).toBeTruthy();
      act(() => vi.advanceTimersByTime(600));
      rerender(<NextBlockCard {...base} difficulty={4} mode="mining" race={sample(2, 200)} />);
      expect(screen.getByRole('img', { name: 'Minas recent peak 3 of 4 leading zeros' })).toBeTruthy();
      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByRole('img', { name: 'Minas recent peak 2 of 4 leading zeros' })).toBeTruthy();
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByRole('img', { name: 'Minas recent peak 0 of 4 leading zeros' })).toBeTruthy();
    } finally { cleanup(); vi.useRealTimers(); }
  });

  it('mining: Play becomes Pause, the live race shows checked hashes and time', () => {
    const onPause = vi.fn();
    render(<NextBlockCard {...base} mode="mining" race={race} backedMiner="Minas" onPause={onPause} />);
    expect(filledPrimaries()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Mining' })).toBeNull();
    expect(card().textContent).toContain('Mining block #5…');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Raise difficulty' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /^Back / })).toBeNull();
    const text = card().textContent;
    expect(text).toContain('Live round #5');
    expect(text).toContain('nonce 3,218');
    expect(text).toContain('0/2 zeros');
    expect(text).toContain('1/2 · close');
    expect(text).toContain('backed');
    expect(text).toContain('148 attempts · 3.4 s of the 10 s target');
    const minasHash = screen.getByLabelText(/^Current hash 0b7e41c9/);
    expect(minasHash.querySelectorAll('.next-block-hx-c.is-hit')).toHaveLength(1);
    expect(minasHash.textContent).toBe('0b7e41c9…');
    expect(screen.getByRole('img', { name: '3.4 of 10 seconds' })).toBeTruthy();
  });

  it('mining: a found winner reads 2/2 zeros', () => {
    const won = { ...race, winner: 'Minas', perMiner: { ...race.perMiner, Minas: { nonce: 1050, hash: '00aa11bb', zeros: 2, iterations: 80 } } };
    render(<NextBlockCard {...base} mode="mining" race={won} />);
    const lane = document.querySelector('[data-miner="Minas"]');
    expect(lane.classList.contains('is-winner')).toBe(true);
    expect(lane.textContent).toContain('2/2 zeros');
  });

  it('repair: Re-mine block #K is the one primary, Mine is paused while the chain is invalid', () => {
    const onRemine = vi.fn();
    const onMine = vi.fn();
    render(<NextBlockCard {...base} mode="repair" repair={{ next: 3, order: [2, 3, 4] }} onRemine={onRemine} onMine={onMine}
      coach={{ target: 'workbench.remine', label: 'Step 2 · re-mine #3' }} />);
    expect(filledPrimaries()).toHaveLength(1);
    expect(card().textContent).toContain('Paused while the chain is invalid');
    const mine = screen.getByRole('button', { name: 'Mining' });
    expect(mine.disabled).toBe(true);
    expect(mine.classList.contains('btn-primary')).toBe(false);
    expect(screen.getByRole('button', { name: 'Auto-mine' }).disabled).toBe(true);
    expect(screen.getByLabelText('Re-mine order, 1 of 3 done')).toBeTruthy();
    expect(card().textContent).toContain('Then #4.');
    const remine = screen.getByRole('button', { name: 'Re-mine block #3' });
    const mark = document.querySelector('[data-coach-target="workbench.remine"]');
    expect(mark.classList.contains('is-active')).toBe(true);
    expect(mark.contains(remine)).toBe(true);
    fireEvent.click(remine);
    expect(onRemine).toHaveBeenCalledWith(3);
  });

  it('repair with a forged signature: Undo edit is the one primary, there is no re-mine', () => {
    const onUndo = vi.fn();
    const onRemine = vi.fn();
    render(<NextBlockCard {...base} mode="repair" repair={{ next: 2, order: [2], undoOnly: true, onUndo }} onRemine={onRemine} />);
    expect(filledPrimaries()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Re-mine/ })).toBeNull();
    expect(card().textContent).toContain('Re-mining cannot fix a signature');
    fireEvent.click(screen.getByRole('button', { name: 'Undo edit in block #2' }));
    expect(onUndo).toHaveBeenCalledWith(2);
    expect(onRemine).not.toHaveBeenCalled();
  });

  it('paused: Mine block #N starts a new search and the paused race stays visible', () => {
    const onMine = vi.fn();
    render(<NextBlockCard {...base} mode="paused" race={race} onMine={onMine} />);
    expect(filledPrimaries()).toHaveLength(1);
    expect(card().textContent).toContain('Paused after 148 attempts · 3.4 s. Mining again starts a new search.');
    fireEvent.click(screen.getByRole('button', { name: 'Mining' }));
    expect(onMine).toHaveBeenCalledTimes(1);
  });

  it('places coach marks on the mine button, difficulty and the lanes', () => {
    const { rerender } = render(<NextBlockCard {...base} mode="idle" lastRound={lastRound} coach={{ target: 'workbench.mine', label: 'Mine' }} />);
    let mark = document.querySelector('[data-coach-target="workbench.mine"].is-active');
    expect(within(mark).getByRole('button', { name: 'Mining' })).toBeTruthy();
    rerender(<NextBlockCard {...base} mode="idle" lastRound={lastRound} coach={{ target: 'workbench.difficulty', label: 'Difficulty' }} />);
    mark = document.querySelector('[data-coach-target="workbench.difficulty"].is-active');
    expect(within(mark).getByRole('button', { name: 'Raise difficulty' })).toBeTruthy();
    rerender(<NextBlockCard {...base} mode="idle" lastRound={lastRound} coach={{ target: 'workbench.back-miner', label: 'Step 3 · back Minas' }} />);
    mark = document.querySelector('[data-coach-target="workbench.back-miner"].is-active');
    expect(within(mark).getByRole('button', { name: 'Back Minas' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('Step 3 · back Minas');
    rerender(<NextBlockCard {...base} mode="mining" race={race} coach={{ target: 'workbench.mine', label: 'Watch the race' }} />);
    const marks = document.querySelectorAll('[data-coach-target="workbench.mine"]');
    expect(marks).toHaveLength(1);
    expect(marks[0].contains(screen.getByRole('button', { name: 'Pause' }))).toBe(false);
    expect(marks[0].textContent).toContain('nonce 3,218');
  });

  it('has exactly one filled primary in every mode', () => {
    for (const mode of ['fresh', 'idle', 'mining', 'repair', 'paused']) {
      render(<NextBlockCard {...base} mode={mode} race={race} lastRound={lastRound} repair={{ next: 2, order: [2, 3] }} />);
      expect(filledPrimaries(), mode).toHaveLength(1);
      cleanup();
    }
  });
});
