import '@fontsource-variable/doto';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import { h, art } from './dom';
import { practiceTable } from './practice';
import { renderTable, ROLE_NAME, type Controller } from './table';
import { hostSetup, joinView } from './staked';
import type { Role } from './engine';
import { galleryView } from './gallery';
import { fromGlasstown, myGhost, watcher } from './two';

const app = document.getElementById('app')!;
let leave: (() => void) | null = null;

function shell(...kids: Node[]) {
  leave?.();
  leave = null;
  app.replaceChildren(
    h('header', { class: 'top' }, h('a', { class: 'brand', href: '#/' }, h('img', { src: art('role-leaker.png'), alt: '' }), h('b', {}, 'GHOST TOWN')), h('nav', {}, h('a', { href: '/glasstown.html' }, 'Glasstown'), h('a', { href: '#/practice' }, 'Practice'), h('a', { href: '#/host' }, 'Host a table'), h('a', { href: '#/gallery' }, 'Glass Gallery'), h('a', { href: '#/how' }, 'Why it is fair'))),
    h('main', {}, ...kids),
    h('footer', {}, h('span', {}, 'A shielded social deduction game on Zcash. Proofs by ', h('a', { href: 'https://chit.nerom.site', target: '_blank', rel: 'noreferrer' }, 'chit-zcash'), '.'), h('span', {}, 'Glasstown + Ghost Town · ZECATHON')),
  );
}

const CAST: [Role, string][] = [
  ['leaker', "Works for the Watcher. Each night, picks one ghost to dox. Can lie about anything except a role card."],
  ['auditor', "Holds the viewing keys. Each night, checks one ghost: Leaker or not. The only role the Leakers fear."],
  ['shielder', "Each night, runs the Dark Pool to shield one ghost from the dox. Get caught by the Watcher's drones and the shield cracks."],
  ['glitch', 'On nobody\'s side. Wins by getting voted out. Acts as shady as possible.'],
  ['citizen', 'No powers, one vote. Reads the room, weighs the claims, demands proof.'],
];

const FAIR: [string, string][] = [
  ['Your role card is a shielded memo', 'The narrator deals each player a dust payment whose encrypted memo is their role. Only your wallet can read it. With multi-recipient ZIP 321, the whole deal is one transaction.'],
  ['The narrator cannot change the deal', 'Every card carries the same commitment: SHA-256 of all seats, roles and a salt. You hold it in your wallet before night one. At the end the salt is revealed and anyone re-checks it.'],
  ['Claims are cheap. Proof is not.', 'Mid-game you can prove your role: paste a chit (a single-output disclosure) for your role card. Every browser verifies it against the deal transaction with the official Zcash crates. A Leaker can say "I am the Auditor". A Leaker can never prove it.'],
  ['Shielded ballots', 'Only the tally is published. Who voted for whom never is, so nobody is punished for a vote.'],
  ['The pot pays in ZEC', 'Each player buys in with a shielded payment. The winners split it in one ZIP 321 payout, published as a payout ledger anyone can audit.'],
];

function home() {
  const ghost = myGhost(5);
  shell(
    h(
      'section',
      { class: 'towns' },
      h(
        'a',
        { class: 'town glass-town', href: '/glasstown.html' },
        h('span', { class: 'town-kicker' }, 'Town one · public'),
        h('b', { class: 'town-name' }, 'GLASSTOWN'),
        h('p', {}, 'Everyone here is made of glass. The Watcher reads every wallet: your job, your home, your name.'),
        h('div', { class: 'town-cast' }, watcher('peer', 4)),
        h('span', { class: 'btn' }, fromGlasstown() ? 'Walk it again · 3 min' : 'Start here · 3 min'),
      ),
      h('div', { class: 'river', 'aria-hidden': 'true' }, h('span', {}, 'the shielded pool')),
      h(
        'div',
        { class: 'town ghost-town' },
        h('div', { class: 'hero-art', 'aria-hidden': 'true' }),
        h('span', { class: 'town-kicker' }, 'Town two · shielded'),
        h('b', { class: 'town-name' }, 'GHOST', h('br'), h('em', {}, 'TOWN')),
        h('p', {}, 'Mafia on Zcash. Your role card is a shielded memo, nobody can fake a role claim, and the pot pays out in ZEC. The Watcher cannot see in here, so he sends Leakers.'),
        ghost ? h('div', { class: 'town-me' }, ghost, h('span', {}, 'Your ghost, from Glasstown')) : null,
        h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/practice' }, 'Play a practice table'), h('a', { class: 'btn', href: '#/host' }, 'Host a staked table')),
        h('a', { class: 'gallery-link', href: '#/gallery' }, 'Or watch a real mainnet deal from the Glass Gallery →'),
      ),
    ),
    h('section', { class: 'cast' }, h('p', { class: 'eyebrow' }, 'The cast'), h('h2', {}, 'Five roles. One boss. Somebody is lying.'), h('div', { class: 'cast-grid' }, h('div', { class: 'cast-card r-watcher' }, watcher('read', 6), h('h3', {}, 'The Watcher'), h('p', {}, 'Lives in Glasstown and reads every public wallet. He cannot see into Ghost Town, so he runs the Leakers. Never sits at the table.')), ...CAST.map(([r, t]) => h('div', { class: `cast-card r-${r}` }, h('img', { src: art(`role-${r}.png`), alt: '' }), h('h3', {}, ROLE_NAME[r]), h('p', {}, t))))),
    h('section', { class: 'fair' }, h('p', { class: 'eyebrow' }, 'Why it needs Zcash'), h('h2', {}, 'Mafia is a game of secrets.', h('br'), 'Zcash is a system for them.'), h('div', { class: 'fair-grid' }, ...FAIR.map(([t, b], i) => h('div', { class: 'fair-card' }, h('span', { class: 'num' }, String(i + 1).padStart(2, '0')), h('h3', {}, t), h('p', {}, b)))), h('a', { class: 'btn', href: '#/how' }, 'The full rules and the fairness model →')),
  );
}

