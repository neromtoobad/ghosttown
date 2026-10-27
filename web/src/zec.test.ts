import { describe, expect, it } from 'vitest';
import { parseCard, roleCard, zip321, joinMemo, CARD_ZAT } from './zec';
import { rolesFor } from './engine';

const A = 'u1u7zlw4ec2x52acm0d6we5emum9kzm8n9jd69ge8ngnm4lk0e2tgl73vqjepwkgxphdu579nlgxh0qx2yp92k4p33m9j77zk8qsc24m8e';

describe('role cards', () => {
  it('fit a memo and read back exactly', () => {
    for (const role of new Set(rolesFor(10))) {
      const memo = roleCard('K7F2X', 9, 'A very long ghost name!', role, 'ab'.repeat(32));
      expect(new TextEncoder().encode(memo).length).toBeLessThanOrEqual(512);
      expect(parseCard(memo)).toEqual({ role, table: 'K7F2X', seat: 9, commitment: 'ab'.repeat(32) });
    }
    expect(parseCard('hello')).toBeNull();
  });
});

describe('ZIP 321', () => {
  it('builds single and multi-recipient requests', () => {
    expect(zip321([{ address: A, zat: 1_000_000, memo: joinMemo('K7F2X', 2, 'Ada') }])).toMatch(new RegExp(`^zcash:${A}\\?amount=0\\.01&memo=[A-Za-z0-9_-]+$`));
    const multi = zip321([{ address: A, zat: CARD_ZAT, memo: 'a' }, { address: A, zat: CARD_ZAT, memo: 'b' }]);
    expect(multi).toContain('address=');
    expect(multi).toContain('address.1=');
    expect(multi).toContain('amount.1=0.0001');
    expect(multi).toContain('memo.1=');
  });
});
