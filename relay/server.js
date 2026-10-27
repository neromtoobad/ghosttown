// The Ghost Town relay: a dumb pipe between one host and its guests. It routes opaque,
// end-to-end encrypted messages by room code and stores nothing. It never sees a role, a
// move or a vote: only room codes, peer ids, sizes and timing.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8080);
const MAX_PEERS = 16;
const MAX_BYTES = 64 * 1024;
const RATE = 40; // messages per peer per 10 s

/** room code -> { host: ws | null, guests: Map<id, ws> } */
const rooms = new Map();

const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
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
