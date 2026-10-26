import { useState, useCallback, useEffect } from 'react';
import { createBlockchain, Block, Transaction } from '../lib/blockchain';
import SHA256 from 'crypto-js/sha256';

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
        if (controller.run) controller.run.aborted = true;
        if (controller.setup) controller.setup.aborted = true;
        controller.run = null;
        controller.setup = null;
    }, [controller]);

    const cancelMining = useCallback(() => {
        if (controller.run) controller.run.aborted = true;
        if (controller.setup) controller.setup.aborted = true;
        controller.run = null;
        controller.setup = null;
        setIsMining(false);
        setIsSettingUp(false);
    }, [controller]);

    const createTransaction = useCallback((sender, recipient, amount, fee = 0.00000001, reference) => {
        if (controller.run || controller.setup) return { success: false, error: 'Wait for mining to finish or stop it first.' };
        try {
            const tx = controller.chain.createTransaction(sender, recipient, Number(amount), Number(fee), reference);
            publish();
            return { success: true, tx };
        } catch (error) { return { success: false, error: error.message }; }
    }, [controller, publish]);

    const doMining = useCallback(async (allowEmpty = true, setup = null) => {
        if (controller.run || (controller.setup && controller.setup !== setup)) return { success: false, error: 'Mining is already running.' };
        if (setup?.aborted) return aborted();
        const chain = controller.chain;
        const miners = chain.getActiveMiners();
        if (!miners.length) return { success: false, error: 'Enable at least one miner in Participants.' };
        if (!allowEmpty && !chain.memPool.length) return { success: false, error: 'Add a transaction first.' };
        const run = { aborted: false };
        controller.run = run; // Lock synchronously, before React can rerender.
        const isCurrent = () => !run.aborted && controller.run === run && controller.chain === chain;
        setIsMining(true);
        setRaceWinner(null);
        setHashAttempts([]);
        const reward = chain.blockArray.length % chain.halvingEvent === 0 ? chain.blockReward / 2 : chain.blockReward;
        const transactions = [...chain.memPool];
        const fees = transactions.reduce((sum, tx) => sum + tx.transactionFee, 0);
        const previousHash = chain.blockArray.at(-1).hash;
        const timestamp = Date.now();
        const difficulty = chain.miningDifficulty;
        const target = '0'.repeat(difficulty);
        const states = miners.map(miner => ({
            miner, nonce: Math.floor(Math.random() * 10000), hash: '', iterations: 0,
            transactions: [...transactions, new Transaction(null, miner.publicKey, reward + fees, 0, 'Mining Reward')]
        }));
        const attempts = [];
        let iterations = 0;
        const start = Date.now();
        const progress = () => Object.fromEntries(states.map(s => [s.miner.name, {
            nonce: s.nonce, hash: s.hash, iterations: s.iterations,
            zeros: s.hash.match(/^0*/)?.[0].length || 0, elapsedMs: Date.now() - start
        }]));
        const report = (state) => {
            setMinerProgress(progress());
            setMiningProgress({ nonce: state.nonce, hash: state.hash, iterations, elapsedMs: Date.now() - start });
            setHashAttempts([...attempts]);
        };
        try {
            // Always yield, including easy blocks, so Stop and concurrent starts
            // have the same lifecycle as expensive mining.
            await new Promise(resolve => setTimeout(resolve, 0));
            let sinceYield = 0;
            while (isCurrent()) {
                for (const state of states) {
                    for (let i = 0; i < state.miner.hashpower; i++) {
                        state.nonce++;
                        state.iterations++;
                        iterations++;
                        sinceYield++;
                        state.hash = SHA256(previousHash + timestamp + JSON.stringify(state.transactions) + state.nonce).toString();
                        attempts.push({ nonce: state.nonce, hash: state.hash, miner: state.miner.name });
                        if (attempts.length > 100) attempts.shift();
                        if (state.hash.startsWith(target)) {
                            if (!isCurrent()) return aborted();
                            const block = new Block(timestamp, state.transactions, previousHash);
                            block.nonce = state.nonce;
                            block.hash = state.hash;
                            block.halved = reward !== chain.blockReward;
                            chain.blockArray.push(block);
                            chain.memPool = [];
                            // A stopped attempt never changes the supply schedule.
                            chain.blockReward = reward;
                            chain.incrementBlocksWon(state.miner.publicKey);
                            report(state);
                            setRaceWinner(state.miner.name);
                            publish();
                            return { success: true, winner: state.miner.name, block, miningTime: (Date.now() - start) / 1000 };
                        }
                    }
                }
                // A threshold, rather than modulo equality, works for every mix
                // of miner weights and guarantees the browser gets control.
                if (sinceYield >= 100) {
                    report(states[0]);
                    sinceYield = 0;
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            return aborted();
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            if (controller.run === run) {
                controller.run = null;
                setIsMining(false);
            }
        }
    }, [controller, publish]);

    const mineBlock = useCallback(() => doMining(true), [doMining]);
    const setupInitialDistribution = useCallback(async () => {
        if (controller.run || controller.setup) return { success: false, error: 'Mining is already running.', winners: [] };
        if (controller.chain.blockArray.length !== 1 || controller.chain.memPool.length) return { success: false, error: 'Reset to start a fresh demo.', winners: [] };
        const setup = { aborted: false };
        controller.setup = setup;
        setIsSettingUp(true);
        const winners = [];
        try {
            const first = await doMining(true, setup);
            if (!first.success || setup.aborted) return { ...first, winners };
            winners.push(first.winner);
            const chain = controller.chain;
            const others = chain.participants.filter(p => p.name !== first.winner);
            const balance = chain.calculateBalance(chain.getParticipantByName(first.winner).publicKey);
            const amount = Math.min(0.6, Math.floor((balance / Math.max(1, others.length) - 0.00000001) * 1e8) / 1e8);
            if (amount <= 0) return { success: false, error: 'Reward is too small to distribute. Reset the demo.', winners };
            for (const recipient of others) chain.createTransaction(first.winner, recipient.name, amount, 0.00000001, 'Demo distribution');
            publish();
            const second = await doMining(false, setup);
            if (!second.success || setup.aborted) return { ...second, winners };
            winners.push(second.winner);
            return { success: true, winners };
        } catch (error) { return { success: false, error: error.message, winners }; }
        finally {
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
        controller.chain.miningDifficulty = n;
        publish();
    }, [controller, publish]);
    const setHalvingInterval = useCallback(value => {
        if (controller.run || controller.setup) return;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 2 || n > 100) return;
        controller.chain.halvingEvent = n;
        publish();
    }, [controller, publish]);
    const tamperBlock = useCallback((blockIndex, txIndex, amount) => {
        if (controller.run || controller.setup) return;
        controller.chain.tamperTransaction(blockIndex, txIndex, amount);
        publish();
    }, [controller, publish]);
    const resetBlockchain = useCallback(() => {
        cancelMining();
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
        return { success: true, count };
    }, [controller, publish]);
    const toggleMiner = useCallback(name => {
        if (controller.run || controller.setup) return;
        controller.chain.toggleMiner(name);
        publish();
    }, [controller, publish]);
    const setMinerHashpower = useCallback((name, value) => {
        if (controller.run || controller.setup || !Number.isFinite(Number(value))) return;
        controller.chain.setMinerHashpower(name, Math.round(Number(value)));
        publish();
    }, [controller, publish]);
    const getActiveMiners = useCallback(() => controller.chain.getActiveMiners(), [controller]);
    return { ...view, isMining, isSettingUp, miningProgress, minerProgress, raceWinner, hashAttempts, selectedBlock,
        setSelectedBlock, createTransaction, mineBlock, mineEmptyBlock: mineBlock, setupInitialDistribution,
        generateRandomTransactions, setDifficulty, setHalvingInterval, tamperBlock, resetBlockchain,
        cancelMining, toggleMiner, setMinerHashpower, getActiveMiners };
}
