import { verifyHashLab } from './hash-lab.acceptance.mjs';
import { verifyChainLab } from './chain-lab.acceptance.mjs';
import { verifyLearningPath } from './learning-path.acceptance.mjs';
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
 page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://eu.i.posthog.com/**', telemetryMock);
 await page.goto(baseURL);
 await page.getByRole('button',{name:'Start demo',exact:true}).click();
 await page.getByRole('button',{name:'Open blockchain insights'}).filter({hasText:/^2 mined$/}).waitFor({timeout:30000});
 assert.equal(await page.locator('.status-positive').filter({hasText:'Chain Valid'}).count(),1);
 results.push('Demo distribution mines two valid blocks');
 await page.getByLabel('From',{exact:true}).selectOption('Alice');
 await page.getByLabel('To',{exact:true}).selectOption('Bob');
 await page.getByLabel('Amount (powCoin)',{exact:true}).fill('0.1');
 await page.getByLabel('Reference (optional)',{exact:true}).fill('Synthetic acceptance transfer');
 await page.getByRole('button',{name:'Add to Mempool'}).click();
 await page.getByRole('status').filter({hasText:'Transaction added'}).waitFor();
 await page.getByRole('button',{name:'Mine Next Block'}).click();
 await page.getByRole('button',{name:'Open blockchain insights'}).filter({hasText:/^3 mined$/}).waitFor({timeout:30000});
 results.push('Transfer enters mempool and confirms in a valid block');
 await page.getByRole('button',{name:'Open Bob details',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Participant details'});
 await dialog.waitFor();
 assert.ok((await dialog.innerText()).includes('cannot recover a wallet'));
 assert.ok((await dialog.locator('.balance-amount').innerText()).includes('0.70000000'));
 await dialog.getByRole('button',{name:/Transaction in block/}).first().click();
 const nested = page.getByRole('dialog',{name:'Transaction details',exact:true});
 await nested.waitFor();
 await page.keyboard.press('Escape');
 await nested.waitFor({state:'hidden'});
 assert.ok(await dialog.isVisible());
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'hidden'});
 results.push('Wallet balance updates; native dialog opens and Escape closes it');
 await page.getByRole('button',{name:'Expand mining race',exact:true}).click();
 for (const width of [320,390,768,1200,1440]) {
  await page.setViewportSize({width,height:900});
  const size = await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll <= size.width, `Expanded mining race: ${JSON.stringify(size)}`);
 }
 await page.getByRole('button',{name:'Collapse mining race',exact:true}).click();
 results.push('Expanded mining view fits all five viewport widths');

 await page.getByRole('button',{name:'Tamper with block #1',exact:true}).click();
 await page.getByText('✗ Chain Corrupted',{exact:true}).waitFor();
 results.push('Tampering is detected');
 await page.getByRole('button',{name:'Reset',exact:true}).click();
 await page.getByRole('button',{name:'Open blockchain insights'}).filter({hasText:/^0 mined$/}).waitFor();
 await page.getByRole('button',{name:'Switch to dark theme'}).click();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.evaluate(() => window.scrollTo(0,0));
 await page.waitForTimeout(100);
 await page.screenshot({path:join(output,'dark-desktop.png'),fullPage:true});
 results.push('Reset returns to genesis; dark theme works');
 await page.locator('summary').filter({hasText:'Experiment settings'}).click();
 await page.getByLabel('Mining difficulty',{exact:true}).fill('5');
 await page.getByRole('button',{name:'Mine Next Block'}).click();
 await page.getByRole('button',{name:'Stop mining',exact:true}).click();
 await page.waitForTimeout(150);
 assert.equal(await page.getByRole('button',{name:'Open blockchain insights'}).filter({hasText:/^0 mined$/}).count(),1);
 results.push('Expensive mining can be stopped without a committed block');
 await page.getByLabel('Mining difficulty',{exact:true}).fill('1');
 await page.getByRole('button',{name:'Auto-mine',exact:true}).click();
 await page.getByRole('button',{name:'Open blockchain insights'}).filter({hasText:/^2 mined$/}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'Stop mining',exact:true}).click();
 await page.getByRole('button',{name:'Reset',exact:true}).click();
 results.push('Auto-mine sets up and stops; reset clears the result');
 assert.equal(telemetryRequests.length,0,'No telemetry before consent, including all prior mining operations');
 const sharing=page.getByLabel('Share usage and technical errors');
 await page.getByText('Usage sharing: off',{exact:true}).click();
 if (process.env.EXPECT_POSTHOG === '1') assert.equal(await sharing.isDisabled(),false,'Configured test build is required');
 if (!await sharing.isDisabled()) {
  const responseFor = event => page.waitForResponse(response => response.url().startsWith('https://eu.i.posthog.com/i/v0/e/') && response.request().method()==='POST' && response.request().postDataJSON()?.event===event);
  const opened=responseFor('app_opened');await sharing.check();await opened;
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
  await page.getByLabel('From',{exact:true}).selectOption('Alice');
  await page.getByLabel('To',{exact:true}).selectOption('Bob');
  await page.getByLabel('Amount (powCoin)',{exact:true}).fill('0.1');
  await page.getByLabel('Reference (optional)',{exact:true}).fill('private-fixture-memo');
  const transaction=responseFor('transaction_created');await page.getByRole('button',{name:'Add to Mempool'}).click();await transaction;
  const settings=page.locator('details.simulation-settings');
  if(!await settings.evaluate(element=>element.open)) await settings.locator('summary').click();
  await page.getByLabel('Coin name',{exact:true}).fill('PrivateFixtureLabel');
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
  await sharing.uncheck();
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.getByRole('button',{name:'Mine Next Block'}).click();
  await page.getByRole('button',{name:'Open blockchain insights'}).filter({hasText:/^1 mined$/}).waitFor({timeout:30000});
  await page.waitForTimeout(100);
  assert.equal(telemetryRequests.length,beforeOptOut,'No sends after opt-out');
  results.push('Mock PostHog: explicit consent, one event per operation, mining summaries, sanitized errors and opt-out');
 } else results.push('No-config build keeps usage sharing disabled and simulation usable');
 for(const width of [320,390,768,1200,1440]) {
  await page.setViewportSize({width,height:900});
  await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,headers:document.querySelectorAll('header').length}));
  assert.ok(layout.scroll<=layout.width,JSON.stringify(layout));
 }
 results.push(...await verifyHashLab(page, output));
 results.push(...await verifyChainLab(page, output));
 const beforeGuideTelemetry=telemetryRequests.length;
 results.push(...await verifyLearningPath(page, output));
 assert.equal(telemetryRequests.length,beforeGuideTelemetry,'Guide does not add telemetry while sharing is off');
 assert.deepEqual(errors,[]);
 results.push('No page errors or horizontal overflow at five widths');
 await page.close();
 const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await mobile.route('https://eu.i.posthog.com/**', telemetryMock);
 await mobile.goto(baseURL);
 await mobile.waitForTimeout(200);
 await mobile.screenshot({path:join(output,'mobile.png')});
 await mobile.screenshot({path:join(output,'mobile-full.png'),fullPage:true});
 console.log(JSON.stringify({results,mobile:await mobile.evaluate(()=>({height:document.documentElement.scrollHeight,headers:document.querySelectorAll('header').length})),errors},null,2));
 } catch (error) {
 console.error(JSON.stringify({completed:results, failure:error.message}));
 if (page && !page.isClosed()) await page.screenshot({path:join(output,'failure.png')}).catch(() => {});
 throw error;
} finally {
 await browser?.close();
 server?.kill('SIGTERM');
}
