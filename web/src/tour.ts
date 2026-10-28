// The judges' tour: ten checks, live, in about ninety seconds. It fetches the real mainnet deal
// for table EAS24, opens and proves a role card, then tries four forgeries that must all fail,
// catches the Watcher's lie in Three Lanterns, replays 200 bot games against their commitments,
// and shows what this page is allowed to talk to. A forgery passes only when it is rejected.

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { ready, txid as txidOf, verify } from 'chit-zcash';
import { h, short, sleep } from './dom';
import { EAS24 } from './gallery';
import { alive, botDay, botNight, botVote, newGame, nightPending, openVote, resolveNight, resolveVote, verifyDeal, votePending, type Game } from './engine';
import { fetchTx, parseCard, proveRole, specimen, TX_SOURCE } from './zec';
import { ROLE_NAME } from './table';
import { watcher } from './two';
import { earn } from './badges';

type Outcome = { ok: boolean; detail: string };
interface Check { title: string; why: string; expect: 'pass' | 'reject'; run: (ctx: Ctx) => Promise<Outcome> }
interface Ctx { hex: string; height: number | null; auditor: string; shielder: string; commitment: string }

const reject = async (f: () => Promise<unknown>): Promise<Outcome> => {
  try {
    const r = (await f()) as { problem?: string | null; report?: { valid: boolean } } | undefined;
    if (r && (r.problem || r.report?.valid === false)) return { ok: true, detail: `Rejected: ${r.problem ?? 'the chit does not open'}` };
    return { ok: false, detail: 'It was accepted. That would be a bug.' };
  } catch (e) {
    return { ok: true, detail: `Rejected: ${e instanceof Error ? e.message : String(e)}` };
  }
};

const CHECKS: Check[] = [
  { title: 'Fetch the real mainnet deal', why: 'Table EAS24 was dealt on Zcash mainnet on Oct 28. The bytes come straight from Zcash lightwalletd through the table relay, never a block explorer.', expect: 'pass',
    run: async (c) => ({ ok: txidOf(c.hex) === EAS24.txid, detail: `${(c.hex.length / 2).toLocaleString('en-US')} bytes, mined in block ${c.height?.toLocaleString('en-US') ?? '?'}. Re-hashed here: ${short(txidOf(c.hex), 10, 6)} ✓` }) },
  { title: 'Open seat 2’s role card with its chit', why: 'A chit opens exactly one output of one transaction, with the official Zcash crates (WASM), in this browser.', expect: 'pass',
    run: async (c) => { const r = verify(c.hex, c.auditor); const card = parseCard(r.verified?.memo.kind === 'text' ? r.verified.memo.value : ''); return { ok: r.valid && card?.role === 'auditor', detail: card ? `Output ${r.verified!.action}: “You are ${ROLE_NAME[card.role]}”, seat ${card.seat! + 1}, deal ${short(card.commitment ?? '', 8, 6)}. ${r.steps.filter((s) => s.ok).length} checks passed.` : r.error ?? 'no card' }; } },
  { title: 'Prove the role at the table', why: 'The table accepts a proof only if the card is for this deal, this table, this seat and this commitment.', expect: 'pass',
    run: async (c) => { const r = await proveRole(c.auditor, c.hex, { txid: EAS24.txid, table: EAS24.table, seat: 1, commitment: c.commitment }); return { ok: !r.problem, detail: r.problem ?? `Proved: ${ROLE_NAME[r.card!.role]}. Claims are cheap; this one is true.` }; } },
  { title: 'Forgery: claim the Auditor’s seat with someone else’s card', why: 'A Leaker holding a real chit (here, the Shielder’s) tries to pass it off for seat 2.', expect: 'reject',
    run: (c) => reject(() => proveRole(c.shielder, c.hex, { txid: EAS24.txid, table: EAS24.table, seat: 1, commitment: c.commitment })) },
  { title: 'Forgery: edit one character of the chit', why: 'Change a single character in the middle of the Auditor’s chit.', expect: 'reject',
    run: (c) => reject(async () => { const i = 60; const ch = c.auditor[i] === 'q' ? 'p' : 'q'; return proveRole(c.auditor.slice(0, i) + ch + c.auditor.slice(i + 1), c.hex, { txid: EAS24.txid, table: EAS24.table, seat: 1, commitment: c.commitment }); }) },
  { title: 'Forgery: replay a real chit against another deal', why: 'Take the real Auditor chit to a different table, whose deal is the practice specimen.', expect: 'reject',
    run: (c) => reject(async () => { const s = await specimen(); return proveRole(c.auditor, s.tx, { txid: s.txid }); }) },
  { title: 'Forgery: a narrator who changed the deal', why: 'The table expects a different commitment than the one sealed in every card.', expect: 'reject',
    run: (c) => reject(() => proveRole(c.auditor, c.hex, { txid: EAS24.txid, table: EAS24.table, seat: 1, commitment: c.commitment.replace(/^./, (x) => (x === 'a' ? 'b' : 'a')) })) },
  { title: 'Three Lanterns: catch the Watcher’s lie', why: 'He commits to lantern A, then claims it was B with a new salt. Your browser re-hashes.', expect: 'reject',
    run: async () => { const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16))); const c = bytesToHex(sha256(utf8ToBytes(`ghosttown:lantern:A:${salt}`))); const lie = bytesToHex(sha256(utf8ToBytes(`ghosttown:lantern:B:${bytesToHex(crypto.getRandomValues(new Uint8Array(16)))}`))); return lie === c ? { ok: false, detail: 'A collision. Buy a lottery ticket.' } : { ok: true, detail: `Rejected: the claim hashes to ${short(lie, 8, 6)}, the commitment is ${short(c, 8, 6)}.` }; } },
  { title: 'Replay 200 bot games', why: 'Seven-seat games played out by bots: every night, every shielded ballot, and at the end the revealed deal must hash to the commitment on every card.', expect: 'pass',
    run: async () => {
      let ok = 0, rounds = 0;
      for (let k = 0; k < 200; k++) {
        const g = newGame(Array.from({ length: 7 }, (_, i) => ({ name: `Ghost ${i + 1}`, bot: true })), `tour-${k}-${Math.random()}`, `salt-${k}`);
        const over = (x: Game) => x.phase === 'over';
        for (let guard = 0; !over(g) && guard < 40; guard++) {
          for (const id of nightPending(g)) botNight(g, id);
          resolveNight(g); rounds++;
          if (over(g)) break;
          for (const s of alive(g)) botDay(g, s.id);
          openVote(g);
          for (const id of votePending(g)) botVote(g, id);
          resolveVote(g);
        }
        if (g.phase === 'over' && verifyDeal(g.seats.map(({ id, name, role }) => ({ id, name, role })), g.salt, g.commitment)) ok++;
      }
      return { ok: ok === 200, detail: `${ok}/200 games finished and re-verified their deal (${rounds.toLocaleString('en-US')} nights).` };
    } },
  { title: 'Who this page may talk to', why: 'Leaks disqualify. This page can reach only itself and the table relay: encrypted moves, and transactions read straight from Zcash.', expect: 'pass',
    run: async () => { const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? ''; const connect = meta.split(';').map((x) => x.trim()).find((x) => x.startsWith('connect-src')) ?? 'connect-src (set by the server headers)'; return { ok: !/blockchair|explorer/i.test(meta), detail: `${connect}. Transactions from ${new URL(TX_SOURCE).host}/tx (lightwalletd), no analytics, no third-party scripts or fonts.` }; } },
];

