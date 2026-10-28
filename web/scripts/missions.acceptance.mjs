import assert from 'node:assert/strict';
import { join } from 'node:path';
import { openTab, workbench } from './workbench.helpers.mjs';

// The mission track with the rail open: the first three missions, coach marks,
// lab lessons and progress that survives a reload. Starts on the workbench after a demo.
export async function verifyMissions(page, output) {
  const rail = page.getByRole('complementary', { name: 'Missions' });
  const done = count => rail.locator('.mission-rail-xp').filter({ hasText: `${count} of 8 done` });
  const showMe = () => rail.getByRole('button', { name: 'Show me' });
  const activeCoach = target => page.locator(`[data-coach-target="${target}"].is-active`);
  await done(0).waitFor();
  await page.screenshot({ path: join(output, 'missions-rail-1440.png') });

  // Mission 1: Show me switches to the hash lab lesson and marks the message.
  await showMe().click();
  await page.waitForURL(/#\/hash-lab$/);
  await page.getByRole('heading', { name: 'Small change. New fingerprint.' }).waitFor();
  await activeCoach('hash-lab.message').waitFor();
  await page.getByLabel('Message', { exact: true }).fill('Hello, block?');
  await done(1).waitFor();

  // Mission 2 runs in the same tab: a fixed message and two searches from nonce 0.
  await page.getByRole('heading', { name: 'Same input. A stricter target.' }).waitFor();
  await activeCoach('hash-lab.search').waitFor();
  const lab = page.locator('section.hash-lab');
  await lab.getByRole('button', { name: 'Find a nonce', exact: true }).click();
  await lab.getByRole('status').filter({ hasText: 'Target found' }).waitFor({ timeout: 30000 });
  assert.equal(await done(1).count(), 1, 'One zero alone does not finish mission 2');
  await lab.getByLabel('Find a hash starting with').selectOption('2');
  await lab.getByRole('button', { name: 'Find a nonce', exact: true }).click();
  await done(2).waitFor({ timeout: 30000 });
  await lab.getByRole('button', { name: 'Back to simulator' }).waitFor();
  // Progress lives in this browser: a reload keeps it, the simulator starts fresh.
  await page.reload();
  await done(2).waitFor();
  await openTab(page, 'Workbench');

  // Mission 3 needs funded wallets: set up the demo, then Show me marks New transaction.
  const wb = workbench(page);
  await page.getByRole('button', { name: 'Start demo', exact: true }).click();
  await wb.mine(3).waitFor({ timeout: 30000 });
  await showMe().click();
  await page.waitForURL(/#\/$/);
  await activeCoach('workbench.new-transaction').waitFor();
  await page.screenshot({ path: join(output, 'missions-coach-workbench.png') });
  await page.getByRole('button', { name: 'New transaction', exact: true }).click();
  const form = page.getByRole('form', { name: 'New transaction' });
  await form.getByRole('combobox',{name:'From'}).selectOption('Alice');
  await form.getByRole('combobox',{name:'To'}).selectOption('Bob');
  await form.getByLabel(/^Amount/).fill('0.05');
  await form.getByRole('button', { name: 'Add to mempool' }).click();
  await done(3).waitFor();
  await activeCoach('workbench.back-miner').waitFor();

  // Phone: the rail becomes a mission bar on top of the timeline.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mission-rail-bar').waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: join(output, 'missions-bar-390.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return ['Missions: Show me switches tabs and marks the step; lab lessons complete missions 1 and 2',
    'Missions: progress survives a reload; sending a coin completes mission 3 and coaches the next step'];
}
