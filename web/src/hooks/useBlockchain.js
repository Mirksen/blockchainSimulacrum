import { useState, useCallback, useRef } from 'react';
import { createBlockchain } from '../lib/blockchain';

export function useBlockchain(config = {}) {
    // Use a version counter to trigger re-renders while keeping the blockchain instance
    const [version, setVersion] = useState(0);
    const blockchainRef = useRef(createBlockchain(config));
    const [isMining, setIsMining] = useState(false);
    const [miningProgress, setMiningProgress] = useState(null);
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

    // Generic mining function with allowEmpty option
    const doMining = useCallback(async (allowEmpty = false) => {
        if (isMining) {
            return { success: false, error: 'Already mining' };
        }

        if (!allowEmpty && blockchainRef.current.memPool.length === 0) {
            return { success: false, error: 'No transactions to mine' };
        }

        setIsMining(true);
        setMiningProgress({ nonce: 0, hash: '', iterations: 0, elapsedMs: 0 });
        setHashAttempts([]);

        // Collect hash attempts (limit to last 500 for scrollable log)
        const attempts = [];
        const onAttempt = ({ nonce, hash }) => {
            attempts.push({ nonce, hash });
            // Keep only last 500 attempts
            if (attempts.length > 500) {
                attempts.shift();
            }
            // Update state every 20 attempts for smoother UI
            if (attempts.length % 20 === 0) {
                setHashAttempts([...attempts]);
            }
        };

        isAbortedRef.current = false;

        try {
            const result = await blockchainRef.current.mineNextBlock(
                (progress) => {
                    setMiningProgress({ ...progress });
                },
                onAttempt,
                allowEmpty,
                () => isAbortedRef.current
            );

            // Final update with all attempts
            setHashAttempts([...attempts]);
            forceUpdate();
            // Do not clear miningProgress to persist result
            // setMiningProgress(null);
            setIsMining(false);

            if (result.aborted) return { success: false, aborted: true };

            return { success: true, ...result };
        } catch (error) {
            setIsMining(false);
            // setMiningProgress(null);
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
        if (isMining || isSettingUp) return { success: false, error: 'Already running' };

        setIsSettingUp(true);

        try {
            // Step 1: Mine empty block to get initial reward
            const mineResult = await doMining(true);
            if (!mineResult.success) {
                setIsSettingUp(false);
                return { success: false, error: 'Failed to mine initial block: ' + mineResult.error };
            }

            // Step 2: Create transactions from Minas to each other participant (0.6 each)
            const miner = blockchainRef.current.getActiveMiner();
            const otherParticipants = blockchainRef.current.participants.filter(p => !p.activeMiner);

            for (const recipient of otherParticipants) {
                try {
                    blockchainRef.current.createTransaction(
                        miner.name,
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

            // Step 3: Mine the block with transactions
            const mineResult2 = await doMining(false);
            if (!mineResult2.success) {
                setIsSettingUp(false);
                return { success: false, error: 'Failed to mine distribution block: ' + mineResult2.error };
            }

            setIsSettingUp(false);
            return { success: true };
        } catch (error) {
            setIsSettingUp(false);
            return { success: false, error: error.message };
        }
    }, [isMining, isSettingUp, doMining, forceUpdate]);

    const resetBlockchain = useCallback(() => {
        blockchainRef.current = createBlockchain(config);
        setSelectedBlock(null);
        setHashAttempts([]);
        setMiningProgress(null);
        forceUpdate();
    }, [config, forceUpdate]);

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
                // We use a small random reference number to make them distinct
                const ref = `Random-TX-${Math.floor(Math.random() * 10000)}`;
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

    return {
        blockchain,
        balances,
        isMining,
        isSettingUp,
        miningProgress,
        hashAttempts,
        selectedBlock,
        chainValid,
        memPool,
        blocks,
        participants,
        difficulty,
        setSelectedBlock,
        createTransaction,
        mineBlock,
        mineEmptyBlock,
        setupInitialDistribution,
        generateRandomTransactions,
        setDifficulty,
        tamperBlock,
        resetBlockchain,
        cancelMining
    };
}
