import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
// Locators shared by the browser acceptance scripts.

const TILE = /^(Genesis block 0|Block \d+)(,|$)/;

export function workbench(page) {
  return {
    tiles: () => page.getByRole('button', { name: TILE }),
    tile: index => page.getByRole('button', { name: index === 0 ? /^Genesis block 0(,|$)/ : new RegExp(`^Block ${index}(,|$)`) }),
    // A click holds a block and a second click lets go, so select only what is not held yet.
    select: async index => {
      const tile = page.getByRole('button', { name: index === 0 ? /^Genesis block 0(,|$)/ : new RegExp(`^Block ${index}(,|$)`) });
      if (await tile.getAttribute('aria-pressed') !== 'true') await tile.click();
    },
    shown: () => page.locator('section.selected-block .card-kit-title').first(),
    mine: index => page.getByRole('region', { name: new RegExp(`^Next block ${index}(,|$)`) }).getByRole('button', { name: 'Mining', exact: true }),
    chainPill: () => page.locator('.top-bar-chain')
  };
}

// Open the overflow menu and choose one item by the start of its name.
export async function menu(page, item) {
  const toggle = page.getByRole('button', { name: /^(More|Menu)$/ });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.locator('.top-bar-menu').getByRole('button', { name: new RegExp(`^${item}`) }).click();
  // Theme and sound keep the menu open; close it so later steps start from a clean view.
  if (await toggle.getAttribute('aria-expanded') === 'true') await page.keyboard.press('Escape');
}

// What a lab or the pool must leave untouched: chain height, next block and wallets.
export async function snapshot(page) {
  if (!page.url().match(/#\/?$/) && page.url().includes('#/')) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workbench' }).click();
  }
  const { tiles } = workbench(page);
  return {
    tiles: await tiles().count(),
    next: await page.locator('section.next-block').getAttribute('aria-label'),
    wallets: await page.getByRole('list', { name: 'Wallets' }).innerText()
  };
}

export async function openTab(page, name) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
}

// After a resize, wait until the top bar has folded (or unfolded) for the new width.
export async function settle(page) {
  await page.waitForFunction(() => (innerWidth < 768) === Boolean(document.querySelector('.top-bar.is-compact')));
}

// Independent check of a displayed 80-byte header: its double SHA-256, reversed for display.
export const headerHash = hex => {
  const once = createHash('sha256').update(Buffer.from(hex, 'hex')).digest();
  return createHash('sha256').update(once).digest().reverse().toString('hex');
};

// The header of a lab block, built here without the app's code: the text stands in for the
// transactions, the lab clock starts at Satoshi's block 0 with ten minutes per block.
export function labHeader({ data, previousHash = '0'.repeat(64), number = 0, bits, nonce }) {
  const bytes = Buffer.alloc(80);
  bytes.writeUInt32LE(1, 0);
  Buffer.from(previousHash, 'hex').reverse().copy(bytes, 4);
  const once = createHash('sha256').update(Buffer.from(data, 'utf8')).digest();
  createHash('sha256').update(once).digest().copy(bytes, 36);
  bytes.writeUInt32LE(1231006505 + number * 600, 68);
  bytes.writeUInt32LE(bits, 72);
  bytes.writeUInt32LE(nonce, 76);
  return bytes.toString('hex');
}
