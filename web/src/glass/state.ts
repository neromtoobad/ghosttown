// Progress lives only in this browser. Every read and write is guarded: private windows,
// blocked storage and previews must still play the whole game, just without resuming.

export type Choices = {
  device?: 'ios' | 'android' | 'desktop';
  route?: 'swap' | 'exchange' | 'friend';
  memo?: string;
  exit?: 'clean' | 'linked';
};

export type State = {
  done: number[];          // level numbers finished
  xp: number;
  startedAt: number | null;
  finishedAt: number | null;
  choices: Choices;
  checklist: boolean[];    // the real-world steps in level 8
  verified: 'shielded' | 'self' | null;
  seed: string;            // random, only used to draw the pixel identity
  muted: boolean;
  best?: number;           // Dark Pool high score (ZEC shielded)
};

const KEY = 'glasstown:v1';

function fresh(): State {
  return {
    done: [], xp: 0, startedAt: null, finishedAt: null, choices: {},
    checklist: [false, false, false, false, false],
    verified: null,
    seed: Math.random().toString(36).slice(2, 10),
    muted: false,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return fresh();
}

export const state: State = load();

export function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

export function reset(): void {
  Object.assign(state, fresh());
  save();
}

export function complete(level: number, xp: number): void {
  if (!state.done.includes(level)) {
    state.done.push(level);
    state.xp += xp;
  }
  if (level === 8 && !state.finishedAt) state.finishedAt = Date.now();
  save();
}

export function begin(): void {
  if (!state.startedAt) { state.startedAt = Date.now(); save(); }
}

export function elapsed(): string {
  if (!state.startedAt) return '—';
  const ms = (state.finishedAt ?? Date.now()) - state.startedAt;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}
