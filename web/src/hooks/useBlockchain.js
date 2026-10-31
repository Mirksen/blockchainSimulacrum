import { useState, useCallback, useEffect } from 'react';
import { createBlockchain } from '../lib/blockchain';
import { runSearch } from '../lib/powSearch';
import { MIN_DIFFICULTY, MAX_DIFFICULTY } from '../lib/difficulty';
import { telemetry, failureCode } from '../lib/telemetry';

function snapshot(chain) {
    return {
        blockchain: chain,
        balances: chain.getAllBalances(),
        chainValid: chain.isChainValid(),
        memPool: [...chain.memPool],
        blocks: [...chain.blockArray],
        participants: chain.participants.map(p => ({ ...p })),
        difficulty: chain.miningDifficulty,
        blockReward: chain.blockReward,
        halvingInterval: chain.halvingEvent,
        blockStatus: chain.inspectBlocks(),
        tamperedEdits: chain.getTamperedEdits()
    };
}
const aborted = () => ({ success: false, aborted: true });
function miningMetrics(run) {
    return { difficulty: run.difficulty, elapsed_ms: Math.max(0, Date.now() - run.startedAt), attempt_count: run.attempts,
        miner_count: run.minerCount, transaction_count: run.transactionCount };
}
function cancelRun(run, reason) {
    if (!run || run.aborted || run.finished) return;
    run.aborted = true;
    run.stop.abort(); // Ends the search (and terminates its worker) without polling.
    if (run.tracked) void telemetry.track('mining_cancelled', { ...miningMetrics(run), reason });
}
// `tracked` runs (new blocks) report operation telemetry; re-mining has no event schema.
function createRun(chain, miners, backed, tracked) {
    return { aborted: false, finished: false, startedAt: Date.now(), attempts: 0, stop: new AbortController(),
        difficulty: chain.miningDifficulty, minerCount: miners.length, transactionCount: chain.memPool.length,
        backed, tracked };
}


