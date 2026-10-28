// Ghost Town's sound effects: synthesized in the browser, nothing downloaded. They follow the same
// sound on/off switch as Glasstown (and the ♪ radio is separate).
import { sfx as glassSfx, toggleMute } from './glass/ui';
import { state } from './glass/state';
import { h } from './dom';

let ac: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (state.muted) return null;
  try { ac ??= new AudioContext(); if (ac.state === 'suspended') void ac.resume(); return ac; } catch { return null; }
}
function tone(freq: number, dur: number, type: OscillatorType, gain: number, slide?: number, delay = 0) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  ...glassSfx,
  /** A ghost is doxxed: a falling, detuned sting. */
  dox() { tone(392, 0.5, 'sawtooth', 0.05, 98); tone(370, 0.6, 'square', 0.03, 92, 0.03); },
  /** The shield held: a bright open chord. */
  shield() { [523, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.05, undefined, i * 0.04)); },
  /** Night falls: a low bell. */
  night() { tone(110, 1.6, 'sine', 0.09, 104); tone(220, 1.2, 'sine', 0.03, undefined, 0.02); glassSfx.whoosh(); },
  /** A ballot is counted. */
  tally() { [0, 0.09, 0.18].forEach((d) => tone(1400, 0.05, 'square', 0.015, undefined, d)); },
  /** You lose. */
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.32, 'triangle', 0.05, undefined, i * 0.16)); },
};

/** The sound switch in the header. */
export function soundButton(): HTMLButtonElement {
  const b = h('button', { class: 'radio-btn', type: 'button', title: 'Sound effects' }) as HTMLButtonElement;
  const draw = () => (b.textContent = state.muted ? '🔇' : '🔈');
  b.addEventListener('click', () => { toggleMute(); draw(); if (!state.muted) sfx.pop(); });
  draw();
  return b;
}
