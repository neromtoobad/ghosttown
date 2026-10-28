// GLASSTOWN, the front door to Ghost Town. A three-minute walk through the glass side of the
// river: the Watcher reads a public wallet, a shielded one stays dark, you run the Dark Pool, and
// then you cross the river. The pixel identity you earn here becomes your ghost at the table.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './glass/glass.css';
import './door.css';

import { h, btn, sfx, toggleMute } from './glass/ui';
import { state, save, begin, complete } from './glass/state';
import { drawIdentity, playerNumber, castPortrait } from './glass/identity';
import { runLesson, type LessonDef } from './glass/lesson';
import { darkPool } from './glass/game';

const wallet = (kind: 'glass' | 'dark', rows: [string, string][]) =>
  h('div', { class: `wallet ${kind}` },
    h('div', { class: 'wallet-head' }, kind === 'glass' ? 'PUBLIC WALLET · anyone can look' : 'PRIVATE WALLET · only you can look'),
    ...rows.map(([k, v]) => h('div', { class: 'wallet-row' }, h('span', {}, k), h('b', {}, kind === 'dark' ? '████████' : v))));

const WALK: LessonDef = {
  n: 1, title: 'Glasstown', blurb: 'The glass side of the river.',
  steps: [
    { who: 'zee', pose: 'wave', text: 'Welcome to <b>Glasstown</b>. I’m <b>Zero</b>. Everything here is made of <b>glass</b>: every wallet, every payment. Anyone can look in.',
      widget: ({ area }) => area.append(wallet('glass', [['Balance', '3.20 ZEC'], ['Paid', 'Bean There Café'], ['Received', 'ACME Corp salary']])) },
    { who: 'peep', pose: 'peer', text: 'I’m the <b>Watcher</b>. I run this town. Tap each payment and see what I learn about its owner.', wait: true,
      widget: ({ area, done, say }) => {
        const rows: [string, string, string][] = [
          ['Bean There Café', '−0.004 ZEC', 'Buys coffee there every morning'],
          ['ACME Corp', '+2.10 ZEC', 'Works at ACME. Salary: 2.1 ZEC'],
          ['Oak St Rentals', '−1.20 ZEC', 'Lives on Oak Street'],
          ['CoinMart exchange', '+0.50 ZEC', 'Real name: Alex Rivera'],
        ];
        let seen = 0;
        const list = h('div', { class: 'pay-list' });
        for (const [who, amt, fact] of rows) {
          const factEl = h('span', { class: 'pay-fact' }, 'Tap to look');
          const b = h('button', { class: 'pay', type: 'button' }, h('span', { class: 'pay-who' }, who), h('span', { class: 'pay-amt' }, amt), factEl);
          b.addEventListener('click', () => {
            if (b.classList.contains('seen')) return;
            b.classList.add('seen'); factEl.textContent = `Watcher learns: ${fact}`; sfx.ding();
            if (++seen === rows.length) { say('peep', 'read', 'Job, salary, home and real name, from <b>one wallet</b>. Glass is my favourite material.'); done(); }
          });
          list.append(b);
        }
        area.append(list);
      } },
    { who: 'zee', pose: 'shield', text: 'Across the river is <b>Ghost Town</b>. Everyone there is <b>shielded</b>. Same payments, but try reading them now.', wait: true,
      widget: ({ area, done, say }) => {
        let taps = 0;
        const list = h('div', { class: 'pay-list dark' });
        for (let i = 0; i < 4; i++) {
          const factEl = h('span', { class: 'pay-fact' }, 'Tap to look');
          const b = h('button', { class: 'pay', type: 'button' }, h('span', { class: 'pay-who' }, '██████████'), h('span', { class: 'pay-amt' }, '████ ZEC'), factEl);
          b.addEventListener('click', () => {
            if (b.classList.contains('seen')) return;
            b.classList.add('seen'); factEl.textContent = 'Shielded. Nothing to learn.'; sfx.buzz();
            if (++taps === 2) { say('peep', 'furious', 'I can’t see <b>who</b>, <b>how much</b> or <b>what for</b>. So I send my <b>Leakers</b> in to find out.'); done(); }
          });
          list.append(b);
        }
        area.append(list);
      } },
    { who: 'zee', pose: 'point', text: 'To get across you have to <b>shield</b>: carry your coins out of the glass and into the <b>dark pool</b> before the Watcher’s drones see them. In Ghost Town, the <b>Shielder</b> plays this every night.', wait: true,
      widget: ({ area, done, say }) => {
        const host = h('div', { class: 'game-host' });
        area.append(host);
        darkPool(host, { seconds: 30, onEnd: (r) => {
          say('peep', r.shielded > 0 ? 'defeated' : 'read', r.shielded > 0 ? `You hid <b>${r.shielded.toFixed(2)} ZEC</b> in the pool. I lost track of all of it. Fine. My Leakers will find you over there.` : 'Nothing made it into the pool, so I saw all of it. Play again, or keep walking.');
          done();
        } });
      } },
    { who: 'peep', pose: 'read', text: 'One more thing, ghost. In Ghost Town anyone can <b>say</b> they’re the Auditor. My Leakers do it all the time. Only a real <b>role card</b>, a shielded memo with a chit, can <b>prove</b> it.' },
  ],
  quiz: { q: 'Over in Ghost Town, a Leaker says “I’m the Auditor”. What settles it?', options: ['A chit for their role card, checked against the deal', 'Whoever sounds most sure', 'The Watcher’s word'], answer: 0, why: 'A claim is free. A chit proves the role card on chain, and a Leaker can never make one for the Auditor’s card.' },
  learned: ['Glass: <b>public</b>. The Watcher reads it all.', 'Shielded: <b>private</b>. Not even the Watcher can see in.', 'In Ghost Town, claims are cheap. <b>Proof</b> is a chit.'],
};