function practiceSetup() {
  const name = h('input', { placeholder: 'Your ghost name', maxlength: '16', value: (() => { try { return localStorage.getItem('gt.name') ?? ''; } catch { return ''; } })() });
  const size = h('select', {}, ...[5, 6, 7, 8].map((n) => h('option', { value: String(n), ...(n === 7 ? { selected: true } : {}) }, `${n} ghosts${n >= 7 ? ' · 2 Leakers + Glitch' : ' · 1 Leaker'}`)));
  shell(
    h(
      'section',
      { class: 'setup panel' },
      h('img', { class: 'setup-art', src: art('night-auditor.png'), alt: '' }),
      h('p', { class: 'eyebrow' }, 'Practice table'),
      h('h1', {}, 'Take a seat.'),
      myGhost(5) ? h('div', { class: 'town-me' }, myGhost(5)!, h('span', {}, 'You sit as the ghost you earned in Glasstown.')) : h('p', { class: 'hint' }, h('a', { href: '/glasstown.html' }, 'New here? Walk through Glasstown first'), ' (3 min): you earn the ghost you play as.'),
      h('p', { class: 'muted' }, 'You and a table of bots. The bots claim, accuse and lie. Your role card and its proof run against the specimen deal: a real, proven Zcash transaction that is not on chain.'),
      h('label', {}, 'Name'),
      name,
      h('label', {}, 'Table'),
      size,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => {
              const n = name.value.trim().replace(/[:\n]/g, '') || 'You';
              try { localStorage.setItem('gt.name', n); } catch { /* fine */ }
              playTable(practiceTable(n, Number(size.value)));
            },
          },
          'Deal me in',
        ),
      ),
    ),
  );
}

export function playTable(ctl: Controller) {
  shell();
  const main = app.querySelector('main')!;
  leave = renderTable(main, ctl, () => (location.hash = '#/'));
}

function how() {
  shell(
    h(
      'section',
      { class: 'how' },
      h('p', { class: 'eyebrow' }, 'Rules and fairness'),
      h('h1', {}, 'How Ghost Town works'),
      h('h2', {}, 'A round'),
      h('ol', {}, h('li', {}, 'Night. The Leakers pick a ghost to dox, the Shielder shields one, and the Auditor checks one ghost\'s keys.'), h('li', {}, 'Morning. A doxxed ghost is exposed, and their role is shown, unless they were shielded.'), h('li', {}, 'Day. Talk, accuse, claim a role, or prove one.'), h('li', {}, 'Vote. Shielded ballot: a plurality exposes one ghost. A tie or a skip exposes nobody.'), h('li', {}, 'The town wins when every Leaker is exposed. The Leakers win when they equal everyone else alive. The Glitch wins by being voted out.')),
      h('h2', {}, 'A staked table, step by step'),
      h('ol', {}, h('li', {}, 'The host opens a table and shares a code. Everyone joins, then buys in by scanning a ZIP 321 request with Zodl, with the memo ghosttown:<table>:join:<seat>.'), h('li', {}, 'The host deals. The app builds one ZIP 321 request, a role-card memo per seat, each carrying the deal commitment. The host scans it once. Each player\'s wallet shows their card.'), h('li', {}, 'Moves travel through a relay, end-to-end encrypted to the host\'s browser (X25519 + XChaCha20-Poly1305). The relay sees ciphertext only.'), h('li', {}, 'Anyone can prove their role: make a chit for their card output with chit.nerom.site, in their own browser, and paste it. Every browser at the table verifies it against the deal transaction.'), h('li', {}, 'At the end the host reveals the salt, every browser re-checks the commitment, and the winners are paid with one ZIP 321 request.')),
      h('h2', {}, 'What is trusted'),
      h('p', {}, 'The host\'s browser is the narrator, like the human narrator in Mafia: it knows every role. The commitment proves the narrator never changed the deal. It does not stop the narrator from peeking, so play with a host you trust, or let the host sit out. The relay learns room codes and message timing, never contents.'),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/practice' }, 'Play a practice table')),
    ),
  );
}

function render() {
  const [head, a] = location.hash.replace(/^#\/?/, '').split('/');
  if (head === 'practice') practiceSetup();
  else if (head === 'how') how();
  else if (head === 'host') shell(hostSetup(playTable));
  else if (head === 't' && a) shell(joinView(a.toUpperCase(), playTable));
  else if (head === 'gallery') shell(galleryView(a));
  else home();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();
