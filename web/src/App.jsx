import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useBlockchain } from './hooks/useBlockchain';
import { useMinerIdentity } from './hooks/useMinerIdentity';
import { playMiningSuccessSound, playRecordSound, unlockMiningAudio } from './lib/sound';
import { ownRow, recordOf } from './lib/records';
import { telemetry } from './lib/telemetry';
import * as missions from './lib/missions';
import { TopBar } from './components/workbench/TopBar';
import { LeaderboardTicker } from './components/workbench/LeaderboardTicker';
import { RecordCelebration } from './components/workbench/RecordCelebration';
import { SettingsDialog } from './components/workbench/SettingsDialog';
import { LowerDifficultyDialog } from './components/workbench/LowerDifficultyDialog';
import { Workbench } from './components/workbench/Workbench';
import { MissionRail } from './components/workbench/MissionRail';
import { MissionIntro } from './components/workbench/MissionIntro';
import { HashLab } from './components/HashLab';
import { ChainLab } from './components/ChainLab';
import { PoolPanel } from './components/PoolPanel';
import { minerProfileHash, POOL_HASH } from './lib/poolApi';
import { BlockDetailsModal } from './components/BlockDetailsModal';
import { ParticipantDetailsModal } from './components/ParticipantDetailsModal';
import { MinerDrawer } from './components/workbench/MinerDetails';
import { colorOf } from './components/workbench/minerColors';
import { TransactionDetailsModal } from './components/TransactionDetailsModal';
import { HintLayer } from './components/HintLayer';
import './index.css';
import { MIN_DIFFICULTY, MAX_DIFFICULTY } from './lib/difficulty';
import { DEFAULT_FEE_RATE } from './lib/blockchain';

const INITIAL_CONFIG = {
  name: 'powfyicoin', miningDifficulty: 4, blockReward: 3.125, halvingEvent: 4,
  participants: ['Alice', 'Bob', 'Chris', 'Hal', 'Dorian', 'Laszlo'], miners: ['Hal', 'Dorian', 'Laszlo']
};
const VIEWS = { '': 'workbench', 'hash-lab': 'hash-lab', 'chain-lab': 'chain-lab', pool: 'pool' };
const RAIL_KEY = 'proofofwork-rail-collapsed';
const INTRO_KEY = 'proofofwork-missions-intro-seen';
const VIEW_LABELS = { workbench: 'Workbench', 'hash-lab': 'Hash lab', 'chain-lab': 'Chain lab', pool: 'Leaderboard' };

const pathOfHash = () => (globalThis.location?.hash ?? '').replace(/^#\/?/, '');
// `#/pool/<name>` is the Leaderboard tab showing that miner's profile.
function profileFromHash() {
  const match = /^pool\/(.+)$/.exec(pathOfHash());
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}
const viewFromHash = () => (profileFromHash() !== null ? 'pool' : VIEWS[pathOfHash()] ?? 'workbench');
function readFlag(key, fallback = false) {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    return stored === '1' ? true : stored === '0' ? false : fallback;
  } catch { return fallback; }
}
function writeFlag(key, value) { try { globalThis.localStorage?.setItem(key, value ? '1' : '0'); } catch { /* storage may be blocked */ } }
const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
// Below 768 px the top bar folds its tabs into the menu.
const PHONE = '(max-width: 767.98px)';
const subscribePhone = notify => {
  const query = globalThis.matchMedia?.(PHONE);
  query?.addEventListener('change', notify);
  return () => query?.removeEventListener('change', notify);
};
const isPhone = () => Boolean(globalThis.matchMedia?.(PHONE).matches);

// Lab missions run the existing lessons of the hash and chain labs.
const HASH_LESSONS = { 'change-fingerprint': 'hash', 'earn-proof-of-work': 'work' };

function coachOf(progress) {
  const active = missions.activeStep(progress);
  if (!active) return null;
  const number = progress.step + 1;
  return { view: active.view, target: active.target, label: `Step ${number} · ${active.step.id.replace(/-/g, ' ')}` };
}