const app = document.getElementById('app')!;
const mute = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Toggle sound' });
const setMute = () => (mute.textContent = state.muted ? 'Sound off' : 'Sound on');
mute.addEventListener('click', () => { toggleMute(); setMute(); }); setMute();
const main = h('main', { class: 'main' });
app.append(
  h('header', { class: 'topbar' }, h('a', { class: 'brand', href: '#/' }, 'GLASSTOWN'), h('div', { class: 'bar-right' }, mute, h('a', { class: 'river-link', href: '/' }, 'Ghost Town →'))),
  main,
  h('footer', { class: 'foot' }, h('p', {}, 'The glass side of Ghost Town. No wallet, no keys, no tracking. Progress stays in this browser. ', h('a', { href: 'https://github.com/neromtoobad/ghosttown', target: '_blank', rel: 'noopener noreferrer' }, 'Open source'), '.')),
);

function title() {
  const zero = castPortrait('zee', 'wave', 6), watch = castPortrait('peep', 'peer', 6);
  main.replaceChildren(h('section', { class: 'door-title' },
    h('p', { class: 'kicker' }, 'Two towns, one river'),
    h('h1', { class: 'door-h1' }, 'GLASSTOWN'),
    h('p', { class: 'door-lede' }, 'Everyone here is made of glass. The Watcher reads every wallet. Across the river is Ghost Town, where everyone is shielded and he can’t see a thing. So he sends Leakers in.'),
    h('div', { class: 'door-cast' }, h('figure', {}, zero, h('figcaption', {}, 'ZERO · your guide')), h('figure', {}, watch, h('figcaption', {}, 'WATCHER · runs the Leakers'))),
    h('div', { class: 'door-actions' }, btn('Walk through Glasstown · 3 min', () => (location.hash = '#/walk'), 'primary big'), h('a', { class: 'btn', href: '/' }, 'Skip to Ghost Town')),
    h('p', { class: 'fine' }, 'You earn a pixel identity on the way. It becomes your ghost at the table.')));
}

async function walk() {
  begin();
  await runLesson(main, WALK, 1);
  complete(1, 100);
  state.finishedAt ??= Date.now();
  save();
  location.hash = '#/river';
}

function river() {
  const me = h('canvas', { class: 'door-me' }) as HTMLCanvasElement;
  drawIdentity(me, 8, 12, null);
  const cross = btn('Cross the river', () => shatter(), 'primary big');
  main.replaceChildren(h('section', { class: 'door-river' },
    h('p', { class: 'kicker' }, 'The river'),
    h('h1', { class: 'door-h1 small' }, `Ghost #${String(playerNumber()).padStart(4, '0')}`),
    h('div', { class: 'door-id' }, me),
    h('p', { class: 'door-lede' }, 'This is you now: a shielded identity. Nothing on it says who you are. Cross the river and take your seat in Ghost Town. Somebody at the table works for the Watcher.'),
    h('div', { class: 'door-actions' }, cross)));
}

/** The glass breaks and you fall into Ghost Town. */
function shatter() {
  sfx.whoosh();
  const wall = h('div', { class: 'shatter', 'aria-hidden': 'true' });
  const n = 26;
  for (let i = 0; i < n; i++) {
    const s = h('i', {});
    const x = (i % 6) * 18 + Math.random() * 6, y = Math.floor(i / 6) * 22 + Math.random() * 6;
    s.style.left = `${x}%`; s.style.top = `${y}%`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}vw`);
    s.style.setProperty('--dy', `${40 + Math.random() * 80}vh`);
    s.style.setProperty('--r', `${(Math.random() - 0.5) * 540}deg`);
    s.style.animationDelay = `${Math.random() * 0.18}s`;
    wall.append(s);
  }
  document.body.append(wall);
  requestAnimationFrame(() => wall.classList.add('go'));
  setTimeout(() => (location.href = '/#/practice'), 1500);
}

function route() {
  window.scrollTo({ top: 0 });
  const hash = location.hash || '#/';
  if (hash === '#/walk') return void walk();
  if (hash === '#/river') return river();
  title();
}
window.addEventListener('hashchange', route);
route();
