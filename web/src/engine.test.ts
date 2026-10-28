import { describe, expect, it } from 'vitest';
import { act, alive, crackShield, botDay, botNight, botVote, commit, newGame, nightPending, openVote, resolveNight, resolveVote, rolesFor, verifyDeal, vote, votePending, winners, type Game } from './engine';

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Ghost ${i + 1}`, bot: true }));

function playOut(g: Game) {
  for (let guard = 0; g.phase !== 'over' && guard < 40; guard++) {
    for (const id of nightPending(g)) botNight(g, id);
    resolveNight(g);
    if (g.phase === 'over') break;
    for (const s of alive(g)) botDay(g, s.id);
    openVote(g);
    for (const id of votePending(g)) botVote(g, id);
    resolveVote(g);
  }
  return g;
}

describe('the deal', () => {
  it('seats the right roles', () => {
    expect(rolesFor(5).sort()).toEqual(['auditor', 'citizen', 'citizen', 'leaker', 'shielder']);
    expect(rolesFor(7).filter((r) => r === 'leaker')).toHaveLength(2);
    expect(rolesFor(7)).toContain('glitch');
    expect(() => rolesFor(4)).toThrow();
  });

  it('is fixed by the seed and bound by the commitment', () => {
    const a = newGame(table(7), 'seed-1', 'salt');
    const b = newGame(table(7), 'seed-1', 'salt');
    expect(a.seats.map((s) => s.role)).toEqual(b.seats.map((s) => s.role));
    expect(verifyDeal(a.seats, 'salt', a.commitment)).toBe(true);
    const swapped = a.seats.map((s) => ({ ...s }));
    [swapped[0].role, swapped[1].role] = [swapped[1].role, swapped[0].role];
    if (swapped[0].role !== swapped[1].role) expect(verifyDeal(swapped, 'salt', a.commitment)).toBe(false);
    expect(verifyDeal(a.seats, 'other salt', a.commitment)).toBe(false);
    expect(commit(a.seats, 'salt')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('a night', () => {
  it('a shield stops the dox', () => {
    const g = newGame(table(5), 'shield-test', 's');
    const leaker = g.seats.find((s) => s.role === 'leaker')!;
    const shielder = g.seats.find((s) => s.role === 'shielder')!;
    const auditor = g.seats.find((s) => s.role === 'auditor')!;
    act(g, leaker.id, auditor.id);
    act(g, shielder.id, auditor.id);
    act(g, auditor.id, leaker.id);
    resolveNight(g);
    expect(g.seats[auditor.id].alive).toBe(true);
    expect(g.log.some((e) => e.kind === 'held')).toBe(true);
    expect(g.audits[0]).toMatchObject({ seat: leaker.id, leaker: true });
  });

  it('refuses illegal targets', () => {
    const g = newGame(table(7), 'illegal', 's');
    const [l1, l2] = g.seats.filter((s) => s.role === 'leaker');
    expect(() => act(g, l1.id, l2.id)).toThrow();
  });
});

describe('the shielded ballot', () => {
  it('publishes only totals, and ties expose nobody', () => {
    const g = newGame(table(5), 'ballot', 's');
    g.phase = 'vote';
    const [a, b, c, d, e] = g.seats.map((s) => s.id);
    vote(g, a, b); vote(g, b, a); vote(g, c, 'skip'); vote(g, d, 'skip'); vote(g, e, b);
    resolveVote(g);
    const tally = g.log.find((x) => x.kind === 'tally')!;
    expect(tally).toMatchObject({ exposed: null });
    expect(JSON.stringify(tally)).not.toContain('"voter"');
  });
});

describe('full games between bots', () => {
  it('always end, with a winner and a valid deal', () => {
    const wins = { town: 0, leak: 0 };
    for (let i = 0; i < 1500; i++) {
      const n = 5 + (i % 6);
      const g = playOut(newGame(table(n), `game-${i}`, `salt-${i}`));
      expect(g.phase).toBe('over');
      expect(g.winner).not.toBeNull();
      expect(verifyDeal(g.seats, g.salt, g.commitment)).toBe(true);
      expect(winners(g).length).toBeGreaterThan(0);
      wins[g.winner as 'town' | 'leak']++;
    }
    // Neither side should win almost every game: the bots make it a contest.
    expect(wins.town).toBeGreaterThan(300);
    expect(wins.leak).toBeGreaterThan(300);
  });
});

describe('Dark Pool', () => {
  it('a cracked shield protects nobody, and the night still ends', () => {
    const g = newGame(table(5), 'crack-seed', 'salt');
    const shielder = g.seats.find((s) => s.role === 'shielder')!;
    const leaker = g.seats.find((s) => s.role === 'leaker')!;
    const victim = g.seats.find((s) => s.role !== 'leaker' && s.id !== shielder.id)!;
    act(g, leaker.id, victim.id);
    crackShield(g, shielder.id);
    for (const id of nightPending(g)) botNight(g, id);
    expect(nightPending(g)).toEqual([]);
    resolveNight(g);
    expect(g.seats[victim.id].alive).toBe(false);
    expect(g.lastShield).toBe(-1);
  });
});
