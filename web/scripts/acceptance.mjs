import { verifyHashLab } from './hash-lab.acceptance.mjs';
import { verifyChainLab } from './chain-lab.acceptance.mjs';
import { verifyMissions } from './missions.acceptance.mjs';
import { verifyPool } from './pool.acceptance.mjs';
import { menu, openTab, settle, snapshot, workbench } from './workbench.helpers.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stripVTControlCharacters } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('..', import.meta.url));
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4180';
const output = process.env.SCREENSHOT_DIR || join(tmpdir(), 'proofofwork-acceptance');
const POOL_API = 'https://api.proofofwork.fyi';
const WIDTHS = [320, 390, 768, 1200, 1440];
await mkdir(output, { recursive: true });
let server, browser, page;
const results=[];
const telemetryRequests=[];
const telemetryMock = async route => {
 const request = route.request();
 const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
 if (request.method() === 'OPTIONS') { await route.fulfill({status:204,headers}); return; }
 assert.equal(new URL(request.url()).pathname, '/i/v0/e/');
 assert.equal(request.method(), 'POST');
 assert.equal(request.headers().referer, undefined);
 telemetryRequests.push(request.postDataJSON());
 await route.fulfill({status:200,headers,contentType:'application/json',body:'{"status":1}'});
};
// Synthetic leaderboard for the ticker; no pool server is ever contacted.
const FIXTURE_ROUND = { height: 900001, hash: `0000${'ab'.repeat(30)}` };
const fixtureRow = (name, bestHash, bestZeros, difficulty) => ({ name, round: FIXTURE_ROUND, nonce: 7, bestHash, bestZeros, difficulty, proofs: 3, foundAt: 0 });
const leaderboardFixture = () => {
 const rows = [fixtureRow('fixture-alpha', `000000${'1'.repeat(58)}`, 6, 1048576), fixtureRow('fixture-beta', `00000${'2'.repeat(59)}`, 5, 65536)];
 return { round: { ...FIXTURE_ROUND, rows }, allTime: rows };
};
const leaderboardMock = async route => {
 const headers = { 'Access-Control-Allow-Origin': '*' };
 if (new URL(route.request().url()).pathname !== '/api/leaderboard') { await route.abort('connectionrefused'); return; }
 await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(leaderboardFixture())});
};
// The reference views of web/DESIGN.md for review: 1512 x 860 and 390 px, both themes.
// Chain content is random per run, so they are compared by eye, not pixel by pixel.
const referenceViews = async name => {
 for (const theme of ['dark','light']) {
  if (await page.locator('html').getAttribute('data-theme') !== theme) await menu(page, theme === 'light' ? 'Light theme' : 'Dark theme');
  for (const [width,height] of [[1512,860],[390,844]]) {
   await page.setViewportSize({width,height});
   await settle(page);
   await page.evaluate(() => scrollTo(0,0));
   await page.screenshot({path:join(output,`view-${name}-${theme}-${width}.png`),fullPage:width<1024});
  }
 }
 if (await page.locator('html').getAttribute('data-theme') !== 'dark') await menu(page, 'Dark theme');
 await page.setViewportSize({width:1440,height:1000});
 await settle(page);
};
const fitsWidths = async (label) => {
 for (const width of WIDTHS) {
  await page.setViewportSize({width,height:900});
  await settle(page);
  const size = await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll <= size.width, `${label}: ${JSON.stringify(size)}`);
 }
 await page.setViewportSize({width:1440,height:1000});
};
try {
 if (!process.env.BASE_URL) {
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4180', '--strictPort'], {cwd:root, stdio:['ignore', 'pipe', 'pipe']});
  let serverLog = '';
  server.stdout.on('data', data => { serverLog += data; });
  server.stderr.on('data', data => { serverLog += data; });
  let ready = false;
  for (let i=0; i<100; i++) {
   if (server.exitCode !== null) throw new Error(`Preview exited: ${serverLog}`);
   try { if (stripVTControlCharacters(serverLog).includes(baseURL) && (await fetch(baseURL)).ok) { ready=true; break; } } catch { /* Startup only. */ }
   await new Promise(resolve => setTimeout(resolve,100));
  }
  assert.ok(ready, `Preview did not start: ${serverLog}`);
 }
 browser = await chromium.launch({channel:'chrome',headless:true});
 page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 // Install once before the app creates timers; all experiments share this clock.
 await page.clock.install();
 page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://eu.i.posthog.com/**', telemetryMock);
 await page.route(`${POOL_API}/**`, leaderboardMock);
 await page.goto(baseURL);
 const wb = workbench(page);

 // Fresh start: only Genesis and the candidate; the single primary is Start demo.
 await wb.tile(0).waitFor();
 assert.equal(await wb.tiles().count(), 1);
 assert.equal(await page.locator('.next-block .btn-primary').count(), 1);
 const ticker = page.getByRole('button',{name:/^Pool leaderboard, 2 miners, leader fixture-alpha/});
 await ticker.waitFor();
 await ticker.click();
 await page.locator('section.pool-panel').waitFor();
 assert.match(page.url(), /#\/pool$/);
 await openTab(page, 'Workbench');
 await page.getByRole('button',{name:'Start demo',exact:true}).waitFor();
 results.push('Fresh start shows Genesis, the candidate and Start demo; the leaderboard ticker opens the mining pool');

 await page.getByRole('button',{name:'Start demo',exact:true}).click();
 await wb.mine(3).waitFor({timeout:30000});
 assert.equal(await wb.tiles().count(), 3);
 assert.equal(await wb.chainPill().innerText(),'Chain valid');
 results.push('Demo distribution mines two valid blocks');

 await page.getByRole('button',{name:'New transaction',exact:true}).click();
 const form = page.getByRole('form',{name:'New transaction'});
 await form.getByRole('combobox',{name:'From'}).selectOption('Alice');
 await form.getByRole('combobox',{name:'To'}).selectOption('Bob');
 await form.getByLabel('Amount (powfyicoin)',{exact:true}).fill('0.1');
 await form.getByLabel(/^Reference/).fill('Synthetic acceptance transfer');
 await form.getByRole('button',{name:'Add to mempool'}).click();
 await page.getByRole('list',{name:'Pending transactions'}).getByText('Synthetic acceptance transfer').waitFor();
 await wb.mine(3).click();
 await wb.mine(4).waitFor({timeout:30000});
 assert.equal(await page.getByText('Synthetic acceptance transfer').count(), 0, 'The mined transfer left the mempool');
 results.push('Transfer enters the mempool and confirms in a valid block');
 await referenceViews('workbench');

 await page.getByRole('button',{name:/^Open Bob, balance 0\.7/}).click();
 const dialog=page.getByRole('dialog',{name:'Participant details'});
 await dialog.waitFor();
 await dialog.getByText('Demo recovery phrase (BIP39)',{exact:true}).waitFor();
 assert.ok((await dialog.innerText()).includes('These words recover this demo key.'));
 assert.ok((await dialog.innerText()).includes("m/44'/0'/0'/0/0"));
 assert.ok((await dialog.innerText()).includes('empty passphrase'));
 await dialog.getByRole('button',{name:'Verify recovery',exact:true}).click();
 assert.equal(await dialog.getByRole('status').innerText(),'Verified: this phrase recovers the same demo public key.');
 results.push('BIP39 recovery derives the same demo public key at the documented path');
 assert.ok((await dialog.locator('.balance-amount').innerText()).includes('0.70000000'));
 await dialog.getByRole('button',{name:/Transaction in block/}).first().click();
 const nested = page.getByRole('dialog',{name:'Transaction details',exact:true});
 await nested.waitFor();
 await page.keyboard.press('Escape');
 await nested.waitFor({state:'hidden'});
 assert.ok(await dialog.isVisible());
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'hidden'});
 results.push('Wallet balance updates; wallet and transaction dialogs open and Escape closes them');

 // Tamper with the coinbase of block #1, then repair the chain in order.
 await wb.tile(1).click();
 await page.getByRole('button',{name:'Tamper with this block',exact:true}).click();
 const editor = page.getByRole('form',{name:'Change a transaction amount in block 1'});
 await editor.getByLabel('New amount').fill('99');
 await editor.getByRole('button',{name:'Change amount'}).click();
 await wb.chainPill().filter({hasText:'Chain invalid'}).waitFor();
 assert.match(await wb.tile(1).getAttribute('aria-label'), /hash mismatch/i);
 assert.match(await wb.tile(2).getAttribute('aria-label'), /built on a broken block/i);
 assert.ok(await page.getByRole('button',{name:'Mine block #4',exact:true}).isDisabled());
 await referenceViews('tampered');
 for (const index of [1, 2, 3]) {
  await page.getByRole('button',{name:`Re-mine block #${index}`,exact:true}).click();
  if (index < 3) await page.getByRole('button',{name:`Re-mine block #${index + 1}`,exact:true}).waitFor({timeout:30000});
 }
 await wb.chainPill().filter({hasText:'Chain valid'}).waitFor({timeout:30000});
 await wb.mine(4).waitFor();
 results.push('Tampering is detected; re-mining the broken block and every later one repairs the chain');

 await fitsWidths('Workbench with history');
 await menu(page, 'Reset');
 await page.getByRole('button',{name:'Start demo',exact:true}).waitFor();
 assert.equal(await wb.tiles().count(), 1);
 await menu(page, 'Light theme');
 assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await page.screenshot({path:join(output,'light-desktop.png')});
 await menu(page, 'Dark theme');
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 results.push('Reset returns to genesis; light and dark theme work');

 // A hard target: the demo can be paused before any block is committed.
 for (let i = 0; i < 3; i++) await page.getByRole('button',{name:'Raise difficulty'}).click();
 assert.equal(await page.getByLabel('Difficulty',{exact:true}).innerText(),'5');
 await page.getByRole('button',{name:'Start demo',exact:true}).click();
 await page.getByRole('button',{name:/^Mining block #1/}).waitFor();
 await fitsWidths('Running race');
 // A lucky miner may find a block before Pause; nothing is committed after it.
 const atPause = await wb.tiles().count();
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('button',{name:/^Mining block #/}).waitFor({state:'detached'});
 await page.waitForTimeout(1000);
 assert.equal(await wb.tiles().count(), atPause, 'Pause commits no block');
 results.push('Expensive mining can be paused without a committed block; the race fits five widths');
 await menu(page, 'Settings');
 const settings = page.getByRole('dialog',{name:'Settings'});
 await settings.getByLabel('Mining difficulty',{exact:true}).fill('1');
 await settings.getByRole('button',{name:'Done'}).click();
 await page.getByRole('switch',{name:'Auto-mine'}).click();
 await wb.tile(2).waitFor({timeout:30000});
 await page.getByRole('switch',{name:'Auto-mine'}).click();
 await menu(page, 'Reset');
 await page.getByRole('button',{name:'Start demo',exact:true}).waitFor();
 results.push('Settings change the difficulty; auto-mine runs and stops; reset clears the result');

 assert.equal(telemetryRequests.length,0,'No telemetry before consent, including all prior mining operations');
 const sharing = () => page.getByLabel('Share usage and technical errors');
 const openSharing = async () => {
  if (!await page.locator('.top-bar-menu').isVisible()) await page.getByRole('button',{name:'More',exact:true}).click();
  const details = page.locator('details.analytics-control');
  if (!await details.evaluate(element => element.open)) await page.getByText(/^Usage sharing: /).click();
 };
 await openSharing();
 await page.getByText('Usage sharing: off',{exact:true}).waitFor();
 if (process.env.EXPECT_POSTHOG === '1') assert.equal(await sharing().isDisabled(),false,'Configured test build is required');
 if (!await sharing().isDisabled()) {
  const responseFor = event => page.waitForResponse(response => response.url().startsWith('https://eu.i.posthog.com/i/v0/e/') && response.request().method()==='POST' && response.request().postDataJSON()?.event===event);
  const opened=responseFor('app_opened');await sharing().check();await opened;
  await page.keyboard.press('Escape');
  const demo=responseFor('demo_completed');await page.getByRole('button',{name:'Start demo',exact:true}).click();await demo;
  assert.equal(telemetryRequests.filter(event=>event.event==='app_opened').length,1);
  assert.equal(telemetryRequests.filter(event=>event.event==='demo_started').length,1);
  assert.equal(telemetryRequests.filter(event=>event.event==='demo_completed').length,1);
  assert.equal(telemetryRequests.filter(event=>event.event==='mining_started').length,2);
  const summaries=telemetryRequests.filter(event=>event.event==='mining_completed');
  assert.equal(summaries.length,2);
  for(const summary of summaries) {
   assert.equal(summary.properties.difficulty,1);
   assert.ok(summary.properties.attempt_count>0);
   assert.ok(summary.properties.elapsed_ms>=0);
  }
  await wb.mine(3).waitFor();
  await page.getByRole('button',{name:'New transaction',exact:true}).click();
  await form.getByRole('combobox',{name:'From'}).selectOption('Alice');
  await form.getByRole('combobox',{name:'To'}).selectOption('Bob');
  await form.getByLabel('Amount (powfyicoin)',{exact:true}).fill('0.1');
  await form.getByLabel(/^Reference/).fill('private-fixture-memo');
  const transaction=responseFor('transaction_created');await form.getByRole('button',{name:'Add to mempool'}).click();await transaction;
  await menu(page, 'Settings');
  await settings.getByLabel('Coin name',{exact:true}).fill('PrivateFixtureLabel');
  await settings.getByRole('button',{name:'Done'}).click();
  const exception=responseFor('$exception');
  await page.evaluate(()=>{
   const error=new TypeError('private-fixture-error');
   window.dispatchEvent(new ErrorEvent('error',{error}));
   window.dispatchEvent(new ErrorEvent('error',{error}));
  });
  await exception;
  assert.equal(telemetryRequests.filter(event=>event.event==='$exception').length,1);
  const data=JSON.stringify(telemetryRequests);
  for(const marker of ['private-fixture-memo','PrivateFixtureLabel','private-fixture-error']) assert.ok(!data.includes(marker));
  const beforeOptOut=telemetryRequests.length;
  await openSharing();
  await sharing().uncheck();
  await page.keyboard.press('Escape');
  await menu(page, 'Reset');
  await page.getByRole('button',{name:'Start demo',exact:true}).click();
  await wb.mine(3).waitFor({timeout:30000});
  await page.waitForTimeout(100);
  assert.equal(telemetryRequests.length,beforeOptOut,'No sends after opt-out');
  await menu(page, 'Settings');
  await settings.getByLabel('Coin name',{exact:true}).fill('powfyicoin');
  await settings.getByRole('button',{name:'Done'}).click();
  results.push('Mock PostHog: explicit consent, one event per operation, mining summaries, sanitized errors and opt-out');
 } else {
  await page.keyboard.press('Escape');
  results.push('No-config build keeps usage sharing disabled and simulation usable');
 }
 await menu(page, 'Reset');
 await page.getByRole('button',{name:'Start demo',exact:true}).click();
 await wb.mine(3).waitFor({timeout:30000});
 await fitsWidths('Workbench after demo');

 // Labs in free play: the collapsed rail opens them without a mission lesson.
 await page.getByRole('button',{name:'Collapse mission rail'}).click();
 const before = await snapshot(page);
 results.push(...await verifyHashLab(page, output, before));
 results.push(...await verifyChainLab(page, output, before));
 results.push(...await verifyPool(page, output, before));
 await page.getByRole('button',{name:'Expand mission rail'}).click();
 const beforeMissionTelemetry=telemetryRequests.length;
 results.push(...await verifyMissions(page, output));
 assert.equal(telemetryRequests.length,beforeMissionTelemetry,'Missions add no telemetry while sharing is off');

 assert.deepEqual(errors,[]);
 results.push('No page errors or horizontal overflow at five widths');
 await page.close();
 const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await mobile.route('https://eu.i.posthog.com/**', telemetryMock);
 await mobile.route(`${POOL_API}/**`, leaderboardMock);
 await mobile.goto(baseURL);
 await mobile.getByRole('button',{name:'Start demo',exact:true}).click();
 await mobile.getByRole('button',{name:'Mine block #3',exact:true}).waitFor({timeout:30000});
 await mobile.screenshot({path:join(output,'mobile.png')});
 await mobile.screenshot({path:join(output,'mobile-full.png'),fullPage:true});
 const mobileLayout = await mobile.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
 assert.ok(mobileLayout.scroll <= mobileLayout.width, JSON.stringify(mobileLayout));
 console.log(JSON.stringify({results,mobile:mobileLayout,errors},null,2));
 } catch (error) {
 console.error(JSON.stringify({completed:results, failure:error.message}));
 if (page && !page.isClosed()) await page.screenshot({path:join(output,'failure.png')}).catch(() => {});
 throw error;
} finally {
 await browser?.close();
 server?.kill('SIGTERM');
}
