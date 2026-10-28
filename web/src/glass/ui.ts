import { state, save } from './state';

// ---------- tiny DOM helper ----------
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

/** Where the site lives, e.g. https://neromtoobad.github.io/glasstown */
export const siteUrl = () => location.origin + import.meta.env.BASE_URL.replace(/\/$/, '');
export const siteLabel = () => siteUrl().replace(/^https?:\/\//, '');

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- sound: synthesized, nothing downloaded ----------
let ac: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (state.muted) return null;
  try { ac ??= new AudioContext(); if (ac.state === 'suspended') void ac.resume(); return ac; } catch { return null; }
}
function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, slide?: number, delay = 0) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  ding() { tone(880, 0.12, 'sine', 0.07); tone(1320, 0.22, 'sine', 0.07, undefined, 0.08); },
  buzz() { tone(150, 0.22, 'square', 0.04, 110); },
  pop() { tone(620, 0.06, 'triangle', 0.05, 900); },
  tick() { tone(1800, 0.015, 'square', 0.012); },
  whoosh() {
    const a = ctx(); if (!a) return;
    const len = a.sampleRate * 0.6, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(400, a.currentTime);
    f.frequency.exponentialRampToValueAtTime(2400, a.currentTime + 0.5); g.gain.value = 0.12;
    src.connect(f).connect(g).connect(a.destination); src.start();
  },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, undefined, i * 0.11)); },
};
export function toggleMute(): boolean { state.muted = !state.muted; save(); return state.muted; }

// ---------- buttons, toasts ----------
export function btn(label: string, onclick: () => void, cls = ''): HTMLButtonElement {
  return h('button', { class: `btn ${cls}`, type: 'button', onclick: () => { sfx.pop(); onclick(); } }, label);
}

export function toast(msg: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
  const t = h('div', { class: `toast ${kind}`, role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}

// Random-looking strings for the simulated chain. Never real addresses.
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function fake(prefix: string, len: number, alpha = B32): string {
  let s = prefix; for (let i = 0; i < len; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}
export const fakeT = () => fake('t1', 33, B58);
export const fakeU = () => fake('u1', 40);
export const short = (a: string) => a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
export const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
