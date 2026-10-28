import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guard from web/DESIGN.md: colors live only in styles/tokens.css; components
// and their stylesheets refer to the tokens.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = join('styles', 'tokens.css');
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi;

function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.(css|jsx?)$/.test(name) ? [path] : [];
  });
}

// CSS comments and JS line comments may mention a literal; only code counts.
const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('design tokens', () => {
  it('no stylesheet or component outside tokens.css uses a color literal', () => {
    const offenders = sources(root)
      .filter(path => relative(root, path) !== TOKENS)
      .flatMap(path => (withoutComments(readFileSync(path, 'utf8')).match(COLOR_LITERAL) ?? [])
        .map(literal => `${relative(root, path)}: ${literal}`));
    expect(offenders).toEqual([]);
  });

  it('tokens.css defines the colors the guard sends components to', () => {
    const tokens = readFileSync(join(root, TOKENS), 'utf8');
    for (const name of ['--bg', '--panel', '--line', '--text', '--blue', '--green', '--amber', '--red']) {
      expect(tokens).toMatch(new RegExp(`${name}:`));
    }
  });
});
