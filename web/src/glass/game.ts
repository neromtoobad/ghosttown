// DARK POOL: a small arcade game about shielding.
// Pick up coins in the bright glass district. Coins you carry are public, so the Watcher's drones
// can spot you from further away. Carry them into the dark pool to make them private.
//
// Two board layouts share one set of rules: landscape (320×192, pool on the right) for wide screens,
// and the same board transposed (192×320, pool at the bottom) for phones held upright. The canvas
// renders at the screen's real resolution, so shapes and text stay sharp at any size. Full-screen
// mode gives the game the whole screen; touch play uses a floating joystick so a finger never
// covers your character.
import { sfx } from './ui';
import { state, save } from './state';
import { playerTraits, portraitGrid, paint } from './identity';

type V = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Drone = V & { tx: number; ty: number; chase: number; lost: number; spin: number };
type Coin = V & { v: number; t: number };
type Pop = V & { text: string; t: number; color: string };
type Spark = V & { vx: number; vy: number; life: number; max: number; color: string; size: number };
type Ripple = V & { t: number };
type Range = [number, number, number, number]; // x0, x1, y0, y1
type Layout = { W: number; H: number; POOL: Rect; WALLS: Rect[]; coin: Range; patrol: Range; spawn: Range; portrait: boolean };

export type Result = { shielded: number; doxxed: number; best: number; isBest: boolean };

const LAND: Layout = {
  W: 320, H: 192, POOL: { x: 228, y: 22, w: 84, h: 148 },
  WALLS: [{ x: 60, y: 40, w: 22, h: 30 }, { x: 120, y: 24, w: 30, h: 20 }, { x: 150, y: 110, w: 26, h: 34 }, { x: 70, y: 128, w: 34, h: 20 }, { x: 196, y: 20, w: 12, h: 26 }],
  coin: [12, 212, 14, 180], patrol: [12, 190, 12, 180], spawn: [20, 180, 20, 170], portrait: false,
};
const flip = (r: Rect): Rect => ({ x: r.y, y: r.x, w: r.h, h: r.w });
const PORT: Layout = { W: 192, H: 320, POOL: flip(LAND.POOL), WALLS: LAND.WALLS.map(flip), coin: [14, 180, 12, 212], patrol: [12, 180, 12, 190], spawn: [20, 170, 20, 180], portrait: true };
const SIGHT_EMPTY = 30, SIGHT_CARRY = 54;
const inRect = (p: V, r: Rect, pad = 0) => p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad;
const SANS = 'Inter, system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
const coarse = () => matchMedia('(pointer: coarse)').matches;