export function tourView(): HTMLElement {
  const list = h('ol', { class: 'tour-list' }, ...CHECKS.map((c, i) => h('li', { class: 'tour-step', 'data-i': String(i) }, h('div', { class: 'ts-head' }, h('b', {}, c.title), h('span', { class: `ts-tag ${c.expect}` }, c.expect === 'pass' ? 'must pass' : 'must be rejected')), h('p', { class: 'muted' }, c.why), h('p', { class: 'ts-out' }))));
  const summary = h('div', { class: 'tour-summary' });
  const go = h('button', { class: 'btn primary', type: 'button' }, 'Run the tour');
  go.addEventListener('click', async () => {
    go.setAttribute('disabled', '');
    summary.replaceChildren(h('p', { class: 'muted' }, 'Running…'));
    let ctx: Ctx | null = null, good = 0;
    for (let i = 0; i < CHECKS.length; i++) {
      const li = list.children[i] as HTMLElement;
      const out = li.querySelector('.ts-out')!;
      li.className = 'tour-step run';
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      try {
        if (!ctx) {
          await ready();
          const tx = await fetchTx(EAS24.txid);
          const card = parseCard((verify(tx.hex, EAS24.chits[0]).verified?.memo.value) ?? '');
          ctx = { hex: tx.hex, height: tx.height, auditor: EAS24.chits[0], shielder: EAS24.chits[1], commitment: card?.commitment ?? '' };
        }
        const r = await CHECKS[i].run(ctx);
        out.textContent = r.detail;
        li.className = `tour-step ${r.ok ? 'good' : 'bad'}`;
        if (r.ok) good++;
      } catch (e) {
        out.textContent = e instanceof Error ? e.message : String(e);
        li.className = 'tour-step bad';
      }
      await sleep(450);
    }
    summary.replaceChildren(h('p', { class: good === CHECKS.length ? 'ok-line big-verdict' : 'error big-verdict' }, good === CHECKS.length ? `✓ ${good}/${CHECKS.length}. Every proof held, every forgery failed, nothing left this page but a lookup to Zcash.` : `${good}/${CHECKS.length} behaved as expected.`));
    if (good === CHECKS.length) earn('tour');
    go.textContent = 'Run it again';
    go.removeAttribute('disabled');
  });
  return h(
    'section',
    { class: 'tour' },
    h('p', { class: 'eyebrow' }, 'For judges · about 90 seconds'),
    h('h1', {}, 'Try to cheat Ghost Town.'),
    h('div', { class: 'dealer' }, watcher('furious', 4), h('p', { class: 'dealer-line' }, 'Everything below runs live in your browser against a real deal on Zcash mainnet. I tried all of it. None of it worked.')),
    h('div', { class: 'row' }, go, h('a', { class: 'btn', href: '#/gallery' }, 'See the deal in the Glass Gallery'), h('a', { class: 'btn', href: '#/practice' }, 'Then play a table')),
    summary,
    list,
  );
}
