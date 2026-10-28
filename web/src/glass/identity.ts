// 26×26 pixel identities: hooded figures with a void where the face would be, glowing eyes,
// halo bars and pixels dissolving off the back edge. The cast and the player use the same system.
// Drawn locally from a seed. Nothing here ever touches a key or an address.
import { state } from './state';

export type Expr = 'idle' | 'happy' | 'alert' | 'squint' | 'blink';
export type Traits = {
  head: 'hood' | 'cap' | 'beanie' | 'bare';
  pal: number;            // index into PALS
  eyes: 'square' | 'slit' | 'visor' | 'smile' | 'lens';
  eyeColor: string;
  halo: boolean;
  dissolve: number;       // 0..1
  earring: boolean;
  texture: 'solid' | 'dither' | 'noise';
  glass?: boolean;        // the Watcher: a see-through face
};

type Pal = { main: string; shade: string; light: string; name: string };
export const PALS: Pal[] = [
  { name: 'Ironwood', main: '#3f7f5f', shade: '#2c5c44', light: '#6fb08b' },
  { name: 'Ember', main: '#d7263d', shade: '#a11b2d', light: '#f0606f' },
  { name: 'Sage', main: '#7fa88a', shade: '#5a8668', light: '#b5d3bd' },
  { name: 'Cobalt', main: '#1f6fe5', shade: '#164fa6', light: '#59a3ff' },
  { name: 'Orchid', main: '#c23b8a', shade: '#8e2a66', light: '#ea6fb5' },
  { name: 'Amber', main: '#d98a1c', shade: '#a86612', light: '#f3b54f' },
  { name: 'Ash', main: '#4a5056', shade: '#2f3439', light: '#7c848c' },
  { name: 'Clay', main: '#d4724a', shade: '#a65334', light: '#ef9e7b' },
  { name: 'Glass', main: '#9fc6d4', shade: '#6d98a8', light: '#dff1f7' },
];
const VOID = '#050807';
const EYE_COLORS = ['#5dff8f', '#7cf2ff', '#ffd23f', '#ff5e5e', '#f2f2f2', '#c08bff'];

export function rng(seedStr: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
}

export const N = 26;
type Grid = (string | null)[][];

