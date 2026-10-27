// The table: seats, your role card, the town feed, and the actions your seat may take now.
// It draws a View (what one seat may know) and talks to a Controller: a practice table in
// this tab, or a networked table run by a host's browser.

import { TEAM, verifyDeal, type Event as GameEvent, type Role, type SeatView, type Team, type View } from './engine';
import { h, copy, short, art } from './dom';
import { portrait } from './pixel';
import { CARD_TEXT, type ProofResult } from './zec';

export interface Controller {
  table: string;
  practice: boolean;
  canCallVote: boolean;
  staked: null | { dealTxid: string | null; stakeZat: number };
  view(): View;
  subscribe(f: () => void): () => void;
  act(target: number): void;
  vote(target: number | 'skip'): void;
  say(text: string): void;
  claim(role: Role, checked?: { seat: number; leaker: boolean }): void;
  callVote(): void;
  /** A chit for this seat's role card, if the table can offer one (practice: the specimen). */
  cardChit(): Promise<string | null>;
  prove(chit: string): Promise<ProofResult>;
  reveal(): { seats: { id: number; name: string; role: Role }[]; salt: string; commitment: string } | null;
  tickAfterNight?: () => void;
}

export const ROLE_NAME: Record<Role, string> = { leaker: 'The Leaker', auditor: 'The Auditor', shielder: 'The Shielder', glitch: 'The Glitch', citizen: 'Citizen' };
const ACTION: Partial<Record<Role, { verb: string; prompt: string }>> = {
  leaker: { verb: 'Dox', prompt: 'Choose a ghost to dox tonight.' },
  auditor: { verb: 'Check keys', prompt: "Choose a ghost whose viewing key you'll check." },
  shielder: { verb: 'Shield', prompt: 'Choose a ghost to shield tonight.' },
};
const TEAM_LABEL: Record<Team, string> = { town: 'The town', leak: 'The Leakers', glitch: 'The Glitch' };

