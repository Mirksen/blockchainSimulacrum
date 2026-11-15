import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useWorkbenchSession } from './hooks/useWorkbenchSession';
import { useMinerIdentity } from './hooks/useMinerIdentity';
import { playMiningSuccessSound, playRecordSound, unlockMiningAudio } from './lib/sound';
import { ownRow, recordOf } from './lib/records';
import { telemetry } from './lib/telemetry';
import * as missions from './lib/missions';
import { evidenceOf } from './lib/missionEvidence';
import { TopBar } from './components/workbench/TopBar';
import { LeaderboardTicker } from './components/workbench/LeaderboardTicker';
import { UsageConsent } from './components/UsageConsent';
import { RecordCelebration } from './components/workbench/RecordCelebration';
import { SettingsDialog } from './components/workbench/SettingsDialog';
import { LowerDifficultyDialog } from './components/workbench/LowerDifficultyDialog';
import { Workbench } from './components/workbench/Workbench';
import { MissionRail } from './components/workbench/MissionRail';
import { MissionIntro } from './components/workbench/MissionIntro';
import { minerProfileHash, POOL_HASH } from './lib/poolApi';
import { BlockDetailsModal } from './components/BlockDetailsModal';
import { ParticipantDetailsModal } from './components/ParticipantDetailsModal';
import { MinerDrawer } from './components/workbench/MinerDetails';
import { colorOf } from './components/workbench/minerColors';
import { TransactionDetailsModal } from './components/TransactionDetailsModal';
import { HintLayer } from './components/HintLayer';
import './index.css';

// Free play starts on the workbench; other experiments load when opened.
const HashLab = lazy(() => import('./components/HashLab').then(module => ({ default: module.HashLab })));
const ChainLab = lazy(() => import('./components/ChainLab').then(module => ({ default: module.ChainLab })));
const PoolPanel = lazy(() => import('./components/PoolPanel').then(module => ({ default: module.PoolPanel })));

const INITIAL_CONFIG = {
  name: 'powfyicoin', miningDifficulty: 4, blockReward: 3.125, halvingEvent: 21,
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
  return { mission: active.mission.id, view: active.view, target: active.target, label: `Step ${number} · ${active.step.id.replace(/-/g, ' ')}` };
}

