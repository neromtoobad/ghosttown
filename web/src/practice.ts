// The practice table: one human, the rest bots, the whole engine in this tab. No ZEC moves;
// proofs of role run against the specimen deal, a real proven transaction that is not on chain.

import { alive, botDay, botNight, botVote, claim, newGame, nightPending, openVote, prove, resolveNight, resolveVote, say, seat, viewFor, vote as castVote, act as nightAct, votePending, type Game, type Role } from './engine';
import { proveRole, specimen, type ProofResult } from './zec';
import type { Controller } from './table';

const BOT_NAMES = ['Moth', 'Cipher', 'Raven', 'Lantern', 'Heron', 'Static', 'Wren', 'Comet', 'Vandal', 'Pilgrim', 'Sphinx', 'Kestrel'];

const randomHex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function practiceTable(name: string, size: number): Controller {
  const seed = randomHex(16);
  const pool = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const players = [{ name, bot: false }, ...pool.slice(0, size - 1).map((n) => ({ name: n, bot: true }))];
  const g: Game = newGame(players, seed, randomHex(16));
  const me = 0;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  let busy = false;
  const code = `P${seed.slice(0, 4).toUpperCase()}`;

  const later = (ms: number, f: () => void) => setTimeout(() => (f(), emit()), ms);

  /** Runs the bots' side of the current phase, then resolves when everyone is in. */
  function tick() {
    if (busy || g.phase === 'over') return;
    if (g.phase === 'night') {
      for (const id of nightPending(g)) if (seat(g, id).bot) botNight(g, id);
      if (nightPending(g).length === 0) {
        busy = true;
        later(1600, () => {
          resolveNight(g);
          busy = false;
          if (g.phase === 'day') dayTalk();
        });
      }
    } else if (g.phase === 'vote') {
      for (const id of votePending(g)) if (seat(g, id).bot) botVote(g, id);
      if (votePending(g).length === 0) {
        busy = true;
        later(1400, () => {
          resolveVote(g);
          busy = false;
          tick();
        });
      }
    }
    emit();
  }

  /** Bots talk one at a time, so the day reads like a conversation. */
  function dayTalk() {
    const talkers = alive(g).filter((s) => s.bot).sort(() => Math.random() - 0.5);
    const round = g.round;
    talkers.forEach((s, i) => later(900 + i * 1500, () => g.phase === 'day' && g.round === round && seat(g, s.id).alive && botDay(g, s.id)));
    // A dead or silent human should not stall the table.
    if (!seat(g, me).alive) later(900 + talkers.length * 1500 + 1200, () => callVote());
  }

  function callVote() {
    if (g.phase !== 'day') return;
    openVote(g);
    tick();
  }

  // A dead human, or one with no night action, still sleeps through the night.
  setTimeout(tick, 400);

  return {
    table: code,
    practice: true,
    canCallVote: true,
    staked: null,
    view: () => viewFor(g, me),
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
    act(target) {
      nightAct(g, me, target);
      tick();
    },
    vote(target) {
      castVote(g, me, target);
      tick();
    },
    say(text) {
      say(g, me, text);
      emit();
    },
    claim(role: Role, checked) {
      claim(g, me, role, checked);
      emit();
    },
    callVote,
    async cardChit() {
      const s = await specimen();
      return s.cards[seat(g, me).role];
    },
    async prove(chit: string): Promise<ProofResult> {
      const s = await specimen();
      const result = await proveRole(chit, s.tx, { txid: s.txid });
      if (!result.problem && result.card?.role !== seat(g, me).role) result.problem = 'That card is for a different role than yours.';
      if (!result.problem && !seat(g, me).proven) {
        prove(g, me);
        emit();
      }
      return result;
    },
    /** Practice only: the whole deal, for the reveal screen. */
    reveal: () => ({ seats: g.seats.map(({ id, name, role }) => ({ id, name, role })), salt: g.salt, commitment: g.commitment }),
    tickAfterNight: tick,
  };
}
