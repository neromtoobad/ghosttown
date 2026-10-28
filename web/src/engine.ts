// The game, with no UI and no network: seats, the deal and its commitment, nights, shielded
// ballots, win checks, and the bots. Deterministic from a seed, so a table can be replayed and
// the deal re-checked by anyone at the end.

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export type Role = 'leaker' | 'auditor' | 'shielder' | 'glitch' | 'citizen';
export type Team = 'leak' | 'town' | 'glitch';
export type Phase = 'night' | 'day' | 'vote' | 'over';

export const TEAM: Record<Role, Team> = { leaker: 'leak', auditor: 'town', shielder: 'town', citizen: 'town', glitch: 'glitch' };

export interface Seat {
  id: number;
  name: string;
  bot: boolean;
  alive: boolean;
  role: Role;
  /** Proved their role card mid-game (a verified chit). */
  proven: boolean;
}

export type Event =
  | { kind: 'night'; round: number }
  | { kind: 'exposed'; round: number; seat: number; role: Role; by: 'dox' | 'vote' }
  | { kind: 'held'; round: number; seat: number }
  | { kind: 'quiet'; round: number }
  | { kind: 'say'; round: number; seat: number; text: string }
  | { kind: 'claim'; round: number; seat: number; role: Role; checked?: { seat: number; leaker: boolean } }
  | { kind: 'proof'; round: number; seat: number; role: Role }
  | { kind: 'tally'; round: number; counts: Record<string, number>; exposed: number | null }
  | { kind: 'glitch'; round: number; seat: number }
  | { kind: 'over'; winner: Team };

export interface Game {
  seed: string;
  salt: string;
  /** SHA-256 over the deal; printed on every role card before night one. */
  commitment: string;
  seats: Seat[];
  round: number;
  phase: Phase;
  night: { dox: Record<number, number>; shield: number | null; audit: number | null };
  lastShield: number | null;
  /** The Auditor's private notebook. */
  audits: { round: number; seat: number; leaker: boolean }[];
  votes: Record<number, number | 'skip'>;
  log: Event[];
  winner: Team | null;
  glitchWon: boolean;
}

// ---------- randomness ----------

/** A small seeded PRNG (sfc32), fed by SHA-256 of the seed and a label. */
export function rng(seed: string, label: string) {
  const h = sha256(utf8ToBytes(`${seed}|${label}`));
  let [a, b, c, d] = [0, 4, 8, 12].map((i) => (h[i] | (h[i + 1] << 8) | (h[i + 2] << 16) | (h[i + 3] << 24)) >>> 0);
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];