export function portraitGrid(t: Traits, seed: string, expr: Expr = 'idle', layers = 8): Grid {
  const r = rng(seed);
  const g: Grid = Array.from({ length: N }, () => Array(N).fill(null));
  const set = (x: number, y: number, c: string | null) => { if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c; };
  const pal = layers >= 3 ? PALS[t.pal] : { main: '#1d3a2a', shade: '#16301f', light: '#285a3e', name: '' };

  if (layers <= 0) { // unrendered: a faint scatter of pixels
    for (let i = 0; i < 70; i++) set(6 + Math.floor(r() * 16), 3 + Math.floor(r() * 22), r() > 0.5 ? '#16301f' : '#1d3a2a');
    return g;
  }
  // silhouette
  const cx = 14.5;
  const inHead = (x: number, y: number) => ((x - cx) / 8) ** 2 + ((y - 12) / 9.2) ** 2 <= 1 && y >= 3;
  const inBody = (x: number, y: number) => y >= 19 && x >= 6 - (y - 19) * 0.6 && x <= 23 + (y - 19) * 0.4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (inHead(x, y) || inBody(x, y)) {
      let c = x > 17 ? pal.shade : pal.main;
      if (layers >= 5 && t.texture === 'dither' && (x + y) % 2 === 0 && x > 9) c = pal.shade;
      if (layers >= 5 && t.texture === 'noise' && r() < 0.28) c = r() > 0.5 ? pal.light : pal.shade;
      if (x < 10 && y < 17 && layers >= 3) c = pal.light;
      set(x, y, c);
    }
  }
  // headwear
  if (layers >= 4) {
    if (t.head === 'cap') {
      const capC = PALS[(t.pal + 3) % PALS.length];
      for (let y = 3; y <= 8; y++) for (let x = 7; x <= 22; x++) if (((x - cx) / 7.6) ** 2 + ((y - 8) / 5) ** 2 <= 1) set(x, y, x > 17 ? capC.shade : capC.main);
      for (let x = 15; x <= 24; x++) set(x, 8, capC.shade);
      set(16, 5, '#ffd23f');
    } else if (t.head === 'beanie') {
      const bc = PALS[(t.pal + 5) % PALS.length];
      for (let y = 2; y <= 8; y++) for (let x = 7; x <= 22; x++) if (((x - cx) / 7.8) ** 2 + ((y - 8) / 6) ** 2 <= 1) set(x, y, (x + y) % 3 === 0 ? bc.shade : bc.main);
      for (let x = 7; x <= 22; x++) set(x, 8, bc.shade);
    } else if (t.head === 'bare') {
      for (let x = 9; x <= 20; x++) set(x, 3, null);
    }
  }
  // face
  if (layers >= 2) {
    const fx = 16, fy = 13;
    const face = t.glass ? '#c9e7f0' : VOID;
    for (let y = 8; y <= 18; y++) for (let x = 10; x <= 21; x++) if (((x - fx) / 5.2) ** 2 + ((y - fy) / 5.6) ** 2 <= 1) set(x, y, face);
    if (t.glass) { // see-through head: you can make out what's inside
      set(13, 16, '#8fb3c0'); set(14, 16, '#8fb3c0'); set(15, 16, '#8fb3c0'); set(18, 16, '#8fb3c0');
      for (let y = 9; y <= 10; y++) set(19, y, '#ffffff');
    }
    // eyes
    const ec = expr === 'alert' ? '#ff4d4d' : layers >= 3 ? t.eyeColor : '#5dff8f';
    const L = 13, R = 18, E = 12;
    const kind = layers >= 7 ? t.eyes : 'square';
    if (expr === 'blink') { set(L, E + 1, ec); set(L + 1, E + 1, ec); set(R, E + 1, ec); set(R + 1, E + 1, ec); }
    else if (kind === 'lens') {
      for (let y = 11; y <= 14; y++) for (let x = 16; x <= 19; x++) set(x, y, (x === 16 || x === 19 || y === 11 || y === 14) ? '#b08d2c' : '#ff3b3b');
      set(17, 12, '#ffd0d0'); set(L, E, '#33424a'); set(L, E + 1, '#33424a');
    } else if (kind === 'visor' || kind === 'smile') {
      for (let x = 11; x <= 21; x++) { set(x, 11, '#d8d2c4'); set(x, 12, '#d8d2c4'); set(x, 13, '#d8d2c4'); }
      if (kind === 'smile') { set(13, 12, VOID); set(14, 11, VOID); set(15, 12, VOID); set(17, 12, VOID); set(18, 11, VOID); set(19, 12, VOID); }
      else { for (const x of [13, 14, 18, 19]) set(x, 12, ec); }
    } else if (kind === 'slit' || expr === 'squint') { for (const x of [L, L + 1, R, R + 1]) set(x, E + 1, ec); }
    else if (expr === 'happy') { set(L, E + 1, ec); set(L + 1, E, ec); set(R, E, ec); set(R + 1, E + 1, ec); }
    else { for (const x of [L, L + 1, R, R + 1]) { set(x, E, ec); set(x, E + 1, ec); } }
  }
  // earring
  if (layers >= 6 && t.earring) { set(10, 16, '#ffd23f'); set(10, 17, '#ffd23f'); }
  // dissolve: pixels drift off the back of the figure in horizontal streaks
  if (layers >= 5 && t.dissolve > 0) {
    for (let y = 3; y < N; y++) {
      let left = -1; for (let x = 0; x < N; x++) if (g[y][x]) { left = x; break; }
      if (left < 0) continue;
      const depth = Math.floor(2 + r() * 4 * t.dissolve);
      for (let k = 0; k < depth; k++) if (r() < 0.55) set(left + k, y, null);
      const streak = Math.floor(r() * 7 * t.dissolve);
      for (let k = 1; k <= streak; k++) if (r() < 0.6) set(left - k - 1, y, r() > 0.5 ? pal.light : pal.main);
    }
  }
  // halo
  if (layers >= 8 && t.halo) {
    for (let x = 12; x <= 19; x++) set(x, 1, x <= 13 ? '#e2683c' : '#ffd23f');
  }
  return g;
}

export function paint(canvas: HTMLCanvasElement, grid: Grid, px = 6, bg: string | null = null): void {
  canvas.width = N * px; canvas.height = N * px;
  const c = canvas.getContext('2d'); if (!c) return;
  c.imageSmoothingEnabled = false;
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, canvas.width, canvas.height); } else c.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const col = grid[y][x]; if (col) { c.fillStyle = col; c.fillRect(x * px, y * px, px, px); } }
}

