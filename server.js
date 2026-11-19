'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const G = require('./games');

const PORT = +process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (u === '/') u = '/index.html';
  const f = path.normalize(path.join(PUB, u));
  if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(d);
  });
});
const wss = new WebSocketServer({ server, maxPayload: 4096 });

const rooms = new Map();    // code -> room
const clients = new Map();  // cid  -> client
const need = r => (r.mode === '1v1' ? 2 : 4);
const isOpen = ws => ws && ws.readyState === 1;
const send = (c, m) => { if (c && isOpen(c.ws)) c.ws.send(JSON.stringify(m)); };
const online = cid => { const c = clients.get(cid); return !!(c && isOpen(c.ws)); };
const gameList = () => Object.values(G.list).map(g => ({ id: g.id, name: g.name, icon: g.icon, modes: g.modes, desc: g.desc }));

const info = r => ({
  code: r.code, mode: r.mode, game: r.game, started: r.started, need: need(r),
  host: r.players.findIndex(p => p.cid === r.host),
  players: r.players.map((p, i) => ({ name: p.name, slot: i, team: i % 2, online: online(p.cid), left: !!p.left }))
});

function pushRoom(r) {
  r.players.forEach((p, i) => {
    if (p.left) return;
    const c = clients.get(p.cid);
    if (c && c.room === r.code) send(c, { t: 'room', room: info(r), you: i, state: r.started ? r.state : null });
  });
}
function lobbyList() {
  return [...rooms.values()].filter(r => !r.started && r.players.length < need(r)).map(r => ({
    code: r.code, mode: r.mode, game: r.game, count: r.players.length, need: need(r),
    host: (r.players.find(p => p.cid === r.host) || {}).name
  }));
}
function broadcastLobby() {
  const m = { t: 'lobby', rooms: lobbyList() };
  for (const c of clients.values()) if (!c.room) send(c, m);
}
function newCode() {
  let c;
  do { c = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(c));
  return c;
}
function leave(c) {
  const r = rooms.get(c.room);
  c.room = null;
  if (!r) return;
  const i = r.players.findIndex(p => p.cid === c.cid);
  if (i < 0) return;
  if (r.started) {
    // انسحاب أثناء اللعب: فريقه يخسر
    if (r.state && r.state.winner === null) {
      r.state.winner = 1 - (i % 2);
      r.state.last = { slot: i, text: 'انسحب من اللعبة' };
    }
    r.players[i].left = true;
  } else r.players.splice(i, 1);
  const alive = r.players.find(p => !p.left);
  if (!alive) rooms.delete(r.code);
  else { if (r.host === c.cid) r.host = alive.cid; pushRoom(r); }
  send(c, { t: 'left' });
  broadcastLobby();
}
function joinRoom(c, r) {
  if (c.room) leave(c);
  r.players.push({ cid: c.cid, name: c.name });
  c.room = r.code;
  pushRoom(r);
  broadcastLobby();
}
const validName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 20);

