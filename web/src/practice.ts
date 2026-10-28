// The practice table: one human, the rest bots, the whole engine in this tab. No ZEC moves;
// proofs of role run against the specimen deal, a real proven transaction that is not on chain.

import { claim, crackShield, newGame, prove, say, seat, viewFor, vote as castVote, act as nightAct, type Role } from './engine';
import { createRunner } from './runner';
import { proveRole, specimen, type ProofResult } from './zec';
import type { Controller } from './table';

export const BOT_NAMES = ['Moth', 'Cipher', 'Raven', 'Lantern', 'Heron', 'Static', 'Wren', 'Comet', 'Vandal', 'Pilgrim', 'Sphinx', 'Kestrel'];
export const randomHex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function practiceTable(name: string, size: number): Controller {
  const seed = randomHex(16);
  const pool = BOT_NAMES.filter((n) => n.toLowerCase() !== name.toLowerCase()).sort(() => Math.random() - 0.5);
  const g = newGame([{ name, bot: false }, ...pool.slice(0, size - 1).map((n) => ({ name: n, bot: true }))], seed, randomHex(16));
  const me = 0;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  const run = createRunner(g, () => [me], emit);

  return {
    table: `P${seed.slice(0, 4).toUpperCase()}`,
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
      run.tick();
    },
    crack() {
      crackShield(g, me);
      run.tick();
    },
    vote(target) {
      castVote(g, me, target);
      run.tick();
    },
    say(text) {
      say(g, me, text);
      emit();
    },
    claim(role: Role, checked) {
      claim(g, me, role, checked);
      emit();
    },
    callVote: run.callVote,
    async cardChit() {
      return (await specimen()).cards[seat(g, me).role];
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
    reveal: () => (g.phase === 'over' ? { seats: g.seats.map(({ id, name, role }) => ({ id, name, role })), salt: g.salt, commitment: g.commitment } : null),
    leave: run.stop,
  };
}
