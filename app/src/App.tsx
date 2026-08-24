import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import './App.css';
import Office from './content/Office';
import { CHECKPOINTS, DATA_SHARDS } from './game/course';
import Player from './game/Player';
import { useGameStore, type RunPhase } from './game/useGameStore';
import useYeller from './game/useYeller';

const formatTime = (elapsed: number) => {
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  const tenths = Math.floor((elapsed % 1) * 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${tenths}`;
};

const formatScore = (score: number) => Math.round(score).toString().padStart(6, '0');

type AudioControls = ReturnType<typeof useYeller>;

function AudioToggle({ isSupported, muted, toggleMute }: AudioControls) {
  if (!isSupported) {
    return (
      <span className="audio-unavailable" title="Voice comms unavailable">
        COMMS N/A
      </span>
    );
  }

  return (
    <button
      aria-label={muted ? 'Enable mission voice comms' : 'Disable mission voice comms'}
      aria-pressed={!muted}
      className={`audio-toggle ${muted ? 'is-muted' : 'is-live'}`}
      onClick={toggleMute}
      type="button"
    >
      <span aria-hidden="true" className="audio-toggle__icon">
        {muted ? '×' : '•'}
      </span>
      <span>COMMS {muted ? 'OFF' : 'ON'}</span>
    </button>
  );
}

function MissionProgress({ checkpointIndex, phase }: { checkpointIndex: number; phase: RunPhase }) {
  const targetIndex = Math.min(checkpointIndex + 1, CHECKPOINTS.length - 1);
  const target = CHECKPOINTS[targetIndex];
  const progress = (checkpointIndex / (CHECKPOINTS.length - 1)) * 100;

  return (
    <section className="objective-panel hud-panel" aria-label="Mission objective">
      <div className="hud-panel__eyebrow">
        <span>ACTIVE OBJECTIVE</span>
        <span className="objective-panel__step">
          {String(Math.min(checkpointIndex + 1, CHECKPOINTS.length - 1)).padStart(2, '0')}
          {' / '}
          {String(CHECKPOINTS.length - 1).padStart(2, '0')}
        </span>
      </div>
      <p className="objective-panel__kicker">
        {phase === 'complete' ? 'ROUTE COMPLETE' : target.kicker}
      </p>
      <h2>{phase === 'complete' ? 'EXFIL SECURED' : target.label}</h2>
      <div className="route-progress" aria-hidden="true">
        <span className="route-progress__fill" style={{ width: `${progress}%` }} />
        {CHECKPOINTS.map((checkpoint, index) => (
          <span
            className={`route-progress__node ${index <= checkpointIndex ? 'is-cleared' : ''}`}
            key={checkpoint.id}
          />
        ))}
      </div>
    </section>
  );
}

function TelemetryPanel() {
  const speed = useGameStore((state) => Math.round(state.speed * 10) / 10);
  const action = useGameStore((state) => state.action);
  const dashPercent = useGameStore((state) => Math.round(state.dashCharge * 100));
  const combo = useGameStore((state) => state.combo);

  return (
    <section className="telemetry-panel hud-panel" aria-label="Movement telemetry">
      <div className="telemetry-panel__speed">
        <span className="telemetry-panel__number">{speed.toFixed(1)}</span>
        <span className="telemetry-panel__unit">M/S</span>
      </div>
      <div className="telemetry-panel__readout">
        <span>MOVE STATE</span>
        <strong className={`action action--${action.toLowerCase()}`}>{action}</strong>
      </div>
      <div className="dash-meter">
        <div className="dash-meter__label">
          <span>DASH CAPACITOR</span>
          <span>{dashPercent}%</span>
        </div>
        <div className="dash-meter__track" aria-hidden="true">
          <span style={{ width: `${dashPercent}%` }} />
        </div>
      </div>
      <div className={`combo-readout ${combo > 1 ? 'is-active' : ''}`}>
        CHAIN <strong>×{combo}</strong>
      </div>
    </section>
  );
}

function ControlLegend() {
  return (
    <div className="control-legend" aria-label="Controls">
      <span className="control-chip"><kbd>WASD</kbd> MOVE</span>
      <span className="control-chip"><kbd>SHIFT</kbd> SPRINT</span>
      <span className="control-chip"><kbd>SPACE</kbd> JUMP / VAULT</span>
      <span className="control-chip"><kbd>CTRL</kbd> SLIDE</span>
      <span className="control-chip"><kbd>E</kbd> DASH</span>
    </div>
  );
}

function GameHud({ audio }: { audio: AudioControls }) {
  const phase = useGameStore((state) => state.phase);
  const score = useGameStore((state) => state.score);
  const elapsed = useGameStore((state) => Math.floor(state.elapsed * 10) / 10);
  const checkpointIndex = useGameStore((state) => state.checkpointIndex);
  const shardCount = useGameStore((state) => Object.keys(state.collectedShards).length);
  const message = useGameStore((state) => state.message);
  const messageNonce = useGameStore((state) => state.messageNonce);

  return (
    <div className={`hud hud--${phase}`}>
      <header className="hud-topbar">
        <div className="brand-lockup" aria-label="Ghostline Cyber Runner">
          <span className="brand-lockup__mark" aria-hidden="true">G//L</span>
          <span className="brand-lockup__name">GHOSTLINE</span>
          <span className="brand-lockup__mode">HERO RUN // 01</span>
        </div>
        <div className="run-metrics">
          <div className="metric">
            <span className="metric__label">RUN TIME</span>
            <strong>{formatTime(elapsed)}</strong>
          </div>
          <div className="metric metric--score">
            <span className="metric__label">SCORE</span>
            <strong>{formatScore(score)}</strong>
          </div>
          <div className="metric">
            <span className="metric__label">DATA</span>
            <strong>{String(shardCount).padStart(2, '0')}<small>/{DATA_SHARDS.length}</small></strong>
          </div>
        </div>
        <AudioToggle {...audio} />
      </header>

      <MissionProgress checkpointIndex={checkpointIndex} phase={phase} />
      <TelemetryPanel />

      {phase === 'running' && (
        <>
          <div className="reticle" aria-hidden="true">
            <span />
          </div>
          <ControlLegend />
        </>
      )}

      <div className="system-status" aria-hidden="true">
        <span className="system-status__pulse" /> LINK STABLE
        <span>12 MS</span>
      </div>

      <div className="hud-message" key={messageNonce} role="status" aria-live="polite">
        <span>{message}</span>
      </div>
    </div>
  );
}

function BriefingPanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="modal-layer modal-layer--briefing">
      <section className="briefing-card" role="dialog" aria-labelledby="briefing-title">
        <div className="briefing-card__index">OP // 01</div>
        <p className="briefing-card__eyebrow">PRIORITY ZERO · BLACKSITE INTERCEPT</p>
        <h1 id="briefing-title">
          BREACH THE <span>GHOSTLINE</span>
        </h1>
        <p className="briefing-card__copy">
          Break into the compromised security operations center. Chain movement tech,
          capture live data packets, and reach exfil before the trace closes.
        </p>

        <div className="briefing-card__grid">
          <div><span>ROUTE</span><strong>{CHECKPOINTS.length - 1} GATES</strong></div>
          <div><span>PAYLOAD</span><strong>{DATA_SHARDS.length} SHARDS</strong></div>
          <div><span>THREAT</span><strong>ADAPTIVE</strong></div>
        </div>

        <button className="jack-in-button" onClick={onStart} type="button">
          <span>JACK IN</span>
          <small>CLICK TO CAPTURE CURSOR</small>
        </button>
        <p className="briefing-card__hint">HEADPHONES RECOMMENDED · VOICE COMMS ARE OFF BY DEFAULT</p>
      </section>
    </div>
  );
}

function ResumePanel({ onResume }: { onResume: () => void }) {
  return (
    <div className="resume-layer">
      <section className="resume-card" aria-label="Run paused">
        <span>CONNECTION SUSPENDED</span>
        <strong>CURSOR RELEASED</strong>
        <button onClick={onResume} type="button">RESUME LINK</button>
      </section>
    </div>
  );
}

function FinishPanel({ onRestart }: { onRestart: () => void }) {
  const score = useGameStore((state) => state.score);
  const elapsed = useGameStore((state) => state.elapsed);
  const shardCount = useGameStore((state) => Object.keys(state.collectedShards).length);
  const shardRatio = shardCount / DATA_SHARDS.length;
  const rank = useMemo(() => {
    if (shardRatio === 1 && elapsed < 90) return 'S';
    if (shardRatio >= 0.75) return 'A';
    if (shardRatio >= 0.5) return 'B';
    return 'C';
  }, [elapsed, shardRatio]);

  return (
    <div className="modal-layer modal-layer--finish">
      <section className="finish-card" role="dialog" aria-labelledby="finish-title">
        <p className="finish-card__eyebrow">TRANSMISSION AUTHENTICATED</p>
        <h2 id="finish-title">RUN SECURED</h2>
        <div className="finish-card__rank" aria-label={`Rank ${rank}`}>
          <span>RANK</span>{rank}
        </div>
        <div className="finish-card__stats">
          <div><span>FINAL TIME</span><strong>{formatTime(elapsed)}</strong></div>
          <div><span>FINAL SCORE</span><strong>{formatScore(score)}</strong></div>
          <div><span>DATA RECOVERED</span><strong>{shardCount}/{DATA_SHARDS.length}</strong></div>
        </div>
        <button className="restart-button" onClick={onRestart} type="button">RUN IT AGAIN</button>
      </section>
    </div>
  );
}

export default function App() {
  const phase = useGameStore((state) => state.phase);
  const beginRun = useGameStore((state) => state.beginRun);
  const pauseRun = useGameStore((state) => state.pauseRun);
  const resetRun = useGameStore((state) => state.resetRun);
  const audio = useYeller();
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [hasCapturedCursor, setHasCapturedCursor] = useState(false);

  useEffect(() => {
    const syncPointerLock = () => {
      const isLocked = Boolean(document.pointerLockElement);
      setIsPointerLocked(isLocked);
      if (isLocked) {
        setHasCapturedCursor(true);
        beginRun();
      }
    };

    document.addEventListener('pointerlockchange', syncPointerLock);
    syncPointerLock();
    return () => document.removeEventListener('pointerlockchange', syncPointerLock);
  }, [beginRun]);

  useEffect(() => {
    if (phase === 'complete' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'running' && hasCapturedCursor && !isPointerLocked) pauseRun();
  }, [hasCapturedCursor, isPointerLocked, pauseRun, phase]);

  const requestPointerLock = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.app canvas');
    if (!canvas || typeof canvas.requestPointerLock !== 'function') return;

    try {
      const lockRequest = canvas.requestPointerLock();
      if (lockRequest instanceof Promise) {
        void lockRequest.catch(() => {
          // Keyboard-only play remains available if capture is rejected.
        });
      }
    } catch {
      // Some mobile browsers expose the method but reject it synchronously.
    }
  }, []);

  const startRun = useCallback(() => {
    // Starting the state machine immediately gives keyboard-only and browsers
    // that deny pointer lock a graceful, playable fallback.
    beginRun();
    requestPointerLock();
  }, [beginRun, requestPointerLock]);

  useEffect(() => {
    if (phase === 'briefing') setHasCapturedCursor(false);

    const handleStartKey = (event: KeyboardEvent) => {
      if (phase === 'briefing' && event.key === 'Enter') startRun();
    };

    window.addEventListener('keydown', handleStartKey);
    return () => window.removeEventListener('keydown', handleStartKey);
  }, [phase, startRun]);

  return (
    <main className="app" data-phase={phase}>
      <Canvas
        camera={{ far: 180, fov: 68, near: 0.05, position: [0, 1.8, 20] }}
        dpr={[1, 1.6]}
        gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
        }}
        shadows="soft"
      >
        <color attach="background" args={['#02070b']} />
        <fog attach="fog" args={['#02070b', 28, 105]} />
        <Physics gravity={[0, -18, 0]} interpolate timeStep={1 / 60}>
          <Office />
          <Player />
        </Physics>
      </Canvas>

      <div className="screen-fx" aria-hidden="true" />
      <GameHud audio={audio} />

      {phase === 'briefing' && <BriefingPanel onStart={startRun} />}
      {phase === 'paused' && (
        <ResumePanel onResume={requestPointerLock} />
      )}
      {phase === 'complete' && <FinishPanel onRestart={resetRun} />}
    </main>
  );
}
