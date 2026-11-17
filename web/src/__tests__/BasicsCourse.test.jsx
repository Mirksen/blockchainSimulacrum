// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BasicsCourse } from '../components/basics/BasicsCourse';
import { MISSIONS, initialProgress, missionStatus, reduce, textOf } from '../lib/missions';

const digest = text => createHash('sha256').update(text).digest('hex');
const BASICS = MISSIONS.filter(mission => mission.view === 'basics').map(mission => mission.id);
const ORIGINAL = 'Alice pays Bob 10';

// Progress whose active mission is `id`: every Basics mission before it completed.
const progressAt = id => ({ ...initialProgress(), completed: BASICS.slice(0, BASICS.indexOf(id)) });
const allBasicsDone = () => ({ ...initialProgress(), completed: [...BASICS] });

// Holds progress like the shell does: every lesson event goes through missions.reduce.
function renderCourse({ progress = initialProgress(), tone = 'plain', coach = null, ...props } = {}) {
  const events = [];
  const state = { progress };
  function Harness() {
    const [current, setCurrent] = useState(progress);
    useEffect(() => { state.progress = current; }, [current]);
    return <BasicsCourse progress={current} tone={tone} coach={coach} onContinue={props.onContinue} onClose={props.onClose}
      onLessonEvent={event => { events.push(event); setCurrent(previous => reduce(previous, event)); }} />;
  }
  const view = render(<Harness />);
  return { ...view, events, state };
}

