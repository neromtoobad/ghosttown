// Staked tables. The host's browser is the narrator: it runs the engine and sends each guest
// only that guest's own view, sealed to the guest's key. Buy-ins, the deal and the payout are
// real Zcash payments made from the players' own wallets via ZIP 321 requests; a role can be
// proved with a chit against the deal transaction.

import qrcode from 'qrcode-generator';
import { ready, scan, txid as txidOf } from 'chit-zcash';
import { claim, crackShield, newGame, prove, say, seat, viewFor, vote as castVote, act as nightAct, winners, type Game, type Role, type View } from './engine';
import { h, copy, short, art } from './dom';
import { connect, makeKeys, open, peerId, seal, sharedKey, type Keys, type Wire } from './net';
import { BOT_NAMES, randomHex } from './practice';
import { createRunner } from './runner';
import type { Controller } from './table';
import { CARD_ZAT, fetchTx, joinMemo, proveRole, roleCard, zecString, zip321, type Payment, type ProofResult } from './zec';

type Play = (c: Controller) => void;

// ---------- messages ----------

type ToHost =
  | { t: 'join'; name: string; addr: string }
  | { t: 'paid'; txid: string }
  | { t: 'act'; target: number }
  | { t: 'vote'; target: number | 'skip' }
  | { t: 'say'; text: string }
  | { t: 'claim'; role: Role; checked?: { seat: number; leaker: boolean } }
  | { t: 'prove'; chit: string };

interface LobbySeat {
  name: string;
  paid: 'no' | 'claimed' | 'yes';
  you: boolean;
}

type ToGuest =
  | { t: 'lobby'; seats: LobbySeat[]; stakeZat: number; tableAddr: string; seat: number; status: string }
  | { t: 'view'; view: View; dealTxid: string | null; stakeZat: number }
  | { t: 'proved'; ok: boolean; problem: string | null }
  | { t: 'bye'; reason: string };

// ---------- helpers ----------

const qr = (text: string, cls = 'qr') => {
  const q = qrcode(0, 'L');
  q.addData(text);
  q.make();
  const box = h('div', { class: cls });
  box.innerHTML = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
  return box;
};

const parseZec = (s: string) => {
  const m = s.trim().match(/^(\d{1,4})(?:\.(\d{1,8}))?$/);
  return m ? Number(m[1]) * 1e8 + Number((m[2] ?? '').padEnd(8, '0')) : null;
};

const code4 = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => A[b % A.length]).join('');
};

const isUA = (a: string) => /^u1[02-9ac-hj-np-z]{100,}$/.test(a.trim());

// ---------- host ----------

interface Guest {
  id: string;
  key: Uint8Array;
  name: string;
  addr: string;
  paid: 'no' | 'claimed' | 'yes';
  txid: string | null;
  seat: number | null;
}

