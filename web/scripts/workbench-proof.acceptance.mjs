import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { asReturningVisitor, headerHash, menu, settle, snapshot, workbench } from './workbench.helpers.mjs';

const reverse = hex => Buffer.from(hex, 'hex').reverse().toString('hex');
const sha256d = bytes => createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest();
const txidOf = hex => sha256d(Buffer.from(hex, 'hex')).reverse().toString('hex');
const parentOf = (left, right) => sha256d(Buffer.concat([
  Buffer.from(left, 'hex').reverse(), Buffer.from(right, 'hex').reverse()
])).reverse().toString('hex');
const changeHash = hash => (hash[0] === '0' ? '1' : '0') + hash.slice(1);

// Independent tree and proof calculation: none of the app's Merkle code is imported.
function expectedProof(transactions, index) {
  let level = transactions.map(txidOf), position = index;
  const path = [], nodes = [level[index]];
  while (level.length > 1) {
    const left = position % 2 === 1;
    path.push({ side: left ? 'left' : 'right', hash: left ? level[position - 1] : level[position + 1] ?? level[position] });
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(parentOf(level[i], level[i + 1] ?? level[i]));
    level = next;
    position = Math.floor(position / 2);
    nodes.push(level[position]);
  }
  return { path, nodes, root: level[0] };
}

function savedHeader(block) {
  const bytes = Buffer.alloc(80);
  bytes.writeUInt32LE(block.version, 0);
  Buffer.from(reverse(block.previousHash), 'hex').copy(bytes, 4);
  Buffer.from(reverse(block.txRoot), 'hex').copy(bytes, 36);
  bytes.writeUInt32LE(block.time, 68);
  bytes.writeUInt32LE(block.bits, 72);
  bytes.writeUInt32LE(block.nonce, 76);
  return bytes.toString('hex');
}

const savedState = page => page.evaluate(() => ({
  chain: localStorage.getItem('proofofwork-chain'),
  missions: localStorage.getItem('proofofwork-missions')
}));

