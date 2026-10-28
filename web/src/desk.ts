// The Auditor's Desk: the Auditor's night, as a puzzle. Last night's ledger is eight shielded
// payments, all noise. You found three viewing keys and don't know whose they are. A key opens
// only payments into or out of its own wallet; an incoming payment never shows who sent it.
// Somewhere in the ledger the Watcher paid his Leaker. Find them before dawn.

import { h, short } from './dom';
import { portrait } from './pixel';
import { BOT_NAMES } from './practice';
import { watcher } from './two';
import { sfx } from './sound';
import { rng } from './engine';
import { earn } from './badges';
import { copy } from './dom';

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const addr = (r: () => number) => 'u1' + Array.from({ length: 58 }, () => B32[Math.floor(r() * 32)]).join('');
/** Opens a payment with a key's owner: incoming hides the sender, outgoing shows the recipient. */
export const opens = (p: Pay, owner: Wallet) => p.from === owner || p.to === owner;
const rnd = () => { const a = crypto.getRandomValues(new Uint32Array(1))[0]; return a / 2 ** 32; };
const shuffleWith = (r: () => number) => <T,>(xs: T[]) => xs.map((x) => [r(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** The daily Desk: one puzzle for everyone each UTC day, numbered from Oct 28 2026 (#1). */
export const dayNumber = (now = Date.now()) => Math.floor((now - Date.UTC(2026, 9, 28)) / 86_400_000) + 1;
export const dailyRng = (day: number) => rng(`ghosttown-desk-${day}`, 'daily');

export interface Wallet { name: string; addr: string }
export interface Pay { id: number; from: Wallet | null; to: Wallet; zec: string; memo: string; watcher?: boolean }

const MEMOS = ['rent, sorry it’s late', 'ajo contribution · week 6', 'lantern oil for the hall', 'happy birthday ghost', 'your half of the suya', 'for the new seat at table 7', 'buy-in, see you tonight', 'thanks for the shield last night'];

/** One night's puzzle: five suspects, three viewing keys (one is the Leaker's), eight payments. */
export function puzzle(rand: () => number = rnd) {
  const shuffle = shuffleWith(rand);
  const names = shuffle(BOT_NAMES).slice(0, 5);
  const suspects: Wallet[] = names.map((name) => ({ name, addr: addr(rand) }));
  const leaker = suspects[Math.floor(rand() * 5)];
  const outsiders: Wallet[] = [{ name: 'Bean There Café', addr: addr(rand) }, { name: 'Oak St Rentals', addr: addr(rand) }];
  const others = suspects.filter((s) => s !== leaker);
  // three keys: the Leaker's own, and two decoys
  const owners = shuffle([leaker, ...shuffle(others).slice(0, 2)]);
  const memos = shuffle(MEMOS);
  const pays: Pay[] = [{ id: 0, from: null, to: leaker, zec: '6.66', memo: 'for services rendered. same again tomorrow night. — W', watcher: true }];
  // seven ordinary payments; every key opens at least two
  const pool = [...suspects, ...outsiders];
  for (let i = 0; i < 7; i++) {
    const owner = owners[i % 3];
    const other = shuffle(pool.filter((w) => w !== owner))[0];
    const out = rand() < 0.5;
    pays.push({ id: i + 1, from: out ? owner : other, to: out ? other : owner, zec: (0.05 + rand() * 1.9).toFixed(2), memo: memos[i] });
  }
  return { suspects, leaker, owners, pays: shuffle(pays) };
}

/** The shareable result of a daily Desk: no spoilers, just the trail. */
export function shareText(day: number, won: boolean, trail: string[]): string {
  const tries = trail.filter((x) => x === '🗝' || x === '⬛').length;
  return `Ghost Town · Auditor’s Desk #${day}\n${won ? `Caught the Watcher’s Leaker in ${tries} ${tries === 1 ? 'try' : 'tries'}` : 'The Watcher got away'}\n${trail.join('')}\nghosttown.nerom.site/#/desk`;
}
interface DailyResult { won: boolean; trail: string[] }
const dailyKey = (day: number) => `gt.desk.daily.${day}`;
const savedDaily = (day: number): DailyResult | null => { try { return JSON.parse(localStorage.getItem(dailyKey(day)) ?? 'null'); } catch { return null; } };

export function deskView(): HTMLElement {
  const day = dayNumber();
  let mode: 'daily' | 'practice' = savedDaily(day) ? 'practice' : 'daily';
  let trail: string[] = [];
  let P = puzzle();
  let key: number | null = null, tries = 0, accusations = 0, over = false;
  const opened = new Map<number, number>(); // payment id -> key index
  const missed = new Map<number, Set<number>>(); // payment id -> keys that opened nothing
  const TRIES = 16;
  const say = h('p', { class: 'dealer-line' });
  const keysRow = h('div', { class: 'keys' });
  const ledger = h('div', { class: 'ledger' });
  const lineup = h('div', { class: 'lineup' });
  const clock = h('div', { class: 'desk-clock' });
  const tabs = h('div', { class: 'desk-tabs' });
  const result = h('div', { class: 'desk-result' });

  const nextIn = () => { const ms = Date.UTC(2026, 9, 28) + day * 86_400_000 - Date.now(); return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`; };
  const showResult = (r: DailyResult) => {
    const text = shareText(day, r.won, r.trail);
    const shareBtn = h('button', { class: 'btn primary', type: 'button', onclick: async (e: Event) => { const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }; if (nav.share) await nav.share({ text }).catch(() => {}); else await copy(text, e.currentTarget as HTMLElement); } }, 'Share');
    result.replaceChildren(h('span', { class: 'kicker' }, `Daily #${day} · ${r.won ? 'solved' : 'the Watcher got away'}`), h('pre', { class: 'share-card' }, text), h('div', { class: 'row' }, shareBtn, h('button', { class: 'btn', type: 'button', onclick: (e: Event) => copy(text, e.currentTarget as HTMLElement) }, 'Copy'), h('span', { class: 'hint' }, `Next Desk in ${nextIn()}.`)));
  };
  const finish = (won: boolean) => {
    if (won) earn('auditor');
    if (mode !== 'daily') return;
    const r = { won, trail };
    try { localStorage.setItem(dailyKey(day), JSON.stringify(r)); } catch { /* fine */ }
    if (won) earn('daily');
    showResult(r);
  };
  const draw = () => {
    tabs.replaceChildren(
      h('button', { class: `desk-tab${mode === 'daily' ? ' on' : ''}`, type: 'button', onclick: () => ((mode = 'daily'), reset()) }, `Daily #${day}`),
      h('button', { class: `desk-tab${mode === 'practice' ? ' on' : ''}`, type: 'button', onclick: () => ((mode = 'practice'), reset()) }, 'Practice'),
    );
    clock.replaceChildren(h('span', {}, 'Key tries before dawn ', h('b', {}, String(TRIES - tries))), h('span', {}, 'Accusations left ', h('b', {}, String(3 - accusations))));
    keysRow.replaceChildren(...P.owners.map((_, i) => h('button', { class: `vkey${key === i ? ' on' : ''}`, type: 'button', disabled: over, onclick: () => ((key = i), draw()) }, h('i', {}, '🗝'), h('span', {}, `Viewing key ${'I'.repeat(i + 1).replace('III', 'III')}`), h('code', {}, `uview1${'x7k3q9m2a4'.slice(i * 3, i * 3 + 4)}…`))));
    ledger.replaceChildren(...P.pays.map((p) => {
      const k = opened.get(p.id);
      if (k === undefined) return h('button', { class: 'pay-sealed', type: 'button', disabled: over || key === null, onclick: () => tryKey(p) }, h('span', { class: 'kicker' }, `Payment ${p.id + 1}`), h('span', { class: 'noise-line' }, Array.from({ length: 3 }, () => Array.from({ length: 22 }, () => '▓▒░█'[Math.floor(rnd() * 4)]).join('')).join('\n')), h('span', { class: 'hint' }, missed.get(p.id)?.size ? `Not key ${[...missed.get(p.id)!].map((k) => 'I'.repeat(k + 1)).join(', ')}` : key === null ? 'Pick a key first' : 'Try the key'));
      const owner = P.owners[k];
      const incoming = p.to === owner;
      return h('div', { class: `pay-open${p.watcher ? ' watcher' : ''}` },
        h('span', { class: 'kicker' }, `Payment ${p.id + 1} · opened with key ${'I'.repeat(k + 1)} · ${incoming ? 'incoming' : 'outgoing'}`),
        h('p', {}, incoming ? 'Received by ' : 'Sent to ', h('code', {}, short(incoming ? owner.addr : p.to.addr, 10, 6)), ` · ${p.zec} ZEC`),
        h('p', { class: 'memo-line' }, `“${p.memo}”`),
        h('p', { class: 'hint' }, incoming ? 'Sender: hidden. An incoming shielded note never says who sent it.' : `Key ${'I'.repeat(k + 1)} sent this, so it is ${short(owner.addr, 10, 6)}'s wallet.`));
    }));
    lineup.replaceChildren(...P.suspects.map((s) => h('button', { class: 'suspect', type: 'button', disabled: over, onclick: () => accuse(s) }, portrait(`desk:${s.name}`), h('b', {}, s.name), h('code', {}, short(s.addr, 8, 6)))));
  };

  function tryKey(p: Pay) {
    if (key === null || over) return;
    tries++;
    const owner = P.owners[key];
    if (opens(p, owner)) {
      opened.set(p.id, key);
      trail.push('🗝');
      if (p.watcher) sfx.dox(); else sfx.ding();
      say.innerHTML = p.watcher ? 'That’s <b>mine</b>. Six-six-six for a job well done. Now: whose wallet received it?' : 'Ordinary ghost business. Keep looking.';
    } else {
      if (!missed.has(p.id)) missed.set(p.id, new Set());
      missed.get(p.id)!.add(key);
      trail.push('⬛');
      sfx.buzz();
      say.innerHTML = 'That key opens <b>nothing</b> in this payment. Viewing keys only see their own wallet.';
    }
    if (tries >= TRIES && !over) { over = true; say.innerHTML = `Dawn. You ran out of time. My Leaker was <b>${P.leaker.name}</b>.`; finish(false); }
    draw();
  }
  function accuse(s: Wallet) {
    if (over) return;
    accusations++;
    trail.push(s === P.leaker ? '👻' : '❌');
    if (s === P.leaker) { sfx.fanfare(); over = true; say.innerHTML = `…<b>${s.name}</b>. You traced my payment to their address. Well audited.`; finish(true); }
    else if (accusations >= 3) { sfx.lose(); over = true; say.innerHTML = `Three wrong accusations. The town stops trusting the Auditor. It was <b>${P.leaker.name}</b>.`; finish(false); }
    else { sfx.buzz(); say.innerHTML = `${s.name} is just a citizen. You’re guessing, Auditor.`; }
    draw();
  }
  const reset = () => {
    P = mode === 'daily' ? puzzle(dailyRng(day)) : puzzle();
    key = null; tries = 0; accusations = 0; over = false; trail = []; opened.clear(); missed.clear(); result.replaceChildren();
    const done = mode === 'daily' ? savedDaily(day) : null;
    if (done) { over = true; showResult(done); say.innerHTML = done.won ? 'You already caught me tonight. Come back tomorrow.' : 'You had your night. Tomorrow I pay someone else.'; }
    else say.innerHTML = mode === 'daily' ? `Daily Desk #${day}: the same night for every Auditor. One try. Eight sealed payments, three keys.` : 'I paid one of these ghosts last night. Eight sealed payments. Three keys. Good luck.';
    draw();
  };
  reset();

  return h(
    'section',
    { class: 'desk' },
    h('p', { class: 'eyebrow' }, "The Auditor's Desk · a viewing-key puzzle"),
    h('h1', {}, 'Who is the Watcher paying?'),
    tabs,
    h('div', { class: 'dealer' }, watcher('read', 4), say),
    result,
    h('div', { class: 'desk-grid' },
      h('div', {}, h('span', { class: 'kicker' }, '1 · Pick a viewing key you found'), keysRow, h('span', { class: 'kicker' }, '2 · Try it on last night’s payments'), ledger),
      h('aside', {}, clock, h('span', { class: 'kicker' }, '3 · Accuse the address the Watcher paid'), lineup, h('button', { class: 'btn', type: 'button', onclick: () => ((mode = 'practice'), reset()) }, 'New practice night'),
        h('details', { class: 'fine-print' }, h('summary', {}, 'The real Zcash rule'), h('p', { class: 'muted' }, 'A viewing key reveals every payment into or out of one wallet, and nothing else. Incoming shielded notes carry the amount and memo but never the sender, so even with a key you can’t see who paid a wallet. That is why the Auditor in Ghost Town checks one ghost at a time.')))),
  );
}
