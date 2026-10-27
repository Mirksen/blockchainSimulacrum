import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE_URL = 'https://proofofwork.fyi';
const INGEST_URL = 'https://eu.i.posthog.com/i/v0/e/';
const sha256 = value => createHash('sha256').update(value).digest('hex');

export function parseManifest(value) {
  const manifest = JSON.parse(value);
  assert.match(manifest.source, /^[a-f0-9]{40}$/);
  assert.equal(manifest.files?.length, 4, 'Require the complete four-file release manifest');
  const paths = new Set();
  for (const file of manifest.files) {
    assert.match(file.path, /^\/(?:index\.html|vite\.svg|assets\/[A-Za-z0-9_-]+\.(?:js|css))$/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(!paths.has(file.path), 'Duplicate release path');
    paths.add(file.path);
  }
  assert.ok(paths.has('/index.html') && paths.has('/vite.svg'), 'Missing release entry or icon');
  assert.equal([...paths].filter(path => path.endsWith('.js')).length, 1);
  assert.equal([...paths].filter(path => path.endsWith('.css')).length, 1);
  return manifest;
}

export function verifyAsset(bytes, expected) {
  assert.ok(sha256(bytes) === expected, 'Public asset differs from the checked release');
}

export function verifyToken(token, fingerprint) {
  assert.match(fingerprint, /^[a-f0-9]{64}$/, 'Provide a SHA-256 fingerprint, never a token');
  assert.ok(typeof token === 'string' && /^phc_[A-Za-z0-9]+$/.test(token), 'Invalid public ingestion token');
  assert.ok(sha256(token) === fingerprint, 'Public project token differs from the checked project');
}

export function authorizeCapture(body, fingerprint, consent) {
  assert.ok(consent, 'Capture outside the explicit synthetic consent window');
  verifyToken(body.api_key, fingerprint);
}

export function verifyHeaders(headers, expectedCsp) {
  assert.ok(headers.get('content-security-policy') === expectedCsp, 'Published CSP differs from the checked policy');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
}

async function main() {
  assert.equal(process.env.CONFIRM_SYNTHETIC_PROBE, 'true', 'Explicitly enable the nine-event production probe');
  const manifest = parseManifest(process.env.RELEASE_MANIFEST || '');
  const fingerprint = process.env.POSTHOG_TOKEN_SHA256 || '';
  assert.match(fingerprint, /^[a-f0-9]{64}$/, 'Provide a SHA-256 fingerprint, never a token');
  const output = resolve(process.env.PRODUCTION_REPORT_DIR || 'production-report');
  await mkdir(output, { recursive: true });
  const record = { checked_at: new Date().toISOString(), checking_commit: process.env.GITHUB_SHA || null,
    source: manifest.source, origin: BASE_URL, scope: 'public production route to real PostHog EU',
    assets: [], events: [], responses: [], request_failures: [], guard_failures: [] };
  let browser, failure;
  try {
    const headersSource = await readFile(process.env.RELEASE_HEADERS_FILE || join(dirname(fileURLToPath(import.meta.url)), '../public/_headers'), 'utf8');
    const expectedCsp = headersSource.split('\n').find(line => line.trim().startsWith('Content-Security-Policy:'))?.trim().slice('Content-Security-Policy:'.length).trim();
    assert.ok(expectedCsp, 'Declared CSP is missing');
    let script;
    for (const asset of manifest.files) {
      const path = asset.path === '/index.html' ? '/' : asset.path;
      const response = await fetch(BASE_URL + path, { redirect: 'error', signal: AbortSignal.timeout(20000) });
      assert.equal(response.status, 200, 'Public asset did not return HTTP 200');
      const bytes = Buffer.from(await response.arrayBuffer());
      verifyAsset(bytes, asset.sha256);
      if (path === '/') verifyHeaders(response.headers, expectedCsp);
      if (path.endsWith('.js')) script = bytes.toString('utf8');
      record.assets.push({ path, sha256: sha256(bytes), status: response.status });
    }
    const tokens = [...new Set(script?.match(/phc_[A-Za-z0-9]+/g) || [])];
    assert.equal(tokens.length, 1, 'Release must contain exactly one public project token');
    verifyToken(tokens[0], fingerprint);

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.setDefaultTimeout(15000);
    let consent = false;
    await page.route('https://eu.i.posthog.com/**', async route => {
      const request = route.request();
      try {
        assert.equal(request.url(), INGEST_URL, 'Unexpected ingestion route');
        if (request.method() === 'OPTIONS') { await route.continue(); return; }
        assert.equal(request.method(), 'POST');
        const body = request.postDataJSON();
        authorizeCapture(body, fingerprint, consent);
        record.events.push({ event: body.event, distinct_id: body.distinct_id, timestamp: body.timestamp, properties: body.properties });
        await route.continue();
      } catch (error) {
        record.guard_failures.push(error.message);
        await route.abort();
      }
    });
    page.on('response', response => {
      if (response.url() === INGEST_URL && response.request().method() === 'POST') {
        record.responses.push({ event_id: response.request().postDataJSON().properties.event_id, status: response.status() });
      }
    });
    page.on('requestfailed', request => {
      if (request.url() === INGEST_URL) record.request_failures.push(request.failure()?.errorText);
    });
    const responseFor = event => page.waitForResponse(response => response.url() === INGEST_URL &&
      response.request().method() === 'POST' && response.request().postDataJSON()?.event === event, { timeout: 15000 });
    const navigation = await page.goto(BASE_URL);
    record.tls = await navigation.securityDetails();
    await page.locator('summary').filter({ hasText: 'Experiment settings' }).click();
    await page.getByLabel('Mining difficulty', { exact: true }).fill('1');
    assert.equal(record.events.length, 0);
    assert.equal(record.guard_failures.length, 0);
    await page.getByText('Usage sharing: off', { exact: true }).click();
    const sharing = page.getByLabel('Share usage and technical errors');
    assert.equal(await sharing.isDisabled(), false);
    consent = true;
    const opened = responseFor('app_opened'); await sharing.check(); await opened;
    const demo = responseFor('demo_completed'); await page.getByRole('button', { name: 'Start demo', exact: true }).click(); await demo;
    const exception = responseFor('$exception');
    await page.evaluate(() => {
      const error = new TypeError('synthetic-production-private-marker');
      window.dispatchEvent(new ErrorEvent('error', { error }));
      window.dispatchEvent(new ErrorEvent('error', { error }));
    });
    await exception;
    for (let i = 0; i < 50 && record.responses.length < record.events.length; i++) await page.waitForTimeout(100);
    assert.equal(record.events.length, 9);
    assert.equal(record.responses.length, 9);
    assert.ok(record.responses.every(response => response.status === 200));
    assert.deepEqual(record.request_failures, []);
    for (const [event, count] of Object.entries({ app_opened: 1, demo_started: 1, demo_completed: 1,
      mining_started: 2, mining_completed: 2, transaction_created: 1, $exception: 1 })) {
      assert.equal(record.events.filter(item => item.event === event).length, count);
    }
    assert.ok(!JSON.stringify(record.events).includes('synthetic-production-private-marker'));
    record.distinct_id = record.events[0].distinct_id;
    assert.ok(record.events.every(event => event.distinct_id === record.distinct_id));
    await sharing.uncheck(); consent = false;
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForTimeout(300);
    assert.equal(record.events.length, 9);
    assert.deepEqual(record.guard_failures, []);
    record.transport_checks = 'passed; verify exact event IDs in the dedicated EU data store separately';
  } catch (error) {
    failure = error; record.failure = error.message;
  } finally {
    await browser?.close();
    await writeFile(join(output, 'production-result.json'), JSON.stringify(record, null, 2));
  }
  console.log(JSON.stringify({ origin: BASE_URL, assets_verified: record.assets.length,
    events_submitted: record.events.length, transport_checks: record.transport_checks, failure: record.failure }));
  if (failure) throw failure;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