// Local mining only. All off-origin requests terminate in this synthetic network;
// even a new API path or telemetry host cannot reach the public leaderboard.
export async function verifyWorkbenchProof(browser, baseURL, output) {
  const origin = new URL(baseURL).origin;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname) || origin === 'https://proofofwork.fyi',
    'Workbench proof acceptance requires a local preview or the canonical production origin');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const errors = [], refusedPosts = [];
  let page;
  try {
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'POST') {
        refusedPosts.push(url.href);
        return route.abort('connectionrefused');
      }
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
      if (url.hostname === 'api.proofofwork.fyi') {
        return route.fulfill({ status: 503, contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Synthetic acceptance pool unavailable' }) });
      }
      return route.abort('connectionrefused');
    });
    await asReturningVisitor(context);
    await context.addInitScript(() => {
      localStorage.setItem('pow.analytics.enabled', 'false');
      if (localStorage.getItem('proofofwork-missions') === null) {
        localStorage.setItem('proofofwork-missions', JSON.stringify({ version: 2, completed: [], skipped: [], step: 0, data: {} }));
        localStorage.setItem('proofofwork-rail-collapsed', '1');
        localStorage.setItem('proofofwork-pool-name', 'proof-fixture');
      }
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    const wb = workbench(page);
    await wb.tile(0).waitFor();
    const notice = page.locator('.usage-consent');
    if (await notice.isVisible()) await notice.getByRole('button', { name: 'Opt out', exact: true }).click();
    // The real demo funds its synthetic wallets. Then mine an explicit transfer,
    // rather than injecting serialized blocks or replacing the proof verifier.
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Lower difficulty', exact: true }).click();
    await page.getByRole('button', { name: 'Start demo', exact: true }).click();
    await wb.mine(2).click();
    await wb.mine(3).waitFor();
    await page.getByRole('button', { name: 'New transaction', exact: true }).click();
    const form = page.getByRole('form', { name: 'New transaction', exact: true });
    await form.getByRole('combobox', { name: 'From', exact: true }).selectOption('Alice');
    await form.getByRole('combobox', { name: 'To', exact: true }).selectOption('Bob');
    await form.getByLabel('Amount (powfyicoin)', { exact: true }).fill('0.1');
    await form.getByLabel(/^Reference/).fill('Synthetic inclusion transfer');
    await form.getByRole('button', { name: 'Add to mempool', exact: true }).click();
    await form.waitFor({ state: 'hidden' });
    await wb.mine(3).click();
    await wb.mine(4).waitFor();
    await wb.select(3);
    const selected = page.locator('section.selected-block');
    await selected.getByRole('heading', { name: 'Block #3', exact: true }).waitFor();
    const transfer = selected.locator('.block-tx-item').filter({
      has: page.getByRole('button', { name: /^Alice → Bob/ })
    });
    assert.equal(await transfer.count(), 1, 'The explicitly mined payment is present');
    await transfer.locator('.block-tx-row').click();
    const index = await transfer.evaluate(item => [...item.parentElement.children].indexOf(item));
    const selectedTxid = await transfer.locator('.block-tx-id code').innerText();
    const before = await savedState(page);
    assert.ok(before.chain && before.missions, 'Mining and the progress fixture are persisted');
    const block = JSON.parse(before.chain).blocks[2];
    const proof = expectedProof(block.transactions, index);
    assert.equal(proof.root, block.txRoot);
    assert.equal(selectedTxid, txidOf(block.transactions[index]));
    const cardHashes = await selected.locator('.card-kit-kv').evaluateAll(rows => Object.fromEntries(rows.map(row => [
      row.querySelector('dt')?.textContent, row.querySelector('.selected-block-hash')?.textContent
    ])));
    assert.equal(cardHashes.Hash, block.hash);
    assert.equal(cardHashes['Merkle root'], block.txRoot);
    const workbenchBefore = await snapshot(page);
    const postsBeforeProof = refusedPosts.length;
    await transfer.getByRole('button', { name: 'Prove inclusion in Chain lab', exact: true }).click();
    const lab = page.locator('.merkle-proof');
    const source = lab.getByRole('region', { name: 'Workbench block copy', exact: true });
    await source.getByRole('heading', { name: `Your block #3 · ${block.transactions.length} transactions`, exact: true }).waitFor();
    const txid = () => lab.getByLabel(`Transaction ID of transaction ${index}`, { exact: true });
    const verdict = text => lab.getByRole('status').filter({ hasText: new RegExp(`^${text} ·`) });
    const computedRoot = () => lab.locator('.merkle-proof-compare dd code').first().innerText();
    const fixedHeader = () => lab.locator('.merkle-proof-header-card .merkle-proof-kv dd code').allTextContents();
    await verdict('Payment proven').waitFor();
    assert.equal(await txid().inputValue(), selectedTxid);
    assert.deepEqual(await fixedHeader(), [block.txRoot, block.hash]);
    assert.equal(await computedRoot(), proof.root);
    assert.deepEqual(await lab.locator('.merkle-proof-level > code').allTextContents(), proof.nodes);
    for (const [level, sibling] of proof.path.entries()) {
      assert.equal(await lab.getByLabel(`Sibling at level ${level} (on the ${sibling.side})`, { exact: true }).inputValue(), sibling.hash);
    }
    await lab.getByText('Inspect the 80 header bytes', { exact: true }).click();
    const header = (await lab.locator('.header-bytes-raw').allTextContents()).join('');
    assert.equal(header, savedHeader(block));
    assert.equal(headerHash(header), block.hash);
    assert.equal(reverse(header.slice(72, 136)), block.txRoot);
    await lab.getByText('Copied raw transaction bytes', { exact: true }).click();
    assert.equal(await lab.locator('.merkle-proof-payment details code').innerText(), block.transactions[index]);

    const sibling = lab.getByLabel(/^Sibling at level 0 /);
    const originalSibling = await sibling.inputValue();
    await sibling.fill(changeHash(originalSibling));
    await verdict('Payment not proven').waitFor();
    assert.notEqual(await computedRoot(), block.txRoot);
    assert.deepEqual(await fixedHeader(), [block.txRoot, block.hash], 'A sibling edit cannot rewrite the held header');
    assert.deepEqual(await savedState(page), before, 'A failed proof cannot change chain or mission progress');
    await lab.getByRole('button', { name: 'Reset proof', exact: true }).click();
    await verdict('Payment proven').waitFor();
    assert.equal(await sibling.inputValue(), originalSibling);
    await txid().fill(changeHash(selectedTxid));
    await verdict('Payment not proven').waitFor();
    assert.notEqual(await computedRoot(), block.txRoot);
    await lab.getByRole('button', { name: 'Reset proof', exact: true }).click();
    await verdict('Payment proven').waitFor();
    assert.equal(await txid().inputValue(), selectedTxid);
    assert.deepEqual(await fixedHeader(), [block.txRoot, block.hash]);

    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await menu(page, theme === 'light' ? 'Light theme' : 'Dark theme');
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await settle(page);
        const fits = await lab.evaluate(element => ({ viewport: innerWidth, page: document.documentElement.scrollWidth,
          width: element.clientWidth, contents: element.scrollWidth }));
        assert.ok(fits.page <= fits.viewport && fits.contents <= fits.width, JSON.stringify({ theme, ...fits }));
        await page.evaluate(() => { scrollTo(0, 0); document.querySelector('.chain-lab').scrollTop = 0; });
        await page.screenshot({ path: join(output, `workbench-proof-${theme}-${width}.png`), fullPage: true });
        await lab.locator('.merkle-proof-verdict').scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(output, `workbench-proof-path-${theme}-${width}.png`), fullPage: true });
      }
    }
    assert.deepEqual(await savedState(page), before, 'Proof editing, reset and theme changes preserve serialized chain and missions');
    await source.getByRole('button', { name: 'Back to workbench', exact: true }).click();
    await selected.getByRole('heading', { name: 'Block #3', exact: true }).waitFor();
    assert.equal(await wb.tile(3).getAttribute('aria-pressed'), 'true', 'Back retains the selected source block');
    assert.deepEqual(await snapshot(page), workbenchBefore, 'Wallets and the next block remain unchanged');
    assert.deepEqual(await savedState(page), before);

    // Reopening captures the same untouched source; examples remain independently available.
    const row = selected.locator('.block-tx-item').nth(index);
    if (await row.locator('.block-tx-row').getAttribute('aria-expanded') !== 'true') await row.locator('.block-tx-row').click();
    await row.getByRole('button', { name: 'Prove inclusion in Chain lab', exact: true }).click();
    await verdict('Payment proven').waitFor();
    assert.equal(await txid().inputValue(), selectedTxid);
    await source.getByRole('button', { name: 'Use example block', exact: true }).click();
    await source.waitFor({ state: 'hidden' });
    await lab.getByRole('group', { name: 'Block size', exact: true }).waitFor();
    await lab.getByLabel('Payment text of transaction 5', { exact: true }).waitFor();
    await verdict('Payment proven').waitFor();
    assert.deepEqual(await savedState(page), before, 'Switching to an example leaves the saved workbench and progress untouched');
    assert.equal(refusedPosts.length, postsBeforeProof, 'Inspecting and editing a proof submits no new POST requests');
    assert.deepEqual(errors, [], 'Own-payment proof has no uncaught page errors');
    return [
      'Workbench proof: mined transfer TXID, raw bytes, header hash/root and every sibling verified with independent SHA-256d',
      'Workbench proof: sibling/TXID edits fail, Reset restores the same copy, Back preserves selection, wallets, serialized chain and missions',
      'Workbench proof: example switch, dark/light 390/1440 layouts and screenshots; isolated network refuses all external writes'
    ];
  } finally { await context.close(); }
}
