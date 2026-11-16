// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HashLab } from '../components/HashLab';

const digest = text => createHash('sha256').update(text).digest('hex');
const fingerprint = () => screen.getByRole('img', { name: /^SHA-256 hash:/ }).getAttribute('aria-label').slice(14);
const edit = text => fireEvent.change(screen.getByLabelText('Your text'), { target: { value: text } });
function manualMatch() {
  let text = 'Learner A';
  for (let number = 1; !digest(text).startsWith('0'); number++) text = `Learner A ${number}`;
  edit(text);
  return text;
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('plain text hashing and manual mining', () => {
  it('hashes exactly the visible text with single SHA-256, including whitespace and Unicode', () => {
    render(<HashLab />);
    expect(fingerprint()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    edit('abc');
    expect(fingerprint()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const text of ['abc ', 'abc\n', 'Lerntext 🚀', 'a'.repeat(1000)]) {
      edit(text);
      expect(fingerprint()).toBe(digest(text));
    }
    edit('abc');
    expect(fingerprint()).toBe(digest('abc'));
    expect(screen.queryByLabelText(/Nonce/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try automatically' })).toBeNull();
  });

  it('reveals the explanation only after a manual match and continues explicitly', () => {
    render(<HashLab />);
    edit('abc');
    expect(screen.queryByRole('heading', { name: 'You mined by hand' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Explore block headers' })).toBeTruthy();
    const text = manualMatch();
    expect(screen.getByRole('heading', { name: 'You mined by hand' })).toBeTruthy();
    expect(fingerprint()).toBe(digest(text));
    // The free experiment: no mission lesson, no coach ring, one way on.
    expect(document.querySelector('[data-coach-target]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Explore block headers' })).toBeNull();
    // Restoring or editing text preserves the actual first proof, without faking a new match.
    edit('abc');
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText(digest(text))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to block mining' }));
    expect(screen.getByText('Double SHA-256 fingerprint')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'You mined by hand' })).toBeNull();
  });

  it('counts the distinct texts hashed by hand and names the try that found the proof', () => {
    render(<HashLab />);
    const misses = ['Learner B', 'Learner B 1', 'Learner B 2', 'Learner B 3'].filter(text => !digest(text).startsWith('0'));
    expect(misses).toHaveLength(4);
    for (const text of misses) edit(text);
    // Repeats and an empty field are no new tries.
    edit(misses[0]);
    edit('');
    edit(misses[1]);
    let text = 'Learner B 4';
    for (let number = 5; !digest(text).startsWith('0'); number++) text = `Learner B ${number}`;
    edit(text);
    const proof = screen.getByRole('region', { name: 'Your first proof of work' });
    expect(proof.textContent).toContain('Found on try 5.');
    expect(proof.textContent).not.toContain('lucky');
  });

  it.each([1, 2, 3])('calls a find on try %i a lucky roll', tries => {
    render(<HashLab />);
    let text = 'Learner A';
    for (let number = 1; !digest(text).startsWith('0'); number++) text = `Learner A ${number}`;
    const misses = ['abc', 'abcd'].slice(0, tries - 1);
    for (const miss of misses) {
      expect(digest(miss).startsWith('0')).toBe(false);
      edit(miss);
    }
    edit(text);
    const proof = screen.getByRole('region', { name: 'Your first proof of work' });
    expect(proof.textContent).toContain(`Found on try ${tries}. That was a lucky roll: on average it takes 16 tries.`);
  });

  it('keeps the try of the first proof and counts again after Reset', () => {
    render(<HashLab />);
    const first = manualMatch();
    edit('abc');
    edit(first);
    expect(screen.getByRole('region', { name: 'Your first proof of work' }).textContent).toContain('Found on try 1.');
    fireEvent.click(screen.getByRole('button', { name: 'Reset text experiment' }));
    edit('abc');
    edit('abcd');
    edit('abcde');
    expect(digest('abcde').startsWith('0')).toBe(false);
    manualMatch();
    const proof = screen.getByRole('region', { name: 'Your first proof of work' });
    expect(proof.textContent).toContain('Found on try 4.');
    expect(proof.textContent).not.toContain('lucky');
  });

  it('changes only the target for two zeros, then finds an independently verifiable match', async () => {
    vi.useFakeTimers();
    render(<HashLab />);
    const text = manualMatch();
    const before = fingerprint();
    fireEvent.click(screen.getByRole('button', { name: 'Try two zeros' }));
    expect(fingerprint()).toBe(before);
    expect(screen.getByLabelText('Your text').value).toBe(text);
    fireEvent.click(screen.getByRole('button', { name: 'Try automatically' }));
    await act(async () => { await vi.runAllTimersAsync(); });
    const found = screen.getByLabelText('Your text').value;
    expect(found).toMatch(/^Learner A \d+$/);
    expect(fingerprint()).toBe(digest(found));
    expect(fingerprint().startsWith('00')).toBe(true);
    const number = Number(found.split(' ').at(-1));
    expect(screen.getByRole('status').textContent).toContain(`${number.toLocaleString()} attempts`);
    // Verify the computer really stopped at the first matching number.
    for (let n = 1; n < number; n++) expect(digest(`Learner A ${n}`).startsWith('00')).toBe(false);
  });

  it.each(['edit', 'reset', 'stop', 'headers', 'unmount'])('cancels pending automation on %s', async action => {
    vi.useFakeTimers();
    const view = render(<HashLab />);
    manualMatch();
    fireEvent.click(screen.getByRole('button', { name: 'Try two zeros' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try automatically' }));
    if (action === 'edit') edit('replacement');
    if (action === 'reset') fireEvent.click(screen.getByRole('button', { name: 'Reset text experiment' }));
    if (action === 'stop') fireEvent.click(screen.getByRole('button', { name: 'Stop trying' }));
    if (action === 'headers') fireEvent.click(screen.getByRole('button', { name: 'Continue to block mining' }));
    if (action === 'unmount') view.unmount();
    await act(async () => { await vi.runAllTimersAsync(); });
    if (action === 'edit') expect(fingerprint()).toBe(digest('replacement'));
    if (action === 'reset') {
      expect(fingerprint()).toBe(digest(''));
      expect(screen.queryByRole('region', { name: 'Your first proof of work' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try automatically' })).toBeNull();
    }
    if (action === 'stop') expect(screen.getByRole('status').textContent).toContain('Stopped after 0 attempts');
    if (action === 'headers') {
      expect(screen.getByText('Double SHA-256 fingerprint')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Back to text hashing' }));
      expect(fingerprint()).toBe(digest(''));
    }
    if (action === 'unmount') expect(screen.queryByRole('status')).toBeNull();
  });
});
