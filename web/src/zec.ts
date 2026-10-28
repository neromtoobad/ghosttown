// Everything that touches Zcash: role-card memos, ZIP 321 payment requests (buy-in, the deal,
// the payout), fetching a transaction, and proving a role by verifying a chit against the deal.

import { ready, verify, inspect, type Report } from 'chit-zcash';
import type { Role } from './engine';
import { RELAY } from './net';

export const CARD_TEXT: Record<Role, string> = {
  leaker: 'THE LEAKER. Each night, choose one ghost to dox. Win when Leakers equal everyone else.',
  auditor: "THE AUDITOR. Each night, check one ghost's viewing key: Leaker or not.",
  shielder: 'THE SHIELDER. Each night, shield one ghost from the dox. Never the same ghost twice.',
  glitch: 'THE GLITCH. You win if the town votes you out.',
  citizen: 'A CITIZEN. Find the Leakers and vote them out.',
};

/** The memo of a role card. It names the table and seat and carries the deal commitment. */
export const roleCard = (table: string, seat: number, name: string, role: Role, commitment: string) =>
  `GHOST TOWN · role card · table ${table} · seat ${seat + 1} (${name.slice(0, 24)})\nYou are ${CARD_TEXT[role]}\ndeal: ${commitment}\nghosttown.nerom.site`;

export interface Card {
  role: Role;
  table: string | null;
  seat: number | null;
  commitment: string | null;
}

/** Reads a role card back out of a memo; null if the memo is not one. */
export function parseCard(memo: string): Card | null {
  if (!memo.startsWith('GHOST TOWN · role card')) return null;
  const role = (Object.keys(CARD_TEXT) as Role[]).find((r) => memo.includes(`You are ${CARD_TEXT[r]}`));
  if (!role) return null;
  const table = memo.match(/table ([A-Z0-9]{4,8})/)?.[1] ?? null;
  const seatNo = memo.match(/seat (\d+)/)?.[1];
  const commitment = memo.match(/deal: ([0-9a-f]{64})/)?.[1] ?? null;
  return { role, table, seat: seatNo ? Number(seatNo) - 1 : null, commitment };
}

// ---------- ZIP 321 ----------

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const zecString = (zat: number) => `${Math.floor(zat / 1e8)}.${String(zat % 1e8).padStart(8, '0')}`.replace(/\.?0+$/, '');

export interface Payment {
  address: string;
  zat: number;
  memo?: string;
}

/** A ZIP 321 request. Several payments become one transaction in wallets that support it. */
export function zip321(payments: Payment[]): string {
  if (payments.length === 1) {
    const [p] = payments;
    const q = [`amount=${zecString(p.zat)}`, ...(p.memo ? [`memo=${b64url(p.memo)}`] : [])];
    return `zcash:${p.address}?${q.join('&')}`;
  }
  const q = payments.flatMap((p, i) => {
    const k = i === 0 ? '' : `.${i}`;
    return [`address${k}=${p.address}`, `amount${k}=${zecString(p.zat)}`, ...(p.memo ? [`memo${k}=${b64url(p.memo)}`] : [])];
  });
  return `zcash:?${q.join('&')}`;
}

export const CARD_ZAT = 10_000; // 0.0001 ZEC of dust carries each role card
export const joinMemo = (table: string, seat: number, name: string) => `ghosttown:${table}:join:${seat + 1}:${name.slice(0, 24)}`;

// ---------- the chain ----------

export interface TxData {
  hex: string;
  height: number | null;
}

/** Where transactions come from: the table relay's /tx, which reads them straight from Zcash
 *  lightwalletd. No block explorer ever learns which deal a player looked up, and every caller
 *  re-hashes the bytes to the txid, so not even the relay can swap a transaction. */
export const TX_SOURCE = RELAY.replace(/^ws/, 'http');

export async function fetchTx(txid: string): Promise<TxData> {
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error('A txid is 64 hex characters.');
  const r = await fetch(`${TX_SOURCE}/tx?txid=${txid}`, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.hex) throw new Error(j?.error ?? `Zcash lookup failed (${r.status}). A fresh transaction can take a minute to appear.`);
  return { hex: j.hex, height: j.height ?? null };
}

// ---------- proof of role ----------

export interface Specimen {
  txid: string;
  tx: string;
  cards: Record<Role, string>;
}

let spec: Promise<Specimen> | null = null;
export const specimen = () => (spec ??= fetch(`${import.meta.env.BASE_URL}specimen-deal.json`, { credentials: 'omit' }).then((r) => r.json()));

export interface ProofResult {
  report: Report;
  card: Card | null;
  /** Why the proof does not count, if it does not. */
  problem: string | null;
}

/**
 * Verifies a chit against the deal transaction and reads the role card it opens. The chit must
 * name the deal transaction, open with the official Zcash crates, and carry a role card for this
 * table and seat with the deal's commitment.
 */
export async function proveRole(chit: string, dealHex: string, expect: { txid: string; table?: string; seat?: number; commitment?: string }): Promise<ProofResult> {
  await ready();
  const head = inspect(chit.trim());
  if (head.txid !== expect.txid) throw new Error('This chit names a different transaction than the deal.');
  const report = verify(dealHex, chit.trim());
  const memo = report.verified?.memo.kind === 'text' ? report.verified.memo.value : '';
  const card = parseCard(memo);
  let problem: string | null = null;
  if (!report.valid) problem = report.error ?? 'The chit does not open its output.';
  else if (!card) problem = 'That output is not a role card.';
  else if (expect.table && card.table !== expect.table) problem = 'That card is from another table.';
  else if (expect.seat !== undefined && card.seat !== expect.seat) problem = 'That card was dealt to another seat.';
  else if (expect.commitment && card.commitment !== expect.commitment) problem = 'That card carries a different deal.';
  return { report, card, problem };
}