export function hostSetup(play: Play) {
  const name = h('input', { placeholder: 'Your ghost name', maxlength: '16' });
  const addr = h('input', { placeholder: 'u1… (your Zodl address: buy-ins arrive here, and your card)', spellcheck: 'false' });
  const stake = h('input', { value: '0.01', inputmode: 'decimal' });
  const ufvk = h('input', { placeholder: 'uview1… (optional: lets this tab confirm buy-ins)', spellcheck: 'false', autocomplete: 'off', class: 'masked' });
  const size = h('select', {}, ...[5, 6, 7, 8, 9, 10].map((n) => h('option', { value: String(n), ...(n === 7 ? { selected: true } : {}) }, `${n} seats (bots fill the rest)`)));
  const err = h('div');
  const box = h(
    'section',
    { class: 'setup panel' },
    h('img', { class: 'setup-art', src: art('night-leaker.png'), alt: '' }),
    h('p', { class: 'eyebrow' }, 'Staked table'),
    h('h1', {}, 'Host a table.'),
    h('p', { class: 'muted' }, 'Your browser becomes the narrator. Friends join with a link, buy in with Zodl, and get their role card as a shielded memo. Empty seats are filled by bots.'),
    h('label', {}, 'Your name'),
    name,
    h('label', {}, 'Table wallet (your shielded address)'),
    addr,
    h('div', { class: 'grid2' }, h('div', {}, h('label', {}, 'Buy-in (ZEC, 0 for a friendly)'), stake), h('div', {}, h('label', {}, 'Seats'), size)),
    h('label', {}, 'Viewing key (optional)'),
    ufvk,
    h('p', { class: 'hint' }, 'Used only in this tab, to read buy-in transactions. Without it you confirm buy-ins by hand.'),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: async () => {
            err.replaceChildren();
            const zat = parseZec(stake.value);
            if (!isUA(addr.value)) return err.replaceChildren(h('p', { class: 'error' }, 'Paste a Unified Address (u1…) from Zodl’s Receive screen.'));
            if (zat === null) return err.replaceChildren(h('p', { class: 'error' }, 'Enter a buy-in in ZEC, e.g. 0.01, or 0.'));
            try {
              const lobby = await hostLobby({ name: name.value.trim().replace(/[:\n]/g, '') || 'Host', addr: addr.value.trim(), stakeZat: zat, ufvk: ufvk.value.trim() || null, size: Number(size.value) }, play);
              box.replaceWith(lobby);
            } catch (e) {
              err.replaceChildren(h('p', { class: 'error' }, e instanceof Error ? e.message : String(e)));
            }
          },
        },
        'Open the table',
      ),
    ),
    err,
  );
  return box;
}

interface HostOpts {
  name: string;
  addr: string;
  stakeZat: number;
  ufvk: string | null;
  size: number;
}