wss.on('connection', ws => {
  let c = null;
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'hello') {
      const cid = String(m.cid || '').replace(/[^\w-]/g, '').slice(0, 40);
      if (!cid) return;
      c = clients.get(cid);
      if (c) { if (c.ws !== ws && isOpen(c.ws)) c.ws.close(); c.ws = ws; }
      else { c = { cid, ws, name: '', room: null }; clients.set(cid, c); }
      ws.client = c;
      const nm = validName(m.name);
      if (nm) c.name = nm;
      send(c, { t: 'hello', games: gameList(), soon: G.soon, name: c.name });
      const r = rooms.get(c.room);
      if (r) {
        const p = r.players.find(p => p.cid === cid);
        if (p) { delete p.off; pushRoom(r); }
        else c.room = null;
      }
      if (!rooms.get(c.room)) { c.room = null; send(c, { t: 'lobby', rooms: lobbyList() }); }
      return;
    }
    if (!c || c.ws !== ws) return;
    const err = msg => send(c, { t: 'err', msg });
    const r = rooms.get(c.room);
    const idx = r ? r.players.findIndex(p => p.cid === c.cid) : -1;

    switch (m.t) {
      case 'name': {
        const nm = validName(m.name);
        if (!nm) return;
        c.name = nm;
        if (r && idx >= 0) { r.players[idx].name = nm; pushRoom(r); broadcastLobby(); }
        break;
      }
      case 'create': {
        const g = G.list[m.game];
        if (!c.name) return err('اكتب اسمك أولاً');
        if (!g || !['1v1', '2v2'].includes(m.mode) || !g.modes.includes(m.mode)) return err('اللعبة لا تدعم هذا النمط');
        if (c.room) leave(c);
        const room = { code: newCode(), mode: m.mode, game: g.id, host: c.cid, players: [], started: false, state: null };
        rooms.set(room.code, room);
        joinRoom(c, room);
        break;
      }
      case 'join': {
        if (!c.name) return err('اكتب اسمك أولاً');
        const room = rooms.get(String(m.code || '').trim());
        if (!room) return err('الغرفة غير موجودة');
        if (room.started) return err('اللعبة بدأت');
        if (room.players.length >= need(room)) return err('الغرفة ممتلئة');
        if (room.players.some(p => p.cid === c.cid)) return;
        joinRoom(c, room);
        break;
      }
      case 'setup': {
        if (!r || r.started || idx !== r.players.findIndex(p => p.cid === r.host)) return err('فقط صاحب الغرفة');
        const g = G.list[m.game];
        if (!g || !['1v1', '2v2'].includes(m.mode) || !g.modes.includes(m.mode)) return err('اللعبة لا تدعم هذا النمط');
        if ((m.mode === '1v1' ? 2 : 4) < r.players.length) return err('عدد اللاعبين أكبر من النمط');
        r.mode = m.mode; r.game = g.id;
        pushRoom(r); broadcastLobby();
        break;
      }
      case 'start': {
        if (!r || r.started || idx !== r.players.findIndex(p => p.cid === r.host)) return err('فقط صاحب الغرفة');
        if (r.players.length !== need(r)) return err(`لازم ${need(r)} لاعبين`);
        r.started = true;
        r.state = G.list[r.game].init(r.players.length);
        pushRoom(r); broadcastLobby();
        break;
      }
      case 'act': {
        if (!r || !r.started || !r.state || idx < 0) return;
        const e = G.list[r.game].act(r.state, idx, m);
        if (e) return err(e);
        pushRoom(r);
        break;
      }
      case 'rematch': {
        if (!r || !r.started || !r.state || r.state.winner === null) return;
        if (r.players.length !== need(r) || r.players.some(p => p.left)) return err('أحد اللاعبين انسحب');
        r.state = G.list[r.game].init(r.players.length);
        pushRoom(r);
        break;
      }
      case 'toRoom': {
        if (!r || !r.started || !r.state || r.state.winner === null) return;
        r.players = r.players.filter(p => !p.left);
        if (!r.players.some(p => p.cid === r.host)) r.host = r.players[0].cid;
        r.started = false; r.state = null;
        pushRoom(r); broadcastLobby();
        break;
      }
      case 'leave':
        leave(c);
        break;
    }
  });

  ws.on('close', () => {
    const cl = ws.client;
    if (!cl || cl.ws !== ws) return;
    const r = rooms.get(cl.room);
    if (!r) return;
    if (!r.started) leave(cl);
    else {
      const p = r.players.find(p => p.cid === cl.cid);
      if (p) p.off = Date.now();
      pushRoom(r);
    }
  });
  ws.on('error', () => {});
});

// تنظيف الغرف اللي كل لاعبينها طافوا أكثر من دقيقتين
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.players.every(p => p.left || (p.off && now - p.off > 120000))) {
      for (const p of r.players) { const c = clients.get(p.cid); if (c && c.room === r.code) c.room = null; }
      rooms.delete(r.code);
    }
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎮  سيرفر الألعاب شغّال! افتح من أي جهاز على نفس الراوتر:\n');
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`   http://${i.address}:${PORT}`);
  console.log(`   http://localhost:${PORT}  (نفس الجهاز)\n`);
});
