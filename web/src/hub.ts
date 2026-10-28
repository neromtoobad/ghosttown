// The hub: Ghost Town is a street of old TVs, and every screen is a door. The fog at the end of
// the street is the Séance Hall, where the table sits. The one red screen is the Watcher's: it
// looks across the river into Glasstown. A plain list under the street opens the same doors.

import { h, art } from './dom';
import { myGhost } from './two';

interface Door {
  id: string;
  name: string;
  line: string;
  href: string;
  /** Screen rectangle on town.jpg, in percent: left, top, width, height. */
  at: [number, number, number, number];
  tone?: 'red' | 'hall';
}

export const DOORS: Door[] = [
  { id: 'hall', name: 'Séance Hall', line: 'The table. Shielded Mafia: find the Leakers before they dox you.', href: '#/practice', at: [43, 33, 14, 24], tone: 'hall' },
  { id: 'lanterns', name: 'Three Lanterns', line: 'A shell game the Watcher cannot rig. Commit, then reveal.', href: '#/lanterns', at: [14, 9, 6.5, 18] },
  { id: 'desk', name: "Auditor's Desk", line: 'Three viewing keys, eight sealed payments. Find who the Watcher pays.', href: '#/desk', at: [11.5, 30.5, 5.5, 19] },
  { id: 'arcade', name: 'Arcade', line: 'Dark Pool. Carry coins out of the glass before the drones see.', href: '#/arcade', at: [12.5, 58, 7, 17] },
  { id: 'how', name: 'Rules', line: 'How a round works, and why nobody can cheat it.', href: '#/how', at: [22, 38, 4.2, 14] },
  { id: 'gallery', name: 'Glass Gallery', line: 'A real mainnet deal, seen from the glass side.', href: '#/gallery', at: [85, 5, 8, 17] },
  { id: 'radio', name: 'Ghost Radio', line: 'The town anthem. Tap to play.', href: '#/radio', at: [84.8, 31, 8, 17] },
  { id: 'host', name: 'Staked Tables', line: 'Host a real table: buy in, deal role cards on Zcash.', href: '#/host', at: [83.5, 58, 9, 18] },
  { id: 'glass', name: 'Glasstown', line: "The Watcher's screen. Look across the river, where every wallet is glass.", href: '/glasstown.html', at: [70, 36, 6.5, 17], tone: 'red' },
];

let radio: HTMLAudioElement | null = null;
/** Ghost Radio: the town anthem. Nothing plays until someone taps it. */
export function toggleRadio(btn?: HTMLElement) {
  radio ??= Object.assign(new Audio(`${import.meta.env.BASE_URL}audio/ghost-town.mp3`), { loop: true, volume: 0.8 });
  if (radio.paused) void radio.play();
  else radio.pause();
  if (btn) btn.dataset.on = radio.paused ? '' : '1';
  document.querySelector('.door.d-radio')?.classList.toggle('on', !radio.paused);
}

export function hub(): HTMLElement {
  const label = h('div', { class: 'street-label' });
  const show = (d: Door | null) => {
    label.replaceChildren(...(d ? [h('b', {}, d.name), h('span', {}, d.line)] : [h('b', {}, 'Ghost Town'), h('span', {}, 'Every screen is a door. Somebody on this street works for the Watcher.')]));
    label.classList.toggle('red', d?.tone === 'red');
  };
  show(null);
  const go = (d: Door) => (d.id === 'radio' ? toggleRadio() : d.href.startsWith('#') ? (location.hash = d.href) : (location.href = d.href));
  const street = h(
    'div',
    { class: 'street' },
    h('img', { class: 'street-art', src: art('town.jpg'), alt: 'A rainy street of old TVs, each showing a ghost' }),
    ...DOORS.map((d) => {
      const [x, y, w, hh] = d.at;
      const b = h('button', { class: `door d-${d.id}${d.tone ? ` t-${d.tone}` : ''}`, type: 'button', style: `left:${x}%;top:${y}%;width:${w}%;height:${hh}%`, 'aria-label': `${d.name}: ${d.line}`, onclick: () => go(d) }, h('span', { class: 'door-tag' }, d.name));
      b.addEventListener('mouseenter', () => show(d));
      b.addEventListener('focus', () => show(d));
      b.addEventListener('mouseleave', () => show(null));
      return b;
    }),
    label,
  );
  const ghost = myGhost(4);
  return h(
    'section',
    { class: 'hub' },
    h('div', { class: 'hub-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'A shielded town on Zcash'), h('h1', {}, 'GHOST ', h('em', {}, 'TOWN'))), h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/tour' }, 'Judges: try to cheat it · 90 s'), ghost ? h('div', { class: 'town-me' }, ghost, h('span', {}, 'You, from Glasstown')) : h('a', { class: 'btn primary', href: '#/practice' }, 'Take a seat at the table'))),
    street,
    h('div', { class: 'doors' }, ...DOORS.map((d) => h('a', { class: `door-card${d.tone === 'red' ? ' red' : ''}${d.tone === 'hall' ? ' hall' : ''}`, href: d.href, onclick: (e: Event) => { if (d.id === 'radio') { e.preventDefault(); toggleRadio(e.currentTarget as HTMLElement); } } }, h('b', {}, d.name), h('span', {}, d.line)))),
  );
}
