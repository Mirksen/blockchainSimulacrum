// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MinerName } from '../components/workbench/MinerName';

const identity = (overrides = {}) => ({ name: 'Mirko', signingName: overrides.name || 'Mirko', fallback: 'Not-Satoshi-4', generated: false,
  setName: () => {}, valid: true, pool: 'ready', entry: null, ...overrides });
const status = () => document.getElementById('miner-name-status');
const show = (values, props = {}) => render(<MinerName identity={identity(values)} {...props} />);
afterEach(cleanup);

describe('MinerName', () => {
  it('invites a name while it is generated and says what it does', () => {
    const { container } = show({ name: 'Not-Satoshi-4', generated: true });
    expect(screen.getByLabelText('Enter your name').value).toBe('Not-Satoshi-4');
    expect(status().textContent).toBe('Every block you mine lands on the leaderboard under this name. Make it yours.');
    expect(container.querySelector('.miner-name.is-generated')).toBeTruthy();
    expect(container.querySelector('.miner-name.is-chosen')).toBeNull();
    cleanup();
    const chosen = show({}).container;
    expect(chosen.querySelector('.miner-name.is-generated')).toBeNull();
    expect(chosen.querySelector('.miner-name.is-chosen')).toBeTruthy();
    expect(screen.getByLabelText('Your name').value).toBe('Mirko');
    expect(screen.queryByText('Enter your name')).toBeNull();
  });

  it('keeps inviting while a generated name is being edited and steps back once the field is left', () => {
    const view = show({ name: 'Not-Satoshi-4', generated: true });
    const input = screen.getByLabelText('Enter your name');
    fireEvent.focus(input);
    // The first keystroke makes the name chosen; the label does not jump while typing.
    view.rerender(<MinerName identity={identity({ name: 'Mirko' })} />);
    expect(screen.getByLabelText('Enter your name')).toBe(input);
    expect(view.container.querySelector('.miner-name.is-generated')).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.getByLabelText('Your name')).toBe(input);
    expect(view.container.querySelector('.miner-name.is-chosen')).toBeTruthy();
  });

  it('says "Your name" while a chosen name is edited', () => {
    show({});
    const input = screen.getByLabelText('Your name');
    fireEvent.focus(input);
    expect(screen.getByLabelText('Your name')).toBe(input);
  });

  it('falls back to the generated name when the field is left empty', () => {
    const setName = vi.fn();
    show({ name: '', signingName: 'Not-Satoshi-4', generated: true, setName });
    const input = screen.getByLabelText('Enter your name');
    expect(input.getAttribute('placeholder')).toBe('Enter your name');
    fireEvent.blur(input);
    expect(setName).toHaveBeenCalledWith('Not-Satoshi-4');
  });

  it('hands every keystroke up', () => {
    const setName = vi.fn();
    show({ setName });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Mirko2' } });
    expect(setName).toHaveBeenCalledWith('Mirko2');
  });

  it('locks the name during a race', () => {
    show({}, { locked: true });
    expect(screen.getByLabelText('Your name').disabled).toBe(true);
  });

  it.each([
    ['a name in the wrong form', { name: 'no', valid: false, pool: 'idle' }, 'Use 3–20 characters: letters, digits or hyphens.'],
    ['a refused name', { pool: 'refused' }, 'This name is not available. Please choose another.'],
    ['an unreachable server', { pool: 'offline' }, 'The leaderboard server is unavailable right now. Your blocks stay in your chain.'],
    ['a block that failed', { entry: { state: 'failed', height: 4, zeros: 3, message: 'This round is over.' } }, 'Block #4 did not reach the leaderboard. This round is over.'],
  ])('marks %s as a problem', (_label, values, text) => {
    show(values);
    expect(status().textContent).toBe(text);
    expect(status().classList.contains('is-problem')).toBe(true);
  });

  it('marks only a badly formed name as invalid input', () => {
    show({ name: 'no', valid: false, pool: 'idle' });
    expect(screen.getByLabelText('Your name').getAttribute('aria-invalid')).toBe('true');
    cleanup();
    show({ pool: 'refused' });
    expect(screen.getByLabelText('Your name').getAttribute('aria-invalid')).toBeNull();
  });

  it('follows a block to the leaderboard and shows the rank the board gives', () => {
    const rows = [{ name: 'someone-else' }, { name: 'Mirko' }];
    const view = show({ pool: 'connecting' });
    expect(status().textContent).toBe('Connecting to the leaderboard…');
    view.rerender(<MinerName identity={identity()} rows={rows} />);
    expect(status().textContent).toBe('Every block you mine now carries this name · rank #2.');
    view.rerender(<MinerName identity={identity({ entry: { state: 'sending', height: 5, zeros: 1 } })} rows={rows} />);
    expect(status().textContent).toBe('Sending block #5 to the leaderboard…');
    view.rerender(<MinerName identity={identity({ entry: { state: 'accepted', height: 5, zeros: 1 } })} rows={rows} />);
    expect(status().textContent).toBe('Block #5 is on the leaderboard: 1 zero · rank #2.');
    view.rerender(<MinerName identity={identity({ entry: { state: 'accepted', height: 5, zeros: 2 } })} rows={[]} />);
    expect(status().textContent).toBe('Block #5 is on the leaderboard: 2 zeros.');
  });
});
