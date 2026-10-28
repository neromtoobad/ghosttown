// Ghost Radio: the town anthem, in three versions, with the words in time. One player for the whole
// town: start it from the ♪ in the header or the Radio TV and it keeps playing as you walk between
// doors. Nothing plays until someone taps it.

import { h } from './dom';
import { watcher } from './two';

type Line = [number, number, string];
interface Track { id: string; title: string; style: string; src: string; lyrics: Line[] }

const DRILL: Line[] = [
  [0, 3.06, 'Ghost Town. Mind the Watcher.'],
  [10.10, 11.88, 'Step in the street where the screens all glow'], [11.88, 15.32, 'Séance Hall in the fog, that’s the table we know'],
  [15.92, 17.62, 'Role card in a memo, shielded, only I read it'], [17.62, 20.56, 'Hash on the deal so the host can’t cheat it'],
  [20.56, 22.28, 'Leaker on the move, working for the Watcher'], [22.28, 25.68, 'Shielder in the dark pool, drones can’t clock her'],
  [25.68, 29.14, 'Slip once, shield cracks, ghost gets doxxed'], [29.14, 30.70, 'Vote’s shielded, no one sees who you dropped'],
  [30.70, 32.90, 'Claim you’re the Auditor? Cool, bring a chit'], [32.90, 37.66, 'One output, one proof, nothing else in it'],
  [37.66, 40.26, 'Ghost Town, nobody sees a thing'], [41.12, 43.68, 'Claims are cheap, bruv, prove it then'], [44.36, 47.12, 'One chit, one output, that’s the proof'], [47.80, 50.48, 'Ghost Town, where the shielded move'],
  [51.10, 54.38, 'Three lanterns on the corner, coin locked in a hash'], [54.38, 57.82, 'He tried to switch it on the flip, but the numbers don’t match'],
  [57.82, 61.08, 'Auditor’s desk, three keys, eight payments'], [61.08, 64.56, 'Follow the six-six-six to the ghost that he’s paying'],
  [64.56, 66.78, 'Arcade on the side, dark pool, beat the drones'], [66.78, 68.44, 'Stake it at the table, buy in from your phone'], [68.44, 72.10, 'One transaction deals the whole room'],
  [72.10, 74.34, 'Glass Gallery, mainnet, check it, it’s true'], [74.34, 76.08, 'Ghost Radio on, this the anthem, bro'], [76.08, 78.70, 'Over the river that’s Glasstown, we don’t go'],
  [78.70, 81.40, 'Ghost Town, nobody sees a thing'], [81.40, 84.82, 'Claims are cheap, bruv, prove it then'], [84.82, 88.30, 'One chit, one output, that’s the proof'], [88.30, 91.74, 'Ghost Town, where the shielded move'],
];
const UK: Line[] = [
  [0, 1.5, 'Welcome to Ghost Town.'], [1.6, 3.16, 'Mind the Watcher.'],
  [9.94, 13.22, 'Rain on the cobbles, every screen’s got a ghost'], [13.22, 16.66, 'Séance Hall in the fog, that’s the table we host'], [16.66, 20.06, 'Role card in a memo, it’s sealed and it’s mine'],
  [20.06, 26.72, 'Watcher can’t see inside so he’s sending his spies'], [26.72, 30.34, 'Three lanterns on the corner, coin locked in a hash'], [30.34, 33.8, 'Tried to switch it on the flip, but the numbers don’t match'],
  [33.8, 37.24, 'Auditor’s desk, three keys and a ledger'], [37.24, 40.68, 'Followed the six-six-six, now I know who you’re paying'],
  [44.26, 47.48, 'Ghost Town, nobody sees a thing'], [47.48, 50.92, 'Say you’re the Auditor? Prove it then'], [50.92, 54.48, 'One chit, one output, that’s the proof'], [54.48, 57.8, 'Ghost Town, where the shielded move'],
  [61.2, 64.84, 'Night falls, Leaker’s moving for the Watcher'], [64.84, 68.24, 'Shielder in the dark pool, drones can’t clock her'], [68.24, 71.58, 'Vote’s shielded, no one’s seeing your ballot'],
  [71.58, 78.44, 'Pot pays out in ZEC, straight to the wallet'], [78.44, 81.98, 'Mainnet deal on the chain, check the gallery'], [81.98, 85.66, 'Two cards, one transaction, he can’t read a name'],
  [85.66, 92.08, 'Over the river that’s Glasstown, all glass'], [92.08, 95.66, 'We don’t live there, fam, we just pass through fast'],
  [95.66, 99.0, 'Ghost Town, nobody sees a thing'], [99.0, 102.38, 'Say you’re the Auditor? Prove it then'], [102.38, 105.74, 'One chit, one output, that’s the proof'], [105.74, 109.3, 'Ghost Town, where the shielded move'],
];
const AFRO: Line[] = [
  [0, 2.66, 'Glasstown… everybody dey see you'],
  [12.5, 15.76, 'Woke up in a town made of glass'], [17.46, 20.16, 'Every coffee, every rent, every cash'], [22.08, 24.38, 'Watcher for corner dey read my wallet'], [26.0, 28.72, 'Know my job, know my name, know my address'],
  [30.3, 32.76, 'So I carry my coins to the dark pool'], [32.76, 34.68, 'Drone no fit follow'], [34.68, 36.86, 'Drone no fit see'], [36.86, 39.16, 'Cross the river, now I be ghost'], [39.16, 40.92, 'Shielded, shielded'], [41.68, 42.8, 'Nobody know'],
  [43.58, 46.56, 'Glass house, dem dey see everything'], [47.88, 51.06, 'Ghost Town, dem no fit see a thing'], [52.2, 55.06, 'Role card for inside shielded memo'], [56.5, 58.28, 'You say you be Auditor?'], [58.86, 60.46, 'Show me the proof'], [61.12, 63.28, 'Ghost Town, Ghost Town'],
  [64.98, 67.52, 'Night fall, Leaker dey move for the Watcher'], [67.52, 69.72, 'Shielder run the dark pool, no let dem catch am'], [69.72, 72.22, 'Anybody fit claim, anybody fit lie'], [72.22, 75.3, 'But a chit no dey lie, one output, one proof'],
  [76.28, 78.32, 'Vote is shielded, nobody see your ballot'], [78.32, 82.82, 'Pot pay out for ZEC, straight to your wallet'],
  [82.82, 85.82, 'Glass house, dem dey see everything'], [86.92, 90.36, 'Ghost Town, dem no fit see a thing'], [91.26, 94.38, 'Role card for inside shielded memo'], [95.52, 97.58, 'You say you be Auditor?'], [97.58, 99.74, 'Show me the proof'], [99.74, 105.24, 'Ghost Town, Ghost Town'], [105.24, 108.2, 'Ghost Town, where the shielded play'],
];