function App() {
  const [theme, setTheme] = useState('dark');
  const [muted, setMuted] = useState(false);
  const soundEnabled = useRef(true);
  const [view, setView] = useState(viewFromHash);
  const [profile, setProfile] = useState(profileFromHash);
  const [winner, setWinner] = useState(null);
  const [autoMining, setAutoMining] = useState(false);
  // Play starts a run; Auto-mine only decides whether the run continues after a block.
  const [running, setRunning] = useState(false);
  const autoMiningRef = useRef(false);
  const [autoTransact, setAutoTransact] = useState(false);
  const [coinName, setCoinName] = useState('powfyicoin');
  const [targetBlockTime, setTargetBlockTime] = useState(10);
  const [showSettings, setShowSettings] = useState(false);
  // A manual lowering waits here until the learner confirms the new chain.
  const [lowerTo, setLowerTo] = useState(null);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);
  // The block a repair is about: shown while the chain is invalid, never held.
  const [repairIndex, setRepairIndex] = useState(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [lastRound, setLastRound] = useState(null);
  const [remining, setRemining] = useState(null);
  const [details, setDetails] = useState(null);
  const [pendingTx, setPendingTx] = useState(null);
  const [blockTx, setBlockTx] = useState(null);
  const [walletDetails, setWalletDetails] = useState(null);
  // The miner whose drawer is open beside the workbench (web/DESIGN.md, "Miner details").
  const [minerDetails, setMinerDetails] = useState(null);
  const [workComparison, setWorkComparison] = useState(null);
  // The rail starts collapsed (free play); a first-visit card invites to the missions once.
  const [railCollapsed, setRailCollapsed] = useState(() => readFlag(RAIL_KEY, true));
  const [introSeen, setIntroSeen] = useState(() => readFlag(INTRO_KEY));
  const [progress, setProgress] = useState(() => missions.load(browserStorage()));
  const [chainExperiment, setChainExperiment] = useState(() => missions.activeMission(progress)?.id === 'follow-stronger-chain' ? 'fork' : 'repair');
  const compact = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const sim = useBlockchain(INITIAL_CONFIG, { storage: browserStorage() });
  // A restored chain already had its adjustments; the next one is due at the next tenth block.
  const lastAdjustedBlock = useRef(sim.restored ? sim.blocks.length - 1 : 0);
  const [boardKey, setBoardKey] = useState(0);
  const [boardRows, setBoardRows] = useState(null);
  const [record, setRecord] = useState(null);
  // A record is what the board gained between the rows before and after an accepted block of
  // this browser; the ticker's own refreshes and other miners' blocks celebrate nothing.
  const awaitingBoard = useRef(false);
  const lastRows = useRef(null);
  const signingName = useRef(null);
  const onBlockAccepted = useCallback(() => { awaitingBoard.current = true; setBoardKey(key => key + 1); }, []);
  const onBoard = useCallback(rows => {
    if (rows && awaitingBoard.current && lastRows.current) {
      awaitingBoard.current = false;
      const found = recordOf(ownRow(lastRows.current, signingName.current), ownRow(rows, signingName.current));
      if (found) {
        setRecord({ ...found, name: signingName.current, id: Date.now() });
        playRecordSound(soundEnabled.current);
      }
    }
    if (rows) lastRows.current = rows;
    setBoardRows(rows);
  }, []);
  const identity = useMinerIdentity({ onAccepted: onBlockAccepted });
  useEffect(() => { signingName.current = identity.signingName; }, [identity.signingName]);
  const { blocks, participants, balances, memPool, chainValid, isMining, isSettingUp, difficulty, halvingInterval,
    minerProgress, miningProgress, createTransaction, mineBlock, setupInitialDistribution, generateRandomTransactions,
    setDifficulty, setHalvingInterval, tamperBlock, undoTamper, remineBlock, resetBlockchain, cancelMining,
    createWallet, createMiner, renameMiner, backMiner, toggleMiner, setMinerShare, setSlowMotion, slowMotion, minerLuck, raceWinner, describeTx, setSigner } = sim;
  const busy = isMining || isSettingUp;
  const coach = railCollapsed ? null : coachOf(progress);
  const activeMission = missions.activeMission(progress);
  const showIntro = !introSeen && railCollapsed && progress.step === 0 && progress.completed.length === 0;

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => setSigner(identity.signer), [identity.signer, setSigner]);
  // Remember the first display, even when the visitor simply ignores the invitation.
  // Keep it visible for this visit until dismissed, opened or navigated away from.
  useEffect(() => { if (showIntro) writeFlag(INTRO_KEY, true); }, [showIntro]);
  useEffect(() => {
    const onHash = () => { setView(viewFromHash()); setProfile(profileFromHash()); };
    globalThis.addEventListener('hashchange', onHash);
    globalThis.addEventListener('popstate', onHash);
    return () => {
      globalThis.removeEventListener('hashchange', onHash);
      globalThis.removeEventListener('popstate', onHash);
    };
  }, []);
  useEffect(() => { missions.save(browserStorage(), progress); }, [progress]);
  useEffect(() => {
    if (!winner) return;
    const timer = setTimeout(() => setWinner(null), 2400);
    return () => clearTimeout(timer);
  }, [winner]);

  const report = useCallback(event => setProgress(current => missions.reduce(current, event)), []);
  const navigate = useCallback(next => {
    writeFlag(INTRO_KEY, true);
    setIntroSeen(true);
    const hash = next === 'workbench' ? '#/' : `#/${next}`;
    if (globalThis.location.hash !== hash) globalThis.history.pushState(null, '', hash);
    setView(next);
    setProfile(null);
  }, []);
  const openProfile = useCallback(name => {
    const hash = minerProfileHash(name);
    if (globalThis.location.hash !== hash) globalThis.history.pushState(null, '', hash);
    setView('pool');
    setProfile(name);
  }, []);
  const closeProfile = useCallback(() => {
    if (globalThis.location.hash !== POOL_HASH) globalThis.history.pushState(null, '', POOL_HASH);
    setProfile(null);
  }, []);

  const finishRound = useCallback(result => {
    if (result.success) {
      setWinner(result.winner || result.winners?.at(-1));
      setError('');
      playMiningSuccessSound(soundEnabled.current);
      return true;
    }
    if (!result.aborted) {
      setError(result.error || 'Mining could not finish. Reset the demo and try again.');
    }
    setRunning(false);
    return false;
  }, []);

  // The hook keeps each miner's final progress after a race; keep it as the last round.
  const rememberRound = useCallback((index, result) => {
    setLastRound({ index, winner: result.winner, nonce: result.block?.nonce,
      attempts: miningProgress?.iterations, elapsedMs: result.miningTime ? result.miningTime * 1000 : undefined,
      difficulty, perMiner: { ...minerProgress } });
  }, [difficulty, miningProgress, minerProgress]);
  const pendingRound = useRef(null);
  useEffect(() => {
    if (!pendingRound.current || isMining) return;
    const { index, result } = pendingRound.current;
    pendingRound.current = null;
    rememberRound(index, result);
  }, [isMining, rememberRound]);

  // Difficulty adapts every 10 mined blocks towards the target block time.
  const adjustDifficulty = useCallback(() => {
    const chainBlocks = sim.blockchain.blockArray;
    const height = chainBlocks.length - 1;
    if (height < 10 || height % 10 !== 0 || lastAdjustedBlock.current === height) return;
    lastAdjustedBlock.current = height;
    const current = sim.blockchain.miningDifficulty;
    // Measured from block #1 at the earliest: the genesis time is a fixed launch moment.
    const from = Math.max(1, height - 10);
    const seconds = (chainBlocks[height].time - chainBlocks[from].time) / (height - from);
    let next = current;
    if (seconds < targetBlockTime * 0.7 && current < MAX_DIFFICULTY) next = current + 1;
    else if (seconds > targetBlockTime * 1.5 && current > MIN_DIFFICULTY) next = current - 1;
    if (next === current) return;
    setDifficulty(next, { source: 'auto' });
    report({ type: 'difficulty_changed', direction: next > current ? 'up' : 'down' });
  }, [report, setDifficulty, sim.blockchain, targetBlockTime]);

  // A run ends after its block unless Auto-mine is on when the block is found.
  const endRoundUnlessRepeating = useCallback(() => { if (!autoMiningRef.current) setRunning(false); }, []);
  const handleMine = useCallback(async () => {
    const index = blocks.length;
    const result = await mineBlock();
    endRoundUnlessRepeating();
    if (finishRound(result)) {
      pendingRound.current = { index, result };
      report({ type: 'block_mined', backedWon: result.backedWon, epoch: result.epoch });
      adjustDifficulty();
    }
    return result;
  }, [adjustDifficulty, blocks.length, endRoundUnlessRepeating, finishRound, mineBlock, report]);
  const handleSetup = useCallback(async () => {
    const result = await setupInitialDistribution();
    endRoundUnlessRepeating();
    if (finishRound(result)) pendingRound.current = { index: 1, result };
    return result;
  }, [endRoundUnlessRepeating, finishRound, setupInitialDistribution]);
  const startMining = () => { setRunning(true); return handleMine(); };
  const startDemo = () => { setRunning(true); return handleSetup(); };
  // The toggle neither starts nor stops a search: off lets the current block finish,
  // on lets a running block continue into the next one.
  const changeAutoMine = next => {
    autoMiningRef.current = next;
    setAutoMining(next);
    if (!next && !busy) setRunning(false);
  };
  const handleRemine = useCallback(async index => {
    setRemining(index);
    const result = await remineBlock(index);
    setRemining(null);
    if (finishRound(result)) {
      pendingRound.current = { index, result };
      setRepairIndex(index);
      report({ type: 'block_remined', blockIndex: index, chainValid: sim.blockchain.isChainValid() });
    }
  }, [finishRound, remineBlock, report, sim.blockchain]);

  const repeating = running && autoMining && chainValid;
  useEffect(() => {
    if (!repeating || busy) return;
    const timer = setTimeout(handleMine, 1500);
    return () => clearTimeout(timer);
  }, [repeating, busy, blocks.length, handleMine]);

  // Refill only an empty mempool. An active candidate and existing transfers
  // stay untouched, and idle filling cannot grow an unbounded pending queue.
  useEffect(() => {
    if (!autoTransact || busy || !chainValid || memPool?.length) return;
    const timer = setTimeout(generateRandomTransactions, 750);
    return () => clearTimeout(timer);
  }, [autoTransact, busy, chainValid, blocks.length, memPool?.length, generateRandomTransactions]);

  // Nothing clicked follows the newest block; a click holds a block until it is clicked again.
  const toggleSelected = index => {
    setRepairIndex(null);
    setSelectedIndex(current => (current === index ? null : index));
  };
  const followNewest = () => {
    setRepairIndex(null);
    setSelectedIndex(null);
  };

  const reset = ({ difficulty: startAt } = {}) => {
    setAutoTransact(false);
    changeAutoMine(false);
    setRunning(false);
    resetBlockchain({ miningDifficulty: startAt });
    lastAdjustedBlock.current = 0;
    setWinner(null);
    setError('');
    setLastRound(null);
    followNewest();
    report({ type: 'reset' });
  };
  // Pause ends the run; the Auto-mine setting stays for the next Play.
  const pause = () => { setRunning(false); cancelMining(); setRemining(null); };
  const changeTheme = next => { setTheme(next); void telemetry.track('settings_changed', { setting: 'theme', value: next }); };
  const prepareSound = () => { if (soundEnabled.current) void unlockMiningAudio(); };
  const changeMuted = next => {
    soundEnabled.current = !next; // Also applies to a search already in flight.
    setMuted(next);
    if (!next) void unlockMiningAudio(); // Resume while the Sound click is trusted.
    void telemetry.track('settings_changed', { setting: 'sound', value: !next });
  };
  const changeTarget = value => {
    if (value === targetBlockTime) return;
    setTargetBlockTime(value);
    void telemetry.track('settings_changed', { setting: 'target_block_time', value });
  };
  const showMe = active => {
    if (!active) return;
    if (active.view === 'chain-lab') setChainExperiment(active.target.startsWith('chain-lab.fork-') ? 'fork' : 'repair');
    navigate(active.view);
    requestAnimationFrame(() => {
      const element = document.querySelector(`[data-coach-target="${active.target}"]`);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element?.querySelector('button, input, select, textarea, a[href]')?.focus({ preventScroll: true });
    });
  };
  const dismissIntro = () => { writeFlag(INTRO_KEY, true); setIntroSeen(true); };
  const toggleRail = () => {
    dismissIntro();
    writeFlag(RAIL_KEY, !railCollapsed);
    setRailCollapsed(!railCollapsed);
  };
  const startMissions = () => {
    dismissIntro();
    writeFlag(RAIL_KEY, false);
    setRailCollapsed(false);
  };

  const onCreateTransaction = (from, to, amount, reference, feeRate = DEFAULT_FEE_RATE) => {
    const result = createTransaction(from, to, Number(amount), undefined, reference, { feeRate });
    if (result.success) report({ type: 'transaction_created' });
    return result;
  };
  const onTamper = (blockIndex, txIndex, amount) => {
    tamperBlock(blockIndex, txIndex, Number(amount));
    setRunning(false);
    setRepairIndex(blockIndex);
    setHealthOpen(true);
    report({ type: 'block_tampered', blockIndex });
  };
  const onUndo = blockIndex => {
    const result = undoTamper(blockIndex);
    if (result?.success !== false) report({ type: 'edit_undone' });
  };
  const onBack = name => {
    backMiner(name);
    if (name) report({ type: 'miner_backed', name });
  };
  // A rename is for this session only; the last round follows the miner to its new name.
  const onRenameMiner = (name, next) => {
    const result = renameMiner(name, next);
    const renamed = result.participant?.name;
    if (result.success && renamed !== name) {
      setMinerDetails(current => (current === name ? renamed : current));
      setLastRound(round => round && { ...round, winner: round.winner === name ? renamed : round.winner,
        perMiner: Object.fromEntries(Object.entries(round.perMiner ?? {}).map(([key, value]) => [key === name ? renamed : key, value])) });
    }
    return result;
  };
  // Raising keeps the chain. Lowering a chain with mined blocks starts a new chain after
  // a confirmation, so its length keeps meaning work (ADR 0004); the automatic
  // adjustment calls setDifficulty directly and may lower without one.
  const onDifficulty = value => {
    if (value < difficulty && blocks.length > 1) { setLowerTo(value); return; }
    setDifficulty(value, { source: 'manual' });
    report({ type: 'difficulty_changed', direction: value > difficulty ? 'up' : 'down', manual: true });
  };
  const confirmLower = () => {
    const value = lowerTo;
    setLowerTo(null);
    reset({ difficulty: value });
  };

  // A repair shows its block only while the chain is invalid; a click on a tile outranks it.
  const shownIndex = !chainValid && repairIndex !== null ? repairIndex : selectedIndex;
  const wallet = walletDetails && participants.find(p => p.name === walletDetails);
  const racingMiners = participants.filter(p => p.isMiner && p.minerEnabled)
    .map(p => ({ name: p.name, hashpower: p.hashpower, colorKey: p.colorKey, color: colorOf(p.colorKey) ?? undefined }));
  const shareOfMiner = miner => Math.round(miner.hashpower / racingMiners.reduce((sum, m) => sum + m.hashpower, 0) * 100);
  const found = minerDetails && participants.find(p => p.name === minerDetails && p.isMiner);
  const drawerMiner = found ? { ...found, color: colorOf(found.colorKey) ?? undefined } : null;
  // A collapsed rail means free play: the labs open without the mission lesson.
  const hashLesson = !railCollapsed && activeMission ? HASH_LESSONS[activeMission.id] : undefined;
  const chainLesson = !railCollapsed && ['change-the-past', 'follow-stronger-chain'].includes(activeMission?.id);

  return (
    <div className={`app-shell${view === 'workbench' ? ' is-workbench' : ''}${view === 'workbench' && drawerMiner ? ' has-miner-drawer' : ''}${railCollapsed ? ' is-rail-collapsed' : ' is-rail-expanded'}`}
      onClickCapture={prepareSound} onKeyDownCapture={prepareSound}>
      <a className="skip-link" href="#workbench">Skip to workbench</a>
      <HintLayer />
      <TopBar view={view} onNavigate={navigate} coinName={coinName} theme={theme} onTheme={changeTheme}
        muted={muted} onMuted={changeMuted} onReset={reset} onOpenSettings={() => setShowSettings(true)} compact={compact} saveState={sim.saveState} />
      <LeaderboardTicker onOpenPool={() => navigate('pool')} onBoard={onBoard} refreshKey={boardKey} ownName={identity.signingName} />
      <div className="wb-shell">
        <div className="wb-rail">
          <MissionRail progress={progress} collapsed={railCollapsed} onToggle={toggleRail} onShowMe={showMe} highlight={showIntro} />
        </div>
        <main id="workbench" className="wb-main" aria-label={VIEW_LABELS[view]}>
          <div className="wb-mbar"><MissionRail progress={progress} variant="bar" collapsed={railCollapsed}
            onToggle={toggleRail} onShowMe={showMe} highlight={showIntro} /></div>
          {showIntro && <MissionIntro onStart={startMissions} onDismiss={dismissIntro} />}
          {view === 'workbench' && <Workbench sim={sim} coinName={coinName} targetSeconds={targetBlockTime}
            autoMine={autoMining} onAutoMine={changeAutoMine} repeating={repeating} autoTransact={autoTransact} onAutoTransact={setAutoTransact}
            selectedIndex={shownIndex} held={shownIndex !== null && shownIndex === selectedIndex} onSelect={toggleSelected} healthOpen={healthOpen} onToggleHealth={() => setHealthOpen(open => !open)}
            lastRound={lastRound} remining={remining} coach={coach}
            identity={identity} boardRows={boardRows}
            onStartDemo={startDemo} onMine={startMining} onPause={pause} onRemine={handleRemine} onTamper={onTamper} onUndo={onUndo}
            onDifficulty={onDifficulty} onBack={onBack} onCreateTransaction={onCreateTransaction} onCreateWallet={createWallet} onCreateMiner={createMiner}
            onRenameMiner={onRenameMiner} onShare={setMinerShare} onOpenMiner={setMinerDetails}
            onOpenWallet={setWalletDetails} onOpenDetails={setDetails} onOpenTransaction={setPendingTx} onOpenBlockTx={(transaction, blockIndex) => setBlockTx({ transaction, blockIndex })} onOpenChainLab={() => navigate('chain-lab')} error={error} />}
          {view === 'hash-lab' && <div className="wb-view">
            <HashLab key={hashLesson ?? 'free'} lesson={hashLesson} onLessonEvent={hashLesson ? report : undefined}
              coach={hashLesson ? coach : null} onClose={() => navigate('workbench')}
              workComparison={workComparison} onWorkComparison={setWorkComparison} />
          </div>}
          {view === 'chain-lab' && <div className="wb-view">
            <ChainLab key={railCollapsed ? 'free' : 'guided'} experiment={chainExperiment} onExperimentChange={setChainExperiment} onLessonEvent={chainLesson ? report : undefined}
              coach={chainLesson ? coach : null} onClose={() => navigate('workbench')} />
          </div>}
          {view === 'pool' && <div className="wb-view"><PoolPanel name={identity.name} onNameChange={identity.setName} refreshKey={boardKey}
            onAccepted={onBlockAccepted} onClose={() => navigate('workbench')}
            profile={profile} onOpenProfile={openProfile} onCloseProfile={closeProfile} /></div>}
        </main>
      </div>
      {winner && <div className="wb-announce" role="status">{winner} mined a block</div>}
      <RecordCelebration key={record?.id} record={record} name={record?.name} onClose={() => setRecord(null)}
        onOpenLeaderboard={() => openProfile(record.name)} />
      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} coinName={coinName} onCoinName={setCoinName}
        difficulty={difficulty} onDifficulty={onDifficulty} halvingInterval={halvingInterval} onHalvingInterval={setHalvingInterval}
        targetBlockTime={targetBlockTime} onTargetBlockTime={changeTarget} busy={busy} />
      {lowerTo !== null && <LowerDifficultyDialog from={difficulty} to={lowerTo} blockCount={blocks.length - 1}
        onConfirm={confirmLower} onCancel={() => setLowerTo(null)} />}
      {details !== null && blocks[details] && <BlockDetailsModal block={blocks[details]} blockIndex={details} blocks={blocks}
        onClose={() => setDetails(null)} participants={participants} describeTx={describeTx} coinName={coinName} />}
      {pendingTx && memPool.includes(pendingTx) && <TransactionDetailsModal transaction={describeTx(pendingTx)} blockIndex={null}
        onClose={() => setPendingTx(null)} coinName={coinName} />}
      {blockTx && <TransactionDetailsModal transaction={blockTx.transaction} blockIndex={blockTx.blockIndex}
        onClose={() => setBlockTx(null)} coinName={coinName} />}
      {wallet && <ParticipantDetailsModal participant={wallet}
        balance={balances.find(b => b.name === wallet.name)} blocks={blocks} describeTx={describeTx} onClose={() => setWalletDetails(null)}
        toggleMiner={toggleMiner} isMining={busy} coinName={coinName}
        share={wallet.isMiner && wallet.minerEnabled ? shareOfMiner(wallet) : null}
        onOpenMiner={name => { setWalletDetails(null); setMinerDetails(name); }} />}
      {view === 'workbench' && drawerMiner && <MinerDrawer key={drawerMiner.publicKey} miner={drawerMiner} miners={racingMiners}
        progress={minerProgress[drawerMiner.name]} difficulty={difficulty} isMining={busy} winner={raceWinner} luck={minerLuck}
        slowMotion={slowMotion} onSlowMotion={setSlowMotion} onShare={setMinerShare} onClose={() => setMinerDetails(null)}
        onOpenForkLab={() => { setMinerDetails(null); setChainExperiment('fork'); navigate('chain-lab'); }} />}
    </div>
  );
}
export default App;