const click = name => fireEvent.click(screen.getByRole('button', { name }));
const heading = () => screen.getByRole('heading', { level: 2 }).textContent;
const filled = () => [...document.querySelectorAll('.btn-emphasized')];

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('BasicsCourse host', () => {
  it('lists the six scenes with status words and opens the active Basics scene', () => {
    renderCourse({ progress: progressAt('see-a-fingerprint') });
    const nav = screen.getByRole('navigation', { name: 'Basics scenes' });
    const steps = within(nav).getAllByRole('button');
    expect(steps).toHaveLength(6);
    expect(steps.map(step => step.textContent)).toEqual([
      '1Scene 1: The copy problemdone', '2Scene 2: Take a fingerprintnow', '3Scene 3: One letter, everything changeslater',
      '4Scene 4: Guess a fingerprintlater', '5Scene 5: Why would anyone guess?later', '6Scene 6: Sealed pageslater'
    ]);
    // The accessible names state number, title and status in words, also where the narrow
    // stepper shows only the numbered circles with a status icon.
    const names = ['Scene 1: The copy problem, done', 'Scene 2: Take a fingerprint, now', 'Scene 3: One letter, everything changes, later',
      'Scene 4: Guess a fingerprint, later', 'Scene 5: Why would anyone guess?, later', 'Scene 6: Sealed pages, later'];
    names.forEach((name, at) => expect(within(nav).getByRole('button', { name })).toBe(steps[at]));
    expect(steps.map(step => Boolean(step.querySelector('.basics-step-icon[aria-hidden="true"]')))).toEqual([true, true, false, false, false, false]);
    expect(heading()).toBe('Take a fingerprint');
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('A hash is a fingerprint of data. Type anything and watch.')).toBeTruthy();
  });

  it('opens the first scene when the active mission is outside Basics and marks skipped scenes', () => {
    renderCourse({ progress: { ...initialProgress(), skipped: [...BASICS] } });
    expect(heading()).toBe('The copy problem');
    const nav = screen.getByRole('navigation', { name: 'Basics scenes' });
    expect(within(nav).getAllByRole('button').every(step => step.textContent.endsWith('skipped'))).toBe(true);
    expect(within(nav).getByRole('button', { name: 'Scene 3: One letter, everything changes, skipped' })).toBeTruthy();
  });

  it('opens any scene from the stepper and never switches scenes by itself', () => {
    const { events } = renderCourse();
    click(/Scene 6: Sealed pages/);
    expect(heading()).toBe('Sealed pages');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }));
    click(/Scene 1: The copy problem/);
    click('Send photo to Bob');
    click('Send coin to Bob');
    click('Send same coin to Carol');
    fireEvent.click(screen.getByRole('switch', { name: 'Shared list' }));
    click('Send coin to Bob');
    click('Send same coin to Carol');
    expect(events.at(-1)).toEqual({ type: 'copy_tried', kind: 'rejected' });
    // Mission 2 is now active, but the course stays on the finished scene.
    expect(heading()).toBe('The copy problem');
    expect(screen.getByRole('heading', { name: 'What you learned' })).toBeTruthy();
  });

  it('uses the tone for ledes and results', () => {
    renderCourse({ progress: allBasicsDone(), tone: 'technical' });
    expect(screen.getByText('Sending digital data creates a copy. How can a digital coin change hands without being spent twice?')).toBeTruthy();
    expect(screen.getByText(/Without a shared, ordered ledger the same coin can be spent twice/)).toBeTruthy();
  });

  it('walks Continue from scene to scene, then the Bridge, then leaves with onContinue', () => {
    const onContinue = vi.fn();
    renderCourse({ progress: allBasicsDone(), onContinue });
    const titles = MISSIONS.filter(mission => mission.view === 'basics').map(mission => textOf(mission.title, 'plain'));
    for (const title of titles) {
      expect(heading()).toBe(title);
      expect(screen.getByRole('heading', { name: 'What you learned' })).toBeTruthy();
      expect(filled().map(button => button.textContent)).toEqual(['Continue']);
      click('Continue');
    }
    expect(heading()).toBe("Your words, Bitcoin's words");
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }));
    const rows = screen.getAllByRole('row').slice(1).map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent));
    expect(rows).toEqual([['Page', 'Block'], ['Seal', 'Hash'], ['Lucky number', 'Nonce'], ['Notebook', 'Blockchain'],
      ['The draw', 'Mining'], ['Postage', 'Proof of work'], ['Guessing: 3 zeros', 'Difficulty'], ['Writer', 'Miner']]);
    expect(screen.getByText(/You explored fingerprints \(cryptography\), linked blocks, and proof of work\. Bitcoin also relies on a network of computers that check and share the chain\. This site does not simulate that network\./)).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();
    click('Continue');
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('resets a scene with lesson_reset and goes back with onClose', () => {
    const onClose = vi.fn();
    const { events, state } = renderCourse({ onClose });
    click('Send photo to Bob');
    expect(state.progress.step).toBe(1);
    click('Reset scene');
    expect(events.at(-1)).toEqual({ type: 'lesson_reset' });
    expect(state.progress.step).toBe(0);
    expect(screen.getByRole('button', { name: 'Send photo to Bob' }).disabled).toBe(false);
    click('Back to simulator');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('works for free viewing without onLessonEvent', () => {
    render(<BasicsCourse progress={initialProgress()} tone="plain" coach={null} />);
    click('Send photo to Bob');
    click('Reset scene');
    click(/Scene 4: Guess a fingerprint/);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: 'Learner A' } });
    click('Roll');
    expect(screen.getByText('Rolls: 2 · 16 on average')).toBeTruthy();
  });

  it('shows the coach mark of the active step', () => {
    renderCourse({ coach: { mission: 'copy-problem', view: 'basics', target: 'basics.copy-photo', label: 'Step 1 · send the photo' } });
    expect(screen.getByRole('note').textContent).toBe('Step 1 · send the photo');
    expect(document.querySelector('[data-coach-target="basics.copy-photo"]').classList.contains('is-active')).toBe(true);
  });
});