const at = (f: string) => `${import.meta.env.BASE_URL}audio/${f}`;
export const TRACKS: Track[] = [
  { id: 'drill', title: 'Ghost Town', style: 'UK drill · the anthem', src: at('ghost-town-drill.mp3'), lyrics: DRILL },
  { id: 'uk', title: 'Ghost Town', style: 'UK rap', src: at('ghost-town-uk.mp3'), lyrics: UK },
  { id: 'afro', title: 'Ghost Town', style: 'Afrobeats · Pidgin', src: at('ghost-town-afro.mp3'), lyrics: AFRO },
];

let audio: HTMLAudioElement | null = null;
let current = TRACKS[0];
let analyser: AnalyserNode | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const onRadio = (f: () => void) => (subs.add(f), () => subs.delete(f));
/** Subscribe an element: the listener drops itself once the element has left the page. */
export function bindRadio(el: Element, f: () => void) {
  let mounted = false;
  requestAnimationFrame(() => (mounted = true));
  const g = () => (el.isConnected ? f() : mounted && subs.delete(g));
  subs.add(g);
}
export const playing = () => !!audio && !audio.paused;
export const nowTrack = () => current;
export const position = () => audio?.currentTime ?? 0;

function ensure() {
  if (audio) return audio;
  audio = new Audio(current.src);
  audio.loop = true;
  audio.volume = 0.85;
  audio.addEventListener('play', emit);
  audio.addEventListener('pause', emit);
  return audio;
}

/** A frequency reading for the visualiser; set up on first play (it needs a user gesture). */
export function levels(out: Uint8Array<ArrayBuffer>): boolean {
  if (!analyser) return false;
  analyser.getByteFrequencyData(out);
  return true;
}

