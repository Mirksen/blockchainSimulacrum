// The workbench session (CONTEXT.md, "Workbench session"): the simulator run the learner
// steers. It owns the chain, the miner races and their progress, the last round, Auto-mine
// and Auto-transact with their intervals, slow motion, the backing, the luck per miner and
// saving after every change. Views read its snapshot and call its actions; React only
// subscribes (hooks/useWorkbenchSession.js). No React here.
//
// createWorkbenchSession({ chain, search, clock, store, config }) -> { getSnapshot, subscribe, actions, dispose }
//   chain   optional start chain; else the store's saved chain, else createBlockchain(config)
//   search  the proof-of-work search: browserSearch (a worker where there is one) or inlineSearch(clock)
//   clock   { setTimeout, clearTimeout, now }: realClock or createTestClock()
//   store   { available, load(), save(chain) -> saveState }: browserStore(storage) or memoryStore()
//   config  the settings of a new chain (also after a reset)
// subscribe(listener) calls listener(events, snapshot) after every change; `events` are the
// typed results of that change (empty for search progress). Every action returns
// { ok, reason?, error?, snapshot, events } with the snapshot after its commit; the
// mining actions return a promise of it.
import { createBlockchain, DEFAULT_FEE_RATE, FEE_RATES } from './blockchain';
import { createSearchControl, runSearch } from './powSearch';
import { MIN_DIFFICULTY, MAX_DIFFICULTY } from './difficulty';
import { telemetry, failureCode } from './telemetry';
import { deserializeChain, loadChain, saveChain, serializeChain } from './chainStore';

// Auto-mine waits this long after a block before the next race; Auto-transact refills an
// empty mempool after this long.
export const AUTO_MINE_MS = 1500;
export const AUTO_TRANSACT_MS = 750;
// One Auto-transact refill: enough to fill a block, few enough to read.
const SAMPLE_TRANSFERS = 8;
const SAMPLE_RATES = [1, 2, 5, 10, 20];
// Satoshis a sample sender keeps for the fee: 20 sat/B on a transfer of up to 1,000 bytes.
const SAMPLE_FEE_ROOM = 20_000;
const MINING_FAILED = 'Mining could not finish. Reset the demo and try again.';
const IDLE = Object.freeze({ kind: 'idle', index: null });
const NO_PROGRESS = Object.freeze({ perMiner: Object.freeze({}), total: null });
const NO_LUCK = Object.freeze({ races: 0, perMiner: Object.freeze({}) });

// --- Adapters ---------------------------------------------------------------------------

// The timers of the page. Read from globalThis on every call, so fake timers apply in tests.
export const realClock = Object.freeze({
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: id => globalThis.clearTimeout(id),
  now: () => Date.now()
});

