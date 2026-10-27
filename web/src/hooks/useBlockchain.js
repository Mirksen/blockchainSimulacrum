import { useState, useCallback, useEffect } from 'react';
import { createBlockchain } from '../lib/blockchain';
import { runSearch } from '../lib/powSearch';
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
        halvingInterval: chain.halvingEvent
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
    void telemetry.track('mining_cancelled', { ...miningMetrics(run), reason });
}


export function useBlockchain(config = {}) {
    // The controller belongs to this hook instance. Only event handlers mutate it;
    // rendering reads a fresh snapshot published after each model change.
    const [controller] = useState(() => ({ chain: createBlockchain(config), config, run: null, setup: null }));
    const [view, setView] = useState(() => snapshot(controller.chain));
    const [isMining, setIsMining] = useState(false);
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [miningProgress, setMiningProgress] = useState(null);
    const [minerProgress, setMinerProgress] = useState({});
    const [raceWinner, setRaceWinner] = useState(null);
    const [hashAttempts, setHashAttempts] = useState([]);
    const [selectedBlock, setSelectedBlock] = useState(null);
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

    const doMining = useCallback(async (allowEmpty = true, setup = null) => {
        const chain = controller.chain;
        const miners = chain.getActiveMiners();
        const reject = (code, error) => {
            void telemetry.track('mining_failed', { difficulty: chain.miningDifficulty, elapsed_ms: 0, attempt_count: 0,
                miner_count: miners.length, transaction_count: chain.memPool.length, reason: code });
            return { success: false, error, code };
        };
        if (controller.run || (controller.setup && controller.setup !== setup)) return reject('busy', 'Mining is already running.');
        if (setup?.aborted) return aborted();
        if (!miners.length) return reject('no_miners', 'Enable at least one miner in Participants.');
        if (!allowEmpty && !chain.memPool.length) return reject('no_transactions', 'Add a transaction first.');
        const run = { aborted: false, finished: false, startedAt: Date.now(), attempts: 0, stop: new AbortController(),
            difficulty: chain.miningDifficulty, minerCount: miners.length, transactionCount: chain.memPool.length };
        controller.run = run; // Lock synchronously, before React can rerender.
        void telemetry.track('mining_started', { difficulty: run.difficulty, miner_count: run.minerCount, transaction_count: run.transactionCount });
        const isCurrent = () => !run.aborted && controller.run === run && controller.chain === chain;
        setIsMining(true);
        setRaceWinner(null);
        setHashAttempts([]);
        // One shared timestamp keeps every miner's candidate on the same header time.
        const timestamp = Date.now();
        const candidates = new Map(miners.map(miner => [miner.name, chain.prepareCandidate(miner, { timestamp })]));
        // Each miner tries `hashpower` consecutive nonces per round from its own random start.
        const entrants = miners.map(miner => ({ id: miner.name, weight: miner.hashpower,
            prefix: candidates.get(miner.name).prefix, startNonce: Math.floor(Math.random() * 10000) + 1 }));
        const attempts = [];
        const start = run.startedAt;
        // All three updates happen in one synchronous callback, so React batches
        // them into a single render per progress event.
        const report = (entrantProgress, featured, total) => {
            const elapsedMs = Date.now() - start;
            setMinerProgress(Object.fromEntries(miners.map(miner => {
                const entrant = entrantProgress[miner.name];
                return [miner.name, { nonce: entrant.nonce, hash: entrant.hash, iterations: entrant.attempts,
                    zeros: entrant.zeros, elapsedMs }];
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
            const result = await runSearch({
                entrants, target: candidates.get(miners[0].name).target, signal: run.stop.signal,
                onProgress: progress => {
                    if (!isCurrent()) return;
                    run.attempts = progress.attempts;
                    remember(progress.recent);
                    report(progress.entrants, miners[0].name, progress.attempts);
                }
            });
            run.attempts = result.attempts;
            if (result.status === 'stopped') return aborted();
            if (result.status !== 'found') throw new Error('Every nonce was tried without a valid block.');
            if (!isCurrent()) return aborted();
            // A stopped, stale or rejected attempt never changes the chain or supply schedule.
            const outcome = chain.acceptBlock(candidates.get(result.winner), result.nonce, result.hash);
            if (outcome.status !== 'accepted') return aborted();
            const block = outcome.block;
            remember([{ id: result.winner, nonce: result.nonce, hash: result.hash }]);
            report(result.entrants, result.winner, result.attempts);
            setRaceWinner(result.winner);
            publish();
            run.finished = true;
            void telemetry.track('mining_completed', { ...miningMetrics(run), block_height: chain.blockArray.length - 1 });
            return { success: true, winner: result.winner, block, miningTime: (Date.now() - start) / 1000 };
        } catch (error) {
            run.finished = true;
            void telemetry.track('mining_failed', { ...miningMetrics(run), reason: 'unexpected' });
            void telemetry.reportError(error, 'mining', true);
            return { success: false, error: error.message, code: 'unexpected' };
        } finally {
            if (controller.run === run) {
                controller.run = null;
                setIsMining(false);
            }
        }
    }, [controller, publish]);

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

    const setDifficulty = useCallback(value => {
        if (controller.run || controller.setup) return;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 5) return;
        const previous = controller.chain.miningDifficulty;
        if (n === previous) return;
        controller.chain.miningDifficulty = n;
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
        publish();
    }, [cancelMining, controller, publish]);
    const generateRandomTransactions = useCallback(() => {
        if (controller.run || controller.setup) return { success: false, error: 'Stop mining first.' };
        const chain = controller.chain;
        let count = 0;
        for (let i = 0; i < 10; i++) {
            const sender = chain.participants[Math.floor(Math.random() * chain.participants.length)];
            const recipients = chain.participants.filter(p => p !== sender);
            if (!recipients.length) break;
            const recipient = recipients[Math.floor(Math.random() * recipients.length)];
            const amount = Math.round((0.05 + Math.random() * 0.05) * 1e8) / 1e8;
            if (chain.calculateBalance(sender.publicKey) < amount + 0.00000001) continue;
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
        setSelectedBlock, createTransaction, mineBlock, mineEmptyBlock: mineBlock, setupInitialDistribution,
        generateRandomTransactions, setDifficulty, setHalvingInterval, tamperBlock, resetBlockchain,
        cancelMining, toggleMiner, setMinerHashpower, getActiveMiners };
}
