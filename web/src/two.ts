// Two towns, one story. Glasstown is the glass side of the river: every wallet public, read by
// the Watcher. Ghost Town is the dark side: everyone shielded, so the Watcher cannot see in and
// sends Leakers instead. A player who walks through Glasstown first keeps the pixel identity they
// earned there, and it becomes their ghost at the table.

import { state } from './glass/state';
import { castPortrait, drawIdentity } from './glass/identity';

/** True once this browser has walked through Glasstown (the front door). */
export const fromGlasstown = () => !!state.finishedAt || state.done.length > 0;

/** Your Glasstown identity, drawn as your ghost; null for a player who skipped the front door. */
export function myGhost(px = 4, bg: string | null = '#0b0d14'): HTMLCanvasElement | null {
  if (!fromGlasstown()) return null;
  const c = document.createElement('canvas');
  c.className = 'glass-ghost';
  drawIdentity(c, 8, px, bg);
  return c;
}

/** The Watcher: Glasstown's villain, the Leakers' boss. Never sits at a table. */
export function watcher(pose = 'read', px = 4): HTMLCanvasElement {
  const c = castPortrait('peep', pose, px);
  c.classList.add('watcher-art');
  return c;
}

export const WATCHER_SAYS = {
  dox: ['The Watcher sends his regards.', 'One more wallet, made of glass.', 'Another ghost, turned back to glass.'],
  win: 'The Watcher sees everything again. Ghost Town is glass.',
  lose: 'The Watcher is blind again. Every one of his Leakers is exposed.',
  card: "You work for the Watcher. He cannot see into Ghost Town, so you are his eyes.",
};