const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
// A clock that only moves when told: tick() runs the timers due now, advance(ms) every timer
// due within `ms`, both letting the promises they resolve settle in between.
export function createTestClock(start = 0) {
  let now = start;
  let sequence = 0;
  const timers = new Map();
  const due = until => [...timers.entries()].filter(([, timer]) => timer.at <= until)
    .sort(([a, x], [b, y]) => x.at - y.at || a - b);
  const fire = ([id, timer]) => { if (!timers.delete(id)) return; now = Math.max(now, timer.at); timer.callback(); };
  return {
    now: () => now,
    setTimeout(callback, ms = 0) {
      const id = ++sequence;
      timers.set(id, { at: now + Math.max(0, Number(ms) || 0), callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    pending: () => timers.size,
    async tick() {
      await settle();
      for (const entry of due(now)) fire(entry);
      await settle();
    },
    async advance(ms, { limit = 10_000 } = {}) {
      const until = now + ms;
      await settle();
      for (let fired = 0; ; fired++) {
        if (fired > limit) throw new Error('The test clock fired too many timers.');
        const [next] = due(until);
        if (!next) break;
        fire(next);
        await settle();
      }
      now = until;
      await settle();
    }
  };
}

// The search of the app: in a browser a worker per race, under test inline (runSearch 'auto').
export const browserSearch = options => runSearch(options);
// The search inline on this thread, yielding through `clock` between batches of attempts.
export const inlineSearch = (clock = realClock) => options =>
  runSearch({ ...options, yieldControl: () => new Promise(resolve => clock.setTimeout(resolve, 0)) }, { mode: 'inline' });

// The chain saved in `storage` (localStorage or alike, lib/chainStore.js); null keeps nothing.
export function browserStore(storage) {
  return { available: Boolean(storage), load: () => (storage ? loadChain(storage) : null), save: chain => saveChain(storage, chain) };
}
// The saved form kept in memory: `saved` is the last saved form, `saves` counts the saves.
export function memoryStore(saved = null) {
  const store = {
    available: true, saved, saves: 0,
    load() {
      try { return store.saved ? deserializeChain(store.saved) : null; } catch { return null; }
    },
    save(chain) {
      store.saved = JSON.parse(JSON.stringify(serializeChain(chain)));
      store.saves++;
      return 'saved';
    }
  };
  return store;
}

// The read side of a snapshot that lib/missionEvidence.js feeMarketEvidence takes.
export const ledgerOf = snapshot => ({ memPool: snapshot.memPool, blockTemplate: () => snapshot.blockTemplate, isChainValid: () => snapshot.chainValid });

// --- Views ------------------------------------------------------------------------------

// A block as plain data: its header fields, its transactions and the hash its content
// gives now (`computedHash`, from inspectBlocks).
function blockViewOf(block, check) {
  return Object.freeze({
    version: block.version, previousHash: block.previousHash, txRoot: block.txRoot, time: block.time, bits: block.bits,
    nonce: block.nonce, hash: block.hash, difficulty: block.difficulty, subsidy: block.subsidy, halved: block.halved,
    retarget: block.retarget ?? null, transactions: Object.freeze([...block.transactions]), computedHash: check.computedHash
  });
}

function chainViewOf(chain) {
  const blockStatus = chain.inspectBlocks();
  return {
    blocks: Object.freeze(chain.blockArray.map((block, index) => blockViewOf(block, blockStatus[index]))),
    blockStatus,
    chainValid: chain.isChainValid(),
    memPool: Object.freeze([...chain.memPool]),
    participants: chain.participants.map(p => ({ ...p })),
    balances: chain.getAllBalances(),
    difficulty: chain.miningDifficulty,
    blockReward: chain.blockReward,
    halvingInterval: chain.halvingEvent,
    targetSeconds: chain.targetSeconds,
    // The chain's own answers about the next block (lib/blockchain.js); views never derive them.
    nextBlock: chain.nextBlock(),
    loweringStartsNewChain: chain.loweringStartsNewChain(),
    canAddMiner: chain.canAddMiner(),
    tamperedEdits: chain.getTamperedEdits(),
    describeTx: chain.describer(),
    // The coins, change, size and fee a transfer at `feeRate` would use, before it is created.
    previewTransaction: (sender, amount, feeRate = DEFAULT_FEE_RATE, reference = '') =>
      chain.planAtRate(sender, Number(amount), Number(feeRate), reference),
    blockTemplate: chain.blockTemplate()
  };
}

// --- Races ------------------------------------------------------------------------------

function raceMetrics(race, clock) {
  return { difficulty: race.difficulty, elapsed_ms: Math.max(0, clock.now() - race.startedAt), attempt_count: race.attempts,
    miner_count: race.minerCount, transaction_count: race.transactionCount };
}
function cancelRace(race, reason, clock) {
  if (!race || race.aborted || race.finished) return;
  race.aborted = true;
  race.stop.abort(); // Ends the search (and terminates its worker) without polling.
  if (race.tracked) void telemetry.track('mining_cancelled', { ...raceMetrics(race, clock), reason });
}
const aborted = () => ({ success: false, aborted: true });

export function createWorkbenchSession({ chain: startChain = null, search = browserSearch, clock = realClock, store = null, config = {} } = {}) {
  const loaded = startChain ? null : store?.load() ?? null;
  const state = {
    chain: startChain ?? loaded ?? createBlockchain(config),
    restored: Boolean(loaded),
    saveState: store?.available ? 'saved' : 'unavailable',
    // `race` is the running search (the lock), `setup` the running demo.
    race: null, setup: null, run: IDLE,
    // Play starts a run; Auto-mine only decides whether the run continues after a block.
    running: false, autoMine: false, autoTransact: false, slow: false,
    backed: null, signer: null, progress: NO_PROGRESS, raceWinner: null, luck: NO_LUCK, lastRound: null, error: '',
    // Follow the most recently queued manual transfer through normal mining rounds.
    manualTxid: null,
    // A refill that found no funded sender waits for the next block of this chain.
    dry: null
  };
  const timers = { mine: null, transact: null };
  const listeners = new Set();
  let chainView = chainViewOf(state.chain);
  let snapshot = build();

  function build() {
    return Object.freeze({
      ...chainView,
      restored: state.restored, saveState: state.saveState, run: state.run,
      settings: Object.freeze({ autoMine: state.autoMine, autoTransact: state.autoTransact, slowMotion: state.slow }),
      // A run started with Play continues with the next block.
      repeating: state.running && state.autoMine && chainView.chainValid,
      progress: state.progress, raceWinner: state.raceWinner, backedMiner: state.backed, luck: state.luck,
      lastRound: state.lastRound, error: state.error
    });
  }
  const busy = () => Boolean(state.race || state.setup);
  // The chain changed: new views, and the store keeps it.
  function chainChanged() {
    chainView = chainViewOf(state.chain);
    if (store) state.saveState = store.save(state.chain);
  }
  function publish(events = []) {
    snapshot = build();
    schedule();
    for (const listener of [...listeners]) listener(events, snapshot);
    return snapshot;
  }
  const done = (fields, events = []) => ({ ok: true, ...fields, snapshot: publish(events), events });
  const refused = (reason, error = null, fields = {}, events = []) => ({ ok: false, reason, error, ...fields, snapshot: publish(events), events });
  const changed = (fields = {}, events = []) => { chainChanged(); return done(fields, events); };

  // Auto-mine and Auto-transact: each timer exists exactly while its condition holds.
  function schedule() {
    const idle = !busy() && state.run === IDLE;
    const valid = chainView.chainValid;
    const mine = state.running && state.autoMine && valid && idle;
    if (mine && timers.mine === null) timers.mine = clock.setTimeout(() => { timers.mine = null; void mineNext(); }, AUTO_MINE_MS);
    if (!mine && timers.mine !== null) { clock.clearTimeout(timers.mine); timers.mine = null; }
    // Refill only an empty mempool: existing transfers stay, and no unbounded queue grows.
    const dry = state.dry?.chain === state.chain && state.dry.height === state.chain.blockArray.length;
    const transact = state.autoTransact && valid && idle && !state.chain.memPool.length && !dry;
    if (transact && timers.transact === null) timers.transact = clock.setTimeout(() => { timers.transact = null; refill(); }, AUTO_TRANSACT_MS);
    if (!transact && timers.transact !== null) { clock.clearTimeout(timers.transact); timers.transact = null; }
  }
  function clearTimers() {
    for (const key of Object.keys(timers)) {
      if (timers[key] !== null) clock.clearTimeout(timers[key]);
      timers[key] = null;
    }
  }

  // One miner race. `prepare(round)` returns the candidates (one per miner) of a round; a
  // further round starts only when every 32-bit nonce of the previous one was tried, and must
  // bring a new header. `commit` stores the winner's proof in the chain and returns the block,
  // or null when the chain refused it. The race must already hold the lock in state.race.
  async function runRace(race, chain, miners, prepare, commit) {
    const isCurrent = () => !race.aborted && state.race === race && state.chain === chain;
    state.raceWinner = null;
    state.progress = NO_PROGRESS;
    publish();
    const start = race.startedAt;
    let candidates;
    // Each miner's current rate: attempts per second over the last quarter second or more,
    // smoothed, so a share change shows within a second instead of in the race average.
    const pace = {};
    const rateNow = (name, iterations, now) => {
      const last = pace[name];
      // A new round of the search (next extraNonce) counts from zero again: start over.
      if (!last || iterations < last.iterations) { pace[name] = { iterations, at: now, rate: last?.rate ?? null }; return pace[name].rate; }
      if (now - last.at < 250) return last.rate;
      const recent = (iterations - last.iterations) / ((now - last.at) / 1000);
      pace[name] = { iterations, at: now, rate: last.rate === null ? recent : (last.rate + recent) / 2 };
      return pace[name].rate;
    };
    const record = (entrantProgress, featured, total) => {
      const now = clock.now();
      const elapsedMs = now - start;
      const lead = entrantProgress[featured];
      state.progress = Object.freeze({
        perMiner: Object.freeze(Object.fromEntries(miners.map(miner => {
          const entrant = entrantProgress[miner.name];
          const rate = rateNow(miner.name, entrant.attempts, now);
          // stream, best and zeroCounts cover this search; header is the candidate's first 76 bytes.
          return [miner.name, { nonce: entrant.nonce, hash: entrant.hash, iterations: entrant.attempts,
            zeros: entrant.zeros, peakZeros: entrant.peakZeros ?? entrant.zeros, elapsedMs, rate,
            stream: entrant.stream ?? [], best: entrant.best ?? null, zeroCounts: entrant.zeroCounts ?? [],
            header: candidates?.get(miner.name)?.header ?? null }];
        }))),
        total: { nonce: lead.nonce, hash: lead.hash, iterations: total, elapsedMs }
      });
    };
    try {
      // The search always yields before its first attempt, including easy blocks, so Stop
      // and concurrent starts have the same lifecycle as expensive mining.
      let round = 0;
      let earlier = 0; // Attempts of finished rounds.
      let result;
      // Hashpower and slow motion change while the race runs, through this control.
      race.control = createSearchControl({ weights: Object.fromEntries(miners.map(miner => [miner.name, miner.hashpower])), slow: state.slow });
      do {
        candidates = prepare(round++);
        result = await search({
          // Each miner tries `hashpower` consecutive nonces per turn from its own random start.
          entrants: miners.map(miner => ({ id: miner.name, weight: miner.hashpower,
            header: candidates.get(miner.name).header, startNonce: Math.floor(Math.random() * 10000) + 1 })),
          bits: candidates.get(miners[0].name).bits, signal: race.stop.signal, control: race.control, detail: true,
          onProgress: progress => {
            if (!isCurrent()) return;
            race.attempts = earlier + progress.attempts;
            record(progress.entrants, miners[0].name, race.attempts);
            publish();
          }
        });
        earlier += result.attempts;
        race.attempts = earlier;
      } while (result.status === 'exhausted' && isCurrent());
      if (result.status === 'stopped' || !isCurrent()) return aborted();
      // A stopped, stale or rejected attempt never changes the chain or supply schedule.
      const block = commit(candidates.get(result.winner), result);
      if (!block) return aborted();
      record(result.entrants, result.winner, race.attempts);
      state.raceWinner = result.winner;
      const total = miners.reduce((sum, miner) => sum + miner.hashpower, 0);
      state.luck = Object.freeze({ races: state.luck.races + 1, perMiner: Object.fromEntries([...Object.entries(state.luck.perMiner),
        ...miners.map(miner => {
          const before = state.luck.perMiner[miner.publicKey] ?? { won: 0, expected: 0 };
          return [miner.publicKey, { won: before.won + (miner.name === result.winner ? 1 : 0), expected: before.expected + miner.hashpower / total }];
        })]) });
      race.finished = true;
      if (race.tracked) void telemetry.track('mining_completed', { ...raceMetrics(race, clock), block_height: chain.blockArray.length - 1 });
      return { success: true, winner: result.winner, block, miningTime: (clock.now() - start) / 1000,
        backedWon: race.backed === null ? null : result.winner === race.backed };
    } catch (error) {
      race.finished = true;
      if (race.tracked) void telemetry.track('mining_failed', { ...raceMetrics(race, clock), reason: 'unexpected' });
      void telemetry.reportError(error, 'mining', true);
      return { success: false, error: error.message, code: 'unexpected' };
    } finally {
      // Slow motion is one look at one race: it ends with that race, found, paused or stale,
      // so Auto-mine's next block and every later race run at full speed again.
      state.slow = false;
      if (state.race === race) state.race = null;
    }
  }
  // `tracked` races (new blocks) report operation telemetry; re-mining has no event schema.
  function lockRace(chain, miners, tracked) {
    const race = { aborted: false, finished: false, startedAt: clock.now(), attempts: 0, stop: new AbortController(),
      difficulty: chain.miningDifficulty, minerCount: miners.length, transactionCount: chain.memPool.length, backed: state.backed, tracked };
    state.race = race; // Lock synchronously, before any view renders.
    return race;
  }

  // A new block on top of the chain: `{ success, winner, block, height, epoch, retarget, run }`.
  async function raceNewBlock(setup = null) {
    const chain = state.chain;
    const miners = chain.getActiveMiners();
    const reject = (code, error, reason = code) => {
      void telemetry.track('mining_failed', { difficulty: chain.miningDifficulty, elapsed_ms: 0, attempt_count: 0,
        miner_count: miners.length, transaction_count: chain.memPool.length, reason });
      return { success: false, error, code };
    };
    if (state.race || (state.setup && state.setup !== setup)) return reject('busy', 'Mining is already running.');
    if (setup?.aborted) return aborted();
    if (!miners.length) return reject('no_miners', 'Enable at least one miner in Participants.');
    // A new block would only extend an invalid chain; repair or undo first.
    if (!chain.canExtend()) return reject('chain_invalid', 'Mining is paused because the chain is invalid. Re-mine or undo the changed block first.', 'invalid_state');
    const race = lockRace(chain, miners, true);
    const height = chain.blockArray.length;
    const run = setup ? state.run : Object.freeze({ kind: 'mining', index: height });
    state.run = run;
    void telemetry.track('mining_started', { difficulty: race.difficulty, miner_count: race.minerCount, transaction_count: race.transactionCount });
    // One shared time keeps every miner's candidate on the same header time; each round
    // moves on to the next extraNonce in the coinbase.
    const time = chain.nextBlockTime();
    // Every miner here hashes in this browser, so every candidate carries its visitor's signature.
    const signature = state.signer?.current() ?? null;
    const prepare = extraNonce => new Map(miners.map(miner => [miner.name, chain.prepareCandidate(miner, { time, extraNonce, signature })]));
    // A block at a check height may retarget the difficulty (acceptBlock); it applies from the next block on.
    let retarget = null;
    const result = await runRace(race, chain, miners, prepare, (candidate, found) => {
      const outcome = chain.acceptBlock(candidate, found.nonce, found.hash);
      if (outcome.status !== 'accepted') return null;
      retarget = outcome.retarget;
      if (retarget) void telemetry.track('difficulty_changed', { previous: retarget.from, value: retarget.to });
      return outcome.block;
    });
    if (result.success && signature) void state.signer.submit(result.block, signature, height);
    const current = result.success && state.chain === chain;
    return current ? { ...result, height, epoch: chain.epochAt(height), retarget, run } : { ...(result.success ? aborted() : result), run };
  }

  // The last round: who won at which nonce, after how many tries, each miner's final progress.
  function roundOf(index, result, manualTxid = null) {
    return Object.freeze({ index, manualTxid, winner: result.winner, nonce: result.block.nonce, attempts: state.progress.total?.iterations,
      elapsedMs: result.miningTime ? result.miningTime * 1000 : undefined, difficulty: state.chain.miningDifficulty,
      perMiner: { ...state.progress.perMiner } });
  }
  const viewOfBlock = index => chainView.blocks[index];
  // The end of a race of a run: the run returns to idle unless a newer one took over.
  function endRun(result, { setsRunning = true } = {}) {
    if (result.run && state.run === result.run) state.run = IDLE;
    if (result.success) {
      state.error = '';
      if (setsRunning && !state.autoMine) state.running = false;
    } else if (!result.aborted) {
      state.error = result.error || MINING_FAILED;
      state.running = false;
    }
  }
  const outcomeOf = (result, events) => (result.success
    ? { ok: true, snapshot: publish(events), events }
    : { ok: false, reason: result.aborted ? 'aborted' : result.code ?? 'failed', error: result.error ?? null,
      ...(result.repairFirst === undefined ? {} : { repairFirst: result.repairFirst }), snapshot: publish(events), events });
  function acceptedEvents(result, { demo = false } = {}) {
    const { height, retarget } = result;
    const block = viewOfBlock(height);
    const events = [{ type: 'block-accepted', index: height, block, winner: result.winner, retarget, halved: block.halved === true,
      backedWon: result.backedWon, epoch: result.epoch, demo }];
    if (retarget) events.push({ type: 'difficulty-changed', from: retarget.from, to: retarget.to, source: 'auto' });
    return events;
  }

  // Play and every Auto-mine block: one race for the next block.
  async function mineNext() {
    const result = await raceNewBlock();
    if (result.success) {
      state.lastRound = roundOf(result.height, result, state.manualTxid);
      if (state.manualTxid && result.block.transactions.some(tx => tx.createHash() === state.manualTxid)) state.manualTxid = null;
      chainChanged();
    }
    endRun(result);
    return outcomeOf(result, result.success ? acceptedEvents(result) : []);
  }

  // The demo: block #1, its reward shared with the other wallets in the mempool for #2.
  async function demo() {
    const chain = state.chain;
    if (busy()) {
      void telemetry.track('demo_failed', { reason: 'busy' });
      return { success: false, error: 'Mining is already running.', code: 'busy' };
    }
    if (chain.blockArray.length !== 1 || chain.memPool.length) {
      void telemetry.track('demo_failed', { reason: 'invalid_state' });
      return { success: false, error: 'Reset the chain to start a new demo.', code: 'invalid_state' };
    }
    const setup = { aborted: false };
    const run = Object.freeze({ kind: 'setup', index: 1 });
    state.setup = setup;
    state.run = run;
    void telemetry.track('demo_started', { difficulty: chain.miningDifficulty });
    const finish = outcome => {
      const result = setup.aborted ? { ...outcome, success: false, aborted: true } : outcome;
      if (result.success) void telemetry.track('demo_completed', { difficulty: chain.miningDifficulty, block_count: chain.blockArray.length - 1 });
      else if (result.aborted || setup.aborted) void telemetry.track('demo_cancelled');
      else void telemetry.track('demo_failed', { reason: result.code || 'unexpected' });
      return { ...result, run };
    };
    try {
      const first = await raceNewBlock(setup);
      if (!first.success || setup.aborted) return finish(first);
      const others = chain.participants.filter(p => p.name !== first.winner);
      const balance = chain.calculateBalance(chain.getParticipantByName(first.winner).publicKey);
      // Each transfer keeps room for its fee at the lowest rate (a little over 250 bytes).
      const amount = Math.min(0.6, Math.floor((balance / Math.max(1, others.length) - 0.000003) * 1e8) / 1e8);
      if (amount <= 0) return finish({ success: false, error: 'The reward is too small to share. Reset the demo.', code: 'reward_too_small' });
      // One click mines one block: the transfers wait in the mempool for the next one.
      for (const recipient of others) chain.createTransactionAtRate(first.winner, recipient.name, amount, FEE_RATES[0], 'Demo distribution');
      if (others.length) void telemetry.track('transaction_created', { source: 'demo', count: others.length, pending_count: chain.memPool.length });
      return finish(first);
    } catch (error) {
      void telemetry.reportError(error, 'demo', true);
      return finish({ success: false, error: error.message, code: 'unexpected' });
    } finally {
      if (state.setup === setup) state.setup = null;
    }
  }

  // Re-mine historical block `index` with the same race as a new block: only its link,
  // difficulty, nonce and hash change; its transactions stay as they are.
  async function raceRemine(index) {
    const chain = state.chain;
    const miners = chain.getActiveMiners();
    if (busy()) return { success: false, error: 'Mining is already running.', code: 'busy' };
    if (!miners.length) return { success: false, error: 'Enable at least one miner in Participants.', code: 'no_miners' };
    const prepared = chain.prepareRemine(index);
    if (!prepared.success) return prepared;
    const race = lockRace(chain, miners, false);
    const run = Object.freeze({ kind: 'remining', index });
    state.run = run;
    // Every miner works on the same header; only their nonce ranges differ. Its
    // transactions must not change, so each further round rolls the time.
    const prepare = timeRoll => {
      const { candidate } = timeRoll ? chain.prepareRemine(index, { timeRoll }) : prepared;
      return new Map(miners.map(miner => [miner.name, candidate]));
    };
    const result = await runRace(race, chain, miners, prepare, (candidate, found) => {
      const outcome = chain.acceptRemine(candidate, found.nonce, found.hash);
      return outcome.status === 'accepted' ? outcome.block : null;
    });
    const current = result.success && state.chain === chain;
    return current ? { ...result, index, epoch: chain.epochAt(index), run } : { ...(result.success ? aborted() : result), run };
  }

  // Stops the running search or demo; nothing it found later changes the chain.
  function cancel(reason) {
    cancelRace(state.race, reason, clock);
    if (state.setup) state.setup.aborted = true;
    state.race = null;
    state.setup = null;
    state.run = IDLE;
  }

  // One Auto-transact refill of sample transfers between funded wallets.
  function refill() {
    if (busy()) return;
    const chain = state.chain;
    let count = 0;
    for (let i = 0; i < SAMPLE_TRANSFERS; i++) {
      // Pick a sender who can actually fund a sample transfer. Choosing only unfunded
      // wallets must not strand an enabled empty refill.
      const funded = chain.participants.map(participant => ({ participant,
        available: Math.round(chain.calculateBalance(participant.publicKey) * 1e8) - SAMPLE_FEE_ROOM }))
        .filter(sender => sender.available >= 5_000_000);
      if (!funded.length) break;
      const { participant: sender, available } = funded[Math.floor(Math.random() * funded.length)];
      const recipients = chain.participants.filter(p => p !== sender);
      if (!recipients.length) break;
      const recipient = recipients[Math.floor(Math.random() * recipients.length)];
      const maximum = Math.min(10_000_000, available);
      const amount = (5_000_000 + Math.floor(Math.random() * (maximum - 5_000_000 + 1))) / 1e8;
      // Mixed fee rates, so a full block shows which transfers a miner takes first.
      const feeRate = SAMPLE_RATES[Math.floor(Math.random() * SAMPLE_RATES.length)];
      chain.createTransactionAtRate(sender.name, recipient.name, amount, feeRate, 'Demo transfer');
      count++;
    }
    if (count) void telemetry.track('transaction_created', { source: 'random', count, pending_count: chain.memPool.length });
    else {
      void telemetry.track('transaction_rejected', { source: 'random', reason: 'insufficient_funds' });
      state.dry = { chain, height: chain.blockArray.length };
    }
    changed({}, [{ type: 'transaction-created', source: 'random', count }]);
  }

  const actions = Object.freeze({
    // Play: mines the next block; with Auto-mine the run continues block after block.
    mine() {
      state.running = true;
      return mineNext();
    },
    // Start demo: mines block #1 and leaves its distribution waiting for #2.
    async startDemo() {
      state.running = true;
      const result = await demo();
      if (result.success) {
        state.lastRound = Object.freeze({ ...roundOf(1, result), demo: true });
        chainChanged();
      }
      endRun(result);
      return outcomeOf(result, result.success ? acceptedEvents(result, { demo: true }) : []);
    },
    // Re-mine one block of a repair; it never starts or ends a run.
    async remine(index) {
      const result = await raceRemine(index);
      const events = [];
      if (result.success) {
        state.lastRound = roundOf(index, result);
        chainChanged();
        const checks = chainView.blockStatus;
        events.push({ type: 'block-remined', blockIndex: index, block: viewOfBlock(index), winner: result.winner, epoch: result.epoch, backedWon: result.backedWon,
          chainValid: chainView.chainValid,
          hashesAndLinksValid: checks.every(check => check.hashMatches && check.meetsTarget && check.linkIntact),
          signatureInvalid: checks[index]?.status === 'signature-invalid',
          editPresent: chainView.tamperedEdits.some(edit => edit.blockIndex === index && edit.txIndex > 0) });
      }
      endRun(result, { setsRunning: false });
      return outcomeOf(result, events);
    },
    // Pause ends the run and its search; the Auto-mine setting stays for the next Play.
    pause() {
      state.running = false;
      cancel('user_stop');
      return done({});
    },
    // The toggle neither starts nor stops a search: off lets the current block finish,
    // on lets a running block continue into the next one.
    setAutoMine(on) {
      state.autoMine = Boolean(on);
      if (!state.autoMine && !busy()) state.running = false;
      return done({});
    },
    setAutoTransact(on) {
      state.autoTransact = Boolean(on);
      if (state.autoTransact) state.dry = null;
      return done({});
    },
    // A transfer at `feeRate` satoshis per byte; it waits in the mempool.
    createTransaction(sender, recipient, amount, reference, feeRate = DEFAULT_FEE_RATE) {
      if (busy()) {
        void telemetry.track('transaction_rejected', { source: 'manual', reason: 'busy' });
        return refused('busy', 'Wait for mining to finish or stop it first.');
      }
      try {
        const tx = state.chain.createTransactionAtRate(sender, recipient, Number(amount), Number(feeRate), reference);
        state.manualTxid = tx.createHash();
        void telemetry.track('transaction_created', { source: 'manual', count: 1, pending_count: state.chain.memPool.length });
        return changed({ tx }, [{ type: 'transaction-created', source: 'manual', tx }]);
      } catch (error) {
        const code = failureCode(error);
        void telemetry.track('transaction_rejected', { source: 'manual', reason: code });
        return refused(code, error.message);
      }
    },
    // The chain decides (requestDifficulty): applied, unchanged, invalid, or needs-reset when
    // lowering a chain with mined blocks, which starts a new one after a confirmation (ADR 0004).
    setDifficulty(value, { source = 'manual' } = {}) {
      if (busy()) return refused('busy', null, { outcome: 'busy' });
      const from = state.chain.miningDifficulty;
      const { outcome } = state.chain.requestDifficulty(value, { source });
      if (outcome === 'needs-reset') return refused(outcome, null, { outcome }, [{ type: 'difficulty-needs-reset', from, to: value }]);
      if (outcome !== 'applied') return refused(outcome, null, { outcome });
      const to = state.chain.miningDifficulty;
      void telemetry.track('difficulty_changed', { previous: from, value: to });
      return changed({ outcome }, [{ type: 'difficulty-changed', from, to, source }]);
    },
    setHalvingInterval(value) {
      if (busy() || state.chain.setHalvingInterval(value).outcome !== 'applied') return refused('unchanged');
      void telemetry.track('settings_changed', { setting: 'halving_interval', value: state.chain.halvingEvent });
      return changed();
    },
    // The target block time is a chain setting: saved with the chain, kept by a reset.
    setTargetBlockTime(value) {
      if (busy() || state.chain.setTargetSeconds(value).outcome !== 'applied') return refused('unchanged');
      void telemetry.track('settings_changed', { setting: 'target_block_time', value: state.chain.targetSeconds });
      return changed();
    },
    // Only an edit the chain applied pauses the run and counts; a refused one changes nothing.
    tamper(blockIndex, txIndex, amount) {
      if (busy()) return refused('busy');
      const { applied, reason } = state.chain.tamperTransaction(blockIndex, txIndex, Number(amount));
      if (!applied) return refused(reason, null, {}, [{ type: 'block-tampered', blockIndex, txIndex, applied: false, reason }]);
      state.running = false;
      void telemetry.track('tamper_applied', { block_height: blockIndex });
      chainChanged();
      return done({}, [{ type: 'block-tampered', blockIndex, txIndex, applied: true,
        signed: txIndex > 0 && chainView.blockStatus[blockIndex]?.signaturesValid === false,
        newest: blockIndex === chainView.blocks.length - 1 }]);
    },
    undo(blockIndex) {
      if (busy()) return refused('busy', 'Stop mining first.', { restored: 0 });
      const { success, restored } = state.chain.undoTamper(blockIndex);
      if (!success) return refused('nothing-to-undo', null, { restored });
      return changed({ restored }, [{ type: 'edit-undone', blockIndex, restored }]);
    },
    // Adding a non-miner wallet never touches a running race.
    createWallet(name) {
      const result = state.chain.addWallet(name);
      return result.success ? changed({ error: null, participant: result.participant }) : refused('refused', result.error);
    },
    // A new miner joins from the next race on; the miners of a running race stay fixed.
    createMiner(name) {
      if (busy()) return refused('busy', 'Wait until the current block is found.');
      const result = state.chain.addMiner(name);
      return result.success ? changed({ error: null, participant: result.participant }) : refused('refused', result.error);
    },
    // A display name for this session only: the chain stores scripts, so every view follows.
    // Name-keyed state (backing, last race, last round) moves to the new name; never during a race.
    renameMiner(name, next) {
      if (busy()) return refused('busy', 'Wait until the current block is found.');
      const result = state.chain.renameParticipant(name, next);
      if (!result.success) return refused('refused', result.error);
      const renamed = result.participant.name;
      if (renamed === name) return done({ error: null, participant: result.participant });
      const rename = key => (key === name ? renamed : key);
      const renameKeys = record => Object.fromEntries(Object.entries(record ?? {}).map(([key, value]) => [rename(key), value]));
      state.backed = state.backed === null ? null : rename(state.backed);
      state.raceWinner = state.raceWinner === null ? null : rename(state.raceWinner);
      state.progress = Object.freeze({ ...state.progress, perMiner: Object.freeze(renameKeys(state.progress.perMiner)) });
      if (state.lastRound) state.lastRound = Object.freeze({ ...state.lastRound, winner: rename(state.lastRound.winner), perMiner: renameKeys(state.lastRound.perMiner) });
      return changed({ error: null, participant: result.participant }, [{ type: 'miner-renamed', from: name, to: renamed }]);
    },
    // The backing that counts for a race is the one in place when it starts.
    backMiner(name) {
      if (name !== null && !state.chain.getParticipantByName(name)?.isMiner) return refused('not-a-miner', 'Choose a miner to back.');
      state.backed = name;
      return done({ error: null }, name === null ? [] : [{ type: 'miner-backed', name }]);
    },
    toggleMiner(name) {
      const miner = state.chain.getParticipantByName(name);
      if (busy() || !miner?.isMiner) return refused('unchanged');
      state.chain.toggleMiner(name);
      void telemetry.track('settings_changed', { setting: 'miner_enabled', value: miner.minerEnabled });
      return changed();
    },
    // A miner's share of the enabled miners' hashpower, in percent; the others give way in
    // proportion. Also during a race: the running search takes the new weights from its next turn.
    setMinerShare(name, percent) {
      const miner = state.chain.getParticipantByName(name);
      if (!miner?.isMiner || !miner.minerEnabled) return refused('unchanged');
      const before = state.chain.getActiveMiners().map(p => p.hashpower).join();
      const weights = state.chain.setMinerShare(name, percent);
      if (!weights || state.chain.getActiveMiners().map(p => p.hashpower).join() === before) return refused('unchanged');
      state.race?.control?.update({ weights });
      void telemetry.track('settings_changed', { setting: 'hashpower', value: miner.hashpower });
      return changed();
    },
    // Slow motion: the race tries one nonce every SLOW_MS until it is switched off or the race ends.
    setSlowMotion(on) {
      const slow = Boolean(on);
      if (slow === state.slow) return { ok: true, snapshot, events: [] };
      state.slow = slow;
      state.race?.control?.update({ slow });
      return done({});
    },
    // `signer` is { current() -> the signature of the next block or null, submit(block,
    // signature, height) }. Re-mined blocks keep their coinbase and never reach it.
    setSigner(signer) {
      state.signer = signer ?? null;
      return { ok: true, snapshot, events: [] };
    },
    // A new chain with the same settings; Auto-mine and Auto-transact switch off. `difficulty`
    // starts it at another difficulty: lowering it manually is only allowed together with a
    // new chain, so a chain of easier blocks never outgrows one that took more work (ADR 0004).
    reset({ difficulty: next } = {}) {
      const previousBlockCount = state.chain.blockArray.length - 1;
      state.autoMine = false;
      state.autoTransact = false;
      state.running = false;
      cancel('reset');
      clearTimers();
      void telemetry.track('chain_reset', { previous_block_count: previousBlockCount });
      const { miningDifficulty: previous, halvingEvent, targetSeconds } = state.chain;
      const valid = Number.isInteger(next) && next >= MIN_DIFFICULTY && next <= MAX_DIFFICULTY;
      const miningDifficulty = valid ? next : previous;
      if (miningDifficulty !== previous) void telemetry.track('difficulty_changed', { previous, value: miningDifficulty });
      state.chain = createBlockchain({ ...config, miningDifficulty, halvingEvent, targetSeconds });
      state.restored = false;
      state.progress = NO_PROGRESS;
      state.raceWinner = null;
      state.backed = null;
      state.luck = NO_LUCK;
      state.lastRound = null;
      state.manualTxid = null;
      state.error = '';
      state.dry = null;
      return changed({}, [{ type: 'reset' }]);
    }
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
    // Stops the run: the running search, Auto-mine and Auto-transact end, so nothing schedules
    // another race or refill. The session stays usable (React may mount it again).
    dispose() {
      state.running = false;
      state.autoMine = false;
      state.autoTransact = false;
      cancelRace(state.race, 'unmount', clock);
      if (state.setup) state.setup.aborted = true;
      state.race = null;
      state.setup = null;
      clearTimers();
    }
  };
}
