// The Ghost Town relay: a dumb pipe between one host and its guests. It routes opaque,
// end-to-end encrypted messages by room code and stores nothing. It never sees a role, a
// move or a vote: only room codes, peer ids, sizes and timing.
// It also serves GET /tx?txid=, transactions read straight from Zcash lightwalletd (see lwd.js),
// so no browser ever asks a block explorer about a Ghost Town deal.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { fetchTx } from './lwd.js';

const PORT = Number(process.env.PORT ?? 8080);
const MAX_PEERS = 16;
const MAX_BYTES = 64 * 1024;
const RATE = 40; // messages per peer per 10 s

/** room code -> { host: ws | null, guests: Map<id, ws> } */
const rooms = new Map();

const hits = new Map(); // ip -> requests this minute, for /tx
setInterval(() => hits.clear(), 60_000);
const http = createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/tx') {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0];
    hits.set(ip, (hits.get(ip) ?? 0) + 1);
    if (hits.get(ip) > 60) return reply(429, { error: 'Slow down.' });
    try {
      return reply(200, await fetchTx((url.searchParams.get('txid') ?? '').toLowerCase()));
    } catch (e) {
      return reply(e.status ?? 502, { error: e.message });
    }
  }
  reply(200, { ok: true, rooms: rooms.size });
});
const wss = new WebSocketServer({ server: http, maxPayload: MAX_BYTES });

const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));

wss.on('connection', (ws, req) => {
  const q = new URL(req.url ?? '/', 'http://x').searchParams;
  const code = (q.get('room') ?? '').toUpperCase();
  const role = q.get('role');
  const id = q.get('id') ?? '';
  if (!/^[A-Z0-9]{4,8}$/.test(code) || !/^[a-z0-9]{8,32}$/.test(id) || (role !== 'host' && role !== 'guest')) return ws.close(1008, 'bad params');
  let room = rooms.get(code);
  if (role === 'host') {
    if (room?.host && room.host.readyState === 1) return ws.close(1008, 'room has a host');
    room ??= { host: null, guests: new Map() };
    room.host = ws;
    rooms.set(code, room);
  } else {
    if (!room?.host) return ws.close(1008, 'no such table');
    if (room.guests.size >= MAX_PEERS) return ws.close(1008, 'table full');
    room.guests.set(id, ws);
    send(room.host, { type: 'peer', id, joined: true });
  }
  let count = 0;
  const reset = setInterval(() => (count = 0), 10_000);

  ws.on('message', (raw) => {
    if (++count > RATE) return;
    let m;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (typeof m?.data !== 'string') return;
    const r = rooms.get(code);
    if (!r) return;
    if (role === 'guest') send(r.host, { type: 'msg', from: id, data: m.data });
    else if (m.to === '*') for (const [, g] of r.guests) send(g, { type: 'msg', from: 'host', data: m.data });
    else send(r.guests.get(m.to), { type: 'msg', from: 'host', data: m.data });
  });

  ws.on('close', () => {
    clearInterval(reset);
    const r = rooms.get(code);
    if (!r) return;
    if (role === 'host' && r.host === ws) {
      for (const [, g] of r.guests) g.close(1001, 'host left');
      rooms.delete(code);
    } else if (role === 'guest') {
      r.guests.delete(id);
      send(r.host, { type: 'peer', id, joined: false });
    }
  });
});

http.listen(PORT, () => console.log(`ghosttown relay on :${PORT}`));
