/* =========================================================
   PIXEL FLEET — servidor WebSocket (multijugador real + salas)
   Uso:  npm install ws   →   node server.js   (puerto 8080)
   ========================================================= */
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;

const WORLD = { w: 8000, h: 8000 };
const TICK_MS = 100;          // actualización de posiciones (10 Hz)
const players = new Map();    // id -> {ws, id, name, color, room, x, y, a}
let nextId = 1;

const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 PIXEL FLEET server en ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  const id = nextId++;
  const p = {
    ws, id,
    name: 'Piloto' + id,
    color: '#7ef9ff',
    room: '',                 // '' = galaxia pública
    x: Math.random() * WORLD.w,
    y: Math.random() * WORLD.h,
    a: 0,
  };
  players.set(id, p);
  console.log(`+ ${p.name}${p.room ? ' [' + p.room + ']' : ''} (${players.size} online)`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.t) {
      case 'join':                       // {t:'join', name, color, room}
        if (typeof msg.name === 'string')  p.name  = msg.name.slice(0, 12);
        if (typeof msg.color === 'string') p.color = msg.color;
        if (typeof msg.room === 'string')  p.room  = msg.room.slice(0, 8).toUpperCase();
        break;
      case 'pos':                        // {t:'pos', x, y, a}
        p.x = Math.max(0, Math.min(WORLD.w, +msg.x || 0));
        p.y = Math.max(0, Math.min(WORLD.h, +msg.y || 0));
        p.a = +msg.a || 0;
        break;
      case 'shoot':                      // {t:'shoot', x, y, a} → retransmitir en la sala
        roomcast(p, { t: 'shoot', x: +msg.x || 0, y: +msg.y || 0, a: +msg.a || 0 });
        break;
      case 'chat':                       // {t:'chat', text} → retransmitir con identidad
        roomcast(p, { t: 'chat', name: p.name, color: p.color, text: String(msg.text || '').slice(0, 120) });
        break;
    }
  });

  ws.on('close', () => {
    players.delete(id);
    console.log(`- ${p.name} (${players.size} online)`);
  });
});

// enviar un mensaje a todos los de la MISMA SALA menos al remitente
function roomcast(from, msg) {
  const raw = JSON.stringify(msg);
  for (const q of players.values()) {
    if (q !== from && q.room === from.room && q.ws.readyState === 1) q.ws.send(raw);
  }
}

// difusión de estados: una instantánea por sala (1 mensaje, N envíos)
setInterval(() => {
  if (players.size === 0) return;
  const byRoom = new Map();   // room -> [filas]
  for (const p of players.values()) {
    const row = [p.id, p.name, p.color, Math.round(p.x), Math.round(p.y), +p.a.toFixed(2)];
    if (!byRoom.has(p.room)) byRoom.set(p.room, []);
    byRoom.get(p.room).push(row);
  }
  for (const [room, rows] of byRoom) {
    const snapshot = JSON.stringify({ t: 'state', players: rows });
    for (const p of players.values()) {
      if (p.room === room && p.ws.readyState === 1) p.ws.send(snapshot);
    }
  }
}, TICK_MS);