function App() {
  const [theme, setTheme] = useState('dark');
  const [muted, setMuted] = useState(false);
  const soundEnabled = useRef(true);
  const [view, setView] = useState(viewFromHash);
  const [profile, setProfile] = useState(profileFromHash);
  const [winner, setWinner] = useState(null);
  const [coinName, setCoinName] = useState('powfyicoin');
  const [showSettings, setShowSettings] = useState(false);
  // A manual lowering waits here until the learner confirms the new chain.
  const [lowerTo, setLowerTo] = useState(null);
  const [details, setDetails] = useState(null);
  const [pendingTx, setPendingTx] = useState(null);
  const [blockTx, setBlockTx] = useState(null);
  const [walletDetails, setWalletDetails] = useState(null);
  // The miner (by public key, so a rename keeps it) whose drawer is open beside the
  // workbench (web/DESIGN.md, "Miner details").
  const [minerKey, setMinerKey] = useState(null);
  const [workComparison, setWorkComparison] = useState(null);
  // The rail starts collapsed (free play); a first-visit card invites to the missions once.
  const [railCollapsed, setRailCollapsed] = useState(() => readFlag(RAIL_KEY, true));
  const [introSeen, setIntroSeen] = useState(() => readFlag(INTRO_KEY));
  const [progress, setProgress] = useState(() => missions.load(browserStorage()));
  const [chainExperiment, setChainExperiment] = useState(() => missions.experimentOf(missions.activeMission(progress)?.id));
  const compact = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const { session, snapshot } = useWorkbenchSession(INITIAL_CONFIG, { storage: browserStorage() });
  const { actions } = session;
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
  const { blocks, participants, balances, memPool, difficulty, halvingInterval, targetSeconds, run, progress: raceProgress,
    settings, luck, raceWinner, describeTx, saveState } = snapshot;
  const busy = run.kind !== 'idle';
  const coach = railCollapsed ? null : coachOf(progress);
  const activeMission = missions.activeMission(progress);
  const showIntro = !introSeen && railCollapsed && progress.step === 0 && progress.completed.length === 0;

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { actions.setSigner(identity.signer); }, [identity.signer, actions]);
  // Remember the first display, even when the visitor simply ignores the invitation.
  // Keep it visible for this visit until dismissed, opened or navigated away from.
  useEffect(() => { if (showIntro) writeFlag(INTRO_KEY, true); }, [showIntro]);
  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash());
      setProfile(profileFromHash());
    };
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
  // What the session did: the winner notice with its sound, the lowering dialog and the
  // mission reports, all from its events.
  useEffect(() => session.subscribe((events, after) => {
    for (const event of events) {
      if (event.type === 'block-accepted' || event.type === 'block-remined') {
        setWinner({ name: event.winner, id: event.block.hash });
        playMiningSuccessSound(soundEnabled.current);
      }
      if (event.type === 'reset') setWinner(null);
      // A manual lowering waits for the learner to confirm the new chain (ADR 0004).
      if (event.type === 'difficulty-needs-reset') setLowerTo(event.to);
      for (const evidence of evidenceOf(event, after)) report(evidence);
    }
  }), [session, report]);
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

  const changeTheme = next => { setTheme(next); void telemetry.track('settings_changed', { setting: 'theme', value: next }); };
  const prepareSound = () => { if (soundEnabled.current) void unlockMiningAudio(); };
  const changeMuted = next => {
    soundEnabled.current = !next; // Also applies to a search already in flight.
    setMuted(next);
    if (!next) void unlockMiningAudio(); // Resume while the Sound click is trusted.
    void telemetry.track('settings_changed', { setting: 'sound', value: !next });
  };
  const showMe = active => {
    if (!active) return;
    if (active.view === 'chain-lab') setChainExperiment(missions.experimentOf(active.mission.id));
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

  const confirmLower = () => {
    const value = lowerTo;
    setLowerTo(null);
    actions.reset({ difficulty: value });
  };

  const wallet = walletDetails && participants.find(p => p.name === walletDetails);
  const openMiner = name => setMinerKey(participants.find(p => p.name === name && p.isMiner)?.publicKey ?? null);
  // What the workbench opens: a block's details, a transaction, a wallet or a miner's drawer.
  const open = target => {
    if (target.kind === 'block') setDetails(target.index);
    else if (target.kind === 'transaction') {
      if (target.blockIndex === null) setPendingTx(target.tx);
      else setBlockTx({ transaction: target.view, blockIndex: target.blockIndex });
    } else if (target.kind === 'wallet') setWalletDetails(target.name);
    else if (target.kind === 'miner') openMiner(target.name);
  };
  const racingMiners = participants.filter(p => p.isMiner && p.minerEnabled)
    .map(p => ({ name: p.name, hashpower: p.hashpower, colorKey: p.colorKey, color: colorOf(p.colorKey) ?? undefined }));
  const shareOfMiner = miner => Math.round(miner.hashpower / racingMiners.reduce((sum, m) => sum + m.hashpower, 0) * 100);
  const found = minerKey && participants.find(p => p.publicKey === minerKey && p.isMiner);
  const drawerMiner = found ? { ...found, color: colorOf(found.colorKey) ?? undefined } : null;
  // A collapsed rail means free play: the labs open without the mission lesson.
  const hashLesson = !railCollapsed && activeMission ? HASH_LESSONS[activeMission.id] : undefined;
  const chainLesson = !railCollapsed && ['change-the-past', 'follow-stronger-chain', 'prove-a-payment'].includes(activeMission?.id);
  // Slow motion is a look at one miner in its drawer: leaving the workbench, closing the drawer
  // or opening another miner ends it.
  const lookingAt = view === 'workbench' ? drawerMiner?.publicKey ?? null : null;
  useEffect(() => () => { actions.setSlowMotion(false); }, [actions, lookingAt]);

  return (
    <div className={`app-shell${view === 'workbench' ? ' is-workbench' : ''}${view === 'workbench' && drawerMiner ? ' has-miner-drawer' : ''}${railCollapsed ? ' is-rail-collapsed' : ' is-rail-expanded'}`}
      onClickCapture={prepareSound} onKeyDownCapture={prepareSound}>
      <a className="skip-link" href="#workbench" onClick={event => { event.preventDefault(); document.getElementById('workbench')?.focus(); }}>Skip to content</a>
      <HintLayer />
      <TopBar view={view} onNavigate={navigate} coinName={coinName} theme={theme} onTheme={changeTheme}
        muted={muted} onMuted={changeMuted} onReset={() => actions.reset()} onOpenSettings={() => setShowSettings(true)} compact={compact} saveState={saveState} />
      <UsageConsent />
      <LeaderboardTicker onOpenPool={() => navigate('pool')} onBoard={onBoard} refreshKey={boardKey} ownName={identity.signingName} />
      <div className="wb-shell">
        <div className="wb-rail">
          <MissionRail progress={progress} collapsed={railCollapsed} onToggle={toggleRail} onShowMe={showMe} highlight={showIntro} />
        </div>
        <main id="workbench" tabIndex={-1} className="wb-main" aria-label={VIEW_LABELS[view]}>
          <div className="wb-mbar"><MissionRail progress={progress} variant="bar" collapsed={railCollapsed}
            onToggle={toggleRail} onShowMe={showMe} highlight={showIntro} /></div>
          {showIntro && <MissionIntro onStart={startMissions} onDismiss={dismissIntro} />}
          {view === 'workbench' && <Workbench session={session} coinName={coinName} identity={identity} boardRows={boardRows} coach={coach}
            onOpen={open} onNavigate={navigate} />}
          <Suspense fallback={<p role="status">Loading {VIEW_LABELS[view]}…</p>}>
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
          </Suspense>
        </main>
      </div>
      {winner && <div key={winner.id} className="wb-announce" role="status"><span className="wb-found-cube" aria-hidden="true" /><span>{winner.name} mined a block</span></div>}
      <RecordCelebration key={record?.id} record={record} name={record?.name} onClose={() => setRecord(null)}
        onOpenLeaderboard={() => openProfile(record.name)} />
      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} coinName={coinName} onCoinName={setCoinName}
        difficulty={difficulty} onDifficulty={actions.setDifficulty} halvingInterval={halvingInterval} onHalvingInterval={actions.setHalvingInterval}
        targetBlockTime={targetSeconds} onTargetBlockTime={actions.setTargetBlockTime} busy={busy} />
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
        toggleMiner={actions.toggleMiner} isMining={busy} coinName={coinName}
        share={wallet.isMiner && wallet.minerEnabled ? shareOfMiner(wallet) : null}
        onOpenMiner={name => { setWalletDetails(null); openMiner(name); }} />}
      {view === 'workbench' && drawerMiner && <MinerDrawer key={drawerMiner.publicKey} miner={drawerMiner} miners={racingMiners}
        progress={raceProgress.perMiner[drawerMiner.name]} difficulty={difficulty} isMining={busy} winner={raceWinner} luck={luck}
        slowMotion={settings.slowMotion} onSlowMotion={actions.setSlowMotion} onShare={actions.setMinerShare} onClose={() => openMiner(null)}
        onOpenForkLab={() => { openMiner(null); setChainExperiment('fork'); navigate('chain-lab'); }} />}
    </div>
  );
}
export default App;
