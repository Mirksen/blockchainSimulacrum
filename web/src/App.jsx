import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useBlockchain } from './hooks/useBlockchain';
import { playMiningSuccessSound } from './lib/sound';
import { telemetry } from './lib/telemetry';
import * as missions from './lib/missions';
import { TopBar } from './components/workbench/TopBar';
import { LeaderboardTicker } from './components/workbench/LeaderboardTicker';
import { SettingsDialog } from './components/workbench/SettingsDialog';
import { Workbench } from './components/workbench/Workbench';
import { MissionRail } from './components/workbench/MissionRail';
import { MissionIntro } from './components/workbench/MissionIntro';
import { HashLab } from './components/HashLab';
import { ChainLab } from './components/ChainLab';
import { PoolPanel } from './components/PoolPanel';
import { BlockDetailsModal } from './components/BlockDetailsModal';
import { ParticipantDetailsModal } from './components/ParticipantDetailsModal';
import './index.css';

const INITIAL_CONFIG = {
  name: 'powCoin', miningDifficulty: 2, blockReward: 3.125, halvingEvent: 4,
  participants: ['Alice', 'Bob', 'Chris', 'Lars', 'Minas'], miners: ['Minas', 'Lars'], startingBalance: 0
};
const VIEWS = { '': 'workbench', 'hash-lab': 'hash-lab', 'chain-lab': 'chain-lab', pool: 'pool' };
const RAIL_KEY = 'proofofwork-rail-collapsed';
const INTRO_KEY = 'proofofwork-missions-intro-seen';
const VIEW_LABELS = { workbench: 'Workbench', 'hash-lab': 'Hash lab', 'chain-lab': 'Chain lab', pool: 'Mining pool' };

