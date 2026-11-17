// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartChoice } from '../components/StartChoice';

afterEach(cleanup);

const options = () => within(screen.getByRole('list')).getAllByRole('button');

describe('StartChoice', () => {
  it('asks one question with three choices, each with a title and one line', () => {
    render(<StartChoice onChoose={() => {}} />);
    expect(screen.getByRole('region', { name: 'Where do you want to start?' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Where do you want to start?' })).toBeTruthy();
    expect(options().map(button => button.textContent)).toEqual([
      'Hashes are new to meStart with a coin Alice can copy. In six short scenes, discover how a blockchain keeps track of who spent it. About five minutes.',
      'I know what a hash isSkip the two fingerprint exercises and try finding a hash that starts with zero.',
      'Just let me playGo straight to the workbench to mine blocks and send coins.'
    ]);
    expect(screen.getByText('To choose again, open Starting point in the menu.')).toBeTruthy();
  });

  it('fills only the beginner choice and takes no focus', () => {
    render(<StartChoice onChoose={() => {}} />);
    expect(options().map(button => button.classList.contains('is-primary'))).toEqual([true, false, false]);
    expect(options().every(button => button.type === 'button')).toBe(true);
    expect(document.activeElement).toBe(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['Hashes are new to me', 'new'],
    ['I know what a hash is', 'hash'],
    ['Just let me play', 'play']
  ])('"%s" chooses %s', (title, choice) => {
    const onChoose = vi.fn();
    render(<StartChoice onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(choice);
  });

  it('marks nothing as current before a first answer', () => {
    render(<StartChoice onChoose={() => {}} />);
    expect(screen.queryByText('current')).toBeNull();
    expect(options().some(button => button.hasAttribute('aria-current'))).toBe(false);
  });

  it('marks the current choice with a word', () => {
    render(<StartChoice current="hash" onChoose={() => {}} />);
    const current = screen.getByRole('button', { name: /^I know what a hash is current/ });
    expect(within(current).getByText('current')).toBeTruthy();
    expect(current.getAttribute('aria-current')).toBe('true');
    expect(screen.getAllByText('current')).toHaveLength(1);
  });

  it('is keyboard operable: every choice is a native button in reading order', () => {
    const onChoose = vi.fn();
    render(<StartChoice onChoose={onChoose} />);
    const [, second] = options();
    second.focus();
    expect(document.activeElement).toBe(second);
    // A native button turns Enter and Space into a click; jsdom only dispatches the click.
    fireEvent.click(document.activeElement);
    expect(onChoose).toHaveBeenCalledWith('hash');
  });
});
