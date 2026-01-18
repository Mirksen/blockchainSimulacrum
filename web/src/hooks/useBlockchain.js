import { useState, useCallback, useRef } from 'react';
import { createBlockchain } from '../lib/blockchain';

export function useBlockchain(config = {}) {
    // Use a version counter to trigger re-renders while keeping the blockchain instance
    const [version, setVersion] = useState(0);
    const blockchainRef = useRef(createBlockchain(config));
    const [isMining, setIsMining] = useState(false);
    const [miningProgress, setMiningProgress] = useState(null);
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

    const mineBlock = useCallback(async () => {
        if (isMining || blockchainRef.current.memPool.length === 0) {
            return { success: false, error: 'No transactions to mine or already mining' };
        }

        setIsMining(true);
        setMiningProgress({ nonce: 0, hash: '', iterations: 0, elapsedMs: 0 });

        try {
            const result = await blockchainRef.current.mineNextBlock((progress) => {
                setMiningProgress({ ...progress });
            });

            forceUpdate();
            setMiningProgress(null);
            setIsMining(false);

            return { success: true, ...result };
        } catch (error) {
            setIsMining(false);
            setMiningProgress(null);
            return { success: false, error: error.message };
        }
    }, [isMining, forceUpdate]);

    const setDifficulty = useCallback((newDifficulty) => {
        blockchainRef.current.miningDifficulty = parseInt(newDifficulty);
        forceUpdate();
    }, [forceUpdate]);

    const tamperBlock = useCallback((blockIndex, txIndex, newAmount) => {
        blockchainRef.current.tamperTransaction(blockIndex, txIndex, newAmount);
        forceUpdate();
    }, [forceUpdate]);

    const resetBlockchain = useCallback(() => {
        blockchainRef.current = createBlockchain(config);
        setSelectedBlock(null);
        forceUpdate();
    }, [config, forceUpdate]);

    return {
        blockchain,
        balances,
        isMining,
        miningProgress,
        selectedBlock,
        chainValid,
        memPool,
        blocks,
        participants,
        difficulty,
        setSelectedBlock,
        createTransaction,
        mineBlock,
        setDifficulty,
        tamperBlock,
        resetBlockchain,
    };
}
