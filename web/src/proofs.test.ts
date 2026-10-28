// Proof of role against real transactions: the practice specimen, and the deal for table EAS24 on
// Zcash mainnet (txid d3433a76…8c57, block 3,533,398). The chits are the ones its two players
// showed; they open one output each, with the official Zcash crates (chit-zcash, WASM).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ready, txid } from 'chit-zcash';
import { parseCard, proveRole } from './zec';
import type { Role } from './engine';

const EAS24 = JSON.parse(readFileSync(new URL('./fixtures-eas24.json', import.meta.url), 'utf8')) as { txid: string; hex: string };
const SPEC = JSON.parse(readFileSync(new URL('../public/specimen-deal.json', import.meta.url), 'utf8')) as { txid: string; tx: string; cards: Record<Role, string> };
const AUDITOR = 'zout1qyrqzqzh3nrvljq9sf9f3cvfnrcunl3yvcxayk3wn3vqtklajushvwjr6dy07mgk7v9zzqarrpy37dkxlwlw3qnz5p3m5flfz6s757ln3dw3ffy70jcxqk2h7trjvct94cua2nlypnagk8cpq79v0jkl32zkxkqyh2q5sp';
const SHIELDER = 'zout1qyrqyqzh3nrvljq9sf9f3cvfnrcunl3yvcxayk3wn3vqtklajushvwjr60vhxpamamzhj7vjjfggwdt7dt088khyeam26jxw3qdzlvr49kn35vfm4l3wawcadp9uqsk70qd5ucqljnm6jfa7cee6xefxwwy0tjemzmymxp';
const COMMIT = '34845fd4a0377b9d6e1de25efbc779587e532d4cd88e65b62abcc08d87b64def';
const table = { txid: EAS24.txid, table: 'EAS24', commitment: COMMIT };

beforeAll(async () => { await ready(); });

describe('the mainnet deal for table EAS24', () => {
  it('hashes to its txid', () => expect(txid(EAS24.hex)).toBe(EAS24.txid));
  it('proves seat 2 is the Auditor', async () => {
    const r = await proveRole(AUDITOR, EAS24.hex, { ...table, seat: 1 });
    expect(r.problem).toBeNull();
    expect(r.card).toEqual({ role: 'auditor', table: 'EAS24', seat: 1, commitment: COMMIT });
  });
  it('proves seat 1 is the Shielder', async () => {
    const r = await proveRole(SHIELDER, EAS24.hex, { ...table, seat: 0 });
    expect(r.problem).toBeNull();
    expect(r.card?.role).toBe('shielder');
  });
  it('rejects a real card shown for the wrong seat', async () => {
    expect((await proveRole(SHIELDER, EAS24.hex, { ...table, seat: 1 })).problem).toMatch(/another seat/);
  });
  it('rejects a card from another table', async () => {
    expect((await proveRole(AUDITOR, EAS24.hex, { ...table, table: 'ZZZ99', seat: 1 })).problem).toMatch(/another table/);
  });
  it('rejects a narrator who changed the deal', async () => {
    expect((await proveRole(AUDITOR, EAS24.hex, { ...table, seat: 1, commitment: 'f'.repeat(64) })).problem).toMatch(/different deal/);
  });
  it('rejects a chit with one character changed', async () => {
    const forged = AUDITOR.slice(0, 60) + (AUDITOR[60] === 'q' ? 'p' : 'q') + AUDITOR.slice(61);
    await expect(proveRole(forged, EAS24.hex, { ...table, seat: 1 })).rejects.toThrow();
  });
  it('rejects a real chit replayed against another deal', async () => {
    await expect(proveRole(AUDITOR, SPEC.tx, { txid: SPEC.txid })).rejects.toThrow(/different transaction/);
  });
  it('rejects bytes that are not the deal', async () => {
    const r = await proveRole(AUDITOR, SPEC.tx, { txid: EAS24.txid }).catch((e: Error) => ({ problem: e.message }));
    expect(r.problem).toBeTruthy();
  });
});

describe('the practice specimen', () => {
  it('hashes to its txid', () => expect(txid(SPEC.tx)).toBe(SPEC.txid));
  for (const role of ['leaker', 'auditor', 'shielder', 'glitch', 'citizen'] as Role[]) {
    it(`proves the ${role} card`, async () => {
      const r = await proveRole(SPEC.cards[role], SPEC.tx, { txid: SPEC.txid });
      expect(r.problem).toBeNull();
      expect(r.card?.role).toBe(role);
      expect(parseCard(r.report.verified!.memo.value)?.role).toBe(role);
    });
  }
});