describe('Basics scenes complete their missions', () => {
  it('1 the copy problem: photo, double spend, rejection by the shared list', () => {
    const { events, state } = renderCourse();
    expect(filled().map(button => button.textContent)).toEqual(['Send photo to Bob']);
    click('Send photo to Bob');
    expect(screen.getByText('Bob got a copy. Alice still has hers.')).toBeTruthy();
    expect(screen.getAllByText('Holds: Photo, Coin')).toHaveLength(1);
    expect(screen.getByText('Holds: Photo')).toBeTruthy();
    click('Send coin to Bob');
    expect(filled().map(button => button.textContent)).toEqual(['Send same coin to Carol']);
    click('Send same coin to Carol');
    expect(screen.getByText('Bob and Carol both got a copy, and Alice still has hers. The same coin was spent twice.')).toBeTruthy();
    expect(screen.getAllByText('Holds: Photo, Coin')).toHaveLength(2);
    // The holdings are drawn as chips: one coin became three.
    const chips = kind => document.querySelectorAll(`.basics-person .basics-chip.is-${kind}`);
    expect(chips('coin')).toHaveLength(3);
    expect(chips('photo')).toHaveLength(2);
    expect([...document.querySelectorAll('.basics-person .basics-chips')].every(row => row.getAttribute('aria-hidden') === 'true')).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Shared list' }));
    expect(screen.getByRole('heading', { name: 'Shared list: who paid whom' })).toBeTruthy();
    expect(screen.getByText('Holds: Photo')).toBeTruthy();
    expect(chips('coin')).toHaveLength(1);
    click('Send coin to Bob');
    expect(screen.getByText('Alice → Bob · 1 coin')).toBeTruthy();
    expect(chips('coin')).toHaveLength(1);
    click('Send same coin to Carol');
    expect(screen.getByText('Rejected: the list says Alice already paid this coin to Bob.')).toBeTruthy();
    expect(screen.getByText('A simplified example of how a ledger prevents double spending.')).toBeTruthy();
    expect(events).toEqual([
      { type: 'copy_tried', kind: 'photo' }, { type: 'copy_tried', kind: 'double-spend' }, { type: 'copy_tried', kind: 'rejected' }
    ]);
    expect(missionStatus(state.progress, 'copy-problem')).toBe('done');
    expect(filled().map(button => button.textContent)).toEqual(['Continue']);
  });

  it('2 take a fingerprint: type, change, type the first text again', () => {
    const { events, state } = renderCourse({ progress: progressAt('see-a-fingerprint') });
    const input = screen.getByLabelText('Your text');
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(screen.getByRole('img', { name: `Fingerprint (SHA-256 hash): ${digest('Hello')}` })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: `Drawn fingerprint of the hash starting ${digest('Hello').slice(0, 8)}` })).toHaveLength(2);
    expect(screen.getByText('Your first fingerprint')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Hello!' } });
    expect(screen.queryByText('Same text, same fingerprint.')).toBeNull();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(screen.getByText('Same text, same fingerprint.')).toBeTruthy();
    expect(screen.getByText('Always 64 characters, for one letter or a whole book.')).toBeTruthy();
    expect(events).toEqual(['Hello', 'Hello!', 'Hello'].map(text => ({ type: 'fingerprint_made', hash: digest(text) })));
    expect(missionStatus(state.progress, 'see-a-fingerprint')).toBe('done');
  });

  it('3 one letter: counts differing characters and remembers the lowest', () => {
    const { events, state } = renderCourse({ progress: progressAt('change-one-letter') });
    expect(screen.getByLabelText('Original text').readOnly).toBe(true);
    const input = screen.getByLabelText('Your copy');
    expect(input.value).toBe(ORIGINAL);
    expect(document.querySelector('.basics-compare-count').textContent).toBe('0 of 64 characters differ');
    const texts = ['Alice pays Bob 11', 'Alice pays Bob 12', 'Alice pays Bob 13', 'Alice pays Bob 14'];
    const differ = text => [...digest(text)].filter((character, index) => character !== digest(ORIGINAL)[index]).length;
    for (const text of texts) fireEvent.change(input, { target: { value: text } });
    const counts = texts.map(differ);
    expect(document.querySelector('.basics-count').textContent).toBe(`${counts.at(-1)} of 64 characters differ`);
    expect(screen.getByText(`Lowest so far: ${Math.min(...counts)} of 64`)).toBeTruthy();
    expect(document.querySelectorAll('.basics-hash-grid .is-changed')).toHaveLength(counts.at(-1) * 2);
    expect(events).toEqual(texts.map(text => ({ type: 'fingerprints_compared', changed: differ(text), left: digest(ORIGINAL), right: digest(text) })));
    expect(missionStatus(state.progress, 'change-one-letter')).toBe('done');
  });

  it('4 guess a fingerprint: rolls until a later roll starts with 0', () => {
    const { events, state } = renderCourse({ progress: progressAt('change-fingerprint') });
    const input = screen.getByLabelText('Your text');
    expect(input.placeholder).toBe('Type your name');
    expect(screen.getByRole('button', { name: 'Roll' }).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'Learner A' } });
    expect(screen.getByRole('img', { name: `Die shows ${digest('Learner A')[0]}` })).toBeTruthy();
    // SHA-256 of "Learner A 3" is the first of these rolls to start with 0.
    for (let roll = 0; roll < 3; roll++) click('Roll');
    expect(input.value).toBe('Learner A 3');
    expect(digest('Learner A 3').startsWith('0')).toBe(true);
    expect(screen.getByText('Rolls: 4 · 16 on average')).toBeTruthy();
    expect(screen.getByText('Found after 4 rolls. Hash the text once and check the leading zero.')).toBeTruthy();
    expect(screen.getByText('Your first proof')).toBeTruthy();
    expect(document.querySelector('.basics-proof').textContent).toContain('The changing number is called a nonce. Computers that search for valid block hashes are called miners.');
    expect(events).toEqual([{ type: 'manual_hash_found', hash: digest('Learner A 3') }]);
    expect(missionStatus(state.progress, 'change-fingerprint')).toBe('done');
    // Further rolls never report a second find.
    click('Roll');
    expect(events).toHaveLength(1);
  });

  it('4 guess a fingerprint: a first text that already starts with 0 is a lucky roll, not a find', () => {
    const { events, state } = renderCourse({ progress: progressAt('change-fingerprint') });
    const input = screen.getByLabelText('Your text');
    fireEvent.change(input, { target: { value: 'Learner' } });
    expect(digest('Learner').startsWith('0815')).toBe(true);
    expect(screen.getByText('Lucky roll: 1 in 16 texts starts with 0. Roll again and find another one.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Die shows 0' })).toBeTruthy();
    expect(events).toEqual([]);
    expect(screen.queryByText('Your first proof')).toBeNull();
    let rolls = 1;
    let text = 'Learner';
    do { click('Roll'); rolls++; text = input.value; } while (!digest(text).startsWith('0'));
    expect(text).toBe(`Learner ${rolls - 1}`);
    expect(screen.getByText(`Found after ${rolls} rolls. Hash the text once and check the leading zero.`)).toBeTruthy();
    expect(events).toEqual([{ type: 'manual_hash_found', hash: digest(text) }]);
    expect(missionStatus(state.progress, 'change-fingerprint')).toBe('done');
  });

  it('4 guess a fingerprint: rolls automatically for 00 after the find', async () => {
    renderCourse({ progress: progressAt('change-fingerprint') });
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: 'Learner A' } });
    for (let roll = 0; roll < 3; roll++) click('Roll');
    const automatic = screen.getByRole('button', { name: 'Roll automatically for 00' });
    expect(automatic.className).toContain('btn-default');
    fireEvent.click(automatic);
    await waitFor(() => expect(screen.getByText(/^Found 00 after [\d,]+ attempts · 256 on average\.$/)).toBeTruthy(), { timeout: 30000 });
    const value = screen.getByLabelText('Your text').value;
    expect(value).toMatch(/^Learner A \d+$/);
    expect(digest(value).startsWith('00')).toBe(true);
  });

  it('5 why guess: three draws, each won by the first fingerprint starting with 00', () => {
    const { events, state } = renderCourse({ progress: progressAt('why-guess') });
    expect(screen.getByText('Page 1: Alice pays Bob 10')).toBeTruthy();
    const writers = ['Hal', 'Dorian', 'Laszlo'];
    const expected = [1, 2, 3].map(page => {
      const order = writers.map((_, index) => writers[(index + page - 1) % 3]);
      for (let counter = 0, rolls = 0; ; counter++) {
        for (const writer of order) {
          rolls++;
          if (digest(`Page ${page}: ${ORIGINAL} · ${writer} · ${counter}`).startsWith('00')) return { winner: writer, rolls };
        }
      }
    });
    expected.forEach(({ winner, rolls }, index) => {
      click('Run the draw');
      expect(screen.getByText(`${winner} wins page ${index + 1} after ${rolls} rolls in total and writes it. Reward: 1 coin.`)).toBeTruthy();
      expect(screen.getByText(`Page ${index + 2}: Alice pays Bob 10`)).toBeTruthy();
    });
    expect(events).toEqual(expected.map(draw => ({ type: 'draw_finished', ...draw })));
    const postage = expected.reduce((sum, draw) => sum + draw.rolls, 0);
    expect(document.querySelector('.basics-draw .basics-count').textContent).toBe(`Postage paid: ${postage} rolls in total`);
    const wins = writers.map(writer => expected.filter(draw => draw.winner === writer).length);
    expect([...document.querySelectorAll('.basics-writer-wins')].map(node => node.textContent)).toEqual(wins.map(count => `Wins: ${count}`));
    expect(missionStatus(state.progress, 'why-guess')).toBe('done');
  });

  it('5 why guess: plays the draw back over time unless reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const { events } = renderCourse({ progress: progressAt('why-guess') });
    click('Run the draw');
    expect(screen.getByText('Choosing a writer for page 1…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run the draw' }).disabled).toBe(true);
    expect(events).toEqual([]);
    act(() => { vi.advanceTimersByTime(3500); });
    expect(events).toHaveLength(1);
    expect(screen.getByText(/wins page 1 after \d+ rolls in total and writes it\. Reward: 1 coin\./)).toBeTruthy();
  });

  it('6 sealed pages: break, repair without and with guessing', () => {
    const { events, state } = renderCourse({ progress: progressAt('sealed-pages') });
    expect(screen.getAllByText('Seal fits')).toHaveLength(3);
    // Each seal goes into the next page; the tie is stated in words on pages 2 and 3.
    expect(screen.getAllByText('seal goes into')).toHaveLength(2);
    const ties = () => [...document.querySelectorAll('.basics-tie')].map(node => node.textContent);
    expect(ties()).toEqual(['Matches the seal of page 1', 'Matches the seal of page 2']);
    fireEvent.change(screen.getByLabelText('Page 1 text'), { target: { value: 'Alice pays Bob 100' } });
    expect(screen.getByText('Seal no longer fits')).toBeTruthy();
    // Page 2 still stores page 1's stored seal; it is page 1's text that no longer fits.
    expect(ties()).toEqual(['Matches the seal of page 1', 'Matches the seal of page 2']);
    expect(screen.getAllByText('Broken: built on a broken page')).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'seals_checked', valid: false, edited: true });
    click('Repair');
    expect(events.at(-1)).toEqual({ type: 'seals_repaired', zeros: 0, hashes: 3, valid: true });
    expect(screen.getAllByText('Seal fits')).toHaveLength(3);
    expect(screen.getByText('Repaired: 3 hashes in total (1 + 1 + 1). All seals fit.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Guessing'), { target: { value: '3' } });
    expect(screen.getAllByText('Seal fits')).toHaveLength(3);
    expect(screen.getByLabelText('Page 1 text').value).toBe(ORIGINAL);
    fireEvent.change(screen.getByLabelText('Page 1 text'), { target: { value: 'Alice pays Bob 100' } });
    click('Repair');
    const repaired = events.at(-1);
    expect(repaired).toMatchObject({ type: 'seals_repaired', zeros: 3, valid: true });
    expect(repaired.hashes).toBeGreaterThan(3);
    expect(screen.getByText(`Chain alone: repaired in 3 hashes. With work: ${repaired.hashes.toLocaleString('en-US')} tries.`)).toBeTruthy();
    const seals = [...document.querySelectorAll('.basics-seal')].filter(row => row.querySelector('dt').textContent === 'Seal');
    expect(seals).toHaveLength(3);
    expect(seals.every(row => row.querySelector('code').title.startsWith('000'))).toBe(true);
    expect(missionStatus(state.progress, 'sealed-pages')).toBe('done');
    expect(state.progress.completed).toEqual(BASICS);
  });
});
