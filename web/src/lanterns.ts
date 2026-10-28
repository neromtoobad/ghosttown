// Three Lanterns: a shell game the Watcher cannot rig. Before the shuffle he publishes a SHA-256
// commitment to the lantern hiding the coin (and a secret salt). After you pick, he reveals the
// salt and your browser re-hashes it. Now and then he tries to move the coin after the fact, and
// the commitment catches him. It is the same trick that seals every Ghost Town deal.

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { h, short, sleep } from './dom';
import { watcher } from './two';
import { sfx } from './sound';

export const NAMES = ['A', 'B', 'C'];
/** The Watcher's commitment to the lantern hiding the coin: SHA-256 of the lantern and a secret salt. */
export const commit = (lantern: number, salt: string) => bytesToHex(sha256(utf8ToBytes(`ghosttown:lantern:${NAMES[lantern]}:${salt}`)));
const hex = (n: number) => bytesToHex(crypto.getRandomValues(new Uint8Array(n)));

export function lanternsView(): HTMLElement {
  let streak = 0, best = 0, round = 0, busy = false, cheatDue = false;
  try { best = Number(localStorage.getItem('gt.lanterns.best') ?? 0); } catch { /* fine */ }
  const say = h('p', { class: 'dealer-line' });
  const lamps = NAMES.map((n, i) => h('button', { class: 'lamp', type: 'button', 'data-i': String(i), disabled: true }, h('span', { class: 'lamp-glass' }, h('span', { class: 'flame' })), h('span', { class: 'lamp-name' }, n), h('span', { class: 'coin' })));
  const row = h('div', { class: 'lamps' }, ...lamps);
  const seal = h('div', { class: 'seal-box' });
  const score = h('div', { class: 'lamp-score' });
  const again = h('button', { class: 'btn primary', type: 'button' }, 'Deal');
  const drawScore = () => score.replaceChildren(h('span', {}, 'Streak ', h('b', {}, String(streak))), h('span', {}, 'Best ', h('b', {}, String(best))), h('span', {}, 'Rounds ', h('b', {}, String(round))));

  async function deal() {
    if (busy) return;
    busy = true; round++;
    again.disabled = true;
    lamps.forEach((l) => { l.disabled = true; l.classList.remove('lit', 'picked', 'wrong'); });
    const coin = Math.floor(Math.random() * 3);
    const salt = hex(16);
    const c = commit(coin, salt);
    // the Watcher plans a cheat from your third round on (then one in four), and springs it the
    // next time you actually find the coin: the only time lying would gain him anything
    if (round === 3 || (round > 3 && Math.random() < 0.25)) cheatDue = true;
    say.innerHTML = 'I put the coin under a lantern. Here is my <b>commitment</b>. I can’t change it now.';
    seal.replaceChildren(h('span', { class: 'kicker' }, 'The Watcher’s commitment · SHA-256'), h('code', { class: 'seal-hash' }, c), h('p', { class: 'hint' }, 'SHA-256 of "ghosttown:lantern:<which>:<secret salt>". Published before the shuffle.'));
    lamps[coin].classList.add('lit');
    await sleep(900);
    lamps[coin].classList.remove('lit');
    // shuffle: lanterns slide between slots
    const order = [0, 1, 2]; // order[slot] = lantern
    row.classList.add('moving');
    for (let k = 0; k < 7; k++) {
      const a = Math.floor(Math.random() * 3), b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
      [order[a], order[b]] = [order[b], order[a]];
      lamps.forEach((l, lamp) => (l.style.transform = `translateX(${(order.indexOf(lamp) - lamp) * 110}%)`));
      sfx.tick();
      await sleep(320 - k * 18);
    }
    row.classList.remove('moving');
    say.innerHTML = 'Pick a lantern, ghost.';
    lamps.forEach((l) => (l.disabled = false));
    const pick = await new Promise<number>((res) => lamps.forEach((l, i) => (l.onclick = () => res(i))));
    lamps.forEach((l) => { l.disabled = true; l.onclick = null; });
    lamps[pick].classList.add('picked');
    await sleep(500);
    // the reveal: honest, or a lie the commitment catches
    const cheat = cheatDue && pick === coin;
    if (cheat) cheatDue = false;
    const claimed = cheat ? (coin + 1) % 3 : coin;
    const lie = claimed !== coin;
    const claimedSalt = lie ? hex(16) : salt;
    const check = commit(claimed, claimedSalt);
    const ok = check === c;
    lamps[claimed].classList.add('lit');
    const won = ok ? pick === coin : true; // a caught lie hands you the round
    streak = won ? streak + 1 : 0;
    best = Math.max(best, streak);
    try { localStorage.setItem('gt.lanterns.best', String(best)); } catch { /* fine */ }
    seal.replaceChildren(
      h('span', { class: 'kicker' }, 'The reveal'),
      h('div', { class: 'reveal' },
        h('span', {}, 'He says the coin was under'), h('b', {}, `lantern ${NAMES[claimed]}`),
        h('span', {}, 'salt'), h('code', {}, short(claimedSalt, 10, 6)),
        h('span', {}, 'your browser re-hashes'), h('code', { class: ok ? 'good' : 'bad' }, short(check, 14, 8)),
        h('span', {}, 'commitment'), h('code', {}, short(c, 14, 8))),
      h('p', { class: ok ? 'ok-line' : 'error big-verdict' }, ok ? `✓ The hashes match. The Watcher played it straight.${pick === coin ? ' You found the coin.' : ' The coin was not under yours.'}` : '✕ The hashes don’t match. The Watcher tried to move the coin after the fact. The round is yours.'),
    );
    if (lie) sfx.shield(); else if (pick === coin) sfx.fanfare(); else sfx.buzz();
    if (lie) {
      say.innerHTML = 'Ah… it was under that one. Obviously.';
      await sleep(1600);
      say.innerHTML = 'Caught by my own commitment. <b>Fine.</b>';
    } else say.innerHTML = pick === coin ? 'Lucky ghost.' : 'The glass never lies. Again?';
    drawScore();
    again.textContent = 'Deal again';
    again.disabled = false;
    busy = false;
  }
  again.addEventListener('click', deal);
  say.innerHTML = 'Three lanterns, one coin. I can’t rig it, and you can check that I didn’t.';
  drawScore();

  return h(
    'section',
    { class: 'lanterns' },
    h('p', { class: 'eyebrow' }, 'Three Lanterns · a game of commitments'),
    h('h1', {}, 'Find the coin.'),
    h('div', { class: 'dealer' }, watcher('peer', 4), say),
    row,
    h('div', { class: 'row lamp-ctl' }, again, score),
    seal,
    h('details', { class: 'fine-print' }, h('summary', {}, 'Why it matters in Ghost Town'), h('p', { class: 'muted' }, 'Every role card in a Ghost Town deal carries the same kind of commitment: SHA-256 of every seat, every role and a secret salt. You hold it in your wallet before night one. At the end the salt is revealed and every browser re-checks it, so the narrator can no more change the deal than the Watcher can move this coin.')),
  );
}