const portraitFor = (v: View, s: SeatView, table: string) => {
  if (s.role) {
    const img = h('img', { src: art(`${s.alive ? 'role' : 'exposed'}-${s.role}.png`), alt: ROLE_NAME[s.role], loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(portrait(`${table}:${s.name}`)), { once: true });
    return img;
  }
  return portrait(`${table}:${s.name}`);
};

export function renderTable(root: HTMLElement, ctl: Controller, onLeave: () => void) {
  const chat = h('input', { placeholder: 'Say something to the town…', maxlength: '200', class: 'chat-input' });
  chat.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter' && chat.value.trim()) {
      ctl.say(chat.value.trim());
      chat.value = '';
    }
  });
  let seenLog = 0;
  let overlay: HTMLElement | null = null;
  let proofOpen = false;

  const draw = () => {
    const v = ctl.view();
    const me = v.seats[v.me];
    const focused = document.activeElement === chat;
    const name = (id: number) => v.seats[id]?.name ?? '?';

    // ---------- header ----------
    const phaseLabel = v.phase === 'over' ? 'Game over' : v.phase === 'night' ? `Night ${v.round}` : v.phase === 'day' ? `Day ${v.round}` : `Vote · day ${v.round}`;
    const header = h(
      'header',
      { class: `table-head ph-${v.phase}` },
      h('div', { class: 'th-left' }, h('span', { class: 'kicker' }, ctl.practice ? 'Practice table' : 'Staked table'), h('b', { class: 'th-code' }, ctl.table)),
      h('div', { class: 'phase-pill' }, phaseLabel),
      h('button', { class: 'deal-chip', type: 'button', title: 'The deal commitment on every role card', onclick: (e: Event) => copy(v.commitment, e.currentTarget as HTMLElement) }, h('span', {}, 'deal'), h('code', {}, short(v.commitment, 6, 4))),
      h('button', { class: 'btn ghost small', type: 'button', onclick: onLeave }, 'Leave'),
    );

    // ---------- seats ----------
    const clickable = (s: SeatView) =>
      (v.phase === 'night' && v.targets.includes(s.id)) || (v.phase === 'vote' && me.alive && !v.voted && s.alive && s.id !== v.me);
    const seats = h(
      'div',
      { class: 'seats' },
      ...v.seats.map((s) => {
        const can = clickable(s);
        const tag = !s.alive ? 'Exposed' : s.proven ? 'Proven' : s.id === v.me ? 'You' : '';
        return h(
          can ? 'button' : 'div',
          {
            class: `seat${s.alive ? '' : ' dead'}${s.id === v.me ? ' me' : ''}${can ? ' pick' : ''}${s.role ? ` r-${s.role}` : ''}`,
            ...(can ? { type: 'button', onclick: () => (v.phase === 'night' ? ctl.act(s.id) : ctl.vote(s.id)) } : {}),
          },
          h('span', { class: 'seat-art' }, portraitFor(v, s, ctl.table)),
          h('span', { class: 'seat-name' }, s.name),
          h('span', { class: 'seat-role' }, s.role && (s.id !== v.me || !s.alive || s.proven) ? ROLE_NAME[s.role] : s.role && s.id !== v.me ? '' : s.id === v.me ? 'you' : 'unknown'),
          tag ? h('span', { class: `seat-tag t-${tag.toLowerCase()}` }, tag) : null,
          can ? h('span', { class: 'seat-cta' }, v.phase === 'night' ? ACTION[v.myRole]?.verb ?? '' : 'Vote') : null,
        );
      }),
    );

    // ---------- your card ----------
    const partners = v.seats.filter((s) => s.id !== v.me && s.role === 'leaker' && v.myRole === 'leaker');
    const card = h(
      'section',
      { class: `my-card r-${v.myRole}` },
      h('img', { class: 'card-art', src: art(`role-${v.myRole}.png`), alt: ROLE_NAME[v.myRole] }),
      h(
        'div',
        { class: 'memo' },
        h('span', { class: 'kicker' }, ctl.practice ? 'Your role card · specimen memo' : 'Your role card · shielded memo'),
        h('p', { class: 'memo-text' }, `You are ${CARD_TEXT[v.myRole]}`),
        h('p', { class: 'memo-deal' }, `deal: ${short(v.commitment, 12, 8)}`),
        partners.length ? h('p', { class: 'memo-private' }, `Your fellow Leaker${partners.length > 1 ? 's' : ''}: ${partners.map((p) => p.name).join(', ')}`) : null,
        v.audits.length ? h('div', { class: 'notebook' }, h('span', { class: 'kicker' }, "Auditor's notebook"), ...v.audits.map((a) => h('p', {}, `Night ${a.round}: ${name(a.seat)} is `, h('b', { class: a.leaker ? 'bad' : 'ok' }, a.leaker ? 'a LEAKER' : 'not a Leaker')))) : null,
      ),
    );

    // ---------- actions ----------
    const actions = h('section', { class: 'actions' });
    if (v.phase === 'over') {
      actions.append(endPanel(v, ctl, onLeave));
    } else if (!me.alive) {
      actions.append(h('p', { class: 'muted' }, 'You were exposed. You can watch, but the dead do not talk or vote.'));
    } else if (v.phase === 'night') {
      const a = ACTION[v.myRole];
      if (v.targets.length && a) actions.append(h('h3', {}, a.prompt), h('p', { class: 'hint' }, 'Tap a ghost above.'));
      else actions.append(h('h3', {}, v.acted && a ? 'Done. Lights out.' : 'You sleep.'), h('p', { class: 'hint' }, `${v.waiting} ghost${v.waiting === 1 ? ' is' : 's are'} still out in the dark.`));
    } else if (v.phase === 'day') {
      const claimRole = h('select', {}, ...(['citizen', 'auditor', 'shielder'] as Role[]).map((r) => h('option', { value: r }, ROLE_NAME[r])));
      const checkSeat = h('select', {}, h('option', { value: '' }, 'no check'), ...v.seats.filter((s) => s.alive && s.id !== v.me).map((s) => h('option', { value: String(s.id) }, `checked ${s.name}`)));
      const checkRes = h('select', {}, h('option', { value: 'leaker' }, 'LEAKER'), h('option', { value: 'clear' }, 'clear'));
      actions.append(
        h('h3', {}, 'Day. Talk, accuse, prove.'),
        chat,
        h(
          'div',
          { class: 'claim-row' },
          h('span', { class: 'kicker' }, 'Claim'),
          claimRole,
          checkSeat,
          checkRes,
          h('button', { class: 'btn small', type: 'button', onclick: () => ctl.claim(claimRole.value as Role, checkSeat.value ? { seat: Number(checkSeat.value), leaker: checkRes.value === 'leaker' } : undefined) }, 'Claim it'),
        ),
        h('p', { class: 'hint' }, 'Anyone can claim anything. Only a real role card can be proved.'),
        h(
          'div',
          { class: 'row' },
          me.proven ? h('span', { class: 'tag ok' }, '✓ Your role is proven') : h('button', { class: 'btn prove', type: 'button', onclick: () => openProof(ctl, () => (proofOpen = false)) }, 'Prove my role card'),
          ctl.canCallVote ? h('button', { class: 'btn primary', type: 'button', onclick: () => ctl.callVote() }, 'Call the vote') : h('span', { class: 'hint' }, 'The host calls the vote.'),
        ),
      );
    } else if (v.phase === 'vote') {
      actions.append(
        v.voted ? h('h3', {}, 'Ballot cast.') : h('h3', {}, 'Vote: who is a Leaker?'),
        v.voted ? h('p', { class: 'hint' }, `Waiting for ${v.waiting}. Only the totals will be published.`) : h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Tap a ghost above, or'), h('button', { class: 'btn small', type: 'button', onclick: () => ctl.vote('skip') }, 'Skip')),
      );
    }

    // ---------- feed ----------
    const feed = h('div', { class: 'feed' }, ...v.log.map((e) => feedItem(e, v)).filter(Boolean).reverse() as HTMLElement[]);

    root.replaceChildren(h('div', { class: `table ph-${v.phase}` }, header, h('div', { class: 'table-grid' }, h('div', { class: 'table-main' }, seats, h('div', { class: 'feed-wrap' }, h('span', { class: 'kicker' }, 'The town'), feed)), h('aside', { class: 'table-side' }, card, actions))));
    if (focused) chat.focus();

    // the morning card for anything new and dramatic
    const fresh = v.log.slice(seenLog);
    seenLog = v.log.length;
    const big = [...fresh].reverse().find((e) => e.kind === 'exposed' || e.kind === 'held' || e.kind === 'quiet' || e.kind === 'over');
    if (big && !proofOpen) showMoment(big, v);
  };

  function showMoment(e: GameEvent, v: View) {
    overlay?.remove();
    const name = (id: number) => v.seats[id]?.name ?? '?';
    let img = '', title = '', sub = '', cls = '';
    if (e.kind === 'exposed') {
      img = `exposed-${e.role}.png`;
      title = e.by === 'dox' ? `${name(e.seat)} was doxxed.` : `${name(e.seat)} was voted out.`;
      sub = `They were ${ROLE_NAME[e.role]}.`;
      cls = 'bad';
    } else if (e.kind === 'held') {
      img = 'night-shielder.png';
      title = 'The shield held.';
      sub = `Someone tried to dox ${name(e.seat)} in the night.`;
      cls = 'ok';
    } else if (e.kind === 'quiet') {
      img = 'role-citizen.png';
      title = 'A quiet night.';
      sub = 'Nobody was exposed.';
    } else if (e.kind === 'over') {
      img = e.winner === 'leak' ? 'night-leaker.png' : 'night-shielder.png';
      title = `${TEAM_LABEL[e.winner]} win${e.winner === 'leak' ? '' : 's'}.`;
      sub = e.winner === 'leak' ? 'The town is fully doxxed.' : 'Every Leaker is exposed.';
      cls = e.winner === 'leak' ? 'bad' : 'ok';
    } else return;
    overlay = h('div', { class: `moment ${cls}`, role: 'dialog', onclick: () => (overlay?.remove(), (overlay = null)) }, h('div', { class: 'moment-card' }, h('img', { src: art(img), alt: '' }), h('h2', {}, title), h('p', {}, sub), h('span', { class: 'hint' }, 'tap to continue')));
    document.body.append(overlay);
    const mine = overlay;
    setTimeout(() => mine.classList.add('fade'), 3200);
    setTimeout(() => (mine.remove(), overlay === mine && (overlay = null)), 3800);
  }

  function openProof(c: Controller, onClose: () => void) {
    proofOpen = true;
    const input = h('textarea', { rows: '3', placeholder: 'Paste the chit (zout1…) for your role card', spellcheck: 'false' });
    const out = h('div', { class: 'proof-out' });
    const close = () => (modal.remove(), onClose(), draw());
    const modal = h(
      'div',
      { class: 'modal' },
      h(
        'div',
        { class: 'modal-card' },
        h('h2', {}, 'Prove your role card'),
        h('p', { class: 'muted' }, c.practice ? 'On a staked table your card arrives in your wallet as a shielded memo, and you prove it with a chit made in your own browser. Here the chit for your role in the specimen deal is filled in: a real, proven transaction that is not on chain.' : 'Make a chit for your role-card output at chit.nerom.site/#/make (deal transaction + your viewing key, in your own browser), then paste it here. Everyone at the table verifies it against the deal.'),
        input,
        h('div', { class: 'row' }, h('button', { class: 'btn prove', type: 'button', onclick: run }, 'Verify and show the table'), h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel')),
        out,
      ),
    );
    async function run() {
      out.replaceChildren(h('p', { class: 'muted' }, 'Checking with the official Zcash crates…'));
      try {
        const r = await c.prove(input.value);
        out.replaceChildren(
          ...([h('ol', { class: 'checks' }, ...r.report.steps.map((s) => h('li', { class: s.ok ? 'ok' : s.ok === false ? 'bad' : 'skip' }, h('i', {}, s.ok ? '✓' : s.ok === false ? '✕' : '–'), s.label))),
          r.report.verified?.memo.kind === 'text' ? h('pre', { class: 'memo-proof' }, r.report.verified.memo.value) : null,
          r.problem ? h('p', { class: 'error' }, r.problem) : h('p', { class: 'ok-line' }, `✓ Proved: ${ROLE_NAME[r.card!.role]}. The whole table now knows it is true.`),
          ].filter((x) => x !== null) as Node[]),
        );
        if (!r.problem) setTimeout(close, 2200);
      } catch (e) {
        out.replaceChildren(h('p', { class: 'error' }, e instanceof Error ? e.message : String(e)));
      }
    }
    document.body.append(modal);
    c.cardChit().then((x) => x && !input.value && (input.value = x));
  }

  const off = ctl.subscribe(draw);
  draw();
  return () => {
    off();
    overlay?.remove();
  };
}