async function hostLobby(o: HostOpts, play: Play): Promise<HTMLElement> {
  const table = code4();
  const keys = makeKeys();
  const guests = new Map<string, Guest>();
  const root = h('section', { class: 'lobby' });
  let host: HostTable | null = null;

  const send = (g: Guest, m: ToGuest) => wire.send(seal(g.key, m), g.id);
  const lobbyFor = (g: Guest): ToGuest => ({
    t: 'lobby',
    seats: [{ name: o.name, paid: 'yes', you: false }, ...[...guests.values()].filter((x) => x.name).map((x) => ({ name: x.name, paid: x.paid, you: x === g }))],
    stakeZat: o.stakeZat,
    tableAddr: o.addr,
    seat: [...guests.values()].filter((x) => x.name).indexOf(g) + 1,
    status: 'Waiting for the host to deal.',
  });
  const pushLobby = () => {
    for (const g of guests.values()) if (g.name) send(g, lobbyFor(g));
    draw();
  };

  const wire: Wire = await connect(
    table,
    'host',
    peerId(),
    (from, data) => {
      if (data.startsWith('hello:')) {
        const pub = data.slice(6);
        if (!/^[0-9a-f]{64}$/.test(pub)) return;
        guests.set(from, { id: from, key: sharedKey(keys, pub, table), name: '', addr: '', paid: o.stakeZat === 0 ? 'yes' : 'no', txid: null, seat: null });
        return;
      }
      const g = guests.get(from);
      if (!g) return;
      const m = open<ToHost>(g.key, data);
      if (!m) return;
      if (host) return host.onGuest(g, m);
      if (m.t === 'join' && !g.name && typeof m.name === 'string' && isUA(m.addr ?? '')) {
        g.name = m.name.replace(/[:\n]/g, '').slice(0, 16) || 'Ghost';
        g.addr = m.addr.trim();
        pushLobby();
      } else if (m.t === 'paid' && /^[0-9a-f]{64}$/.test(m.txid)) {
        g.txid = m.txid;
        if (g.paid !== 'yes') g.paid = 'claimed';
        pushLobby();
        if (o.ufvk) verifyBuyIn(g);
      }
    },
    (id, joined) => {
      if (!joined && !host) {
        guests.delete(id);
        pushLobby();
      }
    },
  );

  async function verifyBuyIn(g: Guest) {
    if (!o.ufvk || !g.txid) return;
    try {
      await ready();
      const tx = await fetchTx(g.txid);
      const found = scan(tx.hex, o.ufvk, 'main');
      const seatNo = [...guests.values()].filter((x) => x.name).indexOf(g) + 1;
      const ok = found.some((f) => f.direction === 'incoming' && f.value_zat >= o.stakeZat && f.memo.kind === 'text' && f.memo.value.startsWith(`ghosttown:${table}:join:${seatNo + 1}`));
      if (ok) g.paid = 'yes';
    } catch {
      /* not visible yet; the host can retry or confirm by hand */
    }
    pushLobby();
  }

  const link = `${location.origin}${location.pathname}#/t/${table}/${keys.pub}`;

  function draw() {
    const seated = [...guests.values()].filter((g) => g.name);
    root.replaceChildren(
      h(
        'div',
        { class: 'lobby-grid' },
        h(
          'div',
          { class: 'panel' },
          h('p', { class: 'eyebrow' }, `Table ${table}`),
          h('h1', {}, 'The lobby.'),
          h('p', { class: 'muted' }, `Buy-in ${o.stakeZat ? `${zecString(o.stakeZat)} ZEC` : 'free (friendly table)'} · ${o.size} seats · ${o.size - 1 - seated.length} will be bots.`),
          h('div', { class: 'share' }, qr(link), h('div', {}, h('span', { class: 'kicker' }, 'Invite link'), h('code', { class: 'code', 'data-link': link }, short(link, 48, 20)), h('button', { class: 'btn small', type: 'button', onclick: (e: Event) => copy(link, e.currentTarget as HTMLElement) }, 'Copy link'))),
          h('p', { class: 'hint' }, 'The link carries your table key. Anyone with it can join, so share it only with your players.'),
        ),
        h(
          'div',
          { class: 'panel' },
          h('span', { class: 'kicker' }, 'Seats'),
          h('div', { class: 'lobby-seats' }, lobbyRow(o.name, 'yes', 'host'), ...seated.map((g) => lobbyRow(g.name, g.paid, g.txid ? short(g.txid, 8, 6) : '', g.paid === 'claimed' ? () => ((g.paid = 'yes'), pushLobby()) : null, g.paid === 'claimed' && o.ufvk ? () => verifyBuyIn(g) : null))),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: deal }, seated.length ? 'Deal the cards' : 'Deal (you and bots)')),
          h('p', { class: 'hint' }, 'Unpaid seats are not dealt in until confirmed.'),
        ),
      ),
    );
  }

  function deal() {
    const seated = [...guests.values()].filter((g) => g.name && g.paid === 'yes').slice(0, o.size - 1);
    const pool = BOT_NAMES.filter((n) => ![o.name, ...seated.map((g) => g.name)].some((x) => x.toLowerCase() === n.toLowerCase())).sort(() => Math.random() - 0.5);
    const players = [{ name: o.name, bot: false }, ...seated.map((g) => ({ name: g.name, bot: false })), ...pool.slice(0, Math.max(0, o.size - 1 - seated.length)).map((n) => ({ name: n, bot: true }))];
    seated.forEach((g, i) => (g.seat = i + 1));
    for (const g of guests.values()) if (g.seat === null) send(g, { t: 'bye', reason: 'The cards were dealt without you.' });
    const game = newGame(players, randomHex(16), randomHex(16));
    host = new HostTable(table, o, game, seated, (g, m) => send(g, m));
    root.replaceWith(dealScreen(host, play));
  }

  draw();
  return root;
}

