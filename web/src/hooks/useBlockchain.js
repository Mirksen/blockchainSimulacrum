import { useState, useCallback, useRef } from 'react';
import { createBlockchain, Block, Transaction } from '../lib/blockchain';
import SHA256 from 'crypto-js/sha256';

export function useBlockchain(config = {}) {
    // Use a version counter to trigger re-renders while keeping the blockchain instance
    const [version, setVersion] = useState(0);
    const blockchainRef = useRef(createBlockchain(config));
    const [isMining, setIsMining] = useState(false);
    const [miningProgress, setMiningProgress] = useState(null);
    const [minerProgress, setMinerProgress] = useState({}); // Per-miner progress
    const [raceWinner, setRaceWinner] = useState(null); // Winner of last race
    const [hashAttempts, setHashAttempts] = useState([]);
    const isAbortedRef = useRef(false);

    const cancelMining = useCallback(() => {
        isAbortedRef.current = true;
    }, []);
    const [selectedBlock, setSelectedBlock] = useState(null);

    // Force re-render
    const forceUpdate = useCallback(() => setVersion(v => v + 1), []);

    // Computed values that update on version change
    const blockchain = blockchainRef.current;
    const balances = blockchain.getAllBalances();
    const chainValid = blockchain.isChainValid();
    const memPool = blockchain.memPool;
    const blocks = blockchain.blockArray;
    const participants = blockchain.participants;
    const difficulty = blockchain.miningDifficulty;

    const createTransaction = useCallback((senderName, recipientName, amount, fee, reference) => {
        try {
            const tx = blockchainRef.current.createTransaction(
                senderName,
                recipientName,
                parseFloat(amount),
                parseFloat(fee) || 0.00000001,
                reference
            );
            forceUpdate();
            return { success: true, tx };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }, [forceUpdate]);

    // Racing mining function with multiple miners
    const doMining = useCallback(async (allowEmpty = false) => {
        if (isMining) {
            return { success: false, error: 'Already mining' };
        }

        const bc = blockchainRef.current;
        if (!allowEmpty && bc.memPool.length === 0) {
            return { success: false, error: 'No transactions to mine' };
        }

        const activeMiners = bc.getActiveMiners();
        if (activeMiners.length === 0) {
            return { success: false, error: 'No active miners' };
        }

        setIsMining(true);
        setRaceWinner(null);
        setHashAttempts([]);
        isAbortedRef.current = false;

        // Initialize miner progress
        const progress = {};
        activeMiners.forEach(m => {
            progress[m.name] = {
                nonce: Math.floor(Math.random() * 10000), // Random start offset
                hash: '',
                iterations: 0,
                zeros: 0,
                elapsedMs: 0
            };
        });
        setMinerProgress({ ...progress });

        // Calculate rewards
        const currentBlockNumber = bc.blockArray.length;
        let reward = bc.blockReward;
        if (currentBlockNumber > 0 && currentBlockNumber % bc.halvingEvent === 0) {
            reward = bc.blockReward / 2;
            bc.blockReward = reward;
        }
        const transactionFees = bc.memPool.reduce((sum, tx) => sum + tx.transactionFee, 0);
        const totalReward = reward + transactionFees;

        // Prepare block data
        const previousHash = bc.blockArray[bc.blockArray.length - 1].hash;
        const timestamp = Date.now();
        const mempoolTransactions = [...bc.memPool];
        const target = Array(bc.miningDifficulty + 1).join('0');
        const attempts = [];
        const startTime = Date.now();

        // Pre-create reward transactions for each miner so they're included in hash calculation
        // Each miner needs their own reward tx to include in their hash attempts
        const minerRewardTxs = {};
        activeMiners.forEach(miner => {
            minerRewardTxs[miner.publicKey] = new Transaction(null, miner.publicKey, totalReward, 0, 'Mining Reward');
        });

        // Create mining state for each miner (with their full transaction set including reward)
        const minerStates = activeMiners.map(miner => ({
            miner,
            nonce: progress[miner.name].nonce,
            hash: '',
            iterations: 0,
            transactions: [...mempoolTransactions, minerRewardTxs[miner.publicKey]]
        }));

        // Total hashpower for weighting
        const totalHashpower = activeMiners.reduce((sum, m) => sum + m.hashpower, 0);

        let winner = null;
        let winningBlock = null;
        let globalIterations = 0;

        try {
            while (!winner) {
                if (isAbortedRef.current) {
                    setIsMining(false);
                    return { success: false, aborted: true };
                }

                // Each miner gets iterations proportional to hashpower
                for (const state of minerStates) {
                    const iterationsThisRound = Math.max(1, Math.floor((state.miner.hashpower / totalHashpower) * 10));

                    for (let i = 0; i < iterationsThisRound; i++) {
                        state.nonce++;
                        state.iterations++;
                        globalIterations++;

                        // Calculate hash for this miner's attempt
                        // Must match Block.createHash() order: previousHash + timestamp + transactions + nonce
                        // Use state.transactions which includes miner's reward tx
                        const blockData = previousHash + timestamp + JSON.stringify(state.transactions) + state.nonce;
                        state.hash = SHA256(blockData).toString();

                        // Check leading zeros
                        const zeros = state.hash.match(/^0*/)?.[0]?.length || 0;
                        progress[state.miner.name] = {
                            nonce: state.nonce,
                            hash: state.hash,
                            iterations: state.iterations,
                            zeros,
                            elapsedMs: Date.now() - startTime
                        };

                        // Record attempt
                        attempts.push({
                            nonce: state.nonce,
                            hash: state.hash,
                            miner: state.miner.name
                        });
                        if (attempts.length > 500) attempts.shift();

                        // Check if this miner won
                        if (state.hash.substring(0, bc.miningDifficulty) === target) {
                            winner = state.miner;

                            // Create block with SAME timestamp used in hash calculation
                            // (timestamp is set at start of mining, not when block is found)
                            winningBlock = new Block(timestamp, state.transactions, previousHash);
                            winningBlock.nonce = state.nonce;
                            winningBlock.hash = state.hash;
                            break;
                        }
                    }

                    if (winner) break;
                }

                // Update UI every 50 global iterations
                if (globalIterations % 50 === 0) {
                    setMinerProgress({ ...progress });
                    setMiningProgress({
                        nonce: globalIterations,
                        hash: minerStates[0].hash,
                        iterations: globalIterations,
                        elapsedMs: Date.now() - startTime
                    });
                    setHashAttempts([...attempts]);

                    // Yield to UI thread
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // Add winning block to chain
            bc.blockArray.push(winningBlock);
            bc.memPool = [];
            bc.incrementBlocksWon(winner.publicKey);

            // Final updates
            setMinerProgress({ ...progress });
            setMiningProgress({
                nonce: globalIterations,
                hash: winningBlock.hash,
                iterations: globalIterations,
                elapsedMs: Date.now() - startTime
            });
            setHashAttempts([...attempts]);
            setRaceWinner(winner.name);
            setIsMining(false);
            forceUpdate();

            console.log(`🏆 ${winner.name} won! Block mined in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

            return {
                success: true,
                winner: winner.name,
                block: winningBlock,
                miningTime: (Date.now() - startTime) / 1000
            };
        } catch (error) {
            setIsMining(false);
            console.error('Mining error:', error);
            return { success: false, error: error.message };
        }
    }, [isMining, forceUpdate]);

    // Mine block with transactions from mempool
    // Mine block with transactions (allow empty as per new requirement)
    const mineBlock = useCallback(() => doMining(true), [doMining]);

    // Mine empty block (reward only) for initial coin distribution
    const mineEmptyBlock = useCallback(() => doMining(true), [doMining]);

    const setDifficulty = useCallback((newDifficulty) => {
        blockchainRef.current.miningDifficulty = parseInt(newDifficulty);
        forceUpdate();
    }, [forceUpdate]);

    const tamperBlock = useCallback((blockIndex, txIndex, newAmount) => {
        blockchainRef.current.tamperTransaction(blockIndex, txIndex, newAmount);
        forceUpdate();
    }, [forceUpdate]);

    // Automated initial distribution: mine empty block, send 0.6 to each, mine again
    const [isSettingUp, setIsSettingUp] = useState(false);

    const setupInitialDistribution = useCallback(async () => {
        if (isMining || isSettingUp) return { success: false, error: 'Already running', winners: [] };

        setIsSettingUp(true);
        const winners = [];

        try {
            // Step 1: Mine empty block to get initial reward
            const mineResult = await doMining(true);
            if (!mineResult.success) {
                setIsSettingUp(false);
                return { success: false, error: 'Failed to mine initial block: ' + mineResult.error, winners };
            }
            winners.push(mineResult.winner);

            // Step 2: Get the winner of the first mining race
            const winnerName = mineResult.winner;
            const winner = blockchainRef.current.getParticipantByName(winnerName);

            if (!winner) {
                setIsSettingUp(false);
                return { success: false, error: 'Could not find winner participant', winners };
            }

            // Step 3: Create transactions from winner to each other participant (0.6 each)
            const otherParticipants = blockchainRef.current.participants.filter(p => p.name !== winnerName);

            for (const recipient of otherParticipants) {
                try {
                    blockchainRef.current.createTransaction(
                        winner.name,
                        recipient.name,
                        0.6,
                        0.00000001,
                        'Initial Distribution'
                    );
                } catch (err) {
                    console.error(`Failed to create tx to ${recipient.name}:`, err);
                }
            }
            forceUpdate();

            // Step 4: Mine the block with transactions
            const mineResult2 = await doMining(false);
            if (!mineResult2.success) {
                setIsSettingUp(false);
                return { success: false, error: 'Failed to mine distribution block: ' + mineResult2.error, winners };
            }
            winners.push(mineResult2.winner);

            setIsSettingUp(false);
            return { success: true, winners };
        } catch (error) {
            setIsSettingUp(false);
            return { success: false, error: error.message, winners };
        }
    }, [isMining, isSettingUp, doMining, forceUpdate]);

    const resetBlockchain = useCallback(() => {
        blockchainRef.current = createBlockchain(config);
        setSelectedBlock(null);
        setHashAttempts([]);
        setMiningProgress(null);
        forceUpdate();
    }, [config, forceUpdate]);

    // Meaningful transaction references for random transactions
    const txReferences = [
        // Food & Dining
        'Groceries yesterday', 'Sushi dinner', 'Pizza night', 'Coffee shop', 'Lunch break',
        'Birthday cake', 'Thai takeout', 'Brunch together', 'Late night snack', 'Wine tasting',
        'Cooking ingredients', 'Street food', 'Ice cream treat', 'BBQ weekend', 'Farmers market',
        // Entertainment
        'Movie tickets', 'Concert entry', 'Streaming service', 'Video game', 'Book purchase',
        'Museum visit', 'Theme park', 'Bowling night', 'Escape room', 'Comedy show',
        'Music album', 'Podcast gear', 'Board game', 'Art supplies', 'Festival ticket',
        // Transportation
        'Taxi ride', 'Gas refill', 'Parking fee', 'Train ticket', 'Bus fare',
        'Airport shuttle', 'Bike repair', 'Car wash', 'Toll payment', 'Uber ride',
        // Shopping
        'New shoes', 'Winter jacket', 'Tech gadget', 'Kitchen tools', 'Home decor',
        'Gym equipment', 'Plant purchase', 'Pet supplies', 'Birthday gift', 'Anniversary present',
        'Back to school', 'Office chair', 'Bedroom lamp', 'Sports gear', 'Beach towel',
        // Services
        'Haircut today', 'Dog grooming', 'House cleaning', 'Dry cleaning', 'Phone repair',
        'Lawn mowing', 'Tutoring session', 'Yoga class', 'Gym membership', 'Online course',
        // Bills & Utilities
        'Rent share', 'Utility split', 'Phone bill', 'Internet share', 'Insurance',
        'Subscription fee', 'Cloud storage', 'Domain renewal', 'App purchase', 'Premium upgrade',
        // Social
        'Shared dinner', 'Group gift', 'Road trip share', 'Concert split', 'Party supplies',
        'Wedding gift', 'Baby shower', 'Housewarming', 'Thank you gift', 'Get well flowers',
        // Miscellaneous
        'Bet settlement', 'Loan repay', 'Deposit refund', 'Salary advance', 'Freelance work',
        'Consulting fee', 'Design project', 'Photo gig', 'Music lesson', 'Art commission'
    ];

    // Generate random transactions (no auto-mine)
    const generateRandomTransactions = useCallback(() => {
        if (isMining) return { success: false, error: 'Mining in progress' };

        const allParticipants = blockchainRef.current.participants;
        if (allParticipants.length < 2) return { success: false, error: 'Not enough participants' };

        let successCount = 0;

        // Random number of transactions between 10 and 20
        const txCount = 10 + Math.floor(Math.random() * 11);

        for (let i = 0; i < txCount; i++) {
            // Pick random sender
            const senderIdx = Math.floor(Math.random() * allParticipants.length);
            const sender = allParticipants[senderIdx];

            // Pick random recipient (different from sender)
            let recipientIdx;
            do {
                recipientIdx = Math.floor(Math.random() * allParticipants.length);
            } while (recipientIdx === senderIdx);
            const recipient = allParticipants[recipientIdx];

            // Random amount between 0.05 and 0.1
            const amount = 0.05 + Math.random() * 0.05;

            try {
                // Pick a random meaningful reference
                const ref = txReferences[Math.floor(Math.random() * txReferences.length)];
                blockchainRef.current.createTransaction(
                    sender.name,
                    recipient.name,
                    amount,
                    0.00000001,
                    ref
                );
                successCount++;
            } catch (err) {
                // Ignore errors (e.g. insufficient funds) and continue
                console.log('Skipped random tx:', err.message);
            }
        }

        forceUpdate();

        return { success: true, count: successCount };
    }, [isMining, forceUpdate]);

    // Miner control functions
    const toggleMiner = useCallback((name) => {
        blockchainRef.current.toggleMiner(name);
        forceUpdate();
    }, [forceUpdate]);

    const setMinerHashpower = useCallback((name, hashpower) => {
        blockchainRef.current.setMinerHashpower(name, hashpower);
        forceUpdate();
    }, [forceUpdate]);

    // Get active miners
    const getActiveMiners = useCallback(() => {
        return blockchainRef.current.getActiveMiners();
    }, []);

    return {
        blockchain,
        balances,
        isMining,
        isSettingUp,
        miningProgress,
        minerProgress,
        raceWinner,
        hashAttempts,
        selectedBlock,
        chainValid,
        memPool,
        blocks,
        participants,
        difficulty,
        blockReward: blockchainRef.current?.blockReward || 3.125,
        setSelectedBlock,
        createTransaction,
        mineBlock,
        mineEmptyBlock,
        setupInitialDistribution,
        generateRandomTransactions,
        setDifficulty,
        tamperBlock,
        resetBlockchain,
        cancelMining,
        toggleMiner,
        setMinerHashpower,
        getActiveMiners
    };
}