function feedItem(e: GameEvent, v: View): HTMLElement | null {
  const name = (id: number) => v.seats[id]?.name ?? '?';
  switch (e.kind) {
    case 'night':
      return h('div', { class: 'f-night' }, `☾ Night ${e.round} falls. Doors lock. Keys come out.`);
    case 'exposed':
      return h('div', { class: 'f-exposed' }, e.by === 'dox' ? '☀ ' : '⚖ ', h('b', {}, name(e.seat)), e.by === 'dox' ? ' was doxxed in the night. ' : ' was voted out. ', 'They were ', h('span', { class: `rt r-${e.role}` }, ROLE_NAME[e.role]), '.');
    case 'held':
      return h('div', { class: 'f-held' }, '☀ Someone tried to dox ', h('b', {}, name(e.seat)), '. The shield held.');
    case 'quiet':
      return h('div', { class: 'f-held' }, '☀ A quiet night. Nobody was exposed.');
    case 'say':
      return h('div', { class: `f-say${e.seat === v.me ? ' mine' : ''}` }, h('b', {}, name(e.seat)), ' ', e.text);
    case 'claim':
      return h('div', { class: 'f-claim' }, h('b', {}, name(e.seat)), ' claims ', h('span', { class: `rt r-${e.role}` }, ROLE_NAME[e.role]), e.checked ? ` · says ${name(e.checked.seat)} is ${e.checked.leaker ? 'a LEAKER' : 'clear'}` : '', h('span', { class: 'unproven' }, 'unproven'));
    case 'proof':
      return h('div', { class: 'f-proof' }, '✓ ', h('b', {}, name(e.seat)), ' proved their role card: ', h('span', { class: `rt r-${e.role}` }, ROLE_NAME[e.role]), h('span', { class: 'proven' }, 'verified chit'));
    case 'tally': {
      const total = Object.values(e.counts).reduce((a, b) => a + b, 0) || 1;
      return h(
        'div',
        { class: 'f-tally' },
        h('span', { class: 'kicker' }, `Shielded ballot · day ${e.round}`),
        ...Object.entries(e.counts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => h('div', { class: 'bar' }, h('span', { class: 'bar-fill', style: `width:${(n / total) * 100}%` }), h('span', {}, k === 'skip' ? 'Skip' : name(Number(k))), h('b', {}, String(n)))),
        h('p', { class: 'hint' }, e.exposed === null ? 'No majority. Nobody is exposed.' : 'Totals only. Who voted for whom stays shielded.'),
      );
    }
    case 'glitch':
      return h('div', { class: 'f-claim' }, h('b', {}, name(e.seat)), ' was ', h('span', { class: 'rt r-glitch' }, 'The Glitch'), '. Voted out on purpose. The Glitch takes a share of the pot.');
    case 'over':
      return h('div', { class: `f-over ${e.winner}` }, `${TEAM_LABEL[e.winner]} win${e.winner === 'leak' ? '' : 's'}.`);
  }
}

