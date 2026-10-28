import { describe, expect, it } from 'vitest';
import { act, alive, crackShield, viewFor, checkWin, seat, botDay, botNight, botVote, commit, newGame, nightPending, openVote, resolveNight, resolveVote, rolesFor, verifyDeal, vote, votePending, winners, type Game } from './engine';

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

describe('table sizes', () => {
  it.each([5, 6, 7, 8, 9, 10])('%i seats get a fair cast', (n) => {
    const roles = rolesFor(n);
    expect(roles).toHaveLength(n);
    expect(roles.filter((r) => r === 'auditor')).toHaveLength(1);
    expect(roles.filter((r) => r === 'shielder')).toHaveLength(1);
    expect(roles.filter((r) => r === 'leaker').length).toBe(n >= 7 ? 2 : 1);
  });
});

describe('what each seat may know', () => {
  it('a citizen sees only their own role until the end', () => {
    const g = newGame(table(7), 'views', 's');
    const me = g.seats.find((s) => s.role === 'citizen')!;
    const v = viewFor(g, me.id);
    expect(v.seats.filter((s) => s.role !== null).map((s) => s.id)).toEqual([me.id]);
    expect(v.salt).toBeNull();
    expect(v.audits).toEqual([]);
  });
  it('Leakers see each other, and nobody else', () => {
    const g = newGame(table(7), 'leak-view', 's');
    const [l1, l2] = g.seats.filter((s) => s.role === 'leaker');
    const known = viewFor(g, l1.id).seats.filter((s) => s.role !== null).map((s) => s.id).sort();
    expect(known).toEqual([l1.id, l2.id].sort());
  });
  it("only the Auditor reads the Auditor's notebook", () => {
    const g = newGame(table(5), 'notebook', 's');
    const auditor = g.seats.find((s) => s.role === 'auditor')!;
    const leaker = g.seats.find((s) => s.role === 'leaker')!;
    for (const id of nightPending(g)) botNight(g, id);
    resolveNight(g);
    expect(seat(g, auditor.id).role).toBe('auditor');
    expect(viewFor(g, auditor.id).audits).toHaveLength(1);
    expect(viewFor(g, leaker.id).audits).toEqual([]);
  });
  it('the salt is revealed only when the game is over', () => {
    const g = playOut(newGame(table(6), 'salt-reveal', 'the salt'));
    expect(viewFor(g, 0).salt).toBe('the salt');
  });
});

describe('Dark Pool shields', () => {
  it('only a living Shielder can crack a shield, and only at night', () => {
    const g = newGame(table(5), 'crack-rules', 's');
    const citizen = g.seats.find((s) => s.role === 'citizen')!;
    const shielder = g.seats.find((s) => s.role === 'shielder')!;
    expect(() => crackShield(g, citizen.id)).toThrow();
    g.phase = 'day';
    expect(() => crackShield(g, shielder.id)).toThrow();
  });
  it('a held shield is logged, a cracked one is not', () => {
    const g = newGame(table(5), 'held-vs-cracked', 's');
    const leaker = g.seats.find((s) => s.role === 'leaker')!;
    const shielder = g.seats.find((s) => s.role === 'shielder')!;
    const victim = g.seats.find((s) => s.role === 'citizen')!;
    act(g, leaker.id, victim.id);
    crackShield(g, shielder.id);
    for (const id of nightPending(g)) botNight(g, id);
    resolveNight(g);
    expect(g.log.some((e) => e.kind === 'held')).toBe(false);
  });
});

describe('endings', () => {
  it('the town wins when every Leaker is exposed', () => {
    const g = newGame(table(5), 'town-wins', 's');
    for (const s of g.seats) if (s.role === 'leaker') s.alive = false;
    expect(checkWin(g)).toBe(true);
    expect(g.winner).toBe('town');
  });
  it('the Leakers win when they equal everyone else alive', () => {
    const g = newGame(table(5), 'leak-wins', 's');
    const others = g.seats.filter((s) => s.role !== 'leaker');
    for (const s of others.slice(0, 3)) s.alive = false;
    expect(checkWin(g)).toBe(true);
    expect(g.winner).toBe('leak');
  });
  it('a commitment changes with the salt, so nobody can guess the deal from it', () => {
    const g = newGame(table(7), 'salted', 'one');
    expect(commit(g.seats, 'one')).not.toBe(commit(g.seats, 'two'));
  });
});
