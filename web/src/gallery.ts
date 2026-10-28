// The Glass Gallery: watch a real Ghost Town deal from the glass side of the river. On the left,
// everything the public chain shows (the Watcher's whole view): a transaction, its sealed actions,
// noise. On the right, the same outputs opened one at a time with chits their players chose to
// show. Each chit opens exactly one output; the rest stay dark forever.

import { ready, txid as txidOf, verify, type Report } from 'chit-zcash';
import { h, short, art } from './dom';
import { fetchTx, parseCard } from './zec';
import { ROLE_NAME } from './table';
import { watcher } from './two';

/** Table EAS24: dealt on Zcash mainnet on Oct 28 2026, two seats, one transaction. */
export const EAS24 = {
  table: 'EAS24',
  txid: 'd3433a762197fddb05589c2e5ad20d6624fec9f19889e1984a8205c8cfc68c57',
  chits: [
    'zout1qyrqzqzh3nrvljq9sf9f3cvfnrcunl3yvcxayk3wn3vqtklajushvwjr6dy07mgk7v9zzqarrpy37dkxlwlw3qnz5p3m5flfz6s757ln3dw3ffy70jcxqk2h7trjvct94cua2nlypnagk8cpq79v0jkl32zkxkqyh2q5sp',
    'zout1qyrqyqzh3nrvljq9sf9f3cvfnrcunl3yvcxayk3wn3vqtklajushvwjr60vhxpamamzhj7vjjfggwdt7dt088khyeam26jxw3qdzlvr49kn35vfm4l3wawcadp9uqsk70qd5ucqljnm6jfa7cee6xefxwwy0tjemzmymxp',
  ],
};

/** A 26×26 tile of the transaction's own bytes: what an encrypted output looks like from outside. */
function noise(hex: string, offset: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 26;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 26 * 26; i++) {
    const b = parseInt(hex.substr((offset + i * 2) % (hex.length - 2), 2), 16) || 0;
    const v = 40 + (b % 120);
    g.fillStyle = b % 7 === 0 ? `rgb(${v * 0.5},${v * 1.1},${v * 1.3})` : `rgb(${v * 0.55},${v * 0.6},${v * 0.75})`;
    g.fillRect(i % 26, Math.floor(i / 26), 1, 1);
  }
  c.className = 'noise';
  return c;
}