function lobbyRow(name: string, paid: 'no' | 'claimed' | 'yes', detail: string, confirm?: (() => void) | null, verify?: (() => void) | null) {
  return h(
    'div',
    { class: `lobby-seat p-${paid}` },
    h('b', {}, name),
    h('span', { class: 'kicker' }, paid === 'yes' ? 'in' : paid === 'claimed' ? 'paid? check it' : 'not paid'),
    detail ? h('code', {}, detail) : null,
    verify ? h('button', { class: 'btn small', type: 'button', onclick: verify }, 'Check chain') : null,
    confirm ? h('button', { class: 'btn small ghost', type: 'button', onclick: confirm }, 'Confirm by hand') : null,
  );
}

/** The narrator: owns the Game, runs bots, applies guests' moves, and sends each guest their view. */
class HostTable {
  dealTxid: string | null = null;
  dealHex: string | null = null;
  private subs = new Set<() => void>();
  private run;
  constructor(
    readonly table: string,
    readonly o: HostOpts,
    readonly g: Game,
    readonly guests: Guest[],
    private send: (g: Guest, m: ToGuest) => void,
  ) {
    this.run = createRunner(g, () => [0, ...guests.map((x) => x.seat!)], () => this.emit());
  }

  emit() {
    this.subs.forEach((f) => f());
    for (const gu of this.guests) this.send(gu, { t: 'view', view: viewFor(this.g, gu.seat!), dealTxid: this.dealTxid, stakeZat: this.o.stakeZat });
  }

  /** Role cards for every human seat, one ZIP 321 request: the whole deal in one transaction. */
  dealPayments(): Payment[] {
    const addrs = [this.o.addr, ...this.guests.map((g) => g.addr)];
    const seats = [0, ...this.guests.map((g) => g.seat!)];
    return seats.map((s, i) => ({ address: addrs[i], zat: CARD_ZAT, memo: roleCard(this.table, s, seat(this.g, s).name, seat(this.g, s).role, this.g.commitment) }));
  }

  async setDeal(txid: string) {
    const tx = await fetchTx(txid);
    await ready();
    if (txidOf(tx.hex) !== txid) throw new Error('Those bytes do not hash to this txid. Refusing them.');
    this.dealTxid = txid;
    this.dealHex = tx.hex;
    this.emit();
  }

  async check(chit: string, s: number): Promise<ProofResult> {
    if (!this.dealTxid || !this.dealHex) throw new Error('The host has not recorded the deal transaction yet.');
    const r = await proveRole(chit, this.dealHex, { txid: this.dealTxid, table: this.table, seat: s, commitment: this.g.commitment });
    if (!r.problem && r.card?.role !== seat(this.g, s).role) r.problem = 'That card does not match this seat.';
    if (!r.problem && !seat(this.g, s).proven) prove(this.g, s);
    this.emit();
    return r;
  }

  onGuest(gu: Guest, m: ToHost) {
    const s = gu.seat;
    if (s === null) return;
    try {
      if (m.t === 'act') nightAct(this.g, s, m.target);
      else if (m.t === 'vote') castVote(this.g, s, m.target);
      else if (m.t === 'say' && seat(this.g, s).alive && this.g.phase === 'day') say(this.g, s, String(m.text).slice(0, 200));
      else if (m.t === 'claim' && seat(this.g, s).alive && this.g.phase === 'day') claim(this.g, s, m.role, m.checked);
      else if (m.t === 'prove') {
        this.check(m.chit, s)
          .then((r) => this.send(gu, { t: 'proved', ok: !r.problem, problem: r.problem }))
          .catch((e) => this.send(gu, { t: 'proved', ok: false, problem: e instanceof Error ? e.message : String(e) }));
        return;
      }
    } catch {
      /* an illegal move from a guest is ignored */
    }
    this.run.tick();
  }