// ---------- the cast ----------
export type Who = 'zee' | 'peep' | 'moss' | 'gus';
export const CAST: Record<Who, { name: string; handle: string; traits: Traits; seed: string }> = {
  zee: { name: 'ZERO', handle: 'zero', seed: 'zero-guide', traits: { head: 'hood', pal: 0, eyes: 'square', eyeColor: '#5dff8f', halo: true, dissolve: 0.7, earring: false, texture: 'dither' } },
  peep: { name: 'WATCHER', handle: 'watcher', seed: 'the-watcher', traits: { head: 'bare', pal: 8, eyes: 'lens', eyeColor: '#ff3b3b', halo: false, dissolve: 0, earring: false, texture: 'solid', glass: true } },
  moss: { name: 'KEEPER', handle: 'keeper', seed: 'the-keeper', traits: { head: 'beanie', pal: 5, eyes: 'square', eyeColor: '#ffd23f', halo: false, dissolve: 0.4, earring: true, texture: 'noise' } },
  gus: { name: 'SUPPORT ✓', handle: 'support', seed: 'fake-support', traits: { head: 'cap', pal: 4, eyes: 'smile', eyeColor: '#f2f2f2', halo: false, dissolve: 0.2, earring: false, texture: 'solid' } },
};

const POSE_EXPR: Record<string, Expr> = {
  wave: 'happy', cheer: 'happy', shield: 'happy', smile: 'happy', thumbs: 'happy', key: 'idle', point: 'idle', think: 'squint',
  worried: 'alert', gasp: 'alert', furious: 'alert', no: 'alert', caught: 'alert', ask: 'happy', read: 'squint', peer: 'idle',
  fog: 'squint', defeated: 'blink', run: 'blink', scroll: 'idle', notebook: 'squint',
};
export function castPortrait(who: Who, pose: string, px = 6): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const m = CAST[who];
  paint(c, portraitGrid(m.traits, m.seed, POSE_EXPR[pose] ?? 'idle', 8), px);
  c.className = `portrait ${who}`;
  return c;
}

// ---------- the player ----------
export const TRAIT_NAMES = ['', 'silhouette', 'void face', 'palette', 'headwear', 'texture + dissolve', 'earring', 'eyes', 'halo'];

export function playerTraits(): Traits {
  const c = state.choices;
  const r = rng(state.seed + 'traits');
  const heads: Traits['head'][] = ['hood', 'hood', 'cap', 'beanie'];
  return {
    head: heads[Math.floor(r() * heads.length)],
    pal: c.device === 'desktop' ? 3 : c.device === 'android' ? 0 : Math.floor(r() * 8),
    eyes: (['square', 'slit', 'visor'] as const)[Math.floor(r() * 3)],
    eyeColor: EYE_COLORS[Math.floor(r() * EYE_COLORS.length)],
    halo: true,
    dissolve: 0.4 + r() * 0.6,
    earring: c.route === 'friend' || r() > 0.5,
    texture: (['solid', 'dither', 'noise'] as const)[Math.floor(r() * 3)],
  };
}

export function playerNumber(): number {
  const r = rng(state.seed + 'no'); return 1 + Math.floor(r() * 9999);
}

export function drawIdentity(canvas: HTMLCanvasElement, layers: number, px = 6, bg: string | null = null): void {
  paint(canvas, portraitGrid(playerTraits(), state.seed, 'idle', layers), px, bg);
}

// 7 levels unlock 8 pieces: the last level adds both the eyes and the halo.
export function identityLayers(): number { const d = state.done.length; return d >= 7 ? 8 : d; }

export function traitList(): [string, string][] {
  const t = playerTraits();
  return [
    ['Palette', PALS[t.pal].name],
    ['Headwear', { hood: 'Hood', cap: 'Cap', beanie: 'Beanie', bare: 'None' }[t.head]],
    ['Eyes', { square: 'Square', slit: 'Slit', visor: 'Visor', smile: 'Smile', lens: 'Lens' }[t.eyes]],
    ['Texture', t.texture[0].toUpperCase() + t.texture.slice(1)],
    ['Dissolve', `${Math.round(t.dissolve * 100)}%`],
    ['Earring', t.earring ? 'Gold' : 'None'],
    ['Halo', 'Ironwood'],
  ];
}