export function galleryView(txArg?: string): HTMLElement {
  const txid = (txArg ?? EAS24.txid).toLowerCase();
  const known = txid === EAS24.txid ? EAS24.chits : [];
  const facts = h('dl', { class: 'gal-facts' }, h('dt', {}, 'Transaction'), h('dd', {}, short(txid, 12, 8)));
  const glassCol = h('div', { class: 'gal-actions' }, h('p', { class: 'muted' }, 'Fetching the transaction from the public chain…'));
  const darkCol = h('div', { class: 'gal-actions' });
  const wall = h('pre', { class: 'gal-wall', 'aria-hidden': 'true' });
  const chitIn = h('textarea', { rows: '3', placeholder: 'zout1… a chit for one output of this transaction', spellcheck: 'false' });
  const out = h('div', {});
  let hex = '';
  let actions = 0;
  const opened = new Map<number, Report>();

  const drawGlass = () => {
    glassCol.replaceChildren(
      ...Array.from({ length: actions }, (_, i) =>
        h(
          'div',
          { class: `gal-action glass${opened.has(i) ? ' cracked' : ''}` },
          noise(hex, 900 + i * 1160),
          h('div', {}, h('b', {}, `Action ${i}`), h('p', {}, 'Recipient ', h('span', { class: 'redact' }, '████████████')), h('p', {}, 'Amount ', h('span', { class: 'redact' }, '██████ ZEC')), h('p', {}, 'Memo ', h('span', { class: 'redact' }, '████████████████'))),
        ),
      ),
    );
  };
  const drawDark = () => {
    darkCol.replaceChildren(
      ...Array.from({ length: actions }, (_, i) => {
        const r = opened.get(i);
        const v = r?.verified;
        const memo = v?.memo.kind === 'text' ? v.memo.value : '';
        const card = parseCard(memo);
        if (!r || !v) return h('div', { class: 'gal-action sealed' }, h('div', { class: 'seal-dot' }), h('div', {}, h('b', {}, `Action ${i}`), h('p', { class: 'muted' }, 'Still sealed. Nobody has shown this output, so nobody can read it: not the Watcher, not us.')));
        return h(
          'div',
          { class: `gal-action open${card ? ` r-${card.role}` : ''}` },
          card ? h('img', { src: art(`role-${card.role}.png`), alt: '' }) : h('div', { class: 'seal-dot open' }),
          h(
            'div',
            {},
            h('b', {}, card ? `Seat ${card.seat! + 1} · ${ROLE_NAME[card.role]}` : `Action ${i} · opened`),
            h('p', {}, `${(v.value_zat / 1e8).toFixed(4)} ZEC to ${short(v.recipient, 10, 6)}`),
            h('pre', { class: 'memo-proof' }, memo || '(no memo)'),
            h('p', { class: 'ok-line' }, `✓ ${r.steps.filter((s) => s.ok).length} checks passed with the official Zcash crates, in this browser`),
          ),
        );
      }),
    );
  };
  const open = (chit: string) => {
    const r = verify(hex, chit.trim());
    if (!r.valid || !r.verified) throw new Error(r.error ?? 'That chit does not open an output of this transaction.');
    if (r.verified.txid !== txid) throw new Error('That chit names a different transaction.');
    const m = r.steps.map((s) => s.label.match(/\((\d+) actions?\)/)?.[1]).find(Boolean);
    if (m) actions = Math.max(actions, Number(m));
    opened.set(r.verified.action, r);
  };

  (async () => {
    try {
      await ready();
      const tx = await fetchTx(txid);
      if (txidOf(tx.hex) !== txid) throw new Error('Those bytes do not hash to this txid. Refusing them.');
      hex = tx.hex;
      actions = 1;
      for (const c of known) open(c);
      facts.append(h('dt', {}, 'Block'), h('dd', {}, tx.height ? tx.height.toLocaleString('en-US') : 'mempool'), h('dt', {}, 'Size'), h('dd', {}, `${(hex.length / 2).toLocaleString('en-US')} bytes`), h('dt', {}, 'Shielded actions'), h('dd', {}, String(actions)), h('dt', {}, 'Readable by the Watcher'), h('dd', { class: 'bad' }, 'nothing'));
      wall.textContent = hex.slice(0, 6000).replace(/(.{96})/g, '$1\n');
      drawGlass();
      drawDark();
    } catch (e) {
      glassCol.replaceChildren(h('p', { class: 'error' }, e instanceof Error ? e.message : String(e)));
    }
  })();

  return h(
    'section',
    { class: 'gallery' },
    h(
      'div',
      { class: 'gal-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, txid === EAS24.txid ? `Glass Gallery · table ${EAS24.table} · Zcash mainnet` : 'Glass Gallery · Zcash mainnet'), h('h1', {}, 'What the Watcher sees.'), h('p', { class: 'lede' }, 'A real Ghost Town deal, watched from Glasstown. Every role card went out in one shielded transaction. From the glass side it is noise. Each card opens only when its player shows a chit, and only that card.')),
      watcher('peer', 6),
    ),
    facts,
    h(
      'div',
      { class: 'gal-split' },
      h('div', { class: 'gal-side glass-side' }, h('span', { class: 'kicker' }, 'From Glasstown · the public chain'), glassCol),
      h('div', { class: 'gal-river', 'aria-hidden': 'true' }),
      h('div', { class: 'gal-side dark-side' }, h('span', { class: 'kicker' }, 'From Ghost Town · opened with chits'), darkCol),
    ),
    h(
      'div',
      { class: 'gal-try panel' },
      h('h3', {}, 'Open one more output'),
      h('p', { class: 'muted' }, 'Got a chit for this transaction? It opens exactly one output, here in your browser. The rest stay sealed.'),
      chitIn,
      h('div', { class: 'row' }, h('button', { class: 'btn prove', type: 'button', onclick: () => { try { open(chitIn.value); drawGlass(); drawDark(); out.replaceChildren(h('p', { class: 'ok-line' }, '✓ Opened. One output, nothing else.')); } catch (e) { out.replaceChildren(h('p', { class: 'error' }, e instanceof Error ? e.message : String(e))); } } }, 'Break one seal')),
      out,
    ),
    h('div', { class: 'gal-wall-wrap' }, h('span', { class: 'kicker' }, 'The raw transaction, as the Watcher gets it'), wall),
  );
}