  controller(): Controller {
    const me = 0;
    return {
      table: this.table,
      practice: false,
      canCallVote: true,
      staked: { dealTxid: this.dealTxid, stakeZat: this.o.stakeZat },
      view: () => viewFor(this.g, me),
      subscribe: (f) => (this.subs.add(f), () => this.subs.delete(f)),
      act: (t) => (nightAct(this.g, me, t), this.run.tick()),
      crack: () => (crackShield(this.g, me), this.run.tick()),
      vote: (t) => (castVote(this.g, me, t), this.run.tick()),
      say: (text) => (say(this.g, me, text), this.emit()),
      claim: (role, checked) => (claim(this.g, me, role, checked), this.emit()),
      callVote: () => this.run.callVote(),
      cardChit: async () => null,
      prove: (chit) => this.check(chit, me),
      reveal: () => (this.g.phase === 'over' ? { seats: this.g.seats.map(({ id, name, role }) => ({ id, name, role })), salt: this.g.salt, commitment: this.g.commitment } : null),
      extraEnd: () => payoutPanel(this),
      leave: () => this.run.stop(),
    };
  }
}

function dealScreen(host: HostTable, play: Play) {
  const payments = host.dealPayments();
  const uri = zip321(payments);
  const txid = h('input', { placeholder: 'Deal transaction id (64 hex), once Zodl has sent it', spellcheck: 'false' });
  const msg = h('div');
  return h(
    'section',
    { class: 'deal panel' },
    h('p', { class: 'eyebrow' }, `Table ${host.table} · the deal`),
    h('h1', {}, 'Deal the cards.'),
    h('p', { class: 'muted' }, `Scan this with Zodl and send. It is one transaction with ${payments.length} outputs: each player’s role card as an encrypted memo, ${zecString(CARD_ZAT)} ZEC each. Only each player’s wallet can read their card. Every card carries the commitment below.`),
    h('div', { class: 'share' }, qr(uri, 'qr lg'), h('div', {}, h('span', { class: 'kicker' }, 'Deal commitment'), h('code', { class: 'code' }, host.g.commitment), h('button', { class: 'btn small', type: 'button', onclick: (e: Event) => copy(uri, e.currentTarget as HTMLElement) }, 'Copy payment request'))),
    h('details', { class: 'fallback' }, h('summary', {}, 'Wallet does not take multi-recipient requests? Deal one card at a time.'), h('div', { class: 'cards-row' }, ...payments.map((p, i) => h('div', { class: 'mini' }, qr(zip321([p])), h('span', { class: 'kicker' }, `Seat ${i === 0 ? 1 : host.guests[i - 1].seat! + 1}`))))),
    h('label', {}, 'Deal transaction'),
    txid,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: async () => {
            msg.replaceChildren(h('p', { class: 'muted' }, 'Fetching the deal…'));
            try {
              await host.setDeal(txid.value.trim().toLowerCase());
              msg.replaceChildren(h('p', { class: 'ok-line' }, '✓ Deal recorded. Players can now prove their cards.'));
            } catch (e) {
              msg.replaceChildren(h('p', { class: 'error' }, e instanceof Error ? e.message : String(e)));
            }
          },
        },
        'Record the deal',
      ),
      h('button', { class: 'btn primary', type: 'button', onclick: () => play(host.controller()) }, 'Start night 1'),
    ),
    h('p', { class: 'hint' }, 'You can start before the deal confirms: every player already has their role in this app. The on-chain card is what makes a role provable.'),
    msg,
  );
}

