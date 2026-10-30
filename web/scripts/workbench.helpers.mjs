// Locators shared by the browser acceptance scripts.

const TILE = /^(Genesis block 0|Block \d+)(,|$)/;

export function workbench(page) {
  return {
    tiles: () => page.getByRole('button', { name: TILE }),
    tile: index => page.getByRole('button', { name: index === 0 ? /^Genesis block 0(,|$)/ : new RegExp(`^Block ${index}(,|$)`) }),
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