function shuffle<T>(r: () => number, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- the deal ----------

export function rolesFor(n: number): Role[] {
  if (n < 5 || n > 10) throw new Error('A table seats 5 to 10 ghosts.');
  const leakers = n >= 7 ? 2 : 1;
  const roles: Role[] = [...Array(leakers).fill('leaker'), 'auditor', 'shielder'];
  if (n >= 7) roles.push('glitch');
  while (roles.length < n) roles.push('citizen');
  return roles;
}

/** The exact bytes the commitment covers: seat, name and role, then the salt. */
export const dealText = (seats: Pick<Seat, 'id' | 'name' | 'role'>[], salt: string) =>
  `ghosttown/v1\n${seats.map((s) => `${s.id}:${s.name}:${s.role}`).join('\n')}\nsalt:${salt}`;

export const commit = (seats: Pick<Seat, 'id' | 'name' | 'role'>[], salt: string) => bytesToHex(sha256(utf8ToBytes(dealText(seats, salt))));

export function newGame(players: { name: string; bot: boolean }[], seed: string, salt: string): Game {
  const roles = shuffle(rng(seed, 'deal'), rolesFor(players.length));
  const seats: Seat[] = players.map((p, i) => ({ id: i, name: p.name, bot: p.bot, alive: true, role: roles[i], proven: false }));
  return {
    seed,
    salt,
    commitment: commit(seats, salt),
    seats,
    round: 1,
    phase: 'night',
    night: { dox: {}, shield: null, audit: null },
    lastShield: null,
    audits: [],
    votes: {},
    log: [{ kind: 'night', round: 1 }],
    winner: null,
    glitchWon: false,
  };
}

// ---------- queries ----------

export const alive = (g: Game) => g.seats.filter((s) => s.alive);
export const seat = (g: Game, id: number) => g.seats[id];
export const partners = (g: Game, id: number) => g.seats.filter((s) => s.role === 'leaker' && s.id !== id);

/** Who still owes a night action. */
export function nightPending(g: Game): number[] {
  return alive(g)
    .filter((s) => (s.role === 'leaker' && g.night.dox[s.id] === undefined) || (s.role === 'shielder' && g.night.shield === null) || (s.role === 'auditor' && g.night.audit === null))
    .map((s) => s.id);
}

export const votePending = (g: Game) => alive(g).filter((s) => g.votes[s.id] === undefined).map((s) => s.id);

/** Legal night targets for a seat. */
export function nightTargets(g: Game, id: number): number[] {
  const me = seat(g, id);
  const live = alive(g);
  if (me.role === 'leaker') return live.filter((s) => s.role !== 'leaker').map((s) => s.id);
  if (me.role === 'shielder') return live.filter((s) => s.id !== g.lastShield).map((s) => s.id);
  if (me.role === 'auditor') return live.filter((s) => s.id !== id && !g.audits.some((a) => a.seat === s.id)).map((s) => s.id);
  return [];
}

// ---------- moves ----------

export function act(g: Game, id: number, target: number) {
  if (g.phase !== 'night') throw new Error('Not night.');
  const me = seat(g, id);
  if (!me.alive) throw new Error('The exposed do not act.');
  if (!nightTargets(g, id).includes(target)) throw new Error('Not a legal target.');
  if (me.role === 'leaker') g.night.dox[id] = target;
  else if (me.role === 'shielder') g.night.shield = target;
  else if (me.role === 'auditor') g.night.audit = target;
}

/** The Shielder ran Dark Pool and the Watcher's drones caught them: tonight's shield cracks and
 *  protects nobody. The night still counts as acted, and tomorrow any ghost may be shielded. */
export function crackShield(g: Game, id: number) {
  if (g.phase !== 'night') throw new Error('Not night.');
  const me = seat(g, id);
  if (!me.alive || me.role !== 'shielder') throw new Error('Only a living Shielder holds a shield.');
  g.night.shield = -1;
}

/** Ends the night: dox (unless shielded), the audit, then the morning. */
export function resolveNight(g: Game) {
  const r = rng(g.seed, `night${g.round}`);
  const picks = Object.values(g.night.dox);
  let target: number | null = null;
  if (picks.length) {
    const counts = new Map<number, number>();
    for (const p of picks) counts.set(p, (counts.get(p) ?? 0) + 1);
    const top = Math.max(...counts.values());
    target = pick(r, [...counts.entries()].filter(([, c]) => c === top).map(([t]) => t));
  }
  if (g.night.audit !== null) g.audits.push({ round: g.round, seat: g.night.audit, leaker: seat(g, g.night.audit).role === 'leaker' });
  if (target !== null && target === g.night.shield) g.log.push({ kind: 'held', round: g.round, seat: target });
  else if (target !== null) expose(g, target, 'dox');
  else g.log.push({ kind: 'quiet', round: g.round });
  g.lastShield = g.night.shield;
  g.night = { dox: {}, shield: null, audit: null };
  if (!checkWin(g)) g.phase = 'day';
}

export function say(g: Game, id: number, text: string) {
  g.log.push({ kind: 'say', round: g.round, seat: id, text: text.slice(0, 280) });
}

export function claim(g: Game, id: number, role: Role, checked?: { seat: number; leaker: boolean }) {
  g.log.push({ kind: 'claim', round: g.round, seat: id, role, checked });
}

/** A verified role card: everyone now knows this seat's role for certain. */
export function prove(g: Game, id: number) {
  const s = seat(g, id);
  s.proven = true;
  g.log.push({ kind: 'proof', round: g.round, seat: id, role: s.role });
}

export const openVote = (g: Game) => {
  if (g.phase === 'day') g.phase = 'vote';
};

export function vote(g: Game, id: number, target: number | 'skip') {
  if (g.phase !== 'vote') throw new Error('Voting is closed.');
  if (!seat(g, id).alive) throw new Error('The exposed do not vote.');
  if (target !== 'skip' && (!seat(g, target)?.alive || target === id)) throw new Error('Not a legal vote.');
  g.votes[id] = target;
}

/** Counts the shielded ballot: only the totals are published, never who voted for whom. */
export function resolveVote(g: Game) {
  const counts: Record<string, number> = {};
  for (const v of Object.values(g.votes)) counts[String(v)] = (counts[String(v)] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  let out: number | null = null;
  if (first && first[0] !== 'skip' && (!second || second[1] < first[1])) out = Number(first[0]);
  g.log.push({ kind: 'tally', round: g.round, counts, exposed: out });
  if (out !== null) {
    if (seat(g, out).role === 'glitch') {
      g.glitchWon = true;
      g.log.push({ kind: 'glitch', round: g.round, seat: out });
    }
    expose(g, out, 'vote');
  }
  g.votes = {};
  if (!checkWin(g)) {
    g.round += 1;
    g.phase = 'night';
    g.log.push({ kind: 'night', round: g.round });
  }
}

function expose(g: Game, id: number, by: 'dox' | 'vote') {
  const s = seat(g, id);
  s.alive = false;
  g.log.push({ kind: 'exposed', round: g.round, seat: id, role: s.role, by });
}

export function checkWin(g: Game): boolean {
  const live = alive(g);
  const leak = live.filter((s) => s.role === 'leaker').length;
  const rest = live.length - leak;
  const winner: Team | null = leak === 0 ? 'town' : leak >= rest ? 'leak' : null;
  if (!winner) return false;
  g.winner = winner;
  g.phase = 'over';
  g.log.push({ kind: 'over', winner });
  return true;
}

/** Seats that share the pot: the winning team, dead or alive, plus a Glitch who got voted out. */
export const winners = (g: Game) => g.seats.filter((s) => (g.winner && TEAM[s.role] === g.winner) || (s.role === 'glitch' && g.glitchWon)).map((s) => s.id);

/** At the end: does the published deal match the commitment every card carried? */
export const verifyDeal = (seats: Pick<Seat, 'id' | 'name' | 'role'>[], salt: string, commitment: string) => commit(seats, salt) === commitment;

// ---------- bots ----------
// Bots only use what their seat could know: public events, their own role, a Leaker's
// partners, the Auditor's own notebook. They talk in templates, claim, and sometimes lie.

/** Public suspicion of each seat, from claims, proofs and exposures. Higher is shadier. */
export function suspicion(g: Game, viewer: number): Map<number, number> {
  const s = new Map<number, number>(alive(g).filter((x) => x.id !== viewer).map((x) => [x.id, 0]));
  const proven = new Set(g.seats.filter((x) => x.proven).map((x) => x.id));
  const auditorClaims = g.log.filter((e): e is Extract<Event, { kind: 'claim' }> => e.kind === 'claim' && e.role === 'auditor');
  const provenAuditor = auditorClaims.find((c) => proven.has(c.seat) && seat(g, c.seat).role === 'auditor');
  for (const c of auditorClaims) {
    if (!c.checked || !s.has(c.checked.seat)) continue;
    const weight = provenAuditor && provenAuditor.seat === c.seat ? 10 : 2;
    s.set(c.checked.seat, (s.get(c.checked.seat) ?? 0) + (c.checked.leaker ? weight : -weight));
  }
  // Two seats claiming the same power role: at least one is lying. The unproven one is shady.
  for (const role of ['auditor', 'shielder'] as Role[]) {
    const claimers = [...new Set(g.log.filter((e) => e.kind === 'claim' && e.role === role).map((e) => (e as { seat: number }).seat))];
    if (claimers.length > 1) for (const c of claimers) if (!proven.has(c) && s.has(c)) s.set(c, (s.get(c) ?? 0) + 3);
  }
  for (const id of proven) if (s.has(id)) s.set(id, seat(g, id).role === 'leaker' ? 99 : -99);
  return s;
}

const shadiest = (m: Map<number, number>, r: () => number, exclude: number[] = []) => {
  const xs = [...m.entries()].filter(([id]) => !exclude.includes(id));
  if (!xs.length) return null;
  const top = Math.max(...xs.map(([, v]) => v));
  return pick(r, xs.filter(([, v]) => v === top).map(([id]) => id));
};

export function botNight(g: Game, id: number) {
  const r = rng(g.seed, `bot${id}n${g.round}`);
  const me = seat(g, id);
  const targets = nightTargets(g, id);
  if (!targets.length) return;
  if (me.role === 'leaker') {
    // A proven or claimed Auditor is the first to go, then whoever accused us.
    const loud = targets.find((t) => seat(g, t).proven && seat(g, t).role === 'auditor') ?? targets.find((t) => g.log.some((e) => e.kind === 'claim' && e.seat === t && e.role === 'auditor'));
    const partner = partners(g, id).find((p) => g.night.dox[p.id] !== undefined);
    act(g, id, loud ?? (partner ? g.night.dox[partner.id] : pick(r, targets)));
  } else if (me.role === 'shielder') {
    const auditor = targets.find((t) => g.seats[t].proven && g.seats[t].role === 'auditor') ?? targets.find((t) => g.log.some((e) => e.kind === 'claim' && e.seat === t && e.role === 'auditor'));
    act(g, id, auditor ?? (targets.includes(id) && r() < 0.4 ? id : pick(r, targets)));
  } else if (me.role === 'auditor') {
    const sus = suspicion(g, id);
    const unknown = targets.filter((t) => (sus.get(t) ?? 0) >= 0);
    act(g, id, pick(r, unknown.length ? unknown : targets));
  }
}

const LINES = {
  open: ['Quiet night. Too quiet.', 'The Watcher is out there, across the river. Somebody here works for him.', 'I left Glasstown to get away from the Watcher. Now this.', 'Somebody here has been leaking metadata.', 'I have nothing to hide. Literally, it is all shielded.', 'Whoever it is, your memos are showing.', 'Let us not vote on vibes this time.', 'I was asleep. Encrypted, even.'],
  accuse: (n: string) => [`${n} has been very quiet. Shielded quiet.`, `I do not trust ${n}.`, `${n}, where were you last block?`, `My gut says ${n}.`, `${n} keeps changing the subject.`],
  defend: ['I am a citizen. Check me if you like.', 'Vote me and you lose a friend of the town.', 'Wrong ghost. Keep looking.'],
  mourn: (n: string) => [`RIP ${n}. Fully doxxed.`, `The Watcher got ${n}. He is laughing in Glasstown.`, `They got ${n}. We need answers.`, `${n} did not deserve that.`],
};

/** One bot's turn to talk in the day: maybe a claim, maybe a lie, maybe just noise. */
export function botDay(g: Game, id: number) {
  const r = rng(g.seed, `bot${id}d${g.round}`);
  const me = seat(g, id);
  const name = (x: number) => seat(g, x).name;
  const exposedLast = [...g.log].reverse().find((e): e is Extract<Event, { kind: 'exposed' }> => e.kind === 'exposed' && e.round === g.round && e.by === 'dox');
  if (exposedLast && r() < 0.35) return say(g, id, pick(r, LINES.mourn(name(exposedLast.seat))));
  if (me.role === 'auditor') {
    const found = g.audits.find((a) => a.leaker && seat(g, a.seat).alive);
    const last = g.audits.at(-1);
    if (found) {
      claim(g, id, 'auditor', { seat: found.seat, leaker: true });
      if (!me.proven) prove(g, id); // finding a Leaker is worth burning the cover for
      return say(g, id, `I am the Auditor, and I just proved it. I checked ${name(found.seat)}'s keys: LEAKER.`);
    }
    if (last && r() < 0.5) {
      claim(g, id, 'auditor', { seat: last.seat, leaker: false });
      return say(g, id, `Auditor here. ${name(last.seat)} is clean.`);
    }
  }
  if (me.role === 'leaker') {
    // Lie: claim Auditor and frame someone, but a Leaker can never prove it.
    const framed = alive(g).filter((s) => s.role !== 'leaker' && s.id !== id);
    if (framed.length && r() < 0.3 && !g.log.some((e) => e.kind === 'claim' && e.seat === id)) {
      const t = pick(r, framed).id;
      claim(g, id, 'auditor', { seat: t, leaker: true });
      return say(g, id, `I am the Auditor. ${name(t)} is a Leaker. I cannot prove it yet, trust me.`);
    }
  }
  const sus = suspicion(g, id);
  const target = shadiest(sus, r, me.role === 'leaker' ? partners(g, id).map((p) => p.id) : []);
  if (target !== null && r() < 0.6) return say(g, id, pick(r, LINES.accuse(name(target))));
  return say(g, id, pick(r, LINES.open));
}

export function botVote(g: Game, id: number) {
  const r = rng(g.seed, `bot${id}v${g.round}`);
  const me = seat(g, id);
  const sus = suspicion(g, id);
  const mates = me.role === 'leaker' ? partners(g, id).map((p) => p.id) : [];
  if (me.role === 'auditor') {
    const found = g.audits.find((a) => a.leaker && seat(g, a.seat).alive);
    if (found) return vote(g, id, found.seat);
  }
  if (me.role === 'glitch' && r() < 0.5) return vote(g, id, 'skip'); // the Glitch wants to look shady, not vote
  const target = shadiest(sus, r, mates);
  if (target === null || (sus.get(target) ?? 0) <= 0 && r() < 0.35) return vote(g, id, 'skip');
  vote(g, id, target);
}

// ---------- what one seat may see ----------

export interface SeatView {
  id: number;
  name: string;
  alive: boolean;
  proven: boolean;
  /** Known only when public (exposed, proven, game over) or to this seat (self, Leaker partners). */
  role: Role | null;
}

export interface View {
  me: number;
  myRole: Role;
  seats: SeatView[];
  round: number;
  phase: Phase;
  log: Event[];
  commitment: string;
  /** The Auditor's own notebook; empty for everyone else. */
  audits: Game['audits'];
  /** This seat's legal night targets, if it still owes an action tonight. */
  targets: number[];
  acted: boolean;
  voted: boolean;
  /** Seats still to act or vote, as counts only. */
  waiting: number;
  winner: Team | null;
  glitchWon: boolean;
  /** Revealed only when the game is over. */
  salt: string | null;
}

export function viewFor(g: Game, me: number): View {
  const mine = seat(g, me);
  const over = g.phase === 'over';
  const knows = (s: Seat) => over || !s.alive || s.proven || s.id === me || (mine.role === 'leaker' && s.role === 'leaker');
  const acted = g.phase !== 'night' || !nightPending(g).includes(me);
  return {
    me,
    myRole: mine.role,
    seats: g.seats.map((s) => ({ id: s.id, name: s.name, alive: s.alive, proven: s.proven, role: knows(s) ? s.role : null })),
    round: g.round,
    phase: g.phase,
    log: g.log,
    commitment: g.commitment,
    audits: mine.role === 'auditor' ? g.audits : [],
    targets: g.phase === 'night' && mine.alive && !acted ? nightTargets(g, me) : [],
    acted,
    voted: g.phase === 'vote' ? g.votes[me] !== undefined : false,
    waiting: g.phase === 'night' ? nightPending(g).length : g.phase === 'vote' ? votePending(g).length : 0,
    winner: g.winner,
    glitchWon: g.glitchWon,
    salt: over ? g.salt : null,
  };
}