const viewFromHash = () => VIEWS[(globalThis.location?.hash ?? '').replace(/^#\/?/, '')] ?? 'workbench';
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
  const [muted, setMuted] = useState(true);
  const [view, setView] = useState(viewFromHash);
  const [winner, setWinner] = useState(null);
  const [autoMining, setAutoMining] = useState(false);
  const [coinName, setCoinName] = useState('powCoin');
  const [targetBlockTime, setTargetBlockTime] = useState(10);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [lastRound, setLastRound] = useState(null);
  const [remining, setRemining] = useState(null);
  const [details, setDetails] = useState(null);
  const [walletDetails, setWalletDetails] = useState(null);
  const [railCollapsed, setRailCollapsed] = useState(() => readFlag(RAIL_KEY, true));
  const [introSeen, setIntroSeen] = useState(() => readFlag(INTRO_KEY));
  const [progress, setProgress] = useState(() => missions.load(browserStorage()));
  const compact = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const lastAdjustedBlock = useRef(0);
  const sim = useBlockchain(INITIAL_CONFIG);
  const { blocks, participants, balances, memPool, chainValid, isMining, isSettingUp, difficulty, halvingInterval,
    minerProgress, miningProgress, createTransaction, mineBlock, setupInitialDistribution, generateRandomTransactions,
    setDifficulty, setHalvingInterval, tamperBlock, undoTamper, remineBlock, resetBlockchain, cancelMining,
    createWallet, backMiner, toggleMiner, setMinerHashpower } = sim;
  const busy = isMining || isSettingUp;
  const fresh = blocks.length === 1 && memPool.length === 0;
  const coach = railCollapsed ? null : coachOf(progress);
  const activeMission = missions.activeMission(progress);
  const showIntro = !introSeen && railCollapsed && progress.step === 0 && progress.completed.length === 0;

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  // Remember the first display, even when the visitor simply ignores the invitation.
  // Keep it visible for this visit until dismissed, opened or navigated away from.
  useEffect(() => { if (showIntro) writeFlag(INTRO_KEY, true); }, [showIntro]);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    globalThis.addEventListener('hashchange', onHash);
    return () => globalThis.removeEventListener('hashchange', onHash);
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
  }, []);

  const finishRound = useCallback(result => {
    if (result.success) {
      setWinner(result.winner || result.winners?.at(-1));
      setError('');
      playMiningSuccessSound(!muted);
      return true;
    }
    if (!result.aborted) {
      setError(result.error || 'Mining could not finish. Reset the demo and try again.');
      setAutoMining(false);
    }
    return false;
  }, [muted]);

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
    const seconds = (chainBlocks[height].timestamp - chainBlocks[height - 10].timestamp) / 10000;
    let next = current;
    if (seconds < targetBlockTime * 0.7 && current < 5) next = current + 1;
    else if (seconds > targetBlockTime * 1.5 && current > 1) next = current - 1;
    if (next === current) return;
    setDifficulty(next, { source: 'auto' });
    report({ type: 'difficulty_changed', direction: next > current ? 'up' : 'down' });
  }, [report, setDifficulty, sim.blockchain, targetBlockTime]);

  const handleMine = useCallback(async () => {
    const index = blocks.length;
    const result = await mineBlock();
    if (finishRound(result)) {
      pendingRound.current = { index, result };
      setSelectedIndex(null);
      report({ type: 'block_mined', backedWon: result.backedWon, epoch: result.epoch });
      adjustDifficulty();
    }
    return result;
  }, [adjustDifficulty, blocks.length, finishRound, mineBlock, report]);
  const handleSetup = useCallback(async () => {
    const result = await setupInitialDistribution();
    finishRound(result);
    return result;
  }, [finishRound, setupInitialDistribution]);
  const handleRemine = useCallback(async index => {
    setRemining(index);
    const result = await remineBlock(index);
    setRemining(null);
    if (finishRound(result)) {
      pendingRound.current = { index, result };
      setSelectedIndex(index);
      report({ type: 'block_remined', blockIndex: index, chainValid: sim.blockchain.isChainValid() });
    }
  }, [finishRound, remineBlock, report, sim.blockchain]);

  useEffect(() => {
    if (!autoMining || busy) return;
    const timer = setTimeout(async () => {
      if (fresh) await handleSetup();
      else { generateRandomTransactions(); await handleMine(); }
    }, 1500);
    return () => clearTimeout(timer);
  }, [autoMining, busy, fresh, blocks.length, generateRandomTransactions, handleMine, handleSetup]);

  const reset = () => {
    setAutoMining(false);
    resetBlockchain();
    lastAdjustedBlock.current = 0;
    setWinner(null);
    setError('');
    setLastRound(null);
    setSelectedIndex(null);
    report({ type: 'reset' });
  };
  const pause = () => { setAutoMining(false); cancelMining(); setRemining(null); };
  const changeTheme = next => { setTheme(next); void telemetry.track('settings_changed', { setting: 'theme', value: next }); };
  const changeMuted = next => { setMuted(next); void telemetry.track('settings_changed', { setting: 'sound', value: !next }); };
  const changeTarget = value => {
    if (value === targetBlockTime) return;
    setTargetBlockTime(value);
    void telemetry.track('settings_changed', { setting: 'target_block_time', value });
  };
  const showMe = active => {
    if (!active) return;
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

  const onCreateTransaction = (from, to, amount, reference) => {
    const result = createTransaction(from, to, Number(amount), undefined, reference);
    if (result.success) report({ type: 'transaction_created' });
    return result;
  };
  const onTamper = (blockIndex, txIndex, amount) => {
    tamperBlock(blockIndex, txIndex, Number(amount));
    setSelectedIndex(blockIndex);
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
  const onDifficulty = value => {
    setDifficulty(value, { source: 'manual' });
    report({ type: 'difficulty_changed', direction: value > difficulty ? 'up' : 'down', manual: true });
  };

  const wallet = walletDetails && participants.find(p => p.name === walletDetails);
  // A collapsed rail means free play: the labs open without the mission lesson.
  const hashLesson = !railCollapsed && activeMission ? HASH_LESSONS[activeMission.id] : undefined;
  const chainLesson = !railCollapsed && activeMission?.id === 'change-the-past';

  return (
    <div className={`app-shell${view === 'workbench' ? ' is-workbench' : ''}${railCollapsed ? ' is-rail-collapsed' : ' is-rail-expanded'}`}>
      <a className="skip-link" href="#workbench">Skip to workbench</a>
      <TopBar view={view} onNavigate={navigate} coinName={coinName} chainValid={chainValid} theme={theme} onTheme={changeTheme}
        muted={muted} onMuted={changeMuted} onReset={reset} onOpenSettings={() => setShowSettings(true)} compact={compact} />
      <LeaderboardTicker onOpenPool={() => navigate('pool')} />
      <div className="wb-shell">
        <div className="wb-rail">
          <MissionRail progress={progress} collapsed={railCollapsed} onToggle={toggleRail} onShowMe={showMe} highlight={showIntro} />
        </div>
        <main id="workbench" className="wb-main" aria-label={VIEW_LABELS[view]}>
          <div className="wb-mbar"><MissionRail progress={progress} variant="bar" collapsed={railCollapsed}
            onToggle={toggleRail} onShowMe={showMe} highlight={showIntro} /></div>
          {showIntro && <MissionIntro onStart={startMissions} onDismiss={dismissIntro} />}
          {view === 'workbench' && <Workbench sim={sim} coinName={coinName} targetSeconds={targetBlockTime}
            autoMine={autoMining} onAutoMine={value => value ? setAutoMining(true) : pause()}
            selectedIndex={selectedIndex} onSelect={setSelectedIndex} healthOpen={healthOpen} onToggleHealth={() => setHealthOpen(open => !open)}
            lastRound={lastRound} remining={remining} coach={coach}
            onStartDemo={handleSetup} onMine={handleMine} onPause={pause} onRemine={handleRemine} onTamper={onTamper} onUndo={onUndo}
            onDifficulty={onDifficulty} onBack={onBack} onCreateTransaction={onCreateTransaction} onCreateWallet={createWallet}
            onOpenWallet={setWalletDetails} onOpenDetails={setDetails} onOpenChainLab={() => navigate('chain-lab')} error={error} />}
          {view === 'hash-lab' && <div className="wb-view">
            <HashLab key={hashLesson ?? 'free'} lesson={hashLesson} onLessonEvent={hashLesson ? report : undefined}
              coach={hashLesson ? coach : null} onClose={() => navigate('workbench')} />
          </div>}
          {view === 'chain-lab' && <div className="wb-view">
            <ChainLab key={chainLesson ? 'lesson' : 'free'} onLessonEvent={chainLesson ? report : undefined}
              coach={chainLesson ? coach : null} onClose={() => navigate('workbench')} />
          </div>}
          {view === 'pool' && <div className="wb-view"><PoolPanel onClose={() => navigate('workbench')} /></div>}
        </main>
      </div>
      {winner && <div className="wb-announce" role="status">{winner} mined a block</div>}
      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} coinName={coinName} onCoinName={setCoinName}
        difficulty={difficulty} onDifficulty={onDifficulty} halvingInterval={halvingInterval} onHalvingInterval={setHalvingInterval}
        targetBlockTime={targetBlockTime} onTargetBlockTime={changeTarget} busy={busy} />
      {details !== null && blocks[details] && <BlockDetailsModal block={blocks[details]} blockIndex={details} blocks={blocks}
        onClose={() => setDetails(null)} participants={participants} coinName={coinName} />}
      {wallet && <ParticipantDetailsModal participant={wallet}
        balance={balances.find(b => b.name === wallet.name)} blocks={blocks} onClose={() => setWalletDetails(null)}
        toggleMiner={toggleMiner} setMinerHashpower={setMinerHashpower} isMining={busy} coinName={coinName} />}
    </div>
  );
}
export default App;
