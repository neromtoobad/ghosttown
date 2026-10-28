// Badges on your ghost: small marks earned around the town. They live only in this browser, like
// your Glasstown identity, and never leave it.

import { h } from './dom';
import { sfx } from './sound';

export interface Badge { id: string; icon: string; name: string; how: string }
export const BADGES: Badge[] = [
  { id: 'glasstown', icon: '🌉', name: 'Crossed the river', how: 'Walk through Glasstown' },
  { id: 'proved', icon: '✓', name: 'Proven', how: 'Prove your role card at the table' },
  { id: 'darkpool', icon: '🛡', name: 'Out of the glass', how: 'Hold a shield, or win a round of Dark Pool' },
  { id: 'liar', icon: '🏮', name: 'Caught him lying', how: "Catch the Watcher's lie in Three Lanterns" },
  { id: 'auditor', icon: '🗝', name: 'Followed the money', how: "Find who the Watcher pays at the Auditor's Desk" },
  { id: 'daily', icon: '📅', name: 'On the night shift', how: "Solve a daily Auditor's Desk" },
  { id: 'winner', icon: '👑', name: 'Last ghost standing', how: 'Win a game at the Séance Hall' },
  { id: 'radio', icon: '📻', name: 'On air', how: 'Play the anthem on Ghost Radio' },
  { id: 'tour', icon: '🧪', name: 'Tried to cheat it', how: "Run the judges' tour" },
];

const KEY = 'gt.badges';
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
export const earned = () => new Set(read());

/** Earn a badge. The first time shows a toast; after that it does nothing. */
export function earn(id: string) {
  const got = read();
  if (got.includes(id)) return;
  try { localStorage.setItem(KEY, JSON.stringify([...got, id])); } catch { return; }
  const b = BADGES.find((x) => x.id === id);
  if (!b) return;
  sfx.fanfare();
  const t = h('div', { class: 'badge-toast', role: 'status' }, h('span', { class: 'bt-icon' }, b.icon), h('div', {}, h('small', {}, 'Badge earned'), h('b', {}, b.name)));
  // several at once stack upwards instead of covering each other
  const stacked = document.querySelectorAll('.badge-toast').length;
  t.style.transform = `translateY(${-stacked * 74}px)`;
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2600 + stacked * 400);
  setTimeout(() => t.remove(), 3200 + stacked * 400);
  document.querySelectorAll('.badge-strip').forEach((s) => s.replaceWith(badgeStrip(s.classList.contains('small'))));
}

/** Your badges: earned ones lit, the rest dim with how to earn them. */
export function badgeStrip(small = false): HTMLElement {
  const got = earned();
  return h('div', { class: `badge-strip${small ? ' small' : ''}`, 'aria-label': `${got.size} of ${BADGES.length} badges` },
    ...BADGES.map((b) => h('span', { class: `badge${got.has(b.id) ? ' on' : ''}`, title: `${b.name}: ${got.has(b.id) ? 'earned' : b.how}` }, b.icon)),
    small ? null : h('span', { class: 'badge-count' }, `${got.size}/${BADGES.length}`));
}
