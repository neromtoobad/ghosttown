// The Auditor's Desk: the Auditor's night, as a puzzle. Last night's ledger is eight shielded
// payments, all noise. You found three viewing keys and don't know whose they are. A key opens
// only payments into or out of its own wallet; an incoming payment never shows who sent it.
// Somewhere in the ledger the Watcher paid his Leaker. Find them before dawn.

import { h, short } from './dom';
import { portrait } from './pixel';
import { BOT_NAMES } from './practice';
import { watcher } from './two';

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const addr = (r: () => number) => 'u1' + Array.from({ length: 58 }, () => B32[Math.floor(r() * 32)]).join('');
/** Opens a payment with a key's owner: incoming hides the sender, outgoing shows the recipient. */
export const opens = (p: Pay, owner: Wallet) => p.from === owner || p.to === owner;
const rand = () => { const a = crypto.getRandomValues(new Uint32Array(1))[0]; return a / 2 ** 32; };
const shuffle = <T,>(xs: T[]) => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

export interface Wallet { name: string; addr: string }
export interface Pay { id: number; from: Wallet | null; to: Wallet; zec: string; memo: string; watcher?: boolean }

const MEMOS = ['rent, sorry it’s late', 'ajo contribution · week 6', 'lantern oil for the hall', 'happy birthday ghost', 'your half of the suya', 'for the new seat at table 7', 'buy-in, see you tonight', 'thanks for the shield last night'];

/** One night's puzzle: five suspects, three viewing keys (one is the Leaker's), eight payments. */
export function puzzle() {
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

export function deskView(): HTMLElement {
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

  const draw = () => {
    clock.replaceChildren(h('span', {}, 'Key tries before dawn ', h('b', {}, String(TRIES - tries))), h('span', {}, 'Accusations left ', h('b', {}, String(3 - accusations))));
    keysRow.replaceChildren(...P.owners.map((_, i) => h('button', { class: `vkey${key === i ? ' on' : ''}`, type: 'button', disabled: over, onclick: () => ((key = i), draw()) }, h('i', {}, '🗝'), h('span', {}, `Viewing key ${'I'.repeat(i + 1).replace('III', 'III')}`), h('code', {}, `uview1${'x7k3q9m2a4'.slice(i * 3, i * 3 + 4)}…`))));
    ledger.replaceChildren(...P.pays.map((p) => {
      const k = opened.get(p.id);
      if (k === undefined) return h('button', { class: 'pay-sealed', type: 'button', disabled: over || key === null, onclick: () => tryKey(p) }, h('span', { class: 'kicker' }, `Payment ${p.id + 1}`), h('span', { class: 'noise-line' }, Array.from({ length: 3 }, () => Array.from({ length: 22 }, () => '▓▒░█'[Math.floor(rand() * 4)]).join('')).join('\n')), h('span', { class: 'hint' }, missed.get(p.id)?.size ? `Not key ${[...missed.get(p.id)!].map((k) => 'I'.repeat(k + 1)).join(', ')}` : key === null ? 'Pick a key first' : 'Try the key'));
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
      say.innerHTML = p.watcher ? 'That’s <b>mine</b>. Six-six-six for a job well done. Now: whose wallet received it?' : 'Ordinary ghost business. Keep looking.';
    } else {
      if (!missed.has(p.id)) missed.set(p.id, new Set());
      missed.get(p.id)!.add(key);
      say.innerHTML = 'That key opens <b>nothing</b> in this payment. Viewing keys only see their own wallet.';
    }
    if (tries >= TRIES && !over) { over = true; say.innerHTML = `Dawn. You ran out of time. My Leaker was <b>${P.leaker.name}</b>.`; }
    draw();
  }
  function accuse(s: Wallet) {
    if (over) return;
    accusations++;
    if (s === P.leaker) { over = true; say.innerHTML = `…<b>${s.name}</b>. You traced my payment to their address. Well audited.`; }
    else if (accusations >= 3) { over = true; say.innerHTML = `Three wrong accusations. The town stops trusting the Auditor. It was <b>${P.leaker.name}</b>.`; }
    else say.innerHTML = `${s.name} is just a citizen. You’re guessing, Auditor.`;
    draw();
  }
  const reset = () => { P = puzzle(); key = null; tries = 0; accusations = 0; over = false; opened.clear(); missed.clear(); say.innerHTML = 'I paid one of these ghosts last night. Eight sealed payments. Three keys. Good luck.'; draw(); };
  reset();

  return h(
    'section',
    { class: 'desk' },
    h('p', { class: 'eyebrow' }, "The Auditor's Desk · a viewing-key puzzle"),
    h('h1', {}, 'Who is the Watcher paying?'),
    h('div', { class: 'dealer' }, watcher('read', 4), say),
    h('div', { class: 'desk-grid' },
      h('div', {}, h('span', { class: 'kicker' }, '1 · Pick a viewing key you found'), keysRow, h('span', { class: 'kicker' }, '2 · Try it on last night’s payments'), ledger),
      h('aside', {}, clock, h('span', { class: 'kicker' }, '3 · Accuse the address the Watcher paid'), lineup, h('button', { class: 'btn', type: 'button', onclick: reset }, 'New night'),
        h('details', { class: 'fine-print' }, h('summary', {}, 'The real Zcash rule'), h('p', { class: 'muted' }, 'A viewing key reveals every payment into or out of one wallet, and nothing else. Incoming shielded notes carry the amount and memo but never the sender, so even with a key you can’t see who paid a wallet. That is why the Auditor in Ghost Town checks one ghost at a time.')))),
  );
}