export function darkPool(host: HTMLElement, opts: { seconds?: number; onEnd: (r: Result) => void }): () => void {
  const seconds = opts.seconds ?? 45;
  // ---------- DOM ----------
  const wrap = document.createElement('div'); wrap.className = 'game';
  const top = document.createElement('div'); top.className = 'game-top';
  const hud = document.createElement('div'); hud.className = 'game-hud';
  const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'game-close'; closeBtn.textContent = '✕'; closeBtn.setAttribute('aria-label', 'Exit full screen');
  top.append(hud, closeBtn);
  const stage = document.createElement('div'); stage.className = 'game-stage';
  const cv = document.createElement('canvas'); cv.className = 'game-cv'; cv.tabIndex = 0;
  cv.setAttribute('aria-label', 'Dark Pool game. Move with the arrow keys or WASD, or touch and drag.');
  const overlay = document.createElement('div'); overlay.className = 'game-overlay';
  const help = document.createElement('div'); help.className = 'game-help';
  const fsBtn = document.createElement('button'); fsBtn.type = 'button'; fsBtn.className = 'btn small fs-btn'; fsBtn.innerHTML = '<span aria-hidden="true">⤢</span> Full screen';
  help.innerHTML = coarse() ? '<span>Touch and drag anywhere to move</span>' : '<span>Move: arrow keys / WASD, or press and drag</span>';
  help.append(fsBtn);
  stage.append(cv, overlay); wrap.append(top, stage, help); host.append(wrap);
  const g = cv.getContext('2d')!;

  // ---------- layout + crisp sizing ----------
  let L: Layout = LAND, focus = false, scale = 1;
  const inPool = (p: V) => inRect(p, L.POOL, -3);
  const blocked = (p: V, rad: number) => p.x < rad || p.y < rad || p.x > L.W - rad || p.y > L.H - rad || L.WALLS.some((w) => inRect(p, w, rad));
  const wantPortrait = () => (focus ? innerHeight > innerWidth * 1.05 : stage.getBoundingClientRect().width < 520);
  const fit = () => {
    const box = stage.getBoundingClientRect(); if (!box.width) return;
    let cw = box.width, ch = (box.width * L.H) / L.W;
    if (focus) { const bh = box.height || innerHeight; if (ch > bh) { ch = bh; cw = (bh * L.W) / L.H; } }
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    scale = cv.width / L.W;
  };
  const ro = new ResizeObserver(() => { if (mode !== 'play' && wantPortrait() !== L.portrait) newRound(mode === 'over'); fit(); });
  ro.observe(stage);

  // ---------- sprites ----------
  const traits = playerTraits();
  const meSprite = document.createElement('canvas'); paint(meSprite, portraitGrid(traits, state.seed, 'idle', 8), 1);

  // ---------- round state ----------
  let me = { x: 0, y: 0, carry: 0, inv: 0 };
  let shielded = 0, doxxed = 0, lives = 3, time = seconds, spawnT = 0, shake = 0, flash = 0;
  let drones: Drone[] = [], coins: Coin[] = [], pops: Pop[] = [], sparks: Spark[] = [], ripples: Ripple[] = [];
  const trail: V[] = [];
  let mode: 'ready' | 'play' | 'over' = 'ready';
  let lastResult: Result | null = null, lastCaught = false;
  const keys = new Set<string>();
  let pointer: V | null = null, joy: { ox: number; oy: number; x: number; y: number } | null = null;
  const rand = ([x0, x1, y0, y1]: Range) => ({ x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0) });

  const addDrone = () => {
    let p: V; do { p = rand(L.spawn); } while (blocked(p, 6) || Math.hypot(p.x - me.x, p.y - me.y) < 80);
    drones.push({ ...p, tx: p.x, ty: p.y, chase: 0, lost: 0, spin: Math.random() * 6 });
  };
  const addCoin = () => {
    let p: V; do { p = rand(L.coin); } while (blocked(p, 6));
    coins.push({ ...p, v: [0.01, 0.01, 0.02, 0.05][Math.floor(Math.random() * 4)], t: Math.random() * 6 });
  };
  function newRound(keepOver = false) {
    L = wantPortrait() ? PORT : LAND;
    me = { x: L.POOL.x + L.POOL.w / 2, y: L.POOL.y + L.POOL.h / 2, carry: 0, inv: 0 };
    shielded = 0; doxxed = 0; lives = 3; time = seconds; spawnT = 0; shake = 0; flash = 0;
    drones = []; coins = []; pops = []; sparks = []; ripples = []; trail.length = 0;
    addDrone(); for (let i = 0; i < 4; i++) addCoin();
    fit();
    if (keepOver && lastResult) showOver(lastResult, lastCaught); else showReady();
  }
  // Dev builds expose live state so a scripted bot can play (tests and trailer capture). Stripped from production.
  if (import.meta.env.DEV) (window as unknown as { __dp: unknown }).__dp = { get me() { return me; }, get coins() { return coins; }, get drones() { return drones; }, get pool() { return L.POOL; }, get walls() { return L.WALLS; }, get shielded() { return shielded; }, get lives() { return lives; }, get time() { return time; } };

  // ---------- full screen ----------
  function setFocus(on: boolean) {
    if (on === focus) return;
    focus = on;
    wrap.classList.toggle('focus', on);
    document.documentElement.classList.toggle('game-lock', on);
    fsBtn.innerHTML = on ? 'Exit full screen' : '<span aria-hidden="true">⤢</span> Full screen';
    if (on) { const rf = wrap.requestFullscreen?.bind(wrap); if (rf) rf({ navigationUI: 'hide' }).catch(() => {}); }
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    requestAnimationFrame(() => { if (mode !== 'play' && wantPortrait() !== L.portrait) newRound(mode === 'over'); fit(); });
    sfx.pop();
  }
  const onFsChange = () => { if (!document.fullscreenElement && focus) setFocus(false); };
  document.addEventListener('fullscreenchange', onFsChange);
  fsBtn.addEventListener('click', () => setFocus(!focus));
  closeBtn.addEventListener('click', () => setFocus(false));

  // ---------- overlays ----------
  function showReady() {
    mode = 'ready';
    overlay.className = 'game-overlay show';
    const big = coarse() && !focus;
    overlay.innerHTML = `<div class="go-card">
      <div class="go-kicker">Dark Pool</div>
      <ol class="go-rules"><li><i class="r-coin"></i><span>Pick up gold coins</span></li><li><i class="r-pool"></i><span>Carry them into the <b>dark pool</b> to make them private</span></li><li><i class="r-drone"></i><span>Coins you carry are public, so dodge the Watcher’s drones</span></li></ol>
      <div class="go-actions">${big ? '<button type="button" class="btn primary big go-full">⤢ Play full screen</button><button type="button" class="btn go-start">Play here</button>' : '<button type="button" class="btn primary big go-start">Start ▸</button>' + (focus ? '' : '<button type="button" class="btn go-full">⤢ Full screen</button>')}</div>
      <small>${coarse() ? 'Touch and drag anywhere to move' : 'or press an arrow key'}</small></div>`;
    overlay.querySelector('.go-start')?.addEventListener('click', start);
    overlay.querySelector('.go-full')?.addEventListener('click', () => { setFocus(true); setTimeout(start, 250); });
  }
  function start() {
    if (mode === 'play') return;
    if (mode === 'over') newRound();
    mode = 'play'; overlay.className = 'game-overlay'; overlay.innerHTML = ''; sfx.pop();
    cv.focus({ preventScroll: true });
  }
  function showOver(r: Result, caught: boolean) {
    overlay.className = 'game-overlay show';
    overlay.innerHTML = `<div class="go-card">
      <div class="go-kicker">${caught ? 'Caught by the Watcher' : 'Time’s up'}</div>
      <div class="go-big">${r.shielded.toFixed(2)} <span>ZEC</span></div>
      <div class="go-sub">made private in the dark pool</div>
      <div class="go-stats"><span class="lost">Lost to the Watcher <b>${r.doxxed.toFixed(2)}</b></span><span>${r.isBest ? 'New best!' : 'Best'} <b>${r.best.toFixed(2)}</b></span></div>
      <div class="go-actions"><button type="button" class="btn primary go-again">Play again</button>${focus ? '<button type="button" class="btn go-exit">Done</button>' : ''}</div></div>`;
    overlay.querySelector('.go-again')!.addEventListener('click', () => { newRound(); start(); });
    overlay.querySelector('.go-exit')?.addEventListener('click', () => setFocus(false));
  }

  // ---------- input ----------
  const onKey = (e: KeyboardEvent, down: boolean) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' && down && focus) { setFocus(false); return; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      if (!wrap.isConnected) return;
      e.preventDefault(); down ? keys.add(k) : keys.delete(k);
      if (down && mode === 'ready') start();
    }
  };
  const kd = (e: KeyboardEvent) => onKey(e, true), ku = (e: KeyboardEvent) => onKey(e, false);
  const toLocal = (e: PointerEvent): V => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * L.W, y: ((e.clientY - r.top) / r.height) * L.H }; };
  const pd = (e: PointerEvent) => {
    if (mode !== 'play') return;
    const p = toLocal(e); cv.setPointerCapture(e.pointerId); e.preventDefault();
    if (e.pointerType === 'touch') joy = { ox: p.x, oy: p.y, x: p.x, y: p.y }; else pointer = p;
  };
  const pm = (e: PointerEvent) => { const p = toLocal(e); if (joy) { joy.x = p.x; joy.y = p.y; } else if (pointer) pointer = p; };
  const pu = () => { pointer = null; joy = null; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); cv.addEventListener('pointerup', pu); cv.addEventListener('pointercancel', pu);

  const pop = (x: number, y: number, text: string, color: string) => pops.push({ x, y, text, t: 1.3, color });
  const burst = (x: number, y: number, color: string, n: number, speed = 40) => {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random()); sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7 + Math.random() * 0.4, max: 1.1, color, size: 1 + Math.random() * 1.6 }); }
  };

  // ---------- simulation ----------
  function step(dt: number) {
    let dx = 0, dy = 0, mag = 1;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1; if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1; if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (pointer) { const vx = pointer.x - me.x, vy = pointer.y - me.y, d = Math.hypot(vx, vy); if (d > 3) { dx = vx / d; dy = vy / d; } }
    if (joy) { const vx = joy.x - joy.ox, vy = joy.y - joy.oy, d = Math.hypot(vx, vy); if (d > 2.5) { dx = vx / d; dy = vy / d; mag = Math.min(1, 0.45 + d / 22); } }
    const len = Math.hypot(dx, dy) || 1, sp = 88 * mag;
    const nx = me.x + (dx / len) * sp * dt, ny = me.y + (dy / len) * sp * dt;
    if (!blocked({ x: nx, y: me.y }, 4)) me.x = nx;
    if (!blocked({ x: me.x, y: ny }, 4)) me.y = ny;
    me.inv = Math.max(0, me.inv - dt);
    const hidden = inPool(me);
    if (!hidden && (dx || dy) && me.carry > 0) { trail.push({ x: me.x, y: me.y + 6 }); if (trail.length > 30) trail.shift(); }
    else if (trail.length) trail.shift();
    if (hidden && (dx || dy) && Math.random() < dt * 6) ripples.push({ x: me.x, y: me.y + 5, t: 0 });

    if (hidden && me.carry > 0) {
      shielded = +(shielded + me.carry).toFixed(2); pop(me.x, me.y - 12, `+${me.carry.toFixed(2)} private`, '#5dff8f');
      burst(me.x, me.y, '#5dff8f', 26, 46); ripples.push({ x: me.x, y: me.y, t: 0 });
      me.carry = 0; sfx.whoosh(); trail.length = 0;
    }
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i]; c.t += dt;
      if (Math.hypot(c.x - me.x, c.y - me.y) < 8) { me.carry = +(me.carry + c.v).toFixed(2); coins.splice(i, 1); sfx.ding(); pop(c.x, c.y - 9, `+${c.v} public`, '#0e7490'); burst(c.x, c.y, '#ffd23f', 10, 30); }
    }
    spawnT += dt; if (spawnT > 1.6 && coins.length < 6) { spawnT = 0; addCoin(); }

    for (const d of drones) {
      d.spin += dt * 30;
      const dist = Math.hypot(me.x - d.x, me.y - d.y);
      const sees = !hidden && dist < (me.carry > 0 ? SIGHT_CARRY : SIGHT_EMPTY);
      if (sees) { if (d.chase <= 0) sfx.tick(); d.chase = 1.0; d.lost = 0; } else if (d.chase > 0) { d.chase -= dt; if (hidden) d.lost = 0.9; }
      d.lost = Math.max(0, d.lost - dt);
      let tx = d.tx, ty = d.ty, spd = 32;
      if (d.chase > 0 && !hidden) { tx = me.x; ty = me.y; spd = 52 + Math.min(16, me.carry * 100); }
      else if (Math.hypot(d.tx - d.x, d.ty - d.y) < 4) { const t2 = rand(L.patrol); d.tx = t2.x; d.ty = t2.y; }
      const vx = tx - d.x, vy = ty - d.y, l = Math.hypot(vx, vy) || 1;
      const ax = d.x + (vx / l) * spd * dt, ay = d.y + (vy / l) * spd * dt;
      if (!blocked({ x: ax, y: d.y }, 5) && !inPool({ x: ax, y: d.y })) d.x = ax; else d.tx = d.x - (vx / l) * 30;
      if (!blocked({ x: d.x, y: ay }, 5) && !inPool({ x: d.x, y: ay })) d.y = ay; else d.ty = d.y - (vy / l) * 30;
      if (!hidden && me.inv <= 0 && dist < 8) {
        lives--; doxxed = +(doxxed + me.carry).toFixed(2);
        pop(me.x, me.y - 12, me.carry > 0 ? `caught −${me.carry.toFixed(2)}` : 'caught!', '#e5484d');
        burst(me.x, me.y, '#e5484d', 18, 40);
        me.carry = 0; me.inv = 2.2; sfx.buzz(); trail.length = 0; shake = 0.35; flash = 0.35;
        if (navigator.vibrate) try { navigator.vibrate(60); } catch { /* not supported */ }
        me.x = L.POOL.x + L.POOL.w / 2; me.y = L.POOL.y + L.POOL.h / 2;
        if (lives <= 0) { end(true); return; }
      }
    }
    const want = 1 + Math.floor((seconds - time) / 15);
    if (drones.length < Math.min(3, want)) addDrone();
    for (let i = pops.length - 1; i >= 0; i--) { pops[i].t -= dt; pops[i].y -= 16 * dt; if (pops[i].t <= 0) pops.splice(i, 1); }
    time -= dt; if (time <= 0) { time = 0; end(false); }
  }
  function fx(dt: number) {
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.92; s.vy *= 0.92; if (s.life <= 0) sparks.splice(i, 1); }
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 1.2) ripples.splice(i, 1); }
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt);
  }

  // ---------- drawing ----------
  const rr = (x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  function draw(now: number) {
    const t = now / 1000, { W, H, POOL, WALLS } = L;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (shake > 0) g.translate((Math.random() - 0.5) * 4 * shake / 0.35, (Math.random() - 0.5) * 4 * shake / 0.35);
    // floor: the bright, public glass district
    const fl = g.createLinearGradient(0, 0, 0, H); fl.addColorStop(0, '#f4fafd'); fl.addColorStop(1, '#e6f2f8');
    g.fillStyle = fl; g.fillRect(-4, -4, W + 8, H + 8);
    g.strokeStyle = 'rgba(14,116,144,0.08)'; g.lineWidth = 0.5; g.beginPath();
    for (let x = 0; x <= W; x += 8) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = 0; y <= H; y += 8) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    // glass buildings
    for (const w of WALLS) {
      g.fillStyle = 'rgba(14,60,80,0.12)'; rr(w.x + 1.5, w.y + 2.5, w.w, w.h, 3); g.fill();
      const gr = g.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h); gr.addColorStop(0, '#e9f8fd'); gr.addColorStop(1, '#bfe2f0');
      g.fillStyle = gr; rr(w.x, w.y, w.w, w.h, 3); g.fill();
      g.strokeStyle = '#7fb8cf'; g.lineWidth = 0.8; g.stroke();
      for (let yy = w.y + 4; yy < w.y + w.h - 3; yy += 6) for (let xx = w.x + 4; xx < w.x + w.w - 3; xx += 6) {
        const lit = ((xx * 7 + yy * 13) | 0) % 3 === 0;
        g.fillStyle = lit ? '#ffd23f' : 'rgba(14,116,144,0.18)'; g.fillRect(xx, yy, 2.4, 2.4);
      }
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(w.x + 2, w.y + w.h - 3); g.lineTo(w.x + 2, w.y + 2); g.lineTo(w.x + w.w - 3, w.y + 2); g.stroke();
    }
    // the dark pool
    g.save();
    g.shadowColor = 'rgba(93,255,143,0.55)'; g.shadowBlur = 10 * scale / 4;
    const pg = g.createLinearGradient(0, POOL.y, 0, POOL.y + POOL.h); pg.addColorStop(0, '#0f1d16'); pg.addColorStop(1, '#030605');
    g.fillStyle = pg; rr(POOL.x, POOL.y, POOL.w, POOL.h, 10); g.fill();
    g.restore();
    g.save(); rr(POOL.x, POOL.y, POOL.w, POOL.h, 10); g.clip();
    for (let i = 0; i < 46; i++) {
      const sp = 4 + (i % 5) * 2, x = POOL.x + ((i * 37.7) % POOL.w), y = POOL.y + POOL.h - ((i * 23.3 + t * sp) % POOL.h);
      g.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 1.5 + i)); g.fillStyle = i % 4 ? '#3f7f5f' : '#5dff8f'; g.fillRect(x, y, 1.4, 1.4);
    }
    g.globalAlpha = 1;
    for (const r of ripples) { g.strokeStyle = `rgba(93,255,143,${0.5 * (1 - r.t / 1.2)})`; g.lineWidth = 0.8; g.beginPath(); g.ellipse(r.x, r.y, 3 + r.t * 16, 1.5 + r.t * 7, 0, 0, Math.PI * 2); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(93,255,143,0.75)'; g.lineWidth = 1; rr(POOL.x + 0.5, POOL.y + 0.5, POOL.w - 1, POOL.h - 1, 10); g.stroke();
    g.font = `700 6.5px ${MONO}`; g.textAlign = 'center'; g.fillStyle = '#5dff8f';
    g.fillText('DARK POOL', POOL.x + POOL.w / 2, POOL.y + 12);
    g.font = `600 5.5px ${SANS}`; g.fillStyle = 'rgba(200,255,220,0.7)'; g.fillText('coins here are private', POOL.x + POOL.w / 2, POOL.y + POOL.h - 7);
    g.textAlign = 'left';
    // trail: what a public wallet leaves behind
    for (let i = 0; i < trail.length; i++) { g.globalAlpha = (i / trail.length) * 0.55; g.fillStyle = '#3aa0c4'; g.beginPath(); g.arc(trail[i].x, trail[i].y, 1.1, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    // coins
    for (const c of coins) {
      const b = Math.sin(c.t * 4) * 1.2;
      g.fillStyle = 'rgba(120,80,0,0.18)'; g.beginPath(); g.ellipse(c.x, c.y + 5.5, 3.6 - b * 0.4, 1.2, 0, 0, Math.PI * 2); g.fill();
      const cg = g.createRadialGradient(c.x - 1.4, c.y - 1.8 + b, 0.5, c.x, c.y + b, 5); cg.addColorStop(0, '#fff2b0'); cg.addColorStop(0.5, '#ffd23f'); cg.addColorStop(1, '#d99a0b');
      g.fillStyle = cg; g.beginPath(); g.arc(c.x, c.y + b, 4.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#b37a06'; g.lineWidth = 0.6; g.stroke();
      g.fillStyle = '#8a5a00'; g.font = `800 5.6px ${SANS}`; g.textAlign = 'center'; g.fillText('Z', c.x, c.y + b + 2); g.textAlign = 'left';
      const sh = (Math.sin(c.t * 2) + 1) / 2; g.strokeStyle = `rgba(255,255,255,${0.4 + sh * 0.5})`; g.lineWidth = 0.7; g.beginPath(); g.arc(c.x, c.y + b, 3.4, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    }
    // drones
    const meHidden = inPool(me);
    for (const d of drones) {
      const chasing = d.chase > 0 && !meHidden;
      const rad = me.carry > 0 ? SIGHT_CARRY : SIGHT_EMPTY;
      const vg = g.createRadialGradient(d.x, d.y, 2, d.x, d.y, rad);
      vg.addColorStop(0, chasing ? 'rgba(229,72,77,0.22)' : 'rgba(229,72,77,0.10)'); vg.addColorStop(1, 'rgba(229,72,77,0)');
      g.fillStyle = vg; g.beginPath(); g.arc(d.x, d.y, rad, 0, Math.PI * 2); g.fill();
      g.strokeStyle = chasing ? 'rgba(229,72,77,0.55)' : 'rgba(229,72,77,0.18)'; g.lineWidth = 0.6; g.setLineDash([2, 2]); g.beginPath(); g.arc(d.x, d.y, rad, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      if (chasing) { g.strokeStyle = 'rgba(229,72,77,0.8)'; g.lineWidth = 0.8; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(me.x, me.y); g.stroke(); g.setLineDash([]); }
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.ellipse(d.x, d.y + 8, 5, 1.5, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(43,58,66,0.6)'; g.lineWidth = 0.6;
      for (const ox of [-5, 5]) { g.beginPath(); g.ellipse(d.x + ox, d.y - 4.5, 3.2, 0.9 + Math.abs(Math.sin(d.spin)) * 0.5, 0, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = '#2b3a42'; rr(d.x - 5.5, d.y - 4.5, 11, 8.5, 3); g.fill();
      g.fillStyle = '#f2f5f6'; g.beginPath(); g.arc(d.x, d.y - 0.3, 3, 0, Math.PI * 2); g.fill();
      const lx = Math.max(-1, Math.min(1, (me.x - d.x) / 30)), ly = Math.max(-1, Math.min(1, (me.y - d.y) / 30));
      g.fillStyle = chasing ? '#ff2a2a' : '#c0392b'; g.beginPath(); g.arc(d.x + lx * 1.1, d.y - 0.3 + ly * 1.1, 1.5, 0, Math.PI * 2); g.fill();
      g.font = `800 8px ${SANS}`; g.textAlign = 'center';
      if (d.lost > 0) { g.fillStyle = '#a8730a'; g.fillText('?', d.x, d.y - 9); }
      else if (chasing) { g.fillStyle = '#e5484d'; g.fillText('!', d.x, d.y - 9); }
      g.textAlign = 'left';
    }
    // player: your pixel identity
    const blink = me.inv > 0 && Math.floor(now / 110) % 2 === 0;
    if (!blink) {
      g.save();
      if (meHidden) { g.globalAlpha = 0.75; g.shadowColor = '#5dff8f'; g.shadowBlur = 8 * scale / 4; }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(me.x, me.y + 10, 6, 1.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = meHidden ? '#0b1410' : '#ffffff'; rr(me.x - 9, me.y - 9, 18, 18, 4.5); g.fill();
      g.strokeStyle = meHidden ? '#5dff8f' : '#15221b'; g.lineWidth = 0.8; g.stroke();
      g.imageSmoothingEnabled = false;
      g.save(); rr(me.x - 8, me.y - 8, 16, 16, 3.5); g.clip(); g.fillStyle = '#0b1410'; g.fillRect(me.x - 8, me.y - 8, 16, 16); g.drawImage(meSprite, me.x - 8, me.y - 8, 16, 16); g.restore();
      g.imageSmoothingEnabled = true;
      g.restore();
      if (me.carry > 0 && !meHidden) {
        const n = Math.min(4, Math.max(1, Math.round(me.carry / 0.02)));
        for (let i = 0; i < n; i++) { g.fillStyle = '#d99a0b'; g.beginPath(); g.ellipse(me.x, me.y - 12 - i * 1.6, 3, 1.2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffd23f'; g.beginPath(); g.ellipse(me.x, me.y - 12.4 - i * 1.6, 3, 1.1, 0, 0, Math.PI * 2); g.fill(); }
      }
    }
    // particles + floating text
    for (const s of sparks) { g.globalAlpha = Math.max(0, s.life / s.max); g.fillStyle = s.color; g.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size); }
    g.globalAlpha = 1;
    g.font = `800 6.5px ${SANS}`; g.textAlign = 'center'; g.lineJoin = 'round';
    for (const p of pops) { g.globalAlpha = Math.min(1, p.t); g.lineWidth = 2; g.strokeStyle = inPool(p) ? '#0b1410' : '#ffffff'; g.strokeText(p.text, p.x, p.y); g.fillStyle = p.color; g.fillText(p.text, p.x, p.y); }
    g.globalAlpha = 1; g.textAlign = 'left';
    // floating joystick (touch)
    if (joy) {
      const vx = joy.x - joy.ox, vy = joy.y - joy.oy, d = Math.hypot(vx, vy), k = d > 14 ? 14 / d : 1;
      g.fillStyle = 'rgba(21,34,27,0.10)'; g.strokeStyle = 'rgba(21,34,27,0.35)'; g.lineWidth = 0.8;
      g.beginPath(); g.arc(joy.ox, joy.oy, 15, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(18,161,90,0.85)'; g.beginPath(); g.arc(joy.ox + vx * k, joy.oy + vy * k, 6, 0, Math.PI * 2); g.fill();
    }
    if (flash > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgba(229,72,77,${flash * 0.6})`; g.fillRect(0, 0, cv.width, cv.height); }
    hud.innerHTML = `<span>Time <b>${Math.ceil(time)}s</b></span><span class="${me.carry > 0 ? 'exposed' : ''}">Carrying <b>${me.carry.toFixed(2)}</b></span><span class="ok">Private <b>${shielded.toFixed(2)}</b></span><span><b class="hearts">${'♥'.repeat(Math.max(0, lives))}${'♡'.repeat(3 - Math.max(0, lives))}</b></span>`;
  }

  // ---------- loop ----------
  let raf = 0, last = 0, alive = true;
  function frame(now: number) {
    if (!alive) return;
    if (!wrap.isConnected) { cleanup(); return; }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0); last = now;
    if (mode === 'play') step(dt);
    fx(dt);
    draw(now);
    raf = requestAnimationFrame(frame);
  }
  function end(caught: boolean) {
    if (mode !== 'play') return;
    mode = 'over'; keys.clear(); pointer = null; joy = null;
    const isBest = shielded > (state.best ?? 0) && shielded > 0;
    state.best = +Math.max(state.best ?? 0, shielded).toFixed(2); save();
    sfx.fanfare();
    const r: Result = { shielded, doxxed, best: state.best, isBest };
    lastResult = r; lastCaught = caught;
    showOver(r, caught);
    opts.onEnd(r);
  }
  function cleanup() {
    alive = false; cancelAnimationFrame(raf); ro.disconnect();
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    document.removeEventListener('fullscreenchange', onFsChange);
    if (focus) { document.documentElement.classList.remove('game-lock'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  }
  newRound();
  raf = requestAnimationFrame(frame);
  return cleanup;
}