function payoutPanel(host: HostTable) {
  const g = host.g;
  if (g.phase !== 'over' || !host.o.stakeZat) return null;
  const addrOf = (s: number) => (s === 0 ? host.o.addr : host.guests.find((x) => x.seat === s)?.addr);
  const humanWinners = winners(g).filter((s) => !seat(g, s).bot);
  const paidIn = 1 + host.guests.length;
  const pot = host.o.stakeZat * paidIn;
  if (!humanWinners.length) return h('p', { class: 'hint' }, 'Only bots won. The stakes stay with the table wallet: refund the players by hand.');
  const share = Math.floor((pot - 20_000) / humanWinners.length); // leave room for the fee
  const uri = zip321(humanWinners.map((s) => ({ address: addrOf(s)!, zat: share, memo: `GHOST TOWN · table ${host.table} · you won ${zecString(share)} ZEC. deal: ${g.commitment}` })));
  return h('div', { class: 'payout' }, h('span', { class: 'kicker' }, 'Pay the winners'), h('p', { class: 'muted' }, `Pot ${zecString(pot)} ZEC. ${humanWinners.length} winning player${humanWinners.length > 1 ? 's' : ''} get ${zecString(share)} ZEC each, in one ZIP 321 request from the table wallet.`), qr(uri, 'qr'), h('p', { class: 'hint' }, 'Afterwards, publish the payout chits as a ledger at chit.nerom.site/#/ledger so anyone can audit it.'));
}

// ---------- guest ----------

export function joinView(code: string, play: Play) {
  const hostPub = location.hash.split('/')[3] ?? '';
  const name = h('input', { placeholder: 'Your ghost name', maxlength: '16' });
  const addr = h('input', { placeholder: 'u1… (your Zodl address: your role card and any prize arrive here)', spellcheck: 'false' });
  const err = h('div');
  const box = h(
    'section',
    { class: 'setup panel' },
    h('img', { class: 'setup-art', src: art('role-citizen.png'), alt: '' }),
    h('p', { class: 'eyebrow' }, `Table ${code}`),
    h('h1', {}, 'Join the table.'),
    h('p', { class: 'muted' }, 'You will buy in from Zodl and receive your role card as a shielded memo. Your address goes only to the host, encrypted.'),
    h('label', {}, 'Your name'),
    name,
    h('label', {}, 'Your shielded address'),
    addr,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: async () => {
            if (!/^[0-9a-f]{64}$/.test(hostPub)) return err.replaceChildren(h('p', { class: 'error' }, 'This link is missing the table key. Ask the host for the full invite link.'));
            if (!isUA(addr.value)) return err.replaceChildren(h('p', { class: 'error' }, 'Paste a Unified Address (u1…) from Zodl’s Receive screen.'));
            try {
              box.replaceWith(await guestLobby(code, hostPub, name.value.trim().replace(/[:\n]/g, '') || 'Ghost', addr.value.trim(), play));
            } catch (e) {
              err.replaceChildren(h('p', { class: 'error' }, e instanceof Error ? e.message : String(e)));
            }
          },
        },
        'Take a seat',
      ),
    ),
    err,
  );
  return box;
}

