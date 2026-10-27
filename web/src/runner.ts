// Runs a table in the narrator's browser: bots act and talk on a human-feeling clock, nights
// and votes resolve once every seat is in. Practice tables and staked hosts both use it.

import { alive, botDay, botNight, botVote, nightPending, openVote, resolveNight, resolveVote, seat, votePending, type Game } from './engine';

export interface Runner {
  /** Call after any change: lets bots move and resolves the phase when everyone is in. */
  tick(): void;
  callVote(): void;
  stop(): void;
}

export function createRunner(g: Game, humans: () => number[], emit: () => void): Runner {
  let busy = false;
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, f: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (stopped) return;
      f();
      emit();
    }, ms);
    timers.add(t);
  };

  function tick() {
    if (busy || stopped || g.phase === 'over') return emit();
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
    // With no living human left to call it, the vote opens on its own.
    if (!humans().some((id) => seat(g, id).alive)) later(900 + talkers.length * 1500 + 1200, callVote);
  }

  function callVote() {
    if (g.phase !== 'day') return;
    openVote(g);
    tick();
  }

  later(400, tick);
  return {
    tick,
    callVote,
    stop: () => {
      stopped = true;
      timers.forEach(clearTimeout);
    },
  };
}