export function useBlockchain(config = {}) {
    // The controller belongs to this hook instance. Only event handlers mutate it;
    // rendering reads a fresh snapshot published after each model change.
    const [controller] = useState(() => ({ chain: createBlockchain(config), config, run: null, setup: null, backed: null }));
    const [view, setView] = useState(() => snapshot(controller.chain));
    const [isMining, setIsMining] = useState(false);
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [miningProgress, setMiningProgress] = useState(null);
    const [minerProgress, setMinerProgress] = useState({});
    const [raceWinner, setRaceWinner] = useState(null);
    const [hashAttempts, setHashAttempts] = useState([]);
    const [selectedBlock, setSelectedBlock] = useState(null);
    const [backedMiner, setBackedMiner] = useState(null);
    const [lastDifficultyChange, setLastDifficultyChange] = useState(null);
    const publish = useCallback(() => setView(snapshot(controller.chain)), [controller]);

    useEffect(() => () => {
        cancelRun(controller.run, 'unmount');
        if (controller.setup) controller.setup.aborted = true;
        controller.run = null;
        controller.setup = null;
    }, [controller]);

    const cancelMining = useCallback((reason = 'user_stop') => {
        cancelRun(controller.run, reason);
        if (controller.setup) controller.setup.aborted = true;
        controller.run = null;
        controller.setup = null;
        setIsMining(false);
        setIsSettingUp(false);
    }, [controller]);

    const createTransaction = useCallback((sender, recipient, amount, fee = 0.00000001, reference) => {
        if (controller.run || controller.setup) {
            void telemetry.track('transaction_rejected', { source: 'manual', reason: 'busy' });
            return { success: false, error: 'Wait for mining to finish or stop it first.' };
        }
        try {
            const tx = controller.chain.createTransaction(sender, recipient, Number(amount), Number(fee), reference);
            publish();
            void telemetry.track('transaction_created', { source: 'manual', count: 1, pending_count: controller.chain.memPool.length });
            return { success: true, tx };
        } catch (error) {
            const code = failureCode(error);
            void telemetry.track('transaction_rejected', { source: 'manual', reason: code });
            return { success: false, error: error.message, code };
        }
    }, [controller, publish]);

    // One miner race. `prepare(round)` returns the candidates (one per miner) of a
    // round; a further round starts only when every 32-bit nonce of the previous one
    // was tried, and must bring a new header. `commit` stores the winner's proof in
    // the chain and returns the block, or null when the chain refused it. The run must
    // already hold the lock in controller.run.
    const race = useCallback(async (run, chain, miners, prepare, commit) => {
        const isCurrent = () => !run.aborted && controller.run === run && controller.chain === chain;
        setIsMining(true);
        setRaceWinner(null);
        setMinerProgress({});
        setMiningProgress(null);
        setHashAttempts([]);
        const attempts = [];
        const start = run.startedAt;
        // All three updates happen in one synchronous callback, so React batches
        // them into a single render per progress event.
        const report = (entrantProgress, featured, total) => {
            const elapsedMs = Date.now() - start;
            setMinerProgress(Object.fromEntries(miners.map(miner => {
                const entrant = entrantProgress[miner.name];
                return [miner.name, { nonce: entrant.nonce, hash: entrant.hash, iterations: entrant.attempts,
                    zeros: entrant.zeros, peakZeros: entrant.peakZeros ?? entrant.zeros, elapsedMs }];
            })));
            const lead = entrantProgress[featured];
            setMiningProgress({ nonce: lead.nonce, hash: lead.hash, iterations: total, elapsedMs });
            setHashAttempts([...attempts]);
        };
        const remember = (entries) => {
            for (const { id, nonce, hash } of entries) attempts.push({ nonce, hash, miner: id });
            attempts.splice(0, Math.max(0, attempts.length - 100));
        };
        try {
            // The search always yields before its first attempt, including easy
            // blocks, so Stop and concurrent starts have the same lifecycle as
            // expensive mining.
            let round = 0;
            let earlier = 0; // Attempts of finished rounds.
            let candidates;
            let result;
            do {
                candidates = prepare(round++);
                result = await runSearch({
                    // Each miner tries `hashpower` consecutive nonces per turn from its own random start.
                    entrants: miners.map(miner => ({ id: miner.name, weight: miner.hashpower,
                        header: candidates.get(miner.name).header, startNonce: Math.floor(Math.random() * 10000) + 1 })),
                    bits: candidates.get(miners[0].name).bits, signal: run.stop.signal,
                    onProgress: progress => {
                        if (!isCurrent()) return;
                        run.attempts = earlier + progress.attempts;
                        remember(progress.recent);
                        report(progress.entrants, miners[0].name, run.attempts);
                    }
                });
                earlier += result.attempts;
                run.attempts = earlier;
            } while (result.status === 'exhausted' && isCurrent());
            if (result.status === 'stopped') return aborted();
            if (!isCurrent()) return aborted();
            // A stopped, stale or rejected attempt never changes the chain or supply schedule.
            const block = commit(candidates.get(result.winner), result);
            if (!block) return aborted();
            remember([{ id: result.winner, nonce: result.nonce, hash: result.hash }]);
            report(result.entrants, result.winner, run.attempts);
            setRaceWinner(result.winner);
            publish();
            run.finished = true;
            if (run.tracked) void telemetry.track('mining_completed', { ...miningMetrics(run), block_height: chain.blockArray.length - 1 });
            return { success: true, winner: result.winner, block, miningTime: (Date.now() - start) / 1000,
                backedWon: run.backed === null ? null : result.winner === run.backed };
        } catch (error) {
            run.finished = true;
            if (run.tracked) void telemetry.track('mining_failed', { ...miningMetrics(run), reason: 'unexpected' });
            void telemetry.reportError(error, 'mining', true);
            return { success: false, error: error.message, code: 'unexpected' };
        } finally {
            if (controller.run === run) {
                controller.run = null;
                setIsMining(false);
            }
        }
    }, [controller, publish]);

    const doMining = useCallback(async (allowEmpty = true, setup = null) => {
        const chain = controller.chain;
        const miners = chain.getActiveMiners();
        const reject = (code, error, reason = code) => {
            void telemetry.track('mining_failed', { difficulty: chain.miningDifficulty, elapsed_ms: 0, attempt_count: 0,
                miner_count: miners.length, transaction_count: chain.memPool.length, reason });
            return { success: false, error, code };
        };
        if (controller.run || (controller.setup && controller.setup !== setup)) return reject('busy', 'Mining is already running.');
        if (setup?.aborted) return aborted();
        if (!miners.length) return reject('no_miners', 'Enable at least one miner in Participants.');
        if (!allowEmpty && !chain.memPool.length) return reject('no_transactions', 'Add a transaction first.');
        // A new block would only extend an invalid chain; repair or undo first.
        if (!chain.canExtend()) {
            return reject('chain_invalid', 'Paused while the chain is invalid. Re-mine or undo the changed block first.', 'invalid_state');
        }
        const run = createRun(chain, miners, controller.backed, true);
        controller.run = run; // Lock synchronously, before React can rerender.
        void telemetry.track('mining_started', { difficulty: run.difficulty, miner_count: run.minerCount, transaction_count: run.transactionCount });
        // One shared time keeps every miner's candidate on the same header time;
        // each round moves on to the next extraNonce in the coinbase.
        const time = chain.nextBlockTime();
        const height = chain.blockArray.length;
        const prepare = extraNonce => new Map(miners.map(miner => [miner.name, chain.prepareCandidate(miner, { time, extraNonce })]));
        const result = await race(run, chain, miners, prepare, (candidate, found) => {
            const outcome = chain.acceptBlock(candidate, found.nonce, found.hash);
            return outcome.status === 'accepted' ? outcome.block : null;
        });
        return result.success ? { ...result, epoch: chain.epochAt(height) } : result;
    }, [controller, race]);

    // Re-mine historical block `index` with the same race as a new block: only its
    // link, difficulty, nonce and hash change; its transactions stay as they are.
    const remineBlock = useCallback(async index => {
        const chain = controller.chain;
        const miners = chain.getActiveMiners();
        if (controller.run || controller.setup) return { success: false, error: 'Mining is already running.', code: 'busy' };
        if (!miners.length) return { success: false, error: 'Enable at least one miner in Participants.', code: 'no_miners' };
        const prepared = chain.prepareRemine(index);
        if (!prepared.success) return prepared;
        const run = createRun(chain, miners, controller.backed, false);
        controller.run = run; // Lock synchronously, before React can rerender.
        // Every miner works on the same header; only their nonce ranges differ. Its
        // transactions must not change, so each further round rolls the time.
        const prepare = timeRoll => {
            const { candidate } = timeRoll ? chain.prepareRemine(index, { timeRoll }) : prepared;
            return new Map(miners.map(miner => [miner.name, candidate]));
        };
        const result = await race(run, chain, miners, prepare, (candidate, found) => {
            const outcome = chain.acceptRemine(candidate, found.nonce, found.hash);
            return outcome.status === 'accepted' ? outcome.block : null;
        });
        return result.success ? { ...result, index, epoch: chain.epochAt(index) } : result;
    }, [controller, race]);

    const mineBlock = useCallback(() => doMining(true), [doMining]);
    const setupInitialDistribution = useCallback(async () => {
        if (controller.run || controller.setup) {
            void telemetry.track('demo_failed', { reason: 'busy' });
            return { success: false, error: 'Mining is already running.', winners: [] };
        }
        if (controller.chain.blockArray.length !== 1 || controller.chain.memPool.length) {
            void telemetry.track('demo_failed', { reason: 'invalid_state' });
            return { success: false, error: 'Reset to start a fresh demo.', winners: [] };
        }
        const setup = { aborted: false };
        controller.setup = setup;
        setIsSettingUp(true);
        void telemetry.track('demo_started', { difficulty: controller.chain.miningDifficulty });
        const winners = [];
        const finish = outcome => {
            const result = setup.aborted ? { ...outcome, success: false, aborted: true } : outcome;
            if (result.success) void telemetry.track('demo_completed', { difficulty: controller.chain.miningDifficulty, block_count: controller.chain.blockArray.length - 1 });
            else if (result.aborted || setup.aborted) void telemetry.track('demo_cancelled');
            else void telemetry.track('demo_failed', { reason: result.code || 'unexpected' });
            return { ...result, winners };
        };
        try {
            const first = await doMining(true, setup);
            if (!first.success || setup.aborted) return finish(first);
            winners.push(first.winner);
            const chain = controller.chain;
            const others = chain.participants.filter(p => p.name !== first.winner);
            const balance = chain.calculateBalance(chain.getParticipantByName(first.winner).publicKey);
            const amount = Math.min(0.6, Math.floor((balance / Math.max(1, others.length) - 0.00000001) * 1e8) / 1e8);
            if (amount <= 0) return finish({ success: false, error: 'Reward is too small to distribute. Reset the demo.', code: 'reward_too_small' });
            for (const recipient of others) chain.createTransaction(first.winner, recipient.name, amount, 0.00000001, 'Demo distribution');
            if (others.length) void telemetry.track('transaction_created', { source: 'demo', count: others.length, pending_count: chain.memPool.length });
            publish();
            const second = await doMining(false, setup);
            if (!second.success || setup.aborted) return finish(second);
            winners.push(second.winner);
            return finish({ success: true });
        } catch (error) {
            void telemetry.reportError(error, 'demo', true);
            return finish({ success: false, error: error.message, code: 'unexpected' });
        } finally {
            if (controller.setup === setup) {
                controller.setup = null;
                setIsSettingUp(false);
            }
        }
    }, [controller, doMining, publish]);

    // Each change is recorded with its direction for missions; `source` lets the
    // caller say why it changed (e.g. 'adjustment'), null when not given.
    const setDifficulty = useCallback((value, { source = null } = {}) => {
        if (controller.run || controller.setup) return;
        const n = Number(value);
        if (!Number.isInteger(n) || n < MIN_DIFFICULTY || n > MAX_DIFFICULTY) return;
        const previous = controller.chain.miningDifficulty;
        if (n === previous) return;
        controller.chain.miningDifficulty = n;
        setLastDifficultyChange({ from: previous, to: n, direction: n > previous ? 'up' : 'down',
            height: controller.chain.blockArray.length - 1, source });
        publish();
        void telemetry.track('difficulty_changed', { previous, value: n });
    }, [controller, publish]);
    const setHalvingInterval = useCallback(value => {
        if (controller.run || controller.setup) return;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 2 || n > 100) return;
        if (n === controller.chain.halvingEvent) return;
        controller.chain.halvingEvent = n;
        publish();
        void telemetry.track('settings_changed', { setting: 'halving_interval', value: n });
    }, [controller, publish]);
    const tamperBlock = useCallback((blockIndex, txIndex, amount) => {
        if (controller.run || controller.setup) return;
        const applied = controller.chain.tamperTransaction(blockIndex, txIndex, amount);
        publish();
        if (applied) void telemetry.track('tamper_applied', { block_height: blockIndex });
    }, [controller, publish]);
    const undoTamper = useCallback(blockIndex => {
        if (controller.run || controller.setup) return { success: false, restored: 0, error: 'Stop mining first.' };
        const result = controller.chain.undoTamper(blockIndex);
        if (result.success) publish();
        return result;
    }, [controller, publish]);
    // Adding a non-miner wallet never touches a running race.
    const createWallet = useCallback(name => {
        const result = controller.chain.addWallet(name);
        if (result.success) publish();
        return result;
    }, [controller, publish]);
    // The backing that counts for a race is the one in place when it starts.
    const backMiner = useCallback(name => {
        if (name !== null && !controller.chain.getParticipantByName(name)?.isMiner) {
            return { success: false, error: 'Only a miner can be backed.' };
        }
        controller.backed = name;
        setBackedMiner(name);
        return { success: true, error: null };
    }, [controller]);
    const resetBlockchain = useCallback(() => {
        const previous_block_count = controller.chain.blockArray.length - 1;
        cancelMining('reset');
        void telemetry.track('chain_reset', { previous_block_count });
        const { miningDifficulty, halvingEvent } = controller.chain;
        controller.chain = createBlockchain({ ...controller.config, miningDifficulty, halvingEvent });
        setSelectedBlock(null);
        setHashAttempts([]);
        setMiningProgress(null);
        setMinerProgress({});
        setRaceWinner(null);
        controller.backed = null;
        setBackedMiner(null);
        setLastDifficultyChange(null);
        publish();
    }, [cancelMining, controller, publish]);
    const generateRandomTransactions = useCallback(() => {
        if (controller.run || controller.setup) return { success: false, error: 'Stop mining first.' };
        const chain = controller.chain;
        let count = 0;
        for (let i = 0; i < 10; i++) {
            // Pick a sender who can actually fund a sample transfer. Choosing
            // only unfunded wallets must not strand an enabled empty refill.
            const funded = chain.participants.map(participant => ({ participant,
                available: Math.round(chain.calculateBalance(participant.publicKey) * 1e8) - 1 }))
                .filter(sender => sender.available >= 5_000_000);
            if (!funded.length) break;
            const { participant: sender, available } = funded[Math.floor(Math.random() * funded.length)];
            const recipients = chain.participants.filter(p => p !== sender);
            if (!recipients.length) break;
            const recipient = recipients[Math.floor(Math.random() * recipients.length)];
            const maximum = Math.min(10_000_000, available);
            const amount = (5_000_000 + Math.floor(Math.random() * (maximum - 5_000_000 + 1))) / 1e8;
            chain.createTransaction(sender.name, recipient.name, amount, 0.00000001, 'Demo transfer');
            count++;
        }
        publish();
        if (count) void telemetry.track('transaction_created', { source: 'random', count, pending_count: chain.memPool.length });
        else void telemetry.track('transaction_rejected', { source: 'random', reason: 'insufficient_funds' });
        return { success: true, count };
    }, [controller, publish]);
    const toggleMiner = useCallback(name => {
        if (controller.run || controller.setup) return;
        const miner = controller.chain.getParticipantByName(name);
        if (!miner?.isMiner) return;
        controller.chain.toggleMiner(name);
        publish();
        void telemetry.track('settings_changed', { setting: 'miner_enabled', value: miner.minerEnabled });
    }, [controller, publish]);
    const setMinerHashpower = useCallback((name, value) => {
        if (controller.run || controller.setup || !Number.isFinite(Number(value))) return;
        const miner = controller.chain.getParticipantByName(name);
        if (!miner?.isMiner) return;
        const n = Math.max(1, Math.min(10, Math.round(Number(value))));
        if (n === miner.hashpower) return;
        controller.chain.setMinerHashpower(name, n);
        publish();
        void telemetry.track('settings_changed', { setting: 'hashpower', value: n });
    }, [controller, publish]);
    const getActiveMiners = useCallback(() => controller.chain.getActiveMiners(), [controller]);
    return { ...view, isMining, isSettingUp, miningProgress, minerProgress, raceWinner, hashAttempts, selectedBlock,
        backedMiner, lastDifficultyChange,
        setSelectedBlock, createTransaction, mineBlock, mineEmptyBlock: mineBlock, setupInitialDistribution,
        generateRandomTransactions, setDifficulty, setHalvingInterval, tamperBlock, undoTamper, remineBlock,
        resetBlockchain, cancelMining, toggleMiner, setMinerHashpower, getActiveMiners, createWallet, backMiner };
}