async function guestLobby(table: string, hostPub: string, name: string, addr: string, play: Play): Promise<HTMLElement> {
  const keys: Keys = makeKeys();
  const key = sharedKey(keys, hostPub, table);
  const root = h('section', { class: 'lobby' }, h('p', { class: 'muted' }, 'Knocking…'));
  let ctl: GuestTable | null = null;
  const wire = await connect(
    table,
    'guest',
    peerId(),
    (_from, data) => {
      const m = open<ToGuest>(key, data);
      if (!m) return;
      if (m.t === 'lobby') drawLobby(m);
      else if (m.t === 'view') {
        if (!ctl) {
          ctl = new GuestTable(table, (x) => wire.send(seal(key, x)), m);
          play(ctl.controller());
        } else ctl.update(m);
      } else if (m.t === 'proved') ctl?.proved(m);
      else if (m.t === 'bye') root.replaceChildren(h('p', { class: 'error' }, m.reason));
    },
    undefined,
    (reason) => root.isConnected && root.replaceChildren(h('p', { class: 'error' }, `The table closed: ${reason}`)),
  );
  wire.send(`hello:${keys.pub}`);
  wire.send(seal(key, { t: 'join', name, addr } satisfies ToHost));

  function drawLobby(m: Extract<ToGuest, { t: 'lobby' }>) {
    const me = m.seats.find((s) => s.you);
    const txid = h('input', { placeholder: 'Buy-in transaction id', spellcheck: 'false' });
    const pay = m.stakeZat ? zip321([{ address: m.tableAddr, zat: m.stakeZat, memo: joinMemo(table, m.seat, name) }]) : null;
    root.replaceChildren(
      h(
        'div',
        { class: 'lobby-grid' },
        h(
          'div',
          { class: 'panel' },
          h('p', { class: 'eyebrow' }, `Table ${table} · seat ${m.seat + 1}`),
          h('h1', {}, me?.paid === 'yes' ? 'You are in.' : 'Buy in.'),
          pay && me?.paid !== 'yes'
            ? h(
                'div',
                {},
                h('p', { class: 'muted' }, `Scan with Zodl: ${zecString(m.stakeZat)} ZEC to the table, with your seat in the memo. Then paste the transaction id.`),
                h('div', { class: 'share' }, qr(pay, 'qr lg'), h('div', {}, h('a', { class: 'btn small', href: pay }, 'Open in wallet'), h('button', { class: 'btn small', type: 'button', onclick: (e: Event) => copy(pay, e.currentTarget as HTMLElement) }, 'Copy request'))),
                txid,
                h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => /^[0-9a-f]{64}$/.test(txid.value.trim()) && wire.send(seal(key, { t: 'paid', txid: txid.value.trim().toLowerCase() } satisfies ToHost)) }, 'I paid')),
              )
            : h('p', { class: 'muted' }, m.status),
        ),
        h('div', { class: 'panel' }, h('span', { class: 'kicker' }, 'At the table'), h('div', { class: 'lobby-seats' }, ...m.seats.map((s) => lobbyRow(s.you ? `${s.name} (you)` : s.name, s.paid, '')))),
      ),
    );
  }
  return root;
}

class GuestTable {
  private subs = new Set<() => void>();
  private pending: ((r: { ok: boolean; problem: string | null }) => void) | null = null;
  constructor(
    readonly table: string,
    private send: (m: ToHost) => void,
    private last: Extract<ToGuest, { t: 'view' }>,
  ) {}

  update(m: Extract<ToGuest, { t: 'view' }>) {
    this.last = m;
    this.subs.forEach((f) => f());
  }

  proved(m: { ok: boolean; problem: string | null }) {
    this.pending?.(m);
    this.pending = null;
  }

  controller(): Controller {
    const self = this;
    return {
      table: this.table,
      practice: false,
      canCallVote: false,
      get staked() {
        return { dealTxid: self.last.dealTxid, stakeZat: self.last.stakeZat };
      },
      view: () => this.last.view,
      subscribe: (f) => (this.subs.add(f), () => this.subs.delete(f)),
      act: (target) => this.send({ t: 'act', target }),
      vote: (target) => this.send({ t: 'vote', target }),
      say: (text) => this.send({ t: 'say', text }),
      claim: (role, checked) => this.send({ t: 'claim', role, checked }),
      callVote: () => {},
      cardChit: async () => null,
      async prove(chit) {
        // Check it here first with this tab's own copy of the deal, then ask the narrator.
        const v = self.last.view;
        if (!self.last.dealTxid) throw new Error('The host has not recorded the deal transaction yet.');
        const tx = await fetchTx(self.last.dealTxid);
        const r = await proveRole(chit, tx.hex, { txid: self.last.dealTxid, table: self.table, seat: v.me, commitment: v.commitment });
        if (r.problem) return r;
        const verdict = await new Promise<{ ok: boolean; problem: string | null }>((res) => {
          self.pending = res;
          self.send({ t: 'prove', chit });
        });
        return { ...r, problem: verdict.ok ? null : verdict.problem };
      },
      reveal: () => {
        const v = this.last.view;
        return v.phase === 'over' && v.salt ? { seats: v.seats.map((s) => ({ id: s.id, name: s.name, role: s.role! })), salt: v.salt, commitment: v.commitment } : null;
      },
    };
  }
}
