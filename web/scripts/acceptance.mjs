import { verifyMiningFeedback } from './mining-feedback.acceptance.mjs';
import { verifyMiningControlsAndSound } from './mining-controls.acceptance.mjs';
import { verifyForkLab, verifyForkMission } from './fork-lab.acceptance.mjs';
import { verifyHashLab } from './hash-lab.acceptance.mjs';
import { verifyChainLab } from './chain-lab.acceptance.mjs';
import { verifyForgeMission, verifyMissions, verifyMissionReload } from './missions.acceptance.mjs';
import { verifyMissionVisibility } from './missions-visibility.acceptance.mjs';
import { verifyPool } from './pool.acceptance.mjs';
import { verifyMinerName } from './miner-name.acceptance.mjs';
import { headerHash, menu, openTab, settle, snapshot, workbench } from './workbench.helpers.mjs';
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
const fixtureRow = (name, bestHash, bestZeros, difficulty) => ({ name, round: FIXTURE_ROUND, header: '00'.repeat(80), coinbase: '00', branch: [], bestHash, bestZeros, difficulty, proofs: 3, foundAt: 0 });
const leaderboardFixture = () => {
 const rows = [fixtureRow('fixture-alpha', `000000${'1'.repeat(58)}`, 6, 1048576), fixtureRow('fixture-beta', `00000${'2'.repeat(59)}`, 5, 65536)];
 return { recent: { from: FIXTURE_ROUND.height - 143, to: FIXTURE_ROUND.height, rows }, allTime: rows };
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
 results.push(...await verifyMiningControlsAndSound(browser, baseURL, output));
 results.push(...await verifyMiningFeedback(browser, baseURL, output));
 results.push(...await verifyMissionVisibility(browser, baseURL, output));
 results.push(...await verifyMissionReload(browser, baseURL, output));
 results.push(...await verifyForgeMission(browser, baseURL, output));
 page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 // Install once before the app creates timers; all experiments share this clock.
 await page.clock.install();
 page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://eu.i.posthog.com/**', telemetryMock);
 await page.route(`${POOL_API}/**`, leaderboardMock);
 await page.goto(baseURL);
 const wb = workbench(page);

 // Usage sharing is on by default (opt-out, Mirko 2026-11-03): a first visit sends
 // app_opened and shows the notice; opting out takes Settings, the switch and Save choice.
 const usageNotice = page.getByRole('region',{name:'This site counts usage'});
 if (process.env.EXPECT_POSTHOG === '1') {
  await usageNotice.waitFor();
  for (let i=0; i<50 && !telemetryRequests.some(event=>event.event==='app_opened'); i++) await page.waitForTimeout(100);
  assert.equal(telemetryRequests.filter(event=>event.event==='app_opened').length,1,'A first visit shares by default');
  assert.equal(await usageNotice.getByRole('link',{name:'Privacy policy'}).getAttribute('href'),'/privacy.html');
  await page.screenshot({path:join(output,'view-usage-notice-1440.png')});
  assert.equal(await usageNotice.locator('.btn-primary').innerText(),'OK','OK is the one filled button');
  await usageNotice.getByRole('button',{name:'Settings',exact:true}).click();
  await usageNotice.getByRole('checkbox',{name:'Share usage counts'}).uncheck();
  await usageNotice.getByRole('button',{name:'Save choice',exact:true}).click();
  await usageNotice.waitFor({state:'detached'});
  telemetryRequests.length = 0;
  results.push('First visit: usage sharing is on with a notice; opting out via Settings stops it and the notice stays away');
 } else {
  assert.equal(await usageNotice.count(), 0, 'No notice without a token: nothing is shared');
 }

 // First visit: the rail is collapsed and one card invites to the missions; dismissing it is remembered.
 const intro = page.getByRole('region',{name:'Curious? Try a mission.'});
 await intro.waitFor();
 assert.equal(await page.locator('.mission-rail.is-collapsed').count(), 1);
 await page.screenshot({path:join(output,'view-intro-dark-1440.png')});
 await intro.getByRole('button',{name:"Don't show again"}).click();
 await intro.waitFor({state:'detached'});
 await page.reload();
 await wb.tile(0).waitFor();
 assert.equal(await intro.count(), 0, 'The dismissed intro stays away after a reload');
 assert.equal(await page.locator('.mission-rail.is-collapsed').count(), 1);
 results.push('First visit: collapsed rail with a mission intro that stays away once dismissed');

 // Fresh start: only Genesis and the candidate; the single primary is Start demo.
 await wb.tile(0).waitFor();
 assert.equal(await wb.tiles().count(), 1);
 assert.equal(await page.locator('.next-block .btn-primary').count(), 1);
 const controls = page.getByRole('group',{name:'Mining controls'});
 assert.equal(await controls.getByRole('button',{name:'Auto-mine',exact:true}).getAttribute('aria-pressed'), 'false', 'Manual mining is the default');
 assert.equal(await controls.getByRole('button',{name:'Start demo',exact:true}).count(), 1, 'Play and Repeat share one control group');
 const ticker = page.getByRole('button',{name:/^Leaderboard, 2 miners, leader fixture-alpha/});
 await ticker.waitFor();
 await ticker.click();
 await page.locator('section.pool-panel').waitFor();
 assert.match(page.url(), /#\/pool$/);
 await openTab(page, 'Workbench');
 await page.getByRole('button',{name:'Start demo',exact:true}).waitFor();
 assert.deepEqual(await page.locator('.next-block-lane[data-miner]').evaluateAll(lanes => lanes.map(lane => lane.dataset.miner)), ['Hal','Dorian','Laszlo'], 'Default miners');
 assert.deepEqual(await page.getByRole('list',{name:'Wallets'}).locator('.wallets-card-nm').allInnerTexts(), ['Hal','Dorian','Laszlo','Alice','Bob','Chris'], 'Miners first, then the default wallets');
 results.push('Fresh start shows Genesis, the candidate and Start demo with miners Hal, Dorian and Laszlo; the leaderboard ticker opens the leaderboard');

 // Start demo mines only #1; its reward goes out as transfers that wait in the mempool for #2.
 await page.getByRole('button',{name:'Start demo',exact:true}).click();
 await wb.mine(2).waitFor({timeout:30000});
 assert.equal(await wb.tiles().count(), 2, 'Start demo mines only block #1');
 assert.equal(await wb.tile(0).count(), 1);
 assert.equal(await wb.tile(1).count(), 1);
 assert.equal(await wb.chainPill().innerText(),'Chain valid');
 const demoTransfers = page.getByRole('list',{name:'Pending transactions'}).locator('li.mempool-card-tx:not(.is-coinbase)').filter({hasText:'Demo distribution'});
 const walletCount = await page.getByRole('list',{name:'Wallets'}).locator('.wallets-card-nm').count();
 assert.equal(await demoTransfers.count(), walletCount - 1, 'One demo transfer to each other wallet waits in the mempool');
 // One click on Mining (Auto-mine off) mines exactly one block: the demo transfers.
 await wb.mine(2).click();
 await wb.mine(3).waitFor({timeout:30000});
 await page.waitForTimeout(1500);
 assert.equal(await wb.tiles().count(), 3, 'One Mining click adds exactly one block');
 assert.equal(await wb.mine(3).count(), 1, 'No further block starts after one click');
 assert.equal(await demoTransfers.count(), 0, 'Block #2 confirmed the demo transfers');
 assert.equal(await wb.chainPill().innerText(),'Chain valid');
 results.push('Start demo mines only #1 and leaves the distribution transfers in the mempool; one Mining click mines exactly #2');

 // The top bar carries no chain status and no coin pill; the coin label lives in the menu at every width.
 for (const width of WIDTHS) {
  await page.setViewportSize({width,height:900});
  await settle(page);
  assert.equal(await page.locator('.top-bar-chain').count(), 0, `No chain pill in the top bar at ${width}`);
  assert.equal(await page.locator('.top-bar-coin').count(), 0, `No coin pill in the top bar at ${width}`);
  assert.equal(await page.locator('.top-bar').getByText(/Chain (in)?valid/).count(), 0, `The top bar names no chain status at ${width}`);
  const toggle = page.getByRole('button',{name:/^(More|Menu)$/});
  await toggle.click();
  const coin = page.locator('.top-bar-menu-coin');
  await coin.waitFor();
  assert.equal(await coin.innerText(), 'powfyicoin · virtual', `The menu names the virtual coin at ${width}`);
  await page.keyboard.press('Escape');
  await coin.waitFor({state:'detached'});
 }
 await page.setViewportSize({width:1440,height:1000});
 await settle(page);
 results.push('The top bar drops the chain and coin pills; the menu names the virtual coin at five widths');

 // The chain band: one sideways row, numbers above the tiles, ages on them, no paging or hint text.
 const band = page.locator('section.chain-band');
 assert.equal(await wb.chainScroll().count(), 1);
 assert.equal(await band.getByRole('button',{name:/earlier|newer|Show checks|Hide checks/i}).count(), 0, 'No paging or checks buttons');
 assert.equal(await band.locator('.chain-band-earlier, .chain-band-newer, .chain-band-hint, .chain-band-health-toggle').count(), 0);
 assert.doesNotMatch(await band.innerText(), /click a block to hold it|grows to the right/);
 for (const index of [0, 1, 2]) {
  const item = band.locator(`.chain-band-item[data-index="${index}"]`);
  const num = item.locator('.chain-band-num');
  assert.equal(await num.innerText(), `#${index}`);
  const [numBox, tileBox] = [await num.boundingBox(), await item.locator('.chain-band-tile').boundingBox()];
  assert.ok(numBox.y + numBox.height <= tileBox.y + 1, `#${index} sits above its tile: ${JSON.stringify({numBox,tileBox})}`);
  // The age sits in the tile's bottom line; the top row holds only the tag and the interval.
  const age = await item.locator('.chain-band-tile-foot .chain-band-age').innerText();
  assert.match(age, /^(just now|\d+ (min|h) ago|\d+ days? ago)$/, `Age on tile #${index}`);
  assert.doesNotMatch(age, / s ago/, `No seconds in the age of tile #${index}`);
  assert.equal(await item.locator('.chain-band-tile-top .chain-band-age').count(), 0, `No age in the top row of tile #${index}`);
  const topParts = await item.locator('.chain-band-tile-top > *').evaluateAll(parts => parts.map(part => part.className));
  for (const part of topParts) assert.ok(['chain-band-tag','chain-band-time'].includes(part), `Top row of tile #${index} holds only tag and interval: ${topParts}`);
  assert.doesNotMatch(await item.locator('.chain-band-tile-face').innerText(), /meets/, `No "meets" on tile #${index}`);
 }
 assert.match(await band.locator('.chain-band-item[data-index="0"] .chain-band-age').innerText(), / ago$/, 'Genesis was mined before this visit');
 // Ages never show seconds: 20 s on the page clock is still "just now", 80 s is "1 min ago".
 const tileAges = () => band.locator('.chain-band-tile-foot .chain-band-age').allInnerTexts();
 await page.clock.fastForward(20000);
 await page.waitForTimeout(200);
 for (const index of [1, 2]) assert.equal(await band.locator(`.chain-band-item[data-index="${index}"] .chain-band-age`).innerText(), 'just now', `Tile #${index} after 20 s`);
 for (const age of await tileAges()) assert.doesNotMatch(age, / s ago/, `No seconds in any tile age: ${age}`);
 await page.clock.fastForward(60000);
 for (const index of [1, 2]) await band.locator(`.chain-band-item[data-index="${index}"] .chain-band-age`).filter({hasText:/^1 min ago$/}).waitFor();
 for (const age of await tileAges()) assert.doesNotMatch(age, / s ago/, `No seconds in any tile age: ${age}`);
 // The pill is the only chain status; a click opens the check line and the checks per block.
 const pill = wb.chainPill();
 const checks = band.getByRole('list',{name:'Checks per block'});
 assert.equal(await pill.count(), 1);
 assert.equal(await pill.getAttribute('aria-expanded'), 'false');
 assert.equal(await checks.count(), 0);
 assert.equal(await band.locator('.chain-band-health-text').count(), 0, 'The check line stays closed until asked for');
 await pill.click();
 assert.equal(await pill.getAttribute('aria-expanded'), 'true');
 await checks.waitFor();
 assert.equal(await pill.getAttribute('aria-controls'), await checks.getAttribute('id'));
 assert.match(await band.locator('.chain-band-health-text').innerText(), /2 of 2 .*2 of 2 links intact/s);
 assert.ok(await checks.getByRole('listitem').count() >= 3, 'One check per block and the candidate');
 await pill.click();
 assert.equal(await pill.getAttribute('aria-expanded'), 'false');
 await checks.waitFor({state:'detached'});
 results.push('Chain band: one scrolling row, block numbers above tiles, ages in minutes on the tile foot without "meets"; the "Chain valid" pill toggles the checks');

 // The block card names no miner in its head; the Next block card shows no link, bits or odds.
 assert.equal(await page.locator('section.selected-block .card-kit-aside').count(), 0, 'A valid block has no aside');
 assert.doesNotMatch(await page.locator('section.selected-block .card-kit-head').innerText(), /mined by/);
 assert.equal(await page.getByRole('button',{name:'Show newest',exact:true}).count(), 0);
 const nextText = await page.locator('section.next-block').innerText();
 for (const gone of [/builds on #/, /bits 0x/, /Odds per block/]) assert.doesNotMatch(nextText, gone);
 results.push('Block card without "mined by" or "Show newest"; Next block without "builds on", bits and odds');

 // Between races a click on a miner renames it everywhere and sets its hashpower as a share.
 const winner = await band.locator('.chain-band-item[data-index="1"] .chain-band-who').innerText();
 assert.ok(['Hal','Dorian','Laszlo'].includes(winner), winner);
 const RENAMED = 'Testminer7';
 await wb.minerButton(winner).click();
 assert.equal(await wb.minerButton(winner).getAttribute('aria-expanded'), 'true');
 let editor = wb.minerEditor(winner);
 await editor.getByRole('textbox',{name:'Name'}).fill(RENAMED);
 await editor.getByRole('textbox',{name:'Name'}).press('Enter');
 await editor.waitFor({state:'detached'});
 await page.locator(`.next-block-lane[data-miner="${RENAMED}"]`).waitFor();
 assert.equal(await page.locator(`.next-block-lane[data-miner="${winner}"]`).count(), 0, 'The lane follows the new name');
 const walletList = page.getByRole('list',{name:'Wallets'});
 await walletList.getByRole('button',{name:new RegExp(`^Open ${RENAMED}, balance`)}).waitFor();
 assert.equal(await walletList.getByRole('button',{name:new RegExp(`^Open ${winner}, balance`)}).count(), 0, 'The wallet follows the new name');
 assert.equal(await band.locator('.chain-band-item[data-index="1"] .chain-band-who').innerText(), RENAMED, 'The chain tile follows the new name');
 assert.equal(await band.locator('.chain-band-who').filter({hasText:new RegExp(`^${winner}$`)}).count(), 0, 'No tile keeps the old name');
 await wb.minerButton(RENAMED).click();
 editor = wb.minerEditor(RENAMED);
 const power = editor.getByRole('slider',{name:`${RENAMED}'s share of the hashpower`});
 const share = editor.locator('output.miner-share-value');
 assert.deepEqual([await power.getAttribute('min'), await power.getAttribute('max'), await power.inputValue()], ['5','90','33']);
 assert.equal(await share.innerText(), '33 %', 'Three equal miners share one third each');
 await power.focus();
 await page.keyboard.press('End');
 await share.filter({hasText:/^90 %$/}).waitFor();
 assert.equal(await power.getAttribute('aria-valuetext'), '90 %, 90 % chance to find the next block');
 assert.match(await editor.innerText(), /Takes from the others in proportion: \w+ 5 % · \w+ 5 %/);
 await page.keyboard.press('Home');
 await share.filter({hasText:/^5 %$/}).waitFor();
 for (let i = 0; i < 28; i++) await page.keyboard.press('ArrowRight');
 await share.filter({hasText:/^33 %$/}).waitFor();
 await editor.getByRole('button',{name:'Done',exact:true}).click();
 await editor.waitFor({state:'detached'});
 results.push('A click on a miner opens its popover: a rename reaches the lane, the wallets and the chain tiles; the share slider gives way in proportion');

 await page.getByRole('button',{name:'New transaction',exact:true}).click();
 const form = page.getByRole('form',{name:'New transaction'});
 await form.getByRole('combobox',{name:'From'}).selectOption('Alice');
 await form.getByRole('combobox',{name:'To'}).selectOption('Bob');
 await form.getByLabel('Amount (powfyicoin)',{exact:true}).fill('0.1');
 await form.getByLabel(/^Reference/).fill('Synthetic acceptance transfer');
 // Priced at the default 5 sat/B from its estimated size (the longest signature).
 assert.match(await form.getByRole('status').innerText(), /Spends 1 coin \(0\.60\) · 0\.10 to Bob · 0\.4999867 change · 0\.0000133 fee \(about 266 B at 5 sat\/B\)/);
 assert.equal(await form.getByLabel('Fee rate').inputValue(), '5');
 await form.getByRole('button',{name:'Add to mempool'}).click();
 const pendingList = page.getByRole('list',{name:'Pending transactions'});
 await pendingList.getByText('Synthetic acceptance transfer').waitFor();
 assert.match(await pendingList.innerText(), /1 coin · 0\.4999867 change · 0\.0000133 fee · 26[56] B · 5 sat\/B/);
 assert.match(await page.getByRole('region',{name:'Mempool'}).innerText(), /Block space #3\s+26[56] B of 1,300 B/);
 await pendingList.getByRole('button',{name:/^Details of Alice to Bob/}).click();
 const pendingDialog = page.getByRole('dialog',{name:'Transaction details',exact:true});
 await pendingDialog.getByRole('list',{name:'Outputs'}).waitFor();
 assert.equal(await pendingDialog.getByRole('list',{name:'Outputs'}).getByRole('listitem').count(), 3, 'Payment, change and memo');
 await page.keyboard.press('Escape');
 await pendingDialog.waitFor({state:'hidden'});
 results.push('The form previews coins, change, fee, size and fee rate; a pending transaction shows its inputs, outputs and the next block\'s space');
 await wb.mine(3).click();
 await wb.mine(4).waitFor({timeout:30000});
 assert.equal(await page.getByText('Synthetic acceptance transfer').count(), 0, 'The mined transfer left the mempool');
 results.push('Transfer enters the mempool and confirms in a valid block');
 // The chain lives in this browser: a reload continues with the same blocks, hashes and balances.
 const savedHashes = await page.evaluate(() => JSON.parse(localStorage.getItem('proofofwork-chain')).blocks.map(block => block.hash));
 const balancesBefore = await page.getByRole('list',{name:'Wallets'}).innerText();
 await page.reload();
 await wb.mine(4).waitFor();
 assert.equal(await wb.tiles().count(), savedHashes.length + 1, 'Genesis and every saved block are back');
 assert.equal(await page.getByRole('list',{name:'Wallets'}).innerText(), balancesBefore, 'Balances survive a reload');
 assert.equal(await page.getByRole('button',{name:'Start demo',exact:true}).count(), 0);
 await page.getByRole('button',{name:/^(More|Menu)$/}).click();
 await page.locator('.top-bar-menu').getByText('Chain saved in this browser · Reset starts over').waitFor();
 await page.keyboard.press('Escape');
 results.push('A reload restores the saved chain, its balances and the next block; the menu says the chain is saved');
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
 assert.equal(await dialog.getByRole('list',{name:'Unspent outputs'}).getByRole('listitem').count(), 2, 'Bob holds two coins');
 await dialog.getByRole('button',{name:/Transaction in block/}).first().click();
 const nested = page.getByRole('dialog',{name:'Transaction details',exact:true});
 await nested.waitFor();
 assert.match(await nested.innerText(), /Fee = inputs − outputs/);
 assert.match(await nested.innerText(), /Every input passes its script/);
 await page.keyboard.press('Escape');
 await nested.waitFor({state:'hidden'});
 assert.ok(await dialog.isVisible());
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'hidden'});
 results.push('Wallet balance updates; wallet and transaction dialogs open and Escape closes them');

 const tamper = async (index, amount) => {
  await wb.select(index);
  await page.getByRole('button',{name:'Tamper with this block',exact:true}).click();
  const editor = page.getByRole('form',{name:`Change a transaction amount in block ${index}`});
  await editor.getByLabel('New amount').fill(amount);
  await editor.getByRole('button',{name:'Change amount'}).click();
  await wb.chainPill().filter({hasText:'Chain invalid'}).waitFor();
 };

 // A delayed copy belongs to the old hash, even if this block changes before it finishes.
 // Keep clipboard writes inside this page fixture; never change the system clipboard.
 await page.evaluate(() => {
  window.clipboardFixture = { descriptor: Object.getOwnPropertyDescriptor(navigator, 'clipboard'), writes: [] };
  Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:text => new Promise(resolve => {
   window.clipboardFixture.writes.push(text);
   window.clipboardFixture.finish = resolve;
  }) } });
 });
 await wb.tile(1).hover();
 await page.getByRole('button',{name:'Copy full hash of block 1',exact:true}).click();
 assert.equal(await page.evaluate(() => window.clipboardFixture.writes.length), 1);
 // The coinbase of block #1 is spent in block #2: a new txid leaves that spend pointing at nothing.
 await tamper(1, '3');
 // Hold the feedback timer: waiting for it to expire would let the buggy code pass.
 await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
 try {
  await page.evaluate(() => window.clipboardFixture.finish());
  await wb.tile(1).hover();
  await page.clock.runFor(50);
  assert.equal(await page.getByRole('button',{name:'Copy full hash of block 1',exact:true}).count(), 1, 'The edited hash still offers Copy');
  assert.equal(await page.getByRole('button',{name:'Copied',exact:true}).count(), 0, 'The old hash copy must not confirm the edited hash');
  await page.screenshot({path:join(output,'clipboard-edited-hash.png')});
 } finally { await page.clock.resume(); }
 await page.evaluate(() => {
  const descriptor = window.clipboardFixture.descriptor;
  if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
  else delete navigator.clipboard;
  delete window.clipboardFixture;
 });
 results.push('A delayed chain-band copy cannot report the edited hash as copied');
 const undoEdit = page.getByRole('button',{name:'Undo edit in block #1',exact:true});
 await undoEdit.waitFor();
 assert.match(await page.locator('.next-block-repair-row').innerText(), /that output no longer exists/);
 assert.equal(await page.getByRole('button',{name:'Re-mine block #1',exact:true}).count(), 0);
 await referenceViews('tampered-spent');
 await undoEdit.click();
 await wb.chainPill().filter({hasText:'Chain valid'}).waitFor();
 results.push('Editing a spent coin is a dead end that only Undo leaves, and the reason says why');

 // The coinbase of block #2 is unspent: lowering it can be repaired by redoing the work.
 await tamper(2, '1');
 assert.match(await wb.tile(2).getAttribute('aria-label'), /hash mismatch/i);
 assert.match(await wb.tile(3).getAttribute('aria-label'), /built on a broken block/i);
 assert.ok(await wb.mine(4).isDisabled());
 // Tampering opens the checks by itself; the "Chain invalid" pill closes and reopens them.
 const invalidPill = wb.chainPill().filter({hasText:'Chain invalid'});
 await checks.waitFor();
 assert.equal(await invalidPill.getAttribute('aria-expanded'), 'true', 'Tampering opens the checks');
 await invalidPill.click();
 await checks.waitFor({state:'detached'});
 assert.equal(await invalidPill.getAttribute('aria-expanded'), 'false', 'The invalid pill closes the checks');
 await invalidPill.click();
 await checks.waitFor();
 assert.equal(await invalidPill.getAttribute('aria-expanded'), 'true', 'The invalid pill reopens the checks');
 await referenceViews('tampered');
 for (const index of [2, 3]) {
  await page.getByRole('button',{name:`Re-mine block #${index}`,exact:true}).click();
  if (index < 3) await page.getByRole('button',{name:`Re-mine block #${index + 1}`,exact:true}).waitFor({timeout:30000});
 }
 await wb.chainPill().filter({hasText:'Chain valid'}).waitFor({timeout:30000});
 await wb.mine(4).waitFor();
 results.push('Tampering is detected and opens the checks, which the "Chain invalid" pill closes and reopens; re-mining the broken block and every later one repairs the chain');

 // A mined block can be recomputed from the bytes it shows, without the app.
 await wb.select(2);
 await page.getByRole('button',{name:'Details',exact:true}).click();
 const blockDetails = page.getByRole('dialog',{name:'Block details'});
 await blockDetails.waitFor();
 const headerBytes = (await blockDetails.locator('.header-bytes-raw').allTextContents()).join('');
 assert.equal(headerBytes.length,160);
 assert.equal(await blockDetails.locator('.header-bytes-note code').innerText(),headerHash(headerBytes));
 await page.screenshot({path:join(output,'block-details.png')});
 await page.keyboard.press('Escape');
 await blockDetails.waitFor({state:'hidden'});
 results.push('A mined block is recomputed from its 80 displayed bytes with node:crypto');
 // The card follows the newest block unless one is held; a held block outlives new blocks.
 const held = await wb.tile(2).getAttribute('aria-pressed');
 assert.equal(held,'true');
 assert.equal(await wb.shown().innerText(),'Block #2');
 await wb.mine(4).click();
 await wb.tile(4).waitFor({timeout:30000});
 assert.equal(await wb.shown().innerText(),'Block #2','A held block stays shown while new blocks arrive');
 const rows = page.getByRole('list',{name:'Transactions'}).locator('.block-tx-row');
 assert.ok(await rows.count()>=1);
 await rows.first().click();
 assert.match(await page.locator('.block-tx-id code').innerText(),/^[0-9a-f]{64}$/);
 assert.equal((await page.locator('.selected-block-hash').first().innerText()).replace(/\s/g,'').length,64);
 await page.getByRole('button',{name:'Scripts, signature and raw bytes',exact:true}).click();
 const blockTx = page.getByRole('dialog',{name:'Transaction details'});
 await blockTx.waitFor();
 await page.keyboard.press('Escape');
 await blockTx.waitFor({state:'hidden'});
 await wb.tile(2).click();
 assert.equal(await wb.shown().innerText(),'Block #4','A second click follows the newest again');
 assert.equal(await wb.tile(4).getAttribute('aria-pressed'),'false');
 // Holding and letting go happen on the tile itself; the card offers no "Show newest".
 await wb.tile(1).click();
 assert.equal(await wb.shown().innerText(),'Block #1');
 assert.equal(await wb.tile(1).getAttribute('aria-pressed'),'true');
 assert.equal(await page.getByRole('button',{name:'Show newest',exact:true}).count(), 0, 'A held block offers no "Show newest"');
 await wb.tile(1).click();
 assert.equal(await wb.shown().innerText(),'Block #4','Clicking the held tile again follows the newest');
 assert.equal(await wb.tile(1).getAttribute('aria-pressed'),'false');
 // Tampering shows the block without holding it: a valid chain follows the newest block again.
 await page.getByRole('button',{name:'Tamper with this block',exact:true}).click();
 const newestEditor = page.getByRole('form',{name:'Change a transaction amount in block 4'});
 await newestEditor.getByLabel('New amount').fill('1');
 await newestEditor.getByRole('button',{name:'Change amount'}).click();
 await wb.chainPill().filter({hasText:'Chain invalid'}).waitFor();
 assert.equal(await wb.tile(4).getAttribute('aria-pressed'),'false','A repair holds no block');
 await wb.tile(3).click();
 assert.equal(await wb.shown().innerText(),'Block #3','A click outranks the repair');
 await wb.tile(3).click();
 assert.equal(await wb.shown().innerText(),'Block #4');
 await page.getByRole('button',{name:'Undo edit',exact:true}).first().click();
 await wb.chainPill().filter({hasText:'Chain valid'}).waitFor();
 await wb.mine(5).click();
 await wb.tile(5).waitFor({timeout:30000});
 assert.equal(await wb.shown().innerText(),'Block #5','After a repair the card follows the newest block');
 results.push('The block card follows the newest block, holds a clicked block and opens its transactions in place');

 // The touchpad scrolls the chain sideways: a horizontal wheel moves the row, no paging buttons.
 await page.setViewportSize({width:1100,height:900});
 await settle(page);
 await page.evaluate(() => scrollTo(0,0));
 const scroller = wb.chainScroll();
 const scrollState = () => scroller.evaluate(el => ({left:el.scrollLeft, max:el.scrollWidth - el.clientWidth}));
 // Smooth scrolling animates; read the position once it has come to rest.
 const resting = async () => {
  let last = null, still = 0;
  for (let i = 0; i < 60 && still < 3; i++) {
   const now = await scrollState();
   still = last && now.left === last.left ? still + 1 : 0;
   last = now;
   await page.waitForTimeout(100);
  }
  assert.equal(still, 3, `The chain row comes to rest: ${JSON.stringify(last)}`);
  return last;
 };
 const start = await resting();
 assert.ok(start.max > 100, `Six blocks overflow the band at 1100 px: ${JSON.stringify(start)}`);
 assert.equal(await page.locator('section.chain-band').getByRole('button',{name:/earlier|newer/i}).count(), 0, 'No paging buttons');
 const scrollBox = await scroller.boundingBox();
 const rowBox = await scroller.locator('.chain-band-row').first().boundingBox();
 await page.mouse.move(scrollBox.x + scrollBox.width / 2, rowBox.y + rowBox.height / 2);
 // Scroll toward the far side first, then back: either way the row must move by the wheel's deltaX.
 const [first, second] = start.left > start.max / 2 ? [-400, 400] : [400, -400];
 await page.mouse.wheel(first, 0);
 const middle = await resting();
 assert.ok((middle.left - start.left) * Math.sign(first) > 50, `A wheel deltaX of ${first} moves the row: ${start.left} -> ${middle.left}`);
 await page.mouse.wheel(second, 0);
 const end = await resting();
 assert.ok((end.left - middle.left) * Math.sign(second) > 50, `A wheel deltaX of ${second} moves the row: ${middle.left} -> ${end.left}`);
 await page.mouse.move(0, 0);
 results.push(`A horizontal wheel scrolls the chain row (scrollLeft ${start.left} -> ${middle.left} -> ${end.left}); no paging buttons`);

 // The scroller reaches below the band for the hash tooltip; clicks there reach the cards.
 await page.setViewportSize({width:1440,height:1000});
 await settle(page);
 await page.evaluate(() => scrollTo(0,0));
 const below = await page.evaluate(() => {
  const band = document.querySelector('section.chain-band').getBoundingClientRect();
  const room = document.querySelector('.chain-band-scroll').getBoundingClientRect();
  const buttons = [...document.querySelectorAll('.wb-shell button')].filter(button => {
   const box = button.getBoundingClientRect();
   return !button.closest('section.chain-band') && box.width > 0 && box.height > 0 && box.top >= band.bottom && box.top + box.height / 2 < room.bottom;
  });
  return {bandBottom:band.bottom, roomBottom:room.bottom, buttons:buttons.map(button => {
   const box = button.getBoundingClientRect();
   const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
   return {name:button.getAttribute('aria-label') || button.textContent.trim(), hit:Boolean(hit) && (hit === button || button.contains(hit))};
  })};
 });
 assert.ok(below.roomBottom > below.bandBottom, `The tooltip room reaches below the band: ${JSON.stringify(below)}`);
 assert.ok(below.buttons.length > 0, `Card buttons sit just below the band: ${JSON.stringify(below)}`);
 for (const button of below.buttons) assert.ok(button.hit, `The element under "${button.name}" is that button: ${JSON.stringify(below)}`);
 await page.getByRole('button',{name:'Tamper with this block',exact:true}).click({trial:true});
 results.push(`Clicks below the chain band reach the cards: ${below.buttons.length} buttons in the tooltip room are hit directly`);

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
 for (let i = 0; i < 6; i++) await page.getByRole('button',{name:'Raise difficulty'}).click();
 assert.equal(await page.getByLabel('Difficulty',{exact:true}).innerText(),'10');
 assert.equal(await page.getByRole('button',{name:'Raise difficulty'}).isDisabled(),true);
 await page.getByRole('button',{name:'Start demo',exact:true}).press('Enter');
 await page.getByText('Mining block #1…',{exact:true}).waitFor();
 assert.ok(await page.getByRole('button',{name:'Pause',exact:true}).evaluate(el => el === document.activeElement), 'Play keeps keyboard focus as Pause');
 await fitsWidths('Running race');
 await page.screenshot({path:join(output,'difficulty-10-running.png')});
 // During a race: every miner's stream, a share change from the next turn, the drawer beside the race.
 await page.getByRole('button',{name:'All streams',exact:true}).click();
 const wall = page.getByLabel('Attempts of every miner',{exact:true});
 await wall.getByRole('table',{name:'Newest attempts of Hal'}).getByRole('row').nth(5).waitFor();
 await wb.liveMinerButton('Hal').click();
 const halPopover = wb.minerEditor('Hal');
 assert.equal(await halPopover.getByRole('textbox',{name:'Name'}).count(), 0, 'No rename during a race');
 await halPopover.getByRole('slider').focus();
 await page.keyboard.press('End');
 await halPopover.locator('output.miner-share-value').filter({hasText:/^90 %$/}).waitFor();
 await halPopover.getByRole('button',{name:'All details →',exact:true}).click();
 const drawer = wb.minerDrawer('Hal');
 await drawer.getByRole('heading',{name:'Live attempts',exact:true}).waitFor();
 await drawer.getByRole('table',{name:'Newest attempts of Hal'}).getByRole('row').nth(10).waitFor();
 await page.screenshot({path:join(output,'miner-drawer-running.png')});
 // Slow motion shows on the card and the candidate tile, and ends with the drawer.
 await drawer.getByRole('button',{name:'Slow motion',exact:true}).click();
 const nextCard = page.locator('section.next-block');
 await nextCard.getByText(/^Slow motion · 4 tries\/s$/).waitFor();
 await nextCard.getByRole('button',{name:'Normal speed',exact:true}).waitFor();
 await page.screenshot({path:join(output,'slow-motion-running.png')});
 await drawer.getByRole('button',{name:'Close miner details',exact:true}).click();
 await drawer.waitFor({state:'detached'});
 await nextCard.getByText('Mining block #1…',{exact:true}).waitFor();
 assert.equal(await nextCard.getByRole('button',{name:'Normal speed',exact:true}).count(), 0, 'Closing the drawer ends slow motion');
 await page.getByRole('button',{name:'Hide streams',exact:true}).click();
 results.push('During a race All streams shows every miner\'s attempts; a share change applies in the race; the drawer shows its live attempts; slow motion shows on the card and ends with the drawer');
 // Pause terminates the worker; nothing is committed after it.
 const atPause = await wb.tiles().count();
 await page.getByRole('button',{name:'Pause',exact:true}).press('Enter');
 assert.ok(await page.locator('.next-block .btn-primary').evaluate(el => el === document.activeElement), 'Pause keeps keyboard focus as Play');
 await page.getByRole('button',{name:'Pause',exact:true}).waitFor({state:'detached'});
 await page.waitForTimeout(1000);
 assert.equal(await wb.tiles().count(), atPause, 'Pause commits no block');
 results.push('Difficulty 10 mines in a worker and can be paused without a committed block; the race fits five widths');
 await menu(page, 'Settings');
 const settings = page.getByRole('dialog',{name:'Settings'});
 assert.equal(await settings.getByLabel('Mining difficulty',{exact:true}).getAttribute('max'),'10');
 assert.equal(await settings.getByLabel('Mining difficulty',{exact:true}).inputValue(),'10');
 await settings.getByLabel('Mining difficulty',{exact:true}).fill('9');
 await settings.getByLabel('Mining difficulty',{exact:true}).fill('10');
 await page.screenshot({path:join(output,'difficulty-10-settings.png')});
 await settings.getByLabel('Mining difficulty',{exact:true}).fill('1');
 await settings.getByRole('button',{name:'Done'}).click();
 const beforeAuto = await wb.tiles().count();
 await page.getByRole('button',{name:'Auto-mine',exact:true}).click();
 await page.waitForTimeout(2000);
 assert.equal(await wb.tiles().count(), beforeAuto, 'Auto-mine alone starts no block');
 // Auto-mine on is filled like the Mining button beside it, with the same on-accent text.
 await page.mouse.move(0, 0);
 const autoLit = await page.evaluate(() => {
  const style = selector => getComputedStyle(document.querySelector(selector));
  const [toggle, play] = [style('.next-block-action .repeat-toggle[aria-pressed="true"]'), style('.next-block-action .btn-primary')];
  return {toggle:[toggle.backgroundColor, toggle.color], play:[play.backgroundColor, play.color]};
 });
 assert.deepEqual(autoLit.toggle, autoLit.play, `Auto-mine on matches the Mining fill and text: ${JSON.stringify(autoLit)}`);
 await page.locator('.next-block .btn-primary').click();
 await wb.tile(beforeAuto + 2).waitFor({timeout:30000});
 await page.getByRole('button',{name:'Auto-mine',exact:true}).click();
 await page.locator('.next-block .btn-primary').filter({hasText:'Mining'}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'Create miner',exact:true}).click();
 await page.getByLabel('New miner name',{exact:true}).fill('Newminer4');
 await page.getByRole('form',{name:'Create miner'}).getByRole('button',{name:'Create',exact:true}).click();
 await page.locator('.next-block-lane[data-miner="Newminer4"]').waitFor();
 await page.getByRole('button',{name:/^Open Newminer4, balance 0\.00000000/}).waitFor();
 assert.equal(await page.locator('.next-block-lane[data-miner]').count(), 4);
 await wb.minerButton('Newminer4').click();
 assert.equal(await wb.minerEditor('Newminer4').locator('output.miner-share-value').innerText(), '25 %', 'A new miner joins with an equal share');
 await wb.minerEditor('Newminer4').getByRole('button',{name:'Done',exact:true}).click();
 await wb.minerEditor('Newminer4').waitFor({state:'detached'});
 await menu(page, 'Reset');
 assert.equal(await page.locator('.next-block-lane[data-miner="Newminer4"]').count(), 0, 'Reset removes a created miner');
 await page.getByRole('button',{name:'Start demo',exact:true}).waitFor();
 results.push('Settings change the difficulty; Auto-mine on is filled like Mining; auto-mine continues a run started with Play and stops; a created miner gets a lane, a wallet and its share; reset clears the result');

 assert.equal(telemetryRequests.length,0,'No telemetry after the opt-out, including all prior mining operations');
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
  assert.equal(telemetryRequests.filter(event=>event.event==='mining_started').length,1,'Start demo mines one block');
  const summaries=telemetryRequests.filter(event=>event.event==='mining_completed');
  assert.equal(summaries.length,1);
  for(const summary of summaries) {
   assert.equal(summary.properties.difficulty,1);
   assert.ok(summary.properties.attempt_count>0);
   assert.ok(summary.properties.elapsed_ms>=0);
  }
  // The demo transfers fund Alice once block #2 confirms them.
  await wb.mine(2).click();
  await wb.mine(3).waitFor({timeout:30000});
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
  await wb.mine(2).waitFor({timeout:30000});
  await wb.mine(2).click();
  await wb.mine(3).waitFor({timeout:30000});
  await page.waitForTimeout(100);
  assert.equal(telemetryRequests.length,beforeOptOut,'No sends after opt-out');
  await menu(page, 'Settings');
  await settings.getByLabel('Coin name',{exact:true}).fill('powfyicoin');
  await settings.getByRole('button',{name:'Done'}).click();
  results.push('Mock PostHog: opt back in, one event per operation, mining summaries, sanitized errors and opt-out');
 } else {
  await page.keyboard.press('Escape');
  results.push('No-config build keeps usage sharing disabled and simulation usable');
 }
 await menu(page, 'Reset');
 await page.getByRole('button',{name:'Start demo',exact:true}).click();
 await wb.mine(2).waitFor({timeout:30000});
 await wb.mine(2).click();
 await wb.mine(3).waitFor({timeout:30000});
 await fitsWidths('Workbench after demo');

 // Labs in free play: the collapsed rail opens them without a mission lesson.
 assert.equal(await page.locator('.app-shell.is-rail-collapsed').count(), 1);
 const before = await snapshot(page);
 results.push(...await verifyHashLab(page, output, before));
 results.push(...await verifyChainLab(page, output, before));
 results.push(...await verifyForkLab(page, output, before));
 results.push(...await verifyPool(page, output, before));
 await page.getByRole('button',{name:'Expand mission rail'}).click();
 const beforeMissionTelemetry=telemetryRequests.length;
 results.push(...await verifyMissions(page, output));
 assert.equal(telemetryRequests.length,beforeMissionTelemetry,'Missions add no telemetry while sharing is off');

 results.push(...await verifyForkMission(browser, baseURL, output));
 results.push(...await verifyMinerName(browser, baseURL, output));
 assert.deepEqual(errors,[]);
 results.push('No page errors or horizontal overflow at five widths');
 await page.close();
 const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await mobile.route('https://eu.i.posthog.com/**', telemetryMock);
 await mobile.route(`${POOL_API}/**`, leaderboardMock);
 await mobile.goto(baseURL);
 await mobile.getByRole('button',{name:'Start demo',exact:true}).click();
 await workbench(mobile).mine(2).waitFor({timeout:30000});
 // On phones the compact band carries the same pill; it opens the checks there.
 const mobilePill = workbench(mobile).chainPill();
 assert.equal(await mobilePill.count(), 1);
 assert.equal(await mobilePill.innerText(), 'Chain valid');
 assert.equal(await mobilePill.evaluate(el => Boolean(el.closest('section.chain-band.is-compact'))), true, 'The phone pill sits on the compact band');
 const mobileChecks = mobile.locator('section.chain-band').getByRole('list',{name:'Checks per block'});
 await mobilePill.click();
 assert.equal(await mobilePill.getAttribute('aria-expanded'), 'true');
 await mobileChecks.waitFor();
 await mobilePill.click();
 await mobileChecks.waitFor({state:'detached'});
 assert.equal(await mobile.locator('.top-bar-chain').count(), 0);
 results.push('Phone: the compact band shows the same "Chain valid" pill and it toggles the checks');
 // A few more blocks, so the small blocks clearly overflow the phone width.
 for (const next of [2, 3, 4]) {
  await workbench(mobile).mine(next).click();
  await workbench(mobile).mine(next + 1).waitFor({timeout:60000});
 }
 // The compact row swipes sideways: it takes pointer events itself (Safari scrolls only such a row).
 // A new block scrolls the row smoothly to its newest end; start from there.
 await mobile.waitForFunction(() => {
  const scroll = document.querySelector('.chain-band.is-compact .chain-band-scroll');
  return scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 1;
 }, null, {timeout:10000});
 const row = await mobile.evaluate(() => {
  const scroll = document.querySelector('.chain-band.is-compact .chain-band-scroll');
  const style = getComputedStyle(scroll);
  return { pointerEvents: style.pointerEvents, touchAction: style.touchAction, overflowX: style.overflowX,
   scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth, left: Math.round(scroll.scrollLeft) };
 });
 assert.equal(row.pointerEvents, 'auto', JSON.stringify(row));
 assert.equal(row.overflowX, 'auto', JSON.stringify(row));
 assert.ok(row.scrollWidth - row.clientWidth > 100, `the small blocks overflow the phone width: ${JSON.stringify(row)}`);
 const phoneRowBox = await mobile.locator('.chain-band.is-compact .chain-band-scroll').boundingBox();
 await mobile.mouse.move(phoneRowBox.x + phoneRowBox.width / 2, phoneRowBox.y + phoneRowBox.height / 2);
 await mobile.mouse.wheel(-400, 0);
 // The browser scrolls after the wheel event; wait for the row to move rather than reading at once.
 const rowLeft = () => mobile.evaluate(() => Math.round(document.querySelector('.chain-band.is-compact .chain-band-scroll').scrollLeft));
 await mobile.waitForFunction(left => document.querySelector('.chain-band.is-compact .chain-band-scroll').scrollLeft < left - 50, row.left, {timeout:10000})
  .catch(async () => assert.fail(`the row scrolls back toward Genesis: ${row.left} -> ${await rowLeft()}`));
 const swiped = await rowLeft();
 // Only the ticker stays at the top; the compact band scrolls away with the cards.
 const stuck = async () => mobile.evaluate(() => {
  const ticker = document.querySelector('.leaderboard-ticker').getBoundingClientRect();
  const band = document.querySelector('.wb-band').getBoundingClientRect();
  return { ticker: Math.round(ticker.top), tickerBottom: Math.round(ticker.bottom), band: Math.round(band.top), bandBottom: Math.round(band.bottom), scrollY: Math.round(scrollY) };
 });
 await mobile.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
 await settle(mobile);
 const scrolled = await stuck();
 assert.ok(scrolled.scrollY > 300, JSON.stringify(scrolled));
 assert.equal(scrolled.ticker, 0, `ticker stays on top: ${JSON.stringify(scrolled)}`);
 assert.ok(scrolled.bandBottom <= scrolled.tickerBottom, `the band scrolls away under the ticker: ${JSON.stringify(scrolled)}`);
 await mobile.screenshot({path:join(output,'mobile-scrolled.png')});
 // A tap on a small tile holds that block in the Block card below.
 await workbench(mobile).tile(1).click();
 assert.equal(await workbench(mobile).tile(1).getAttribute('aria-pressed'), 'true');
 await workbench(mobile).tile(1).click();
 await mobile.evaluate(() => scrollTo(0, 0));
 await settle(mobile);
 results.push(`Phone: the small blocks swipe sideways (${row.left} -> ${swiped} px), only the ticker stays on top while the page scrolls, a tap selects a block`);
 // One button switches the row to the vertical list, which opens a block's full hash and stays after a reload.
 await mobile.getByRole('button',{name:'Show the blocks as a list'}).click();
 const listRow = mobile.locator('section.chain-timeline').getByRole('button',{name:/^Block 1(,|$)/});
 await listRow.click();
 assert.equal(await listRow.getAttribute('aria-expanded'), 'true');
 const listChain = mobile.locator('section.chain-timeline');
 await listChain.getByRole('button',{name:'Copy full hash of block 1'}).waitFor();
 await listChain.getByRole('button',{name:'Open in Chain lab'}).waitFor();
 await listRow.click();
 await mobile.reload();
 await mobile.locator('.wb-band.is-list section.chain-timeline').waitFor({timeout:30000});
 await mobile.getByRole('button',{name:'Show the blocks as a row'}).click();
 await mobile.locator('.wb-band section.chain-band.is-compact').waitFor();
 results.push('Phone: a switch shows the blocks as a list with full hash and Chain lab, and the browser remembers it');
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