function endPanel(v: View, ctl: Controller, onLeave: () => void) {
  const r = ctl.reveal();
  const won = v.winner && (TEAM[v.myRole] === v.winner || (v.myRole === 'glitch' && v.glitchWon));
  const ok = r ? verifyDeal(r.seats, r.salt, r.commitment) : null;
  return h(
    'div',
    { class: 'end' },
    h('h3', {}, won ? 'You win.' : 'You lose.'),
    h('p', { class: 'muted' }, `${TEAM_LABEL[v.winner!]} win${v.winner === 'leak' ? '' : 's'}${v.glitchWon && v.winner !== 'glitch' ? ', and the Glitch takes a share' : ''}.`),
    r
      ? h(
          'div',
          { class: 'deal-check' },
          h('span', { class: 'kicker' }, 'The deal, revealed'),
          h('pre', { class: 'code' }, `${r.seats.map((s) => `${s.id + 1}. ${s.name}: ${ROLE_NAME[s.role]}`).join('\n')}\nsalt ${short(r.salt, 10, 6)}`),
          h('p', { class: ok ? 'ok-line' : 'error' }, ok ? `✓ SHA-256 of this deal equals the commitment printed on every role card (${short(r.commitment, 8, 6)}). The narrator did not change a thing.` : '✕ The deal does not match the commitment.'),
        )
      : null,
    ctl.practice ? h('p', { class: 'hint' }, 'On a staked table, the winners split the pot here: one ZIP 321 payment request from the table wallet, published as a Chit payout ledger.') : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: onLeave }, 'Back to town')),
  );
}
