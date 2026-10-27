const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Blockchain } = require('../blockchain');
const config = require('../config');
const root = path.resolve(__dirname, '..');

function scenario(name, run) {
  test(name, (context) => {
    context.mock.timers.enable({ apis: ["Date"], now: 1767225600000 });
    const log = console.log;
    console.log = () => {};
    config.startingBalance = 10;
    config.miningLog = false;
    config.miningTimes = [];
    config.blockHashes = [];
    config.blockCounter = 0;
    try { run(); } finally { console.log = log; }
  });
}
function network(difficulty = 0) {
  const chain = new Blockchain('TestCoin', difficulty, 4, 2);
  chain.addParticipants('Sender', 'Receiver', 'Miner');
  chain.setMiner('Miner');
  return chain;
}
function transfer(chain, amount = 1, fee = 0, reference = 'synthetic-transfer') {
  chain.createTx('Sender', 'Sender', 'Receiver', amount, fee, reference);
  return chain.memPool.at(-1);
}
function cli(args, script = 'main.js') {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', timeout: 10000 });
}

scenario('CLI false disables mining logs and invalid difficulty fails immediately', () => {
  for (const input of ['false', '0']) {
    // Use a separate process so parsing cannot depend on the test runner argv/cache.
    const parsed = spawnSync(process.execPath, ['-e', `process.argv=['node','config.js','0','${input}']; console.log(require('./config').miningLog)`], { cwd: root, encoding: 'utf8', timeout: 1000 });
    assert.equal(parsed.status, 0, parsed.stderr);
    assert.equal(parsed.stdout.trim(), 'false');
  }
  for (const input of ['no-number', '-1', '1.5', 'Infinity', '65', '']) {
    const parsed = spawnSync(process.execPath, ['-e', `process.argv=['node','config.js',${JSON.stringify(input)}];require('./config')`], { cwd: root, encoding: 'utf8', timeout: 1000 });
    assert.notEqual(parsed.status, 0, `accepted difficulty ${input}`);
    assert.match(parsed.stderr, /difficulty/i);
  }
});
scenario('zero-difficulty terminal demo mines three valid blocks without leaked globals', () => {
  const result = cli(['0', 'false']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Are all transactions valid\?: true/);
  assert.match(result.stdout, /Are all block valid\?: true/);
  assert.doesNotMatch(result.stdout, /MINING LOG/);
  assert.equal((result.stdout.match(/Block sucessfully mined/g) || []).length, 3);
  const globals = spawnSync(process.execPath, ['-e', "process.argv=['node','main.js','0','false'];console.log=()=>{};require('./main');if(['kryptoCurrency','miners','transactionArray','transaction','block','transactions'].some(k=>Object.hasOwn(globalThis,k)))process.exit(1)"], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(globals.status, 0, globals.stderr);
});
scenario('reject invalid constructor settings before any state is created', () => {
  for (const difficulty of [NaN, Infinity, -1, 1.5, 65]) assert.throws(() => network(difficulty), /difficulty/i);
  for (const reward of [NaN, Infinity, -1]) assert.throws(() => new Blockchain('TestCoin', 0, reward, 2), /reward/i);
  for (const interval of [0, -1, NaN, 1.5]) assert.throws(() => new Blockchain('TestCoin', 0, 4, interval), /halving/i);
});
scenario('reject nonfinite and invalid money and preserve transaction counter/pool', () => {
  const chain = network();
  for (const [amount, fee] of [[NaN, 0], [Infinity, 0], ['1', 0], [1, NaN], [1, Infinity], [1, -1], [1, '0'], [0, 0], [-1, 0], [0.000000001, 0]]) {
    assert.throws(() => transfer(chain, amount, fee));
    assert.equal(chain.memPool.length, 0);
    assert.equal(chain.transactionCounter, 0);
  }
});
scenario('fees and pending outflows cannot spend the same confirmed funds twice', () => {
  const chain = network();
  assert.throws(() => transfer(chain, 10, 0.01), /funds/i);
  transfer(chain, 6, 0.25);
  assert.throws(() => transfer(chain, 4, 0), /funds/i);
  transfer(chain, 3.75, 0);
  chain.mineNextBlock();
  assert.equal(chain.calculateBalance(chain.participants[0].publicKey), 0);
});
scenario('transaction signatures bind unambiguous field boundaries', () => {
  const chain = network();
  const tx = transfer(chain, 1, 0.2, '3reference');
  tx.transactionFee = 0.23;
  tx.referenceNumber = 'reference';
  assert.equal(tx.isValid(), false);
});
scenario('pool owns a snapshot and rejects duplicate signed transactions', () => {
  const chain = network();
  const tx = transfer(chain);
  assert.throws(() => chain.appendTx(tx), /duplicate/i);
  const external = new tx.constructor(tx.sender, tx.recipient, 2, 0, 'external-transfer');
  external.sign(chain.participants[0].keyPair);
  chain.appendTx(external);
  external.amount = 100;
  assert.equal(chain.memPool.at(-1).amount, 2);
});
scenario('adding participants preserves prior wallet identity; multiple miners and wallet lookup work', () => {
  const chain = network();
  const sender = chain.participants[0];
  transfer(chain);
  chain.addParticipants('Extra');
  assert.ok(chain.participants[0] === sender);
  assert.equal(chain.participants[0].name, 'Sender');
  assert.throws(() => chain.addParticipants('Sender'), /participant/i);
  assert.throws(() => chain.setMiner('Missing'), /participant/i);
  chain.setMiner('Sender', 'Receiver');
  assert.equal(chain.participants[1].activeMiner, true);
  chain.mineNextBlock();
  const log = console.log; const captured = [];
  console.log = value => captured.push(value);
  try { chain.checkWallet('Receiver'); } finally { console.log = log; }
  assert.match(captured.join('\n'), /synthetic-transfer/);
  assert.throws(() => chain.checkWallet('Missing'), /participant/i);
});
scenario('members setter constructs participants without replacing the array with a custom property', () => {
  const chain = new Blockchain('TestCoin', 0, 4, 2);
  chain.members = ['Sender', 'Receiver'];
  assert.deepEqual(chain.members.map(p => p.name), ['Sender', 'Receiver']);
});
scenario('empty pool mining and halving produce valid freshly hashed blocks', () => {
  const chain = network();
  chain.mineNextBlock();
  chain.mineNextBlock();
  assert.equal(chain.areBlocksValid(), true);
  assert.equal(chain.areTxValid(), true);
  assert.equal(chain.blockArray[1].transactions.at(-1).amount, 4);
  assert.equal(chain.blockArray[2].transactions.at(-1).amount, 2);
});
scenario('mutated pending transaction is rejected before mining changes state', () => {
  const chain = network();
  transfer(chain).amount = 9;
  assert.throws(() => chain.mineNextBlock(), /transaction/i);
  assert.equal(chain.blockArray.length, 1);
  assert.equal(chain.blockReward, 4);
  assert.equal(chain.memPool.length, 1);
});
scenario('chain audit rejects a validly rehashed block with a disconnected predecessor', () => {
  const chain = network(); transfer(chain); chain.mineNextBlock();
  const block = chain.blockArray[1]; block.previousHash = 'unrelated-predecessor'; block.hash = block.createHash();
  assert.equal(chain.areBlocksValid(), false);
});
scenario('chain audit checks proof of work rather than only self-consistency', () => {
  const chain = network(1); transfer(chain); chain.mineNextBlock();
  const block = chain.blockArray[1];
  for (let attempt = 0; attempt < 64 && block.hash.startsWith('0'); attempt++) {
    block.nonce++; block.hash = block.createHash();
  }
  assert.ok(!block.hash.startsWith('0'), 'fixture must contain a hash without proof of work');
  assert.equal(chain.areBlocksValid(), false);
});
scenario('audit rejects changed coinbase issuance even after recomputing block hash', () => {
  const chain = network(); transfer(chain); chain.mineNextBlock();
  const block = chain.blockArray[1]; block.transactions.at(-1).amount += 100; block.hash = block.createHash();
  assert.equal(chain.areTxValid(), false);
});
scenario('audit returns false for malformed signatures instead of throwing', () => {
  const chain = network(); transfer(chain); chain.mineNextBlock();
  chain.blockArray[1].transactions[0].signature = 'not-a-signature';
  assert.equal(chain.areTxValid(), false);
});
scenario('a transaction already mined cannot be replayed into the pool', () => {
  const chain = network(); transfer(chain); chain.mineNextBlock();
  assert.throws(() => chain.appendTx(chain.blockArray[1].transactions[0]), /duplicate/i);
});
scenario('a validly signed historical overspend is rejected by audit', () => {
  const chain = network(); transfer(chain); chain.mineNextBlock();
  const block = chain.blockArray[1];
  block.transactions[0].amount = 11;
  block.transactions[0].sign(chain.participants[0].keyPair);
  block.hash = block.createHash();
  assert.equal(chain.areTxValid(), false);
});
scenario('a signed transfer replayed in a later block is rejected by audit', () => {
  const chain = network(); transfer(chain); chain.mineNextBlock();
  transfer(chain, 1, 0, 'second-transfer'); chain.mineNextBlock();
  chain.blockArray[2].transactions[0] = chain.blockArray[1].transactions[0];
  chain.blockArray[2].hash = chain.blockArray[2].createHash();
  assert.equal(chain.areTxValid(), false);
});
scenario('failure during mining preserves pending transactions and the pre-halving reward', () => {
  const chain = network(); transfer(chain); chain.mineNextBlock();
  transfer(chain, 1, 0, 'second-transfer');
  config.miningTimes.push = () => { throw new Error('synthetic mining failure'); };
  assert.throws(() => chain.mineNextBlock(), /synthetic mining failure/);
  assert.equal(chain.blockArray.length, 2);
  assert.equal(chain.blockReward, 4);
  assert.equal(chain.memPool.length, 1);
  assert.equal(chain.memPool[0].sender, chain.participants[0].publicKey);
});
scenario('mining reward overflow is rejected before committing a block', () => {
  config.startingBalance = 90071992.5474099;
  const chain = network();
  assert.throws(() => chain.mineNextBlock(), /safe numeric range/i);
  assert.equal(chain.blockArray.length, 1);
  assert.equal(chain.blockReward, 4);
});
