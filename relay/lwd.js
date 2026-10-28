// Transactions straight from Zcash: lightwalletd over gRPC, never a block explorer. Three public
// servers are tried in turn. Nothing is logged. The browser re-hashes the bytes it gets back to the
// txid it asked for, so not even this relay can hand it a different transaction.
import grpc from '@grpc/grpc-js';
import loader from '@grpc/proto-loader';
import { fileURLToPath } from 'node:url';

const def = loader.loadSync(fileURLToPath(new URL('./proto/lwd.proto', import.meta.url)), { longs: Number });
const { CompactTxStreamer } = grpc.loadPackageDefinition(def).cash.z.wallet.sdk.rpc;
const ENDPOINTS = (process.env.LWD ?? 'zec.rocks:443,na.zec.rocks:443,eu.zec.rocks:443').split(',');
const clients = ENDPOINTS.map((e) => new CompactTxStreamer(e, grpc.credentials.createSsl()));
const call = (c, method, req) => new Promise((ok, fail) => c[method](req, { deadline: Date.now() + 15_000 }, (err, res) => (err ? fail(err) : ok(res))));

const mined = new Map(); // txid -> { hex, height }: mined transactions never change
export async function fetchTx(txid) {
  if (!/^[0-9a-f]{64}$/.test(txid)) throw Object.assign(new Error('A txid is 64 hex characters.'), { status: 400 });
  if (mined.has(txid)) return mined.get(txid);
  const display = Buffer.from(txid, 'hex');
  let last;
  for (const c of clients) {
    for (const hash of [Buffer.from(display).reverse(), display]) {
      try {
        const r = await call(c, 'GetTransaction', { hash });
        const h = Number(r.height);
        const out = { hex: Buffer.from(r.data).toString('hex'), height: h > 0 && h < 2 ** 63 ? h : null };
        if (out.height) { mined.set(txid, out); if (mined.size > 500) mined.delete(mined.keys().next().value); }
        return out;
      } catch (e) {
        last = e;
      }
    }
  }
  throw Object.assign(new Error(last?.code === 5 ? 'Zcash does not know this transaction yet. A fresh one can take a minute.' : 'Could not reach a Zcash server.'), { status: last?.code === 5 ? 404 : 502 });
}