export async function play(id?: string) {
  const a = ensure();
  if (id && id !== current.id) {
    current = TRACKS.find((t) => t.id === id) ?? current;
    a.src = current.src;
  }
  if (!analyser) {
    try {
      const ac = new AudioContext();
      const src = ac.createMediaElementSource(a);
      analyser = ac.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser).connect(ac.destination);
      if (ac.state === 'suspended') await ac.resume();
    } catch { /* the music still plays without the visualiser */ }
  }
  await a.play().catch(() => {});
  emit();
}
export const pause = () => audio?.pause();
export const toggle = () => (playing() ? pause() : void play());

/** The ♪ in the header. */
export function radioButton(): HTMLButtonElement {
  const b = h('button', { class: 'radio-btn', type: 'button', title: 'Ghost Radio', onclick: () => toggle() }) as HTMLButtonElement;
  const draw = () => { b.textContent = playing() ? '♪ on' : '♪'; b.classList.toggle('on', playing()); };
  draw();
  bindRadio(b, draw);
  return b;
}

/** The Radio TV: now playing, a visualiser, the words in time, and the three versions. */
export function radioView(): HTMLElement {
  const cv = h('canvas', { class: 'radio-viz', width: '640', height: '220' }) as HTMLCanvasElement;
  const lines = h('div', { class: 'karaoke' });
  const title = h('div', { class: 'radio-now' });
  const bar = h('i');
  const progress = h('div', { class: 'radio-progress' }, bar);
  const playBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => toggle() });
  const list = h('div', { class: 'radio-list' });
  const drawList = () => {
    title.replaceChildren(h('b', {}, current.title), h('span', {}, current.style));
    playBtn.textContent = playing() ? 'Pause' : 'Play';
    list.replaceChildren(...TRACKS.map((t) => h('button', { class: `radio-track${t.id === current.id ? ' on' : ''}`, type: 'button', onclick: () => play(t.id) }, h('b', {}, t.title), h('span', {}, t.style))));
  };
  drawList();
  const off = onRadio(drawList);
  const g = cv.getContext('2d')!;
  const bins = new Uint8Array(new ArrayBuffer(32));
  let raf = 0;
  const frame = () => {
    if (!document.body.contains(cv)) { off(); cancelAnimationFrame(raf); return; }
    const t = position();
    // the visualiser: pixel bars that rise from the bottom of the screen like ghosts
    g.fillStyle = '#05060a'; g.fillRect(0, 0, 640, 220);
    const live = playing() && levels(bins);
    for (let i = 0; i < 32; i++) {
      const v = live ? bins[i] / 255 : 0.05 + 0.04 * Math.sin(t * 2 + i);
      const hgt = Math.round((v * 190) / 10) * 10;
      for (let y = 0; y < hgt; y += 10) { g.fillStyle = y > 150 ? '#ff4d5e' : y > 100 ? '#ffc46b' : '#7cf5a8'; g.fillRect(i * 20 + 2, 210 - y, 16, 8); }
    }
    // the words, in time
    const L = current.lyrics;
    const i = L.findIndex(([a, b], k) => t >= a - 0.1 && t < (L[k + 1]?.[0] ?? b + 2));
    const show = (k: number, cls: string) => (L[k] ? h('p', { class: cls }, L[k][2]) : h('p', { class: cls }, ' '));
    lines.replaceChildren(show(i - 1, 'prev'), show(i < 0 ? -1 : i, 'cur'), show((i < 0 ? L.findIndex(([a]) => a > t) : i + 1), 'next'));
    bar.style.width = `${audio?.duration ? (t / audio.duration) * 100 : 0}%`;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return h(
    'section',
    { class: 'radio' },
    h('p', { class: 'eyebrow' }, 'Ghost Radio · the town anthem'),
    h('h1', {}, 'On air in ', h('em', {}, 'Ghost Town'), '.'),
    h('div', { class: 'radio-tv' }, cv, title, lines, progress),
    h('div', { class: 'row' }, playBtn, h('span', { class: 'hint' }, 'Keeps playing as you walk the street. The ♪ in the header turns it off.')),
    list,
    h('div', { class: 'dealer' }, watcher('furious', 3), h('p', { class: 'dealer-line' }, 'They wrote a song about me. I’m in every verse. Not one line says where they live.')),
  );
}
