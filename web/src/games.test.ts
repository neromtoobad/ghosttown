// The hub's mini-games: Three Lanterns' commitment, and the Auditor's Desk puzzles.
import { describe, expect, it } from 'vitest';
import { commit } from './lanterns';
import { dailyRng, dayNumber, opens, puzzle, shareText } from './desk';
import { DOORS } from './hub';

describe('Three Lanterns', () => {
  it('commits to one lantern with a salt, as 64 hex characters', () => {
    expect(commit(0, 'salt')).toMatch(/^[0-9a-f]{64}$/);
    expect(commit(0, 'salt')).toBe(commit(0, 'salt'));
  });
  it('a different lantern never matches the commitment', () => {
    for (const salt of ['a', 'b', 'c', 'd']) for (const x of [0, 1, 2]) for (const y of [0, 1, 2]) if (x !== y) expect(commit(x, salt)).not.toBe(commit(y, salt));
  });
  it('a lie with a fresh salt never matches either', () => {
    const c = commit(0, 'the real salt');
    for (let i = 0; i < 200; i++) expect(commit(1 + (i % 2), `forged ${i}`)).not.toBe(c);
  });
});

describe("the Auditor's Desk", () => {
  const nights = Array.from({ length: 300 }, () => puzzle());
  it('deals five suspects, three keys and eight payments', () => {
    for (const p of nights) {
      expect(p.suspects).toHaveLength(5);
      expect(p.owners).toHaveLength(3);
      expect(p.pays).toHaveLength(8);
      expect(new Set(p.suspects.map((s) => s.addr)).size).toBe(5);
    }
  });
  it('has exactly one Watcher payment, to the Leaker, from nobody you can see', () => {
    for (const p of nights) {
      const w = p.pays.filter((x) => x.watcher);
      expect(w).toHaveLength(1);
      expect(w[0].to).toBe(p.leaker);
      expect(w[0].from).toBeNull();
    }
  });
  it('is always solvable: one of your keys is the Leaker’s, and only it opens his payment', () => {
    for (const p of nights) {
      const w = p.pays.find((x) => x.watcher)!;
      expect(p.owners).toContain(p.leaker);
      expect(p.owners.filter((o) => opens(w, o))).toEqual([p.leaker]);
    }
  });
  it('every key opens at least two payments, and every payment opens with some key', () => {
    for (const p of nights) {
      for (const o of p.owners) expect(p.pays.filter((x) => opens(x, o)).length).toBeGreaterThanOrEqual(2);
      for (const x of p.pays) expect(p.owners.some((o) => opens(x, o))).toBe(true);
    }
  });
});

describe('the daily Desk', () => {
  const key = (p: ReturnType<typeof puzzle>) => JSON.stringify([p.suspects.map((s) => s.addr), p.leaker.name, p.pays.map((x) => [x.zec, x.memo])]);
  it('numbers days from Oct 28 2026', () => {
    expect(dayNumber(Date.UTC(2026, 9, 28, 0, 0, 1))).toBe(1);
    expect(dayNumber(Date.UTC(2026, 9, 28, 23, 59))).toBe(1);
    expect(dayNumber(Date.UTC(2026, 9, 29, 0, 0, 1))).toBe(2);
  });
  it('is the same puzzle for everyone on a day, and a new one the next day', () => {
    expect(key(puzzle(dailyRng(7)))).toBe(key(puzzle(dailyRng(7))));
    expect(key(puzzle(dailyRng(7)))).not.toBe(key(puzzle(dailyRng(8))));
  });
  it('every daily for the next year is solvable', () => {
    for (let d = 1; d <= 365; d++) {
      const p = puzzle(dailyRng(d));
      const w = p.pays.find((x) => x.watcher)!;
      expect(p.owners.filter((o) => opens(w, o))).toEqual([p.leaker]);
    }
  });
  it('shares a trail, never the answer', () => {
    const t = shareText(3, true, ['⬛', '🗝', '⬛', '🗝', '❌', '👻']);
    expect(t).toContain('Auditor’s Desk #3');
    expect(t).toContain('in 4 tries');
    expect(t).toContain('⬛🗝⬛🗝❌👻');
    expect(shareText(3, false, ['⬛'])).toContain('got away');
  });
});

describe('the hub', () => {
  it('every door has a name, a line and somewhere to go', () => {
    const ROUTES = ['#/practice', '#/lanterns', '#/desk', '#/arcade', '#/how', '#/gallery', '#/radio', '#/host', '/glasstown.html'];
    expect(new Set(DOORS.map((d) => d.id)).size).toBe(DOORS.length);
    for (const d of DOORS) {
      expect(ROUTES).toContain(d.href);
      expect(d.name.length).toBeGreaterThan(2);
      expect(d.at.every((n) => n >= 0 && n <= 100)).toBe(true);
    }
  });
});
