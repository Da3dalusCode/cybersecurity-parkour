import { create } from 'zustand';
import { CHECKPOINTS, DATA_SHARDS, type Vec3 } from './course';

export type RunPhase = 'briefing' | 'running' | 'paused' | 'complete';
export type ParkourAction =
  | 'IDLE'
  | 'MOVE'
  | 'SPRINT'
  | 'AIRBORNE'
  | 'SLIDE'
  | 'VAULT'
  | 'DASH';

type Telemetry = {
  speed: number;
  action: ParkourAction;
  position: Vec3;
  dashCharge: number;
};

type GameState = Telemetry & {
  phase: RunPhase;
  score: number;
  elapsed: number;
  checkpointIndex: number;
  collectedShards: Record<string, true>;
  combo: number;
  message: string;
  messageNonce: number;
  beginRun: () => void;
  pauseRun: () => void;
  updateClock: (delta: number) => void;
  updateTelemetry: (telemetry: Partial<Telemetry>) => void;
  collectShard: (id: string) => void;
  reachCheckpoint: (index: number) => void;
  registerTrick: (label: string, points: number) => void;
  resetRun: () => void;
};

const INITIAL_TELEMETRY: Telemetry = {
  speed: 0,
  action: 'IDLE',
  position: CHECKPOINTS[0].respawn,
  dashCharge: 1,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...INITIAL_TELEMETRY,
  phase: 'briefing',
  score: 0,
  elapsed: 0,
  checkpointIndex: 0,
  collectedShards: {},
  combo: 1,
  message: 'CLICK TO JACK IN',
  messageNonce: 0,

  beginRun: () => {
    if (get().phase !== 'briefing' && get().phase !== 'paused') return;
    set((state) => ({
      phase: 'running',
      message: state.phase === 'paused' ? 'LINK RESTORED' : 'ROUTE LIVE — MOVE',
      messageNonce: state.messageNonce + 1,
    }));
  },

  pauseRun: () => {
    if (get().phase !== 'running') return;
    set((state) => ({
      phase: 'paused',
      action: 'IDLE',
      speed: 0,
      message: 'CONNECTION SUSPENDED',
      messageNonce: state.messageNonce + 1,
    }));
  },

  updateClock: (delta) => {
    if (get().phase !== 'running') return;
    set((state) => ({ elapsed: state.elapsed + Math.min(delta, 0.1) }));
  },

  updateTelemetry: (telemetry) => set(telemetry),

  collectShard: (id) => {
    const state = get();
    if (state.collectedShards[id] || state.phase !== 'running') return;
    const shard = DATA_SHARDS.find((item) => item.id === id);
    if (!shard) return;
    const awarded = shard.value * state.combo;
    set({
      collectedShards: { ...state.collectedShards, [id]: true },
      score: state.score + awarded,
      combo: Math.min(5, state.combo + 1),
      message: `PACKET SECURED  +${awarded}`,
      messageNonce: state.messageNonce + 1,
    });
  },

  reachCheckpoint: (index) => {
    const state = get();
    if (state.phase !== 'running' || index !== state.checkpointIndex + 1 || !CHECKPOINTS[index]) return;
    const isFinish = index === CHECKPOINTS.length - 1;
    const timeBonus = isFinish ? Math.max(0, Math.round(10000 - state.elapsed * 100)) : 750;
    set({
      checkpointIndex: index,
      phase: isFinish ? 'complete' : 'running',
      score: state.score + timeBonus,
      combo: Math.min(5, state.combo + 1),
      message: isFinish ? `RUN SECURED  +${timeBonus}` : `${CHECKPOINTS[index].label} SYNCED  +${timeBonus}`,
      messageNonce: state.messageNonce + 1,
    });
  },

  registerTrick: (label, points) => {
    if (get().phase !== 'running') return;
    set((state) => ({
      score: state.score + points * state.combo,
      combo: Math.min(5, state.combo + 1),
      message: `${label}  +${points * state.combo}`,
      messageNonce: state.messageNonce + 1,
    }));
  },

  resetRun: () => set((state) => ({
    ...INITIAL_TELEMETRY,
    phase: 'briefing',
    score: 0,
    elapsed: 0,
    checkpointIndex: 0,
    collectedShards: {},
    combo: 1,
    message: 'SYSTEM RESET — CLICK TO JACK IN',
    messageNonce: state.messageNonce + 1,
  })),
}));
