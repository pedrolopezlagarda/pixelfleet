/* =========================================================
   PIXEL FLEET — motor del juego (v0.7)
   Conquista de planetas · economía · combate · chat
   Flota real construible · control RTS de flota (selección por
   cuadro + órdenes) · persistencia total (save v2)
   Multijugador simulado localmente + servidor WS preparado.
   ========================================================= */

const WORLD = { w: 24000, h: 24000 };   // v2.0: galaxia de sistemas solares — cruzarla es una decisión de partida
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

let VW = 0, VH = 0;
let ZMIN = 0.12;          // zoom mínimo: se recalcula para que quepa TODO el mundo
const ZMAX = 3;           // zoom máximo (detalle pixel)
function resize() {
  VW = canvas.width  = Math.floor(innerWidth  / 2);
  VH = canvas.height = Math.floor(innerHeight / 2);
  canvas.style.width  = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ZMIN = Math.min(VW / WORLD.w, VH / WORLD.h) * 0.98;
}
addEventListener('resize', resize);
resize();

/* ---------- utilidades ---------- */
const rnd   = (a, b) => a + Math.random() * (b - a);
const rndi  = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const TAU = Math.PI * 2;
function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d >  Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- configuración del jugador ---------- */
const FACTION_COLORS = ['#7ef9ff', '#ffd166', '#ff6b8a', '#8aff80', '#c792ff', '#ff9f5a'];
// v0.8: cada facción es un imperio con nombre (para chat y clasificación)
const FACTION_NAMES = { '#7ef9ff': 'Aqua', '#ffd166': 'Áurea', '#ff6b8a': 'Carmesí', '#8aff80': 'Verdi', '#c792ff': 'Violeta', '#ff9f5a': 'Ámbar' };
function facName(c) { return c === player.color ? player.name : (FACTION_NAMES[c] || c); }
const player = {
  name: 'PilotoAnónimo',
  color: FACTION_COLORS[0],
  x: WORLD.w / 2, y: WORLD.h / 2,
  angle: 0, vx: 0, vy: 0,
  hp: 12, maxHp: 12, alive: true,   // v1.1: HP alto — las naves ya no caen en 3 impactos
  fuel: 100, maxFuel: 100,
  credits: 0, kills: 0, deaths: 0,
  // v1.7: el mineral ya NO es global — vive como stock en los planetas (stockOf/takeStock)
  invuln: 2, respawnT: 0, shootCd: 0,
  upgrades: { motor: 0, cadencia: 0, blindaje: 0, deposito: 0 },
  tech: {},                   // v1.4: tecnologías de nivel 2 (excluyentes por rama)
  hangarLvl: 0,               // v1.6: nivel de hangar — limita flota y almacén (se compra con ◈)
  auto: false,                // v2.0: piloto automático (la IA vuela tu nave según `role`)
  role: 'hold', ox: null, oy: null, oplanet: null,   // v2.0: orden activa en automático
  deflCd: 0,                  // v1.4: cooldown del escudo deflector
  ship: 'caza',                 // modelo actual (catálogo SHIPS, v0.6)
};

/* ---------- sprites pixel-art ---------- */
// v1.5: un sprite distinto por TIPO de nave (antes todas eran la misma flecha)
const SHIP_SPRITES = {
  caza: [
    '........',
    '..#.....',
    '.###....',
    '#####...',
    '#####.#.',
    '#####...',
    '.###....',
    '..#.....',
  ],
  avispa: [   // dardo afilado y ligero
    '........',
    '....#...',
    '..###...',
    '########',
    '########',
    '..###...',
    '....#...',
    '........',
  ],
  acorazado: [   // mole ancha y blindada
    '........',
    '.####...',
    '########',
    '########',
    '########',
    '########',
    '.####...',
    '........',
  ],
  explorador: [   // alas largas con antena
    '....#...',
    '....#...',
    '..####..',
    '.######.',
    '########',
    '..####..',
    '....#...',
    '....#...',
  ],
};
function makeShipSprite(color, type) {
  const spr = SHIP_SPRITES[type] || SHIP_SPRITES.caza;
  const s = document.createElement('canvas');
  s.width = 8; s.height = 8;
  const c = s.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    c.fillStyle = spr[y][x] === '#' ? color : '#0a1628';
    c.fillRect(x, y, 1, 1);
  }
  c.fillStyle = '#ffffff'; c.fillRect(4, 3, 1, 1);   // cabina
  return s;
}
const shipCache = {};
const shipSprite = (color, type) => {
  const k = color + '|' + (type || 'caza');
  return shipCache[k] || (shipCache[k] = makeShipSprite(color, type));
};

/* planetas pixelados */
const PLANET_PALETTES = [
  ['#2b6cb0', '#63b3ed', '#bee3f8', '#1a365d'],
  ['#c05621', '#ed8936', '#fbd38d', '#7b341e'],
  ['#276749', '#48bb78', '#9ae6b4', '#1c4532'],
  ['#97266d', '#d53f8c', '#fbb6ce', '#521b41'],
  ['#718096', '#a0aec0', '#e2e8f0', '#2d3748'],
  ['#b7791f', '#ecc94b', '#fefcbf', '#744210'],
];
function makePlanet(r, rng) {
  const s = document.createElement('canvas');
  s.width = s.height = r * 2;
  const c = s.getContext('2d');
  const pal = PLANET_PALETTES[Math.floor(rng() * PLANET_PALETTES.length)];
  for (let y = 0; y < r * 2; y++) for (let x = 0; x < r * 2; x++) {
    const dx = x - r + 0.5, dy = y - r + 0.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r) continue;
    const light = (dx * -0.6 + dy * -0.8) / r;
    let col;
    if (d > r * 0.92)      col = pal[3];
    else if (light > 0.35) col = pal[2];
    else if (light < -0.35) col = pal[3];
    else col = pal[0];
    if (rng() < 0.05) col = pal[1];
    c.fillStyle = col;
    c.fillRect(x, y, 1, 1);
  }
  return s;
}

/* v2.0: soles pixel-art — disco amarillo/naranja con gránulos y halo suave */
const SUN_PAL = ['#ffd166', '#ff9f5a', '#fff3b0', '#e36414'];
const SUN_HALO = 0.35;   // proporción del radio dedicada al halo en el sprite
function makeSun(r, rng) {
  const pad = Math.ceil(r * SUN_HALO);
  const s = document.createElement('canvas');
  s.width = s.height = (r + pad) * 2;
  const c = s.getContext('2d');
  const cxy = r + pad;
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    const dx = x - cxy + 0.5, dy = y - cxy + 0.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r + pad) continue;
    if (d > r) {   // halo que se apaga hacia fuera
      c.fillStyle = 'rgba(255,159,90,' + ((1 - (d - r) / pad) * 0.35).toFixed(2) + ')';
      c.fillRect(x, y, 1, 1);
      continue;
    }
    let col;
    if (d > r * 0.9) col = SUN_PAL[3];          // limbo más oscuro
    else if (rng() < 0.06) col = SUN_PAL[2];    // destellos claros
    else if (rng() < 0.12) col = SUN_PAL[1];    // gránulos naranjas
    else col = SUN_PAL[0];
    c.fillStyle = col;
    c.fillRect(x, y, 1, 1);
  }
  return s;
}

/* ---------- generación del mundo ---------- */
// v0.6: mundo DETERMINISTA — mismo universo en cada carga (base de la persistencia)
const rngWorld = mulberry32(1234567);
const rndW  = (a, b) => a + rngWorld() * (b - a);
const rndiW = (a, b) => Math.floor(rndW(a, b + 1));
const PLANET_RES = ['mineral', 'gas', 'creditos'];   // v1.1: tipo de recurso por planeta
const RES_ICON = { mineral: '⛏', gas: '⛽', creditos: '◈' };

/* ---------- v1.7: suministros por planeta ---------- */
// Cada planeta con dueño acumula stock LOCAL de su recurso (⛏ mineral y ⛽ gas;
// los planetas de ◈ no almacenan: siguen dando créditos directos). El consumo
// es a nivel de imperio: se descuenta de los planetas propios de ese tipo,
// del más lleno al más vacío. Si pierdes tus minas, te quedas sin ⛏.
const STOCK_CAP = 100;         // tope de stock por planeta
const STOCK_RATE = 0.4;        // unidades/s que produce un planeta con dueño
const CAP_START_STOCK = 30;    // la capital (siempre minera, v1.7) arranca con 30⛏
function planetsWithStock(color, res) {
  return planets.filter(p => p.owner === color && p.res === res);
}
function stockOf(color, res) {
  return planetsWithStock(color, res).reduce((s, p) => s + (p.stock || 0), 0);
}
// Descuenta n unidades del recurso de los planetas propios (del más lleno al
// más vacío). Devuelve false —sin descontar nada— si no hay suficiente.
function takeStock(color, res, n) {
  if (stockOf(color, res) < n) return false;
  let left = n;
  const mine = planetsWithStock(color, res).sort((a, b) => (b.stock || 0) - (a.stock || 0));
  for (const p of mine) {
    const take = Math.min(p.stock || 0, left);
    p.stock = (p.stock || 0) - take;
    left -= take;
    if (left <= 0) break;
  }
  return true;
}
/* ---------- v2.0: sistemas solares ----------
   12 soles, cada uno con 4-6 planetas en órbitas (sun.r + 450 + k·480).
   Todo determinista (misma seed): los soles NO se guardan en el save —
   se regeneran igual en cada carga. */
const suns = [];
{
  // Rejilla 4×3 con jitter + relajación por repulsión: con 12 sistemas en
  // 24000² el «mejor de N aleatorios» dejaba soles a ~1200 u (el voraz
  // secuencial empaqueta mal). La rejilla garantiza ~4200 u de base y la
  // relajación empuja a los pares demasiado juntos hasta ~5000 u.
  const SUN_M = 3400;   // margen: caben sus órbitas dentro del mundo
  const SUN_SEP = 5000;
  for (let i = 0; i < 12; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    const r = rndiW(150, 220);
    suns.push({
      x: SUN_M + r + (WORLD.w - 2 * (SUN_M + r)) * (col + 0.5) / 4 + rndW(-150, 150),
      y: SUN_M + r + (WORLD.h - 2 * (SUN_M + r)) * (row + 0.5) / 3 + rndW(-150, 150),
      r, orbits: [], sprite: makeSun(r, rngWorld),
    });
  }
  for (let it = 0; it < 400; it++) {
    let moved = false;
    for (let i = 0; i < suns.length; i++) for (let j = i + 1; j < suns.length; j++) {
      const a = suns[i], b = suns[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d >= SUN_SEP) continue;
      const push = (SUN_SEP - d) * 0.3;
      dx /= d; dy /= d;
      a.x -= dx * push; a.y -= dy * push;
      b.x += dx * push; b.y += dy * push;
      moved = true;
    }
    for (const s of suns) {
      s.x = clamp(s.x, SUN_M + s.r, WORLD.w - SUN_M - s.r);
      s.y = clamp(s.y, SUN_M + s.r, WORLD.h - SUN_M - s.r);
    }
    if (!moved) break;
  }
}
const planets = [];
for (let si = 0; si < suns.length; si++) {
  const sun = suns[si];
  const n = rndiW(4, 6);
  for (let k = 0; k < n; k++) {
    const r = rndiW(24, 70);
    const orbit = sun.r + 450 + k * 480;
    const a = rndW(0, TAU);
    sun.orbits.push(orbit);
    planets.push({
      idx: planets.length,   // v1.6: índice estable (las defensas orbitales referencian por índice)
      sys: si,               // v2.0: sistema solar al que pertenece
      x: clamp(sun.x + Math.cos(a) * orbit, r * 2, WORLD.w - r * 2),
      y: clamp(sun.y + Math.sin(a) * orbit, r * 2, WORLD.h - r * 2),
      r,
      sprite: makePlanet(r, rngWorld),
      name: 'S' + (si + 1) + ' · P-' + rndiW(100, 999),   // v2.0: el nombre lleva su sistema
      res: PLANET_RES[rndiW(0, 2)],   // v1.1: ⛏ mineral / ⛽ gas / ◈ créditos (determinista)
      stock: 0,           // v1.7: suministro local acumulado (solo con dueño)
      owner: null,        // color de facción o null
      capture: 0,         // progreso 0..1
      capturer: null,     // facción que está capturando
      shield: 0,          // puntos de escudo (solo planetas con dueño)
      shieldMax: 25,
    });
  }
}
// v0.8: galaxia virgen — NO hay planetas pre-conquistados. Cada facción
// empieza de cero (capital + 1 nave) en initFactions() y se expande con su IA.

// v2.0: evasión solar de la IA — si la trayectoria (x,y,ang) entra en un sol
// (margen de 200 u), gira tangente al sol con un sesgo hacia fuera
function sunAvoid(x, y, ang) {
  for (const s of suns) {
    const rr = s.r + 200;
    const dx = s.x - x, dy = s.y - y;
    if (dx * dx + dy * dy > (rr + 320) * (rr + 320)) continue;   // demasiado lejos
    const fx = Math.cos(ang), fy = Math.sin(ang);
    const t = dx * fx + dy * fy;                  // avance hasta el punto más cercano al sol
    if (t < 0) continue;                          // el sol está detrás
    const px = x + fx * t, py = y + fy * t;
    if (dist2(px, py, s.x, s.y) >= rr * rr) continue;   // pasa de largo
    const awayA = Math.atan2(y - s.y, x - s.x);
    const tanA = awayA + (dx * fy - dy * fx < 0 ? Math.PI / 2 : -Math.PI / 2);
    const vx = Math.cos(tanA) * 0.7 + Math.cos(awayA) * 0.3;
    const vy = Math.sin(tanA) * 0.7 + Math.sin(awayA) * 0.3;
    return Math.atan2(vy, vx);
  }
  return ang;
}

// estrellas (3 capas de parallax)
const starLayers = [];
for (let L = 0; L < 3; L++) {
  const rs = mulberry32(999 + L);
  const stars = [];
  for (let i = 0; i < 220 + L * 140; i++) stars.push({ x: rs() * WORLD.w, y: rs() * WORLD.h });
  starLayers.push({ stars, par: 0.25 + L * 0.3 });
}

/* ---------- v0.8: facciones imperio (bots con IA de facción) ---------- */
const BOT_NAMES = ['Xx_Nova_xX', 'Zorg', 'PixelLord', 'Andromeda', 'Vega', 'CapitánFalkor',
  'Nebulosa', 'R2-Juan', 'Estelar', 'Troya', 'Quasar', 'Lyra', 'Orion', 'NovaPrime',
  'Astra', 'Cometa', 'Pulsar', 'Halley', 'Sagan', 'Kepler', 'Hubble', 'Cosmos',
  'Warp9', 'Eclipse', 'Foton', 'Gravedad', 'Zenith', 'Atlas', 'Rigel', 'Sirio'];
const bots = [];
// estado por facción IA: capital, hucha común, relaciones con las demás, cola de construcción
const facState = {};   // color -> { capital, credits, rel:{color->num}, warT:{}, aiT, buildT, building, personality }
const FAC_SHIP_COST = 60, FAC_SHIP_TIME = 20, FAC_SHIP_ORE = 15;   // v1.7: la IA también paga ⛏ por nave
const playerAggro = {};   // color -> s restantes de "provocada por el jugador" (wingmen pueden responder)

/* =========================================================
   v2.0 — GRID ESPACIAL Y CACHES POR FRAME
   Con flotas de 300+ naves los scans O(n²) se comen el frame.
   Rejilla uniforme de 250 u sobre `bots` (solo vivos), reconstruida
   UNA vez por frame al inicio del bucle de bots; la usan el targeting
   de wingmen/piratas/imperiales, las colisiones de proyectiles y las
   capturas. El comportamiento NO cambia: mismos checks de guerra,
   provocación y alcance — solo cambia cómo se encuentran candidatos.
   ========================================================= */
const GRID_CELL = 250;
const GRID_W = Math.ceil(WORLD.w / GRID_CELL), GRID_H = Math.ceil(WORLD.h / GRID_CELL);
const gridCells = [];
for (let i = 0; i < GRID_W * GRID_H; i++) gridCells.push([]);
function gridRebuild() {
  for (const c of gridCells) c.length = 0;
  for (const b of bots) {
    if (!b.alive) continue;
    const cx = clamp(Math.floor(b.x / GRID_CELL), 0, GRID_W - 1);
    const cy = clamp(Math.floor(b.y / GRID_CELL), 0, GRID_H - 1);
    gridCells[cy * GRID_W + cx].push(b);
  }
}
// Recorre los bots vivos de las celdas que tocan el círculo (x,y,r).
// cb(b) → true detiene la búsqueda (colisiones); los «más cercanos»
// miran todos los candidatos y devuelven siempre false.
function gridEach(x, y, r, cb) {
  const x0 = clamp(Math.floor((x - r) / GRID_CELL), 0, GRID_W - 1);
  const x1 = clamp(Math.floor((x + r) / GRID_CELL), 0, GRID_W - 1);
  const y0 = clamp(Math.floor((y - r) / GRID_CELL), 0, GRID_H - 1);
  const y1 = clamp(Math.floor((y + r) / GRID_CELL), 0, GRID_H - 1);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const cell = gridCells[cy * GRID_W + cx];
    for (let i = 0; i < cell.length; i++) if (cb(cell[i])) return;
  }
}
// caches por frame (se recalculan al inicio del bucle de bots en update):
// seguidores del jugador, naves construidas vivas y naves vivas por facción
const frameFollowers = [];
const frameFacShips = {};
let frameFleetCount = 0;

/* v1.3: personalidades de facción — cada imperio juega distinto */
const PERSONALITIES = {
  agresiva:    { label: '⚔️ conquistadora', warThresh: 1.3, warProb: 0.40, allyProb: 0.05, attackShare: 0.66, conquerMax: 3, incomeMul: 1.0 },
  tortuga:     { label: '🛡️ defensiva',     warThresh: 99,  warProb: 0.02, allyProb: 0.25, attackShare: 0.33, conquerMax: 1, incomeMul: 1.0 },
  comerciante: { label: '💰 mercantil',     warThresh: 2.0, warProb: 0.05, allyProb: 0.35, attackShare: 0.40, conquerMax: 2, incomeMul: 1.25 },
  oportunista: { label: '🐦 oportunista',   warThresh: 2.2, warProb: 0.50, allyProb: 0.15, attackShare: 0.50, conquerMax: 2, incomeMul: 1.0 },
};
const PERS_KEYS = Object.keys(PERSONALITIES);
function persOf(c) { return PERSONALITIES[(facState[c] && facState[c].personality)] || PERSONALITIES.comerciante; }

function setRel(a, b, v) {
  if (facState[a]) facState[a].rel[b] = v;
  if (facState[b]) facState[b].rel[a] = v;
}
function atWarFF(a, b) {   // guerra entre dos colores cualesquiera (fac-fac o fac-jugador)
  if (a === b || !a || !b) return false;
  if (a === player.color) return (standings[b] || 0) <= -30;
  if (b === player.color) return (standings[a] || 0) <= -30;
  return !!(facState[a] && (facState[a].rel[b] || 0) <= -30);
}
function facPower(c) {
  if (c === player.color)
    return planets.filter(p => p.owner === c).length * 2 + bots.filter(b => b.built && b.alive).length + 2;
  const pl = planets.filter(p => p.owner === c).length;
  const sh = bots.filter(b => b.imp && b.alive && b.color === c).length;
  return pl * 2 + sh;
}
function spawnFactionShip(color) {
  const fac = facState[color];
  const home = (fac && fac.capital) || planets.find(p => p.owner === color) || planets[rndi(0, planets.length - 1)];
  const b = {
    name: FACTION_NAMES[color] + '-' + rndi(10, 99),
    color,
    x: clamp(home.x + rnd(-200, 200), 20, WORLD.w - 20),
    y: clamp(home.y + rnd(-200, 200), 20, WORLD.h - 20),
    angle: rnd(0, TAU), speed: rnd(9, 20),   // v1.0: naves imperiales lentas (ritmo ÷3)
    waypoint: null, hp: 10, alive: true, respawnT: 0,   // v1.1: HP alto también en la IA
    shootCd: rnd(0.5, 2), credits: 0, kills: 0,
    vx: 0, vy: 0, flash: 0,
    home, expandR: 1500,
    imp: true, task: null, retalT: 0, lastHitBy: null,   // v0.8: nave imperial
  };
  bots.push(b);
  return b;
}
// v0.8: cada facción empieza DE CERO — capital propia lejos de las demás y 1 nave
// v2.0: capitales a ≥6000 u entre sí y, si es posible, cada una en un sistema distinto
function initFactions() {
  bots.length = 0;
  for (const c of FACTION_COLORS) delete facState[c];
  for (const k in playerAggro) delete playerAggro[k];
  const usedSys = new Set();   // sistemas que ya tienen capital
  if (playerCapital) usedSys.add(playerCapital.sys);
  for (const c of FACTION_COLORS) {
    if (c === player.color) continue;
    let cap = null, bestD = -1, capNewSys = false;
    for (let i = 0; i < 120; i++) {
      const p = planets[rndi(0, planets.length - 1)];
      if (p.owner) continue;
      let dmin = Infinity;
      for (const q of planets) if (q.owner) dmin = Math.min(dmin, dist2(p.x, p.y, q.x, q.y));
      if (dmin < 6000 * 6000 && i < 100) continue;   // los últimos reintentos relajan la distancia
      const newSys = !usedSys.has(p.sys);
      if ((newSys && !capNewSys) || (newSys === capNewSys && dmin > bestD)) { bestD = dmin; cap = p; capNewSys = newSys; }
      if (capNewSys && bestD > 6000 * 6000) break;
    }
    if (!cap) cap = planets.find(p => !p.owner);
    if (!cap) continue;
    usedSys.add(cap.sys);
    cap.owner = c; cap.capital = true; cap.shieldMax = 100; cap.shield = 100;
    cap.name = 'CAPITAL ' + facName(c);
    cap.res = 'mineral'; cap.stock = CAP_START_STOCK;   // v1.7: capital minera también para la IA
    facState[c] = { capital: cap, credits: 20, rel: {}, warT: {}, aiT: rnd(2, 6), buildT: 0, building: false, personality: null, hangarLvl: 0 };   // v2.0: hangarLvl — la IA amplía su flota como el jugador
    for (const o of FACTION_COLORS) if (o !== c) facState[c].rel[o] = 0;
    spawnFactionShip(c);
  }
  // v1.3: repartir personalidades (barajadas; si sobran facciones, se repite alguna)
  // No se anuncian: con niebla de guerra, el carácter de cada imperio se DESCUBRE.
  const deck = PERS_KEYS.slice();
  for (let i = deck.length - 1; i > 0; i--) { const j = rndi(0, i); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  let di = 0;
  for (const c in facState) { facState[c].personality = deck[di % deck.length]; di++; }
}

/* --- IA de facción: tareas de cada nave imperial --- */
function facTaskValid(b) {
  const t = b.task;
  if (!t) return false;
  if (t.type === 'mine')    return !!(t.a && t.a.alive);
  if (t.type === 'conquer') return !!(t.p && !t.p.owner);
  if (t.type === 'attack')  return !!(t.p && t.p.owner && t.p.owner !== b.color && atWarFF(b.color, t.p.owner));
  if (t.type === 'defend')  return !!(facState[b.color] && facState[b.color].capital);
  return false;
}
function facAssignTask(b) {
  b.task = null; b.waypoint = null;
  const fac = facState[b.color];
  if (!fac) return;
  // 1) guerra: parte de las naves ataca el planeta enemigo más cercano; el resto defiende
  // (v1.3: la proporción de atacantes depende de la personalidad)
  const pers = persOf(b.color);
  const enemies = planets.filter(p => p.owner && p.owner !== b.color && atWarFF(b.color, p.owner));
  if (enemies.length) {
    const myShips = bots.filter(o => o.imp && o.alive && o.color === b.color);
    const attackers = myShips.filter(o => o.task && o.task.type === 'attack').length;
    if (attackers < Math.ceil(myShips.length * pers.attackShare)) {
      enemies.sort((p, q) => dist2(b.x, b.y, p.x, p.y) - dist2(b.x, b.y, q.x, q.y));
      b.task = { type: 'attack', p: enemies[0] };
    } else b.task = { type: 'defend' };
    return;
  }
  // 2) expansión: conquistar el planeta neutral más cercano (máx. según personalidad)
  let cands = planets.filter(p => !p.owner);
  if (prepT > 0 && playerCapital)   // en preparación, lejos de la capital del jugador
    cands = cands.filter(p => dist2(p.x, p.y, playerCapital.x, playerCapital.y) >= 2600 * 2600);
  cands.sort((p, q) => dist2(b.x, b.y, p.x, p.y) - dist2(b.x, b.y, q.x, q.y));
  for (const p of cands) {
    const onIt = bots.filter(o => o.imp && o.alive && o.color === b.color && o !== b &&
                                 o.task && o.task.type === 'conquer' && o.task.p === p).length;
    if (onIt < pers.conquerMax) { b.task = { type: 'conquer', p }; return; }
  }
  // 3) economía: minar el asteroide más cercano
  let best = null, bd = Infinity;
  for (const a of asteroids) {
    if (!a.alive) continue;
    const d = dist2(b.x, b.y, a.x, a.y);
    if (d < bd) { bd = d; best = a; }
  }
  if (best) { b.task = { type: 'mine', a: best }; return; }
  b.task = { type: 'defend' };
}
// diplomacia estratégica: neutral por defecto; guerra si claramente más fuerte,
// alianza si estáis igualados, paz si la guerra va mal o se alarga.
// v1.3: los umbrales dependen de la PERSONALIDAD de la facción
function facDiplomacy(c) {
  const f = facState[c];
  if (!f) return;
  const pMe = facPower(c);
  if (pMe <= 0) return;   // facción eliminada
  const pers = persOf(c);
  for (const o of FACTION_COLORS) {
    if (o === c || o === player.color) continue;   // con el jugador manda el panel de diplomacia
    if (!facState[o] || facPower(o) <= 0) { f.rel[o] = 0; continue; }
    const rel = f.rel[o] || 0, pOt = facPower(o);
    if (rel <= -30) {
      f.warT[o] = (f.warT[o] || 0) + 1;
      if (pMe < pOt * 0.7 || f.warT[o] >= 4) {
        setRel(c, o, 0); f.warT[o] = 0;
        chatSys('🕊️ ' + facName(c) + ' y ' + facName(o) + ' firman la PAZ.');
      }
    } else if (rel >= 50) {
      if (Math.random() < 0.15) { setRel(c, o, 0); chatSys('📡 La alianza entre ' + facName(c) + ' y ' + facName(o) + ' se enfría.'); }
    } else {
      // v1.3: el oportunista se suma a guerras ya abiertas contra un débil
      let thresh = pers.warThresh;
      if (f.personality === 'oportunista') {
        const otherWars = Object.entries(facState[o].rel).filter(([k, v]) => k !== c && v <= -30).length;
        if (otherWars > 0) thresh = Math.min(thresh, 1.2);
      }
      if (pMe >= pOt * thresh && Math.random() < pers.warProb) {
        setRel(c, o, -100); f.warT[o] = 0;
        chatSys('🔥 ¡' + facName(c) + ' (' + pers.label + ') declara la GUERRA a ' + facName(o) + '!');
      } else if (Math.abs(pMe - pOt) <= 2 && Math.random() < pers.allyProb) {
        setRel(c, o, 50);
        chatSys('🤝 ' + facName(c) + ' y ' + facName(o) + ' firman una ALIANZA.');
      }
    }
  }
}
// comportamiento por nave: moverse según tarea y disparar SOLO lo permitido
function facShipThink(b, dt) {
  b.flash = Math.max(0, b.flash - dt);
  b.retalT = Math.max(0, (b.retalT || 0) - dt);
  b.shootCd -= dt;
  const fac = facState[b.color];
  if (!facTaskValid(b)) facAssignTask(b);

  /* --- movimiento --- */
  let tx = null, ty = null;
  const t = b.task;
  if (t && (t.type === 'conquer' || t.type === 'attack') && t.p) {
    const hold = t.p.r + 10;
    if (dist2(b.x, b.y, t.p.x, t.p.y) > hold * hold) { tx = t.p.x; ty = t.p.y; b.waypoint = null; }
    else {
      if (!b.waypoint || dist2(b.x, b.y, b.waypoint.x, b.waypoint.y) < 400)
        b.waypoint = { x: clamp(t.p.x + rnd(-hold, hold), 20, WORLD.w - 20),
                       y: clamp(t.p.y + rnd(-hold, hold), 20, WORLD.h - 20) };
      tx = b.waypoint.x; ty = b.waypoint.y;
    }
  } else if (t && t.type === 'mine' && t.a && t.a.alive) {
    if (dist2(b.x, b.y, t.a.x, t.a.y) > 260 * 260) { tx = t.a.x; ty = t.a.y; }
  } else if (t && t.type === 'defend' && fac && fac.capital) {
    if (!b.waypoint || dist2(b.x, b.y, b.waypoint.x, b.waypoint.y) < 900)
      b.waypoint = { x: clamp(fac.capital.x + rnd(-700, 700), 20, WORLD.w - 20),
                     y: clamp(fac.capital.y + rnd(-700, 700), 20, WORLD.h - 20) };
    tx = b.waypoint.x; ty = b.waypoint.y;
  }
  if (tx != null) {
    const wa = sunAvoid(b.x, b.y, Math.atan2(ty - b.y, tx - b.x));   // v2.0: evasión solar
    b.angle = angleLerp(b.angle, wa, 1 - Math.pow(0.05, dt));
    b.thrustLvl = dist2(b.x, b.y, tx, ty) > 30 * 30 ? 1 : 0;   // v1.5
    if (b.thrustLvl) {
      b.x = clamp(b.x + Math.cos(b.angle) * b.speed * dt, 20, WORLD.w - 20);
      b.y = clamp(b.y + Math.sin(b.angle) * b.speed * dt, 20, WORLD.h - 20);
    }
  } else b.thrustLvl = 0;

  /* --- fuego (durante la preparación nadie pelea, pero sí se mina) --- */
  if (b.shootCd > 0) return;
  if (prepT <= 0) {
    const st = standings[b.color] || 0;
    const warP = st <= -30, hostP = st <= -10;
    let tgt = null, td = (warP ? 520 : 340) ** 2;
    // el jugador y sus wingmen: solo si la facción está hostil/en guerra contigo
    if (hostP && player.alive && player.invuln <= 0) {
      const d = dist2(b.x, b.y, player.x, player.y);
      if (d < td) { td = d; tgt = player; }
    }
    // v2.0: candidatos por grid (alcance máx. de cualquier regla: 520 u) —
    // mismos checks de guerra/represalia, solo cambia cómo se encuentran
    gridEach(b.x, b.y, 520, o => {
      if (o === b || !o.alive || o.color === b.color) return false;
      if (o.built) {   // tus wingmen: solo si la facción está hostil contigo
        if (!hostP) return false;
        const d = dist2(b.x, b.y, o.x, o.y);
        if (d < td) { td = d; tgt = o; }
        return false;
      }
      // otras facciones: SOLO en guerra declarada o como represalia (neutralidad por defecto)
      // v1.3: los piratas (grises) son enemigos de todos — se les dispara siempre
      if (!o.imp && !o.pirate) return false;
      if (o.pirate) {
        const d = dist2(b.x, b.y, o.x, o.y);
        if (d < 400 * 400 && d < td) { td = d; tgt = o; }
        return false;
      }
      const war = atWarFF(b.color, o.color);
      const retal = b.retalT > 0 && b.lastHitBy === o.color;
      if (!war && !retal) return false;
      const d = dist2(b.x, b.y, o.x, o.y);
      const r = war ? 480 : 340;
      if (d < r * r && d < td) { td = d; tgt = o; }
      return false;
    });
    if (tgt) {
      const a = Math.atan2(tgt.y - b.y, tgt.x - b.x) + rnd(-0.15, 0.15);
      shoot(b.x + Math.cos(a) * 8, b.y + Math.sin(a) * 8, a, b.color, b);
      b.shootCd = rnd(0.9, 1.8);
      return;
    }
    // guerra: desgastar el escudo del planeta enemigo objetivo
    if (t && t.type === 'attack' && t.p && t.p.owner && t.p.owner !== b.color && t.p.shield > 0) {
      const rr = t.p.r + 300;
      if (dist2(b.x, b.y, t.p.x, t.p.y) < rr * rr) {
        const a = Math.atan2(t.p.y - b.y, t.p.x - b.x) + rnd(-0.1, 0.1);
        shoot(b.x + Math.cos(a) * 8, b.y + Math.sin(a) * 8, a, b.color, b);
        b.shootCd = rnd(0.7, 1.2);
        return;
      }
    }
  }
  // minar: disparar al asteroide objetivo (también durante la preparación)
  if (t && t.type === 'mine' && t.a && t.a.alive && dist2(b.x, b.y, t.a.x, t.a.y) < 300 * 300) {
    const a = Math.atan2(t.a.y - b.y, t.a.x - b.x) + rnd(-0.08, 0.08);
    shoot(b.x + Math.cos(a) * 8, b.y + Math.sin(a) * 8, a, b.color, b);
    b.shootCd = rnd(0.6, 1.1);
    return;
  }
  b.shootCd = 0.4;
}

/* ---------- proyectiles y partículas ---------- */
const projectiles = [];
const particles = [];
function shoot(x, y, angle, color, owner, dmg) {
  projectiles.push({
    x, y,
    vx: Math.cos(angle) * 200, vy: Math.sin(angle) * 200,   // v1.0: proyectiles más lentos
    color, owner, life: 1.8,
    dmg: dmg || 1,   // v1.4: daño por arma (bláster pesado = 2)
  });
}
function explode(x, y, color) {
  for (let i = 0; i < 22; i++) {
    const a = rnd(0, TAU), sp = rnd(30, 160);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.4, 1), color: Math.random() < 0.5 ? color : '#ffd166' });
  }
}

/* ---------- entrada ---------- */
const keys = {};
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (document.activeElement === chatInput) {
    if (k === 'enter') sendChat();
    if (k === 'escape') chatInput.blur();
    return;
  }
  keys[k] = true;
  if (k === ' ') e.preventDefault();   // v1.5.2: ESPACIO es impulso — nunca debe activar el botón con foco
  if (k === 'enter') { chatInput.style.display = 'block'; chatInput.focus(); e.preventDefault(); }
  if (k === 'm' && inGame) backToMenu();
});
// v1.5.2: doble seguro — ningún botón queda enfocado tras el clic (ESPACIO lo reactivaría)
addEventListener('click', e => { if (e.target && e.target.tagName === 'BUTTON') e.target.blur(); });
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
const mouse = { x: 0, y: 0, down: false };
addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (selectBox) { selectBox.x1 = e.clientX; selectBox.y1 = e.clientY; }   // v0.7
});
addEventListener('mousedown', e => {
  if (e.target !== canvas || e.button !== 0) return;   // solo botón izquierdo sobre el canvas
  // v0.7: SHIFT+arrastre = seleccionar naves (nunca dispara);
  // con naves seleccionadas, clic izquierdo = orden de movimiento
  if (e.shiftKey) { selStart(e.clientX, e.clientY); return; }
  if (pendingOrder) {   // v2.0: orden armada desde el panel de flota — el clic fija el objetivo
    const w = clientToWorld(e.clientX, e.clientY);
    const act = pendingOrder;
    fpDisarm();
    orderGroup(act, clamp(w.x, 20, WORLD.w - 20), clamp(w.y, 20, WORLD.h - 20), null);
    selection.clear(); playerSel = false;
    return;
  }
  if (selection.size || playerSel) { orderMoveTo(e.clientX, e.clientY); return; }
  mouse.down = true;
});
addEventListener('mouseup',   () => { mouse.down = false; if (selectBox) selFinish(); });
// zoom estratégico con la rueda del ratón
addEventListener('wheel', e => {
  if (!inGame) return;
  // v1.6.1: hacer scroll DENTRO de un menú/panel no debe cambiar el zoom del juego
  if (e.target.closest && e.target.closest('.game-panel, #chat, #board, #fleet-panel')) return;
  cam.zoomTarget = clamp(cam.zoomTarget * Math.pow(1.2, -e.deltaY / 100), ZMIN, ZMAX);
}, { passive: true });

/* ---------- cámara ---------- */
const cam = { x: player.x, y: player.y, zoom: 1, zoomTarget: 1 };

/* ---------- v0.5: fase de preparación y capital ---------- */
let prepT = 0;                 // segundos restantes de preparación (0 = fase superada)
let playerCapital = null;      // planeta capital del jugador
const prepBanner = document.getElementById('prep-banner');

/* =========================================================
   v0.9 — NIEBLA DE GUERRA
   Rejilla de 200 u sobre el mundo. Ves lo que está a 600 u
   de tus naves o a 1000 u de tus planetas; lo visto queda
   EXPLORADO para siempre (atenuado, con el último dueño
   conocido). Lo nunca visto no se dibuja. Persiste en el save.
   ========================================================= */
const FOG_CELL = 200;
const FOG_W = Math.ceil(WORLD.w / FOG_CELL), FOG_H = Math.ceil(WORLD.h / FOG_CELL);
const explored = new Uint8Array(FOG_W * FOG_H);    // visto alguna vez (persistente)
const visibleNow = new Uint8Array(FOG_W * FOG_H);  // bajo visión AHORA
const VISION_SHIP = 600, VISION_PLANET = 1000;
let fogT = 0;
const fogCanvas = document.createElement('canvas');
fogCanvas.width = FOG_W; fogCanvas.height = FOG_H;
const fogCtx = fogCanvas.getContext('2d');
const fogImg = fogCtx.createImageData(FOG_W, FOG_H);

function fogCell(x, y) {
  const cx = Math.max(0, Math.min(FOG_W - 1, Math.floor(x / FOG_CELL)));
  const cy = Math.max(0, Math.min(FOG_H - 1, Math.floor(y / FOG_CELL)));
  return cy * FOG_W + cx;
}
function fogVisible(x, y)  { return !!visibleNow[fogCell(x, y)]; }
function fogExplored(x, y) { return !!explored[fogCell(x, y)]; }
function fogMark(x, y, r) {
  const x0 = Math.max(0, Math.floor((x - r) / FOG_CELL)), x1 = Math.min(FOG_W - 1, Math.floor((x + r) / FOG_CELL));
  const y0 = Math.max(0, Math.floor((y - r) / FOG_CELL)), y1 = Math.min(FOG_H - 1, Math.floor((y + r) / FOG_CELL));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const ddx = (cx + 0.5) * FOG_CELL - x, ddy = (cy + 0.5) * FOG_CELL - y;
    if (ddx * ddx + ddy * ddy <= r * r) { const i = cy * FOG_W + cx; visibleNow[i] = 1; explored[i] = 1; }
  }
}
function fogUpdate(dt) {
  fogT -= dt;
  if (fogT > 0) return;
  fogT = 0.25;   // 4 Hz sobra
  visibleNow.fill(0);
  if (player.alive) fogMark(player.x, player.y, VISION_SHIP);
  for (const b of bots) if (b.built && b.alive) fogMark(b.x, b.y, VISION_SHIP);
  for (const p of planets) if (p.owner === player.color) fogMark(p.x, p.y, VISION_PLANET);
  // último dueño conocido de los planetas bajo visión (para el mapa atenuado)
  for (const p of planets) if (fogVisible(p.x, p.y)) p.knownOwner = p.owner;
  // repintar la textura de niebla: opaco = inexplorado, velo = explorado sin visión
  const d = fogImg.data;
  for (let i = 0; i < explored.length; i++) {
    const a = visibleNow[i] ? 0 : (explored[i] ? 110 : 235);
    d[i * 4] = 3; d[i * 4 + 1] = 5; d[i * 4 + 2] = 12; d[i * 4 + 3] = a;
  }
  fogCtx.putImageData(fogImg, 0, 0);
}
function fogDraw() {   // se dibuja lo ÚLTIMO en coordenadas de mundo (tras asteroides)
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogCanvas, 0, 0, WORLD.w, WORLD.h);
  ctx.restore();
}

/* =========================================================
   LÓGICA DE ACTUALIZACIÓN
   ========================================================= */
const CAPTURE_RANGE_EXTRA = 24;
const CAPTURE_TIME = 6;      // segundos para capturar (v0.5.2: conquista más pausada)
const KILL_REWARD = 25;
const PLANET_INCOME = 1;       // créditos/s por planeta propio

// v2.1.1: disciplina de fuego de tu flota — tus wingmen solo pueden DAÑAR a
// facciones en guerra contigo o provocadas (por ti o porque te atacaron).
// Las balas perdidas contra neutrales ya no cabrean a nadie (feedback de Pedro).
function wingmanCanEngage(color) {
  return (standings[color] || 0) <= -30 || (playerAggro[color] || 0) > 0;
}
function damageShip(ship, dmg, killer) {
  if (ship === player && player.invuln > 0) return;
  // v1.4: el escudo deflector bloquea un impacto cada 20 s
  if (ship === player && player.tech.deflector && (player.deflCd || 0) <= 0) {
    player.deflCd = 20;
    chatSys('🛡️ El escudo deflector ha bloqueado el impacto.');
    particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: 0.4, color: '#7ef9ff' });
    return;
  }
  ship.hp -= dmg;
  ship.flash = 0.15;
  // v1.6.1: aviso en pantalla cuando TE disparan (cooldown para no spamear)
  if (ship === player && killer && killer !== player)
    notify('⚠️ ¡Bajo fuego enemigo' + (killer.name ? ' de ' + killer.name : '') + '!', 'danger', 'p-hit', 4);
  // diplomacia: que te disparen empeora la relación con esa facción
  if (ship === player && killer && killer.color && killer !== player) {
    changeStanding(killer.color, -6);
  }
  // v0.8: represalia — una nave imperial recuerda quién le disparó un rato
  if (ship.imp && killer && killer.color && killer.color !== ship.color) {
    ship.lastHitBy = killer.color; ship.retalT = 20;
  }
  // v0.8: provocación — si TÚ (o tu flota) dañáis a una facción, tus wingmen
  // pueden atacarla durante un rato; y si te dañan a ti o a tu flota, defensa propia
  if (ship !== player && ship.color && ship.color !== player.color && (killer === player || (killer && killer.built)))
    playerAggro[ship.color] = 45;
  if ((ship === player || ship.built) && killer && killer.color && killer.color !== player.color && killer !== player)
    playerAggro[killer.color] = Math.max(playerAggro[killer.color] || 0, 30);
  // v0.6: simetría — si TÚ dañas a un bot, su facción se cabrea contigo;
  // si lo daña un wingman tuyo, cuenta como tuyo pero atenuado
  if (ship !== player && ship.color && killer === player) changeStanding(ship.color, -6);
  else if (ship !== player && ship.color && killer && killer.built) changeStanding(ship.color, -3);
  if (ship.hp <= 0 && ship.alive) {
    ship.alive = false;
    explode(ship.x, ship.y, ship.color);
    if (ship === player) {
      player.deaths++;
      player.respawnT = 3;
      player.vx = player.vy = 0;
      chatSys('💥 Has sido destruido' + (killer ? ' por ' + killer.name : '') + '. Nave perdida. Reapareciendo…');
      notify('💥 Tu nave ha sido destruida', 'danger');
    } else {
      if (ship.built) {
        const sn = (SHIPS.find(s => s.id === ship.shipType) || SHIPS[0]).name;
        chatSys('💥 Has perdido a ' + ship.name + ' (' + sn + '). Las naves construidas no se reponen.');
        notify('💥 ' + ship.name + ' destruido', 'danger');   // v1.6.1
      }
      ship.respawnT = rnd(3, 6);
      if (killer === player) {
        player.credits += KILL_REWARD; player.kills++;
        if (typeof onPlayerKill === 'function') onPlayerKill(ship);
        chatSys('☠️ Destruiste a ' + ship.name + ' (+' + KILL_REWARD + '◈)');
      } else if (killer && killer.built) {
        // v0.6: las bajas de tus wingmen suman para ti
        player.credits += KILL_REWARD; player.kills++;
        if (typeof onPlayerKill === 'function') onPlayerKill(ship);
        chatSys('🛰️ ' + killer.name + ' destruyó a ' + ship.name + ' (+' + KILL_REWARD + '◈)');
      } else if (killer) {
        killer.credits += KILL_REWARD; killer.kills = (killer.kills || 0) + 1;
      }
    }
  }
}

function respawnShip(ship) {
  // v0.6: la nave DEL JUGADOR se pierde de verdad — reaparece en su capital
  // con la primera nave del hangar, o con un caza de emergencia gratis
  if (ship === player) {
    let modelName;
    if (hangarShips.length) {
      player.ship = hangarShips.shift();
      modelName = (SHIPS.find(s => s.id === player.ship) || SHIPS[0]).name;
      chatSys('🚀 Reapareces en tu capital pilotando: ' + modelName + ' (del hangar).');
    } else {
      player.ship = 'caza';
      modelName = 'Caza';
      chatSys('🚨 Hangar vacío: la capital te asigna un CAZA DE EMERGENCIA gratis.');
    }
    applyUpgrades();
    const p = playerCapital || planets[0];
    ship.x = clamp(p.x + rnd(-150, 150), 20, WORLD.w - 20);
    ship.y = clamp(p.y + rnd(-150, 150), 20, WORLD.h - 20);
    ship.hp = player.maxHp;
    ship.fuel = player.maxFuel;
    ship.alive = true;
    ship.vx = ship.vy = 0;
    player.invuln = 2;
    return;
  }
  // reaparecer cerca de un planeta de su facción (o aleatorio)
  const owned = planets.filter(p => p.owner === ship.color);
  const p = owned.length ? owned[rndi(0, owned.length - 1)]
                        : planets[rndi(0, planets.length - 1)];
  ship.x = clamp(p.x + rnd(-200, 200), 20, WORLD.w - 20);
  ship.y = clamp(p.y + rnd(-200, 200), 20, WORLD.h - 20);
  ship.hp = ship === player ? player.maxHp : 10;   // v1.1: HP alto
  ship.alive = true;
  ship.vx = ship.vy = 0;
  if (ship === player) player.invuln = 2;
}

function update(dt) {
  /* --- jugador --- */
  if (player.alive) {
    const boosting = keys[' '] && player.fuel > 0;
    // v1.4: hipermotor (impulso ×3,2) / crucero (+35 % sin impulso)
    const boostMul = player.tech.hipermotor ? 3.2 : 2.2;
    const accel = 45 * getShipMod().accel * (1 + 0.15 * player.upgrades.motor) *
                  (boosting ? boostMul : (player.tech.crucero ? 1.35 : 1));   // v1.0: velocidades ÷3
    // v2.0: piloto automático — cualquier entrada manual (WASD/clic/ESPACIO) recupera el mando
    if (player.auto) {
      if (keys['w'] || keys['a'] || keys['s'] || keys['d'] ||
          keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'] ||
          keys[' '] || mouse.down) {
        player.auto = false; player.role = 'hold';
        notify('🕹️ Control manual: piloto automático desconectado.', 'info', 'auto-off', 2);
      } else {
        playerAutoUpdate(dt, accel);
      }
    }
    if (!player.auto) {
    let ax = 0, ay = 0;
    if (keys['w'] || keys['arrowup'])    ay -= 1;
    if (keys['s'] || keys['arrowdown'])  ay += 1;
    if (keys['a'] || keys['arrowleft'])  ax -= 1;
    if (keys['d'] || keys['arrowright']) ax += 1;
    if (ax && ay) { ax *= 0.7071; ay *= 0.7071; }
    player.vx += ax * accel * dt;
    player.vy += ay * accel * dt;
    player.vx *= Math.pow(0.12, dt);
    player.vy *= Math.pow(0.12, dt);
    player.x = clamp(player.x + player.vx * dt, 16, WORLD.w - 16);
    player.y = clamp(player.y + player.vy * dt, 16, WORLD.h - 16);

    // apuntar hacia el ratón (teniendo en cuenta el zoom)
    const wx = cam.x + (mouse.x / 2 - VW / 2) / cam.zoom;
    const wy = cam.y + (mouse.y / 2 - VH / 2) / cam.zoom;
    player.angle = angleLerp(player.angle, Math.atan2(wy - player.y, wx - player.x), 1 - Math.pow(0.0001, dt));

    // disparar (v0.7: con naves seleccionadas el clic da órdenes, no dispara)
    player.shootCd -= dt;
    if (mouse.down && player.shootCd <= 0 && !selection.size) {
      shoot(player.x + Math.cos(player.angle) * 8, player.y + Math.sin(player.angle) * 8, player.angle, player.color, player,
            player.tech.blaster ? 2 : 1);   // v1.4: bláster pesado
      // v1.4: enjambre (+60 % cadencia) o bláster pesado (-25 % cadencia)
      player.shootCd = 0.22 * getShipMod().rof * (player.tech.enjambre ? 1 / 1.6 : 1) * (player.tech.blaster ? 1 / 0.75 : 1) / (1 + 0.25 * player.upgrades.cadencia);
      net.sendShoot();
    }
    }   // fin control manual (v2.0: en automático manda playerAutoUpdate)

    // combustible (v1.0: solo se reposta junto a planetas — propios rápido,
    // aliados medio, neutros lento; en mitad del espacio NADA.
    // v1.1: los planetas de ⛽ gas repostan al DOBLE)
    if (boosting) player.fuel = Math.max(0, player.fuel - (player.tech.hipermotor ? 30 : 40) * dt);   // impulso: cortos y caros (v1.4: hipermotor -25 %)
    else {
      let regen = 0;
      for (const p of planets) {
        if (dist2(p.x, p.y, player.x, player.y) >= (p.r + 60) ** 2) continue;
        const g = p.res === 'gas' ? 2 : 1;
        if (p.owner === player.color) { regen = 30 * g; break; }
        if (p.owner && (standings[p.owner] || 0) >= 20) regen = Math.max(regen, 12 * g);   // facción aliada
        else if (!p.owner) regen = Math.max(regen, 8 * g);                                 // planeta neutral
      }
      if (regen) player.fuel = Math.min(player.maxFuel, player.fuel + regen * dt);
    }
    // v1.1: reparación del jugador junto a un planeta propio: +1 HP / 1,5 s por 5◈
    if (player.hp < player.maxHp) {
      let nearOwn = false;
      for (const p of planets)
        if (p.owner === player.color && dist2(p.x, p.y, player.x, player.y) < (p.r + 60) ** 2) { nearOwn = true; break; }
      if (nearOwn && player.credits >= 5) {
        player.repairT = (player.repairT || 0) + dt;
        if (player.repairT >= 1.5) {
          player.repairT = 0; player.hp += 1; player.credits -= 5;
          if (player.hp >= player.maxHp) chatSys('🔧 Reparación completa (' + player.hp + '/' + player.maxHp + ' HP).');
        }
      } else player.repairT = 0;
    }
    player.invuln = Math.max(0, player.invuln - dt);
    player.deflCd = Math.max(0, (player.deflCd || 0) - dt);   // v1.4: escudo deflector
    player.flash = Math.max(0, (player.flash || 0) - dt);
  } else {
    player.respawnT -= dt;
    if (player.respawnT <= 0) respawnShip(player);
  }

  /* --- bots --- */
  // v2.0: caches por frame — se calculan UNA vez y los reutilizan el tick de
  // facciones, la IA de los bots y la UI (nada de filtros O(n) por nave)
  frameFleetCount = 0;
  for (const k in frameFacShips) delete frameFacShips[k];
  frameFollowers.length = 0;
  for (const b of bots) {
    if (!b.alive) continue;
    if (b.built) { frameFleetCount++; if (b.role === 'follow') frameFollowers.push(b); }
    else if (b.imp) frameFacShips[b.color] = (frameFacShips[b.color] || 0) + 1;
  }
  // v0.8: tick de facciones imperio — economía, construcción y diplomacia estratégica
  for (const c in facState) {
    const f = facState[c];
    const owned = planets.filter(p => p.owner === c);
    f.credits += owned.reduce((s, p) => s + (p.capital ? PLANET_INCOME * 3 : (p.res === 'creditos' ? PLANET_INCOME : PLANET_INCOME * 0.5)), 0) * dt * (persOf(c).incomeMul || 1);   // v1.3: los mercantiles ganan más
    const ships = frameFacShips[c] || 0;   // v2.0: cache del frame
    // v2.0: simetría total — el tope de naves de la IA es su nivel de hangar
    // (misma curva que el jugador: 5 + 5·nivel), ya no el número de planetas
    const cap = 5 + 5 * (f.hangarLvl || 0);
    // v2.0: cerca del tope y con la hucha llena, la IA amplía su hangar (misma curva)
    const upgAI = 50 * (f.hangarLvl + 1);
    if (f.hangarLvl < HANGAR_LVL_MAX && ships >= cap * 0.8 && f.credits >= 3 * upgAI) {
      f.credits -= upgAI; f.hangarLvl++;
      const nvAI = f.hangarLvl + 1;
      if (nvAI === 10 || nvAI === 25 || nvAI === 50)   // solo hitos: no spamear el chat
        chatSys('🏗️ ' + facName(c) + ' amplía su hangar a nv.' + nvAI + ': puede desplegar hasta ' + (5 + 5 * f.hangarLvl) + ' naves.');
    }
    // v1.7: simetría de suministros — sin ⛏ en sus planetas mineros no hay nave nueva
    if (!f.building && f.credits >= FAC_SHIP_COST && ships < cap && f.capital && f.capital.owner === c &&
        takeStock(c, 'mineral', FAC_SHIP_ORE)) {
      f.credits -= FAC_SHIP_COST; f.building = true; f.buildT = FAC_SHIP_TIME;
    }
    // v1.2: la construcción muere con la capital (sin capital propio, no hay astillero)
    if (f.building && (!f.capital || f.capital.owner !== c)) { f.building = false; f.buildT = 0; }
    if (f.building) {
      f.buildT -= dt;
      if (f.buildT <= 0) { f.building = false; spawnFactionShip(c); }
    }
    f.aiT -= dt;
    if (f.aiT <= 0) {
      f.aiT = rnd(30, 50);
      facDiplomacy(c);
      for (const b of bots) if (b.imp && b.color === c) b.task = null;   // reasignar tareas
    }
  }
  gridRebuild();   // v2.0: la grid del frame, tras los spawns del tick de facciones
  for (const b of bots) {
    // v0.6/v0.8/v1.3: las naves construidas, imperiales y piratas se pierden de verdad
    if (!b.alive && (b.built || b.imp || b.pirate)) { b.gone = true; continue; }
    if (!b.alive) { b.respawnT -= dt; if (b.respawnT <= 0) respawnShip(b); continue; }
    // v0.6: los wingmen (tus naves construidas) tienen su propia IA
    if (b.built) { wingmanUpdate(b, dt); continue; }
    if (b.pirate) { pirateThink(b, dt); continue; }   // v1.3
    facShipThink(b, dt);   // v0.8: IA de facción
  }

  // v0.5: sin "reciclaje" de bots — nadie se teletransporta junto al jugador
  // v0.5.1: purgar naves construidas destruidas
  let purgedBuilt = false;
  for (let i = bots.length - 1; i >= 0; i--) if (bots[i].gone) { bots.splice(i, 1); purgedBuilt = true; }
  // v0.6: si un wingman tuyo cae con el hangar abierto, refrescar la lista
  if (purgedBuilt && typeof hangarEl !== 'undefined' && !hangarEl.classList.contains('hidden')) renderHangar();

  /* --- proyectiles --- */
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    let dead = pr.life <= 0 || pr.x < 0 || pr.x > WORLD.w || pr.y < 0 || pr.y > WORLD.h;
    if (!dead) {
      // colisión con jugador (v0.5.2: sin fuego amigo — tu color no te daña)
      if (pr.owner !== player && pr.color !== player.color && player.alive && dist2(pr.x, pr.y, player.x, player.y) < 64) {
        damageShip(player, pr.dmg || 1, pr.owner); dead = true;
      }
      // colisión con bots (mismo color = misma facción = inmune)
      // v2.0: candidatos por grid (radio de impacto 7 u)
      if (!dead) gridEach(pr.x, pr.y, 7, b => {
        if (b === pr.owner || !b.alive || b.color === pr.color) return false;
        // v2.1.1: las balas de tus wingmen atraviesan a las facciones neutras
        // sin dañarlas (solo dañan en guerra, provocación o a piratas)
        if (pr.owner && pr.owner.built && !b.pirate && !wingmanCanEngage(b.color)) return false;
        if (dist2(pr.x, pr.y, b.x, b.y) < 49) { damageShip(b, pr.dmg || 1, pr.owner); dead = true; return true; }
        return false;
      });
      // minería: los proyectiles dañan asteroides
      if (!dead) for (const a of asteroids) {
        if (!a.alive) continue;
        if (dist2(pr.x, pr.y, a.x, a.y) < (a.r + 2) ** 2) {
          a.hp -= pr.dmg || 1; dead = true;
          if (a.hp <= 0) {
            a.alive = false; a.respawnT = rnd(20, 40);
            explode(a.x, a.y, '#a0aec0');
            const vein = richVein && dist2(a.x, a.y, richVein.x, richVein.y) < 400 * 400 ? 2 : 1;   // v1.3: veta rica
            const mineGain = (3 + (player.tech.extractor ? 1 : 0)) * vein;   // v1.4: extractor +1◈
            if (pr.owner === player) {
              player.credits += mineGain;   // v1.0: los asteroides ya NO dan combustible (se reposta en planetas)
              if (typeof onAsteroidMined === 'function') onAsteroidMined();   // FIX v1.4: los contratos de minería no contaban
            } else if (pr.owner && pr.owner.built) {
              player.credits += mineGain;   // v1.4: la minería de tus wingmen también es tuya
              if (typeof onAsteroidMined === 'function') onAsteroidMined();
            } else if (pr.owner && pr.owner.imp && facState[pr.owner.color]) {
              facState[pr.owner.color].credits += 3 * vein;   // v0.8: la IA mina para su facción
            }
          } else {
            particles.push({ x: a.x, y: a.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.3, color: '#a0aec0' });
          }
          break;
        }
      }
      // v0.4: los proyectiles dañan los escudos de los planetas
      // v0.5.2: no dañan planetas de su propia facción
      if (!dead) for (const p of planets) {
        if (!p.owner || p.shield <= 0 || p.owner === pr.color) continue;
        if (pr.owner && pr.owner.built && !wingmanCanEngage(p.owner)) continue;   // v2.1.1: idem escudos de neutrales
        if (dist2(pr.x, pr.y, p.x, p.y) < (p.r + 4) ** 2) {
          // v0.5: durante la preparación la capital es invulnerable
          if (prepT > 0 && p === playerCapital) {
            particles.push({ x: pr.x, y: pr.y, vx: rnd(-50, 50), vy: rnd(-50, 50), life: 0.25, color: '#8aff80' });
            dead = true; break;
          }
          p.shield -= pr.dmg || 1;   // v1.4: el bláster pesado desgasta más escudo
          // v1.6.1: aviso en pantalla si atacan un planeta TUYO (cooldown por planeta)
          if (p.owner === player.color) notify('⚠️ ¡' + p.name + ' bajo ataque!', 'warn', 'pl-' + p.name, 8);
          // v0.8: dañar el escudo de una facción cuenta como provocación tuya
          if (pr.owner === player || (pr.owner && pr.owner.built)) playerAggro[p.owner] = 45;
          particles.push({ x: pr.x, y: pr.y, vx: rnd(-50, 50), vy: rnd(-50, 50), life: 0.25, color: p.owner });
          dead = true; break;
        }
      }
    }
    if (dead) projectiles.splice(i, 1);
  }

  /* --- partículas --- */
  for (let i = particles.length - 1; i >= 0; i--) {
    const pa = particles[i];
    pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.vx *= 0.98; pa.vy *= 0.98; pa.life -= dt;
    if (pa.life <= 0) particles.splice(i, 1);
  }

  /* --- conquista de planetas --- */
  let capturing = null;
  for (const p of planets) {
    const range = (p.r + CAPTURE_RANGE_EXTRA) ** 2;
    // ¿quién está presente?
    let playerHere = player.alive && dist2(p.x, p.y, player.x, player.y) < range;
    let botsHere = 0, botColor = null, contested = false;
    gridEach(p.x, p.y, p.r + CAPTURE_RANGE_EXTRA, b => {   // v2.0: presencia por grid
      if (!b.alive) return false;
      if (dist2(p.x, p.y, b.x, b.y) < range) {
        botsHere++;
        if (botColor && botColor !== b.color) contested = true;
        botColor = b.color;
      }
      return false;
    });
    if (playerHere && botsHere && botColor !== player.color) contested = true;

    if ((playerHere || botsHere) && !contested) {
      const faction = playerHere ? player.color : botColor;
      // v0.5: la capital no se puede capturar durante la preparación
      const protectedCap = prepT > 0 && p === playerCapital && faction !== player.color;
      if (p.owner !== faction && p.shield <= 0 && !protectedCap) {
        if (p.capturer !== faction) { p.capturer = faction; p.capture = 0; }
        p.capture += dt / CAPTURE_TIME;
        if (playerHere && faction === player.color) capturing = { p, faction };
        if (p.capture >= 1) {
          const was = p.owner;
          p.owner = faction; p.capture = 0; p.capturer = null;
          p.shield = p.shieldMax;
          if (typeof onPlanetCaptured === 'function') onPlanetCaptured(p, was);
          if (faction === player.color) {
            player.credits += 10;
            chatSys('🪐 Has conquistado ' + p.name + ' para tu facción (+10◈)');
            notify('🪐 ' + p.name + ' conquistado (+10◈)', 'good');   // v1.6.1
          } else if (was === player.color) {
            changeStanding(faction, -25);
            chatSys('⚠️ ' + p.name + ' ha caído en manos de la facción ' + faction);
            notify('🪐 ¡' + p.name + ' PERDIDO!', 'danger');   // v1.6.1
          } else if (p.capital) {
            // v0.8: la caída de una capital enemiga es noticia galáctica
            chatSys('⚠️ La CAPITAL de ' + facName(was) + ' ha caído en manos de ' + facName(faction) + '.');
          }
        }
      } else { p.capture = 0; p.capturer = null; }
    } else { p.capture = Math.max(0, p.capture - dt / CAPTURE_TIME); if (!p.capture) p.capturer = null; }
  }

  // ingresos por planetas propios según RECURSO (v1.1): ◈ créditos ×1, ⛏/⛽ ×0,5,
  // capital ×3; los recursos ⛏/⛽ se acumulan como stock local (v1.7, abajo)
  let income = 0;
  for (const p of planets) if (p.owner === player.color)
    income += p === playerCapital ? PLANET_INCOME * 3 : (p.res === 'creditos' ? PLANET_INCOME : PLANET_INCOME * 0.5);
  player.credits += income * dt;
  // v1.7: cada planeta con dueño (tuyo o de la IA — simetría) acumula stock de
  // su recurso en local (tope 100). Los planetas de ◈ créditos no almacenan.
  for (const p of planets) {
    if (!p.owner || p.res === 'creditos') continue;
    const mul = p.owner === player.color && player.tech.extractor ? 1.5 : 1;   // v1.4: extractor +50 %
    p.stock = Math.min(STOCK_CAP, p.stock + STOCK_RATE * mul * dt);
  }

  // v1.1: los escudos se RECARGAN consumiendo el recurso del dueño
  // (jugador: ⛏ del stock de sus minas (v1.7) · facciones IA: ◈ de su hucha).
  for (const p of planets) {
    if (!p.owner || p.shield >= p.shieldMax) continue;
    const pts = Math.min(1.5 * dt, p.shieldMax - p.shield);
    if (p.owner === player.color) {
      const cost = pts * 0.2;
      if (takeStock(player.color, 'mineral', cost)) p.shield += pts;   // v1.7
    } else {
      const f = facState[p.owner], cost = pts * 0.5;
      if (f && f.credits >= cost) { f.credits -= cost; p.shield += pts; }
    }
  }

  // v1.1: reparación de naves junto a planetas propios (cuesta ◈ y tiempo)
  for (const b of bots) {
    if (!b.alive || (!b.built && !b.imp) || b.hp >= (b.maxHp || 10)) continue;
    const isMine = !!b.built;
    let near = false;
    for (const p of planets) {
      if (p.owner !== (isMine ? player.color : b.color)) continue;
      if (dist2(p.x, p.y, b.x, b.y) < (p.r + 400) ** 2) { near = true; break; }
    }
    if (!near) { b.repairT = 0; continue; }
    b.repairT = (b.repairT || 0) + dt;
    const period = isMine ? 2 : 3, cost = isMine ? 2 : 0;   // la IA repara gratis (su coste es no luchar)
    if (b.repairT >= period && (!cost || player.credits >= cost)) {
      b.repairT = 0; b.hp += 1; if (cost) player.credits -= cost;
    }
  }

  /* --- v2.0: daño solar — a menos de sun.r + 120 u el sol quema (3 HP/s) ---
     Muerte por sol = muerte normal (pérdida real). Ni la invulnerabilidad de
     reaparición ni el deflector protegen del terreno: el deflector aguanta
     un tick y el sol sigue quemando. */
  for (const s of suns) {
    const rr = (s.r + 120) ** 2;
    if (player.alive && player.invuln <= 0 && dist2(player.x, player.y, s.x, s.y) < rr) {
      player.hp -= 3 * dt; player.flash = 0.15;
      notify('☀️ ¡Tu nave se quema! Aléjate del sol.', 'danger', 'sun', 4);
      if (player.hp <= 0) { player.hp = 1; damageShip(player, 999, null); }
    }
    for (const b of bots) {
      if (!b.alive || dist2(b.x, b.y, s.x, s.y) >= rr) continue;
      b.hp -= 3 * dt; b.flash = 0.15;
      if (b.hp <= 0) { b.hp = 1; damageShip(b, 999, null); }
    }
  }

  /* --- cámara y red --- */
  fogUpdate(dt);   // v0.9: niebla de guerra
  cam.x += (player.x - cam.x) * (1 - Math.pow(0.001, dt));
  cam.y += (player.y - cam.y) * (1 - Math.pow(0.001, dt));
  cam.zoom += (cam.zoomTarget - cam.zoom) * (1 - Math.pow(0.0001, dt)); // zoom suavizado
  net.sendPos(dt);

  /* --- v0.5: cuenta atrás de la preparación --- */
  if (prepBanner) {
    if (prepT > 0) {
      prepT -= dt;
      const mm = Math.floor(Math.max(0, prepT) / 60), ss = Math.floor(Math.max(0, prepT) % 60);
      prepBanner.classList.remove('hidden');
      prepBanner.textContent = '🛡️ PREPARACIÓN ' + mm + ':' + String(ss).padStart(2, '0') + ' — tu capital es invulnerable';
      if (prepT <= 0) chatSys('⚠️ Fin de la preparación: la galaxia ya puede atacar tu capital.');
    } else prepBanner.classList.add('hidden');
  }

  /* --- HUD --- */
  document.getElementById('hud-coords').textContent = 'X:' + Math.floor(player.x) + '  Y:' + Math.floor(player.y) + '  ×' + cam.zoom.toFixed(2);
  document.getElementById('online-count').textContent = bots.filter(b => b.alive).length + 1 + net.remotes.size;
  document.getElementById('hp-fill').style.width = Math.max(0, player.hp / player.maxHp * 100) + '%';
  document.getElementById('fuel-fill').style.width = (player.fuel / player.maxFuel * 100) + '%';
  document.getElementById('credits').textContent = '◈ ' + Math.floor(player.credits);
  document.getElementById('kills').textContent = '💀 ' + player.kills;
  document.getElementById('mineral').textContent = '⛏ ' + Math.floor(stockOf(player.color, 'mineral'));   // v1.7: suma de tus minas
  document.getElementById('gas').textContent = '⛽ ' + Math.floor(stockOf(player.color, 'gas'));   // v1.7: suma de tus gasolineras

  // barra de captura
  const capEl = document.getElementById('capbar');
  if (capturing && capturing.faction === player.color) {
    capEl.classList.remove('hidden');
    document.getElementById('capbar-label').textContent = 'CONQUISTANDO ' + capturing.p.name;
    document.getElementById('capbar-fill').style.width = Math.min(100, capturing.p.capture * 100) + '%';
  } else capEl.classList.add('hidden');

  // mensaje de reaparición
  const rEl = document.getElementById('respawn-msg');
  if (!player.alive) { rEl.classList.remove('hidden'); rEl.textContent = 'DESTRUIDO — reapareciendo en ' + Math.ceil(player.respawnT) + '…'; }
  else rEl.classList.add('hidden');

  updateBoard();
  updateChat(dt);
}

/* =========================================================
   DIBUJO
   ========================================================= */
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05060e';
  ctx.fillRect(0, 0, VW, VH);

  // v0.5: todo el mundo se dibuja en coordenadas de mundo con zoom
  const z = cam.zoom;
  const strat = z < 0.45;   // modo mapa de estrategia
  ctx.setTransform(z, 0, 0, z, VW / 2 - cam.x * z, VH / 2 - cam.y * z);
  const vL = cam.x - VW / 2 / z, vR = cam.x + VW / 2 / z;
  const vT = cam.y - VH / 2 / z, vB = cam.y + VH / 2 / z;

  // estrellas con parallax
  const ss = Math.max(1, 1 / z);
  for (const layer of starLayers) {
    const ox = cam.x * (1 - layer.par), oy = cam.y * (1 - layer.par);
    ctx.fillStyle = layer.par < 0.5 ? '#44557a' : (layer.par < 0.7 ? '#8fa8d0' : '#e8f0ff');
    for (const s of layer.stars) {
      const sx = (((s.x + ox) % WORLD.w) + WORLD.w) % WORLD.w;
      const sy = (((s.y + oy) % WORLD.h) + WORLD.h) % WORLD.h;
      if (sx >= vL && sx <= vR && sy >= vT && sy <= vB) ctx.fillRect(sx, sy, ss, ss);
    }
  }

  // rejilla del mapa de estrategia
  if (strat) {
    ctx.strokeStyle = 'rgba(126,249,255,0.05)';
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    for (let gx = Math.floor(vL / 1000) * 1000; gx <= vR; gx += 1000) { ctx.moveTo(gx, vT); ctx.lineTo(gx, vB); }
    for (let gy = Math.floor(vT / 1000) * 1000; gy <= vB; gy += 1000) { ctx.moveTo(vL, gy); ctx.lineTo(vR, gy); }
    ctx.stroke();
  }

  // v2.0: soles — antes que los planetas; son la referencia de cada sistema
  // (landmarks: se ven siempre, la niebla no los oculta)
  for (const s of suns) {
    const glow = s.r * (1 + SUN_HALO);
    if (s.x < vL - glow || s.x > vR + glow || s.y < vT - glow || s.y > vB + glow) continue;
    if (strat) {
      // mapa de estrategia: círculo amarillo + anillos de órbita tenues de su sistema
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,209,102,0.10)'; ctx.lineWidth = 2 / z;
      for (const orb of s.orbits) { ctx.beginPath(); ctx.arc(s.x, s.y, orb, 0, TAU); ctx.stroke(); }
    } else {
      // zoom cercano: sprite pixel-art (halo incluido) + glow exterior
      ctx.drawImage(s.sprite, s.x - s.sprite.width / 2, s.y - s.sprite.height / 2);
      ctx.strokeStyle = 'rgba(255,159,90,0.22)'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 34, 0, TAU); ctx.stroke();
    }
  }

  // planetas (v0.9: niebla — solo lo explorado; atenuado y con el último
  // dueño conocido si ahora mismo no está bajo tu visión)
  for (const p of planets) {
    if (p.x < vL - p.r * 2 || p.x > vR + p.r * 2 || p.y < vT - p.r * 2 || p.y > vB + p.r * 2) continue;
    const pVis = fogVisible(p.x, p.y);
    if (!pVis && !fogExplored(p.x, p.y)) continue;
    const shownOwner = pVis ? p.owner : (p.knownOwner || null);
    ctx.globalAlpha = pVis ? 1 : 0.4;
    if (strat) {
      // mapa de estrategia: círculo con color de facción, sin detalle pixel
      ctx.fillStyle = shownOwner || '#44557a';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      if (pVis && p.shield > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10 / z, -Math.PI / 2, -Math.PI / 2 + (p.shield / p.shieldMax) * TAU); ctx.stroke();
      }
      if (pVis && p.capture > 0 && p.capturer) {
        ctx.strokeStyle = p.capturer; ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 20 / z, -Math.PI / 2, -Math.PI / 2 + p.capture * TAU); ctx.stroke();
      }
      if (p.capital) {   // anillo de capital (la tuya y las de las facciones)
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 34 / z, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      continue;
    }
    // render pixel-art (zoom cercano)
    if (shownOwner) {
      ctx.strokeStyle = shownOwner; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, TAU); ctx.stroke();
      // v0.4: arco de escudo proporcional a los puntos restantes (solo bajo visión)
      if (pVis && p.shield > 0) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8, -Math.PI / 2, -Math.PI / 2 + (p.shield / p.shieldMax) * TAU); ctx.stroke();
      }
    }
    // progreso de captura (solo bajo visión)
    if (pVis && p.capture > 0 && p.capturer) {
      ctx.strokeStyle = p.capturer; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + p.capture * TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(126,249,255,0.06)';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8, 0, TAU); ctx.fill();
    ctx.drawImage(p.sprite, p.x - p.r, p.y - p.r);
    if (z >= 0.8 && dist2(p.x, p.y, player.x, player.y) < 700 * 700) {
      ctx.font = (6 / z) + 'px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = shownOwner || '#8fa8d0';
      // v1.7: en planetas propios se muestra además su stock local (⛏ 42)
      ctx.fillText(p.name + (shownOwner ? ' ●' : '') + (p.capital ? ' ★' : '') +
        (pVis ? ' ' + RES_ICON[p.res] + (p.owner === player.color && p.res !== 'creditos' ? ' ' + Math.floor(p.stock) : '') : ' ?'),
        p.x, p.y - p.r - 4 / z);
    }
    ctx.globalAlpha = 1;
  }

  // bots (v0.9: las naves de otras facciones solo se ven bajo tu visión)
  for (const b of bots) {
    if (!b.alive) continue;
    if (b.x < vL - 60 || b.x > vR + 60 || b.y < vT - 60 || b.y > vB + 60) continue;
    if (!b.built && !fogVisible(b.x, b.y)) continue;   // enemigos en niebla: invisibles
    if (strat) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - 1.5 / z, b.y - 1.5 / z, 3 / z, 3 / z);
    } else {
      // v1.5: opacidad completa, estela según empuje real, flash blanco y sprite por tipo
      const sz = b.built ? 3.5 * shipDef(b.shipType).size : 3;
      const type = b.built ? b.shipType : (b.pirate ? 'avispa' : 'caza');
      drawShipWithHalo(b.x, b.y, b.angle, b.color, sz, 1, b.thrustLvl || 0, b.flash > 0, type);
    }
  }

  // jugadores remotos (multijugador real) — también ocultos por la niebla
  for (const r of net.remotes.values()) {
    if (r.x < vL - 60 || r.x > vR + 60 || r.y < vT - 60 || r.y > vB + 60) continue;
    if (!fogVisible(r.x, r.y)) continue;
    if (strat) {
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x - 1.5 / z, r.y - 1.5 / z, 3 / z, 3 / z);
      continue;
    }
    drawShipWithHalo(r.x, r.y, r.a, r.color, 4, 1, true, false, 'caza');   // v1.5: estela también en remotos
    if (z >= 0.8) {
      ctx.fillStyle = r.color; ctx.font = (6 / z) + 'px monospace'; ctx.textAlign = 'center';
      ctx.fillText(r.name, r.x, r.y - 14 / z);
    }
  }

  // proyectiles y partículas (solo en zoom cercano: a escala de mapa son ruido)
  if (!strat) {
    for (const pr of projectiles) {
      if (pr.x < vL - 4 || pr.x > vR + 4 || pr.y < vT - 4 || pr.y > vB + 4) continue;
      if (pr.color !== player.color && !fogVisible(pr.x, pr.y)) continue;   // v0.9
      ctx.fillStyle = pr.color;
      ctx.fillRect(pr.x - 1, pr.y - 1, 3, 3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(pr.x, pr.y, 1, 1);
    }
    for (const pa of particles) {
      if (pa.x < vL - 4 || pa.x > vR + 4 || pa.y < vT - 4 || pa.y > vB + 4) continue;
      if (!fogVisible(pa.x, pa.y)) continue;   // v0.9
      ctx.globalAlpha = Math.max(0, pa.life);
      ctx.fillStyle = pa.color;
      ctx.fillRect(pa.x, pa.y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // jugador
  if (player.alive) {
    if (strat) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(player.x - 2 / z, player.y - 2 / z, 4 / z, 4 / z);
      ctx.strokeStyle = player.color; ctx.lineWidth = 1.5 / z;
      ctx.beginPath(); ctx.arc(player.x, player.y, 6 / z, 0, TAU); ctx.stroke();
    } else {
      // v1.5: estela al MOVERSE (umbral bajo: el crucero es lento) y más grande con el impulso
      const boostingNow = keys[' '] && player.fuel > 0;
      const moving = Math.abs(player.vx) + Math.abs(player.vy) > 5;
      drawShipWithHalo(player.x, player.y, player.angle, player.color, 4 * getShipMod().size, player.invuln > 0 ? 0.5 + 0.4 * Math.sin(performance.now() / 60) : 1, boostingNow ? 2 : (moving ? 1 : 0), player.flash > 0, player.ship);
      if (z >= 0.8) {
        ctx.fillStyle = '#ffd166'; ctx.font = (7 / z) + 'px monospace'; ctx.textAlign = 'center';
        ctx.fillText(player.name, player.x, player.y - 14 / z);
      }
    }
  }

  // v0.7: resaltado de las naves seleccionadas (aro blanco, vale en ambos zooms)
  if (selection.size) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 / z;
    for (const b of bots) {
      if (!b.built || !b.alive || !selection.has(b.uid)) continue;
      ctx.beginPath(); ctx.arc(b.x, b.y, (strat ? 6 / z : 14), 0, TAU); ctx.stroke();
    }
    // destino de las órdenes de movimiento/ataque del grupo
    ctx.strokeStyle = 'rgba(126,249,255,0.6)'; ctx.lineWidth = 1 / z;
    for (const b of bots) {
      if (!b.built || !b.alive || !selection.has(b.uid)) continue;
      if ((b.role === 'move' || b.role === 'attack') && b.ox != null) {
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.ox, b.oy); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.ox, b.oy, 8 / z, 0, TAU); ctx.stroke();
      }
    }
  }

  drawMinimap();

  // v0.7: overlays en coordenadas de pantalla (cuadro de selección y pista)
  if (selectBox || selection.size) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (selectBox) {
      const rx = Math.min(selectBox.x0, selectBox.x1) / 2, ry = Math.min(selectBox.y0, selectBox.y1) / 2;
      const rw = Math.abs(selectBox.x1 - selectBox.x0) / 2, rh = Math.abs(selectBox.y1 - selectBox.y0) / 2;
      ctx.strokeStyle = '#7ef9ff'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(126,249,255,0.08)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    }
    if (selection.size) {
      ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#7ef9ff';
      ctx.fillText('🛰️ ' + selection.size + ' seleccionada(s) · CLIC: mover · CLIC DERECHO: órdenes (ambos sueltan la selección) · ESC: cancelar', VW / 2, VH - 4);
    }
    // restaurar el transform de mundo: los wrappers posteriores (asteroides) lo necesitan
    ctx.setTransform(z, 0, 0, z, VW / 2 - cam.x * z, VH / 2 - cam.y * z);
  }
}

function drawShipWithHalo(x, y, angle, color, size, alpha, thrust, flash, type) {
  const k = size / 4;   // escala del sprite (size 4 = sprite 8×8)
  ctx.save();
  ctx.globalAlpha = alpha;
  // halo direccional
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, size + 5, angle - 0.9, angle + 0.9); ctx.stroke();
  ctx.globalAlpha = alpha * 0.35;
  ctx.beginPath(); ctx.arc(x, y, size + 8, angle - 0.5, angle + 0.5); ctx.stroke();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // v1.5: estela de motor de verdad — llama parpadeante detrás de la nave al andar.
  // thrust = nivel de empuje: 1 crucero (al moverse), 2 IMPULSO (llama ×1,9)
  if (thrust) {
    const boostF = thrust >= 2 ? 1.9 : 1;
    for (let i = 0; i < 3; i++) {
      const len = (3 + i * 3 + rndi(0, 2)) * k * boostF;
      ctx.globalAlpha = alpha * (0.95 - i * 0.3);
      ctx.fillStyle = i === 0 ? '#fff6d0' : (i === 1 ? '#ffd166' : '#ff9f5a');
      ctx.fillRect(-4 * k - len, -0.5 * k * boostF, len, 1 * k * boostF);
    }
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(shipSprite(color, type), -4 * k, -4 * k, 8 * k, 8 * k);
  // v1.5: flash BLANCO al recibir daño (antes transparentaba la nave)
  if (flash) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4 * k, -4 * k, 8 * k, 8 * k);
  }
  ctx.restore();
}

/* ---------- minimapa ---------- */
const mmc = document.getElementById('minimap-canvas');
const mctx = mmc.getContext('2d');
function drawMinimap() {
  mctx.fillStyle = '#05060e';
  mctx.fillRect(0, 0, 150, 150);
  const k = 150 / WORLD.w;
  // v0.9: el minimapa obedece a la niebla — solo lo explorado y lo visible
  mctx.fillStyle = 'rgba(68,85,122,0.25)';
  for (let cy = 0; cy < FOG_H; cy++) for (let cx = 0; cx < FOG_W; cx++)
    if (!explored[cy * FOG_W + cx]) mctx.fillRect(cx * FOG_CELL * k, cy * FOG_CELL * k, FOG_CELL * k + 1, FOG_CELL * k + 1);
  for (const p of planets) {
    if (!fogExplored(p.x, p.y)) continue;
    mctx.fillStyle = (fogVisible(p.x, p.y) ? p.owner : p.knownOwner) || '#44557a';
    mctx.fillRect(p.x * k, p.y * k, 2, 2);
  }
  // v2.0: soles siempre visibles en el minimapa (referencia de navegación)
  mctx.fillStyle = '#ffd166';
  for (const s of suns) mctx.fillRect(s.x * k, s.y * k, 2, 2);
  mctx.fillStyle = '#8fa8d0';
  for (const b of bots) if (b.alive && (b.built || fogVisible(b.x, b.y))) mctx.fillRect(b.x * k, b.y * k, 1, 1);
  for (const r of net.remotes.values()) {
    if (!fogVisible(r.x, r.y)) continue;
    mctx.fillStyle = r.color;
    mctx.fillRect(r.x * k, r.y * k, 1, 1);
  }
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(player.x * k - 1, player.y * k - 1, 3, 3);
}

/* =========================================================
   CLASIFICACIÓN
   ========================================================= */
function updateBoard() {
  // v0.8: clasificación por FACCIONES — planetas, naves y créditos del imperio
  // v0.9: con niebla — de las demás facciones solo cuentan planetas que CONOCES
  // (último dueño visto) y naves actualmente avistadas
  const rows = [];
  for (const c of FACTION_COLORS) {
    const mine = c === player.color;
    const pl = mine ? planets.filter(p => p.owner === c).length
                    : planets.filter(p => (fogVisible(p.x, p.y) ? p.owner : p.knownOwner) === c).length;
    const sh = mine ? bots.filter(b => b.built && b.alive).length + (player.alive ? 1 : 0)
                    : bots.filter(b => b.imp && b.alive && b.color === c && fogVisible(b.x, b.y)).length;
    const cr = mine ? Math.floor(player.credits) : Math.floor((facState[c] && facState[c].credits) || 0);
    rows.push({ name: mine ? player.name + ' (tú)' : facName(c), pl, sh, credits: cr, me: mine, color: c });
  }
  for (const r of net.remotes.values())
    rows.push({ name: r.name, pl: 0, sh: 1, credits: r.credits | 0, me: false, color: r.color });
  rows.sort((a, b) => b.pl - a.pl || b.credits - a.credits);
  const list = document.getElementById('board-list');
  list.innerHTML = rows.slice(0, 8).map(r =>
    `<li class="${r.me ? 'me' : ''}"><span style="color:${r.color}">${r.name}</span><span class="c">🪐${r.pl} 🛰${r.sh}${r.me ? ' ◈' + r.credits : ''}</span></li>`
  ).join('');
}

/* =========================================================
   CHAT
   ========================================================= */
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const CHAT_LINES = [
  '¿alguien cerca de P-452?', 'vendo mapas estelares, 5◈', 'esta facción es mía 😤',
  'cuidado con el cinturón de asteroides', '¡planeta conquistado! 🪐', 'me dispararon sin avisar 😡',
  'alguien que me escolte a P-101', 'gg', 'el impulso gasta mucho ⛽', '¡formemos alianza!',
  'he visto una flota enorme al este', 'los grises están conquistando todo',
];
let chatTimer = 5;
function chatMsg(name, color, text) {
  const d = document.createElement('div');
  d.innerHTML = `<b style="color:${color}">${name}:</b> ${text.replace(/</g, '&lt;')}`;
  chatLog.appendChild(d);
  while (chatLog.children.length > 30) chatLog.removeChild(chatLog.firstChild);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function chatSys(text) {
  const d = document.createElement('div');
  d.className = 'sys';
  d.textContent = text;
  chatLog.appendChild(d);
  while (chatLog.children.length > 30) chatLog.removeChild(chatLog.firstChild);
  chatLog.scrollTop = chatLog.scrollHeight;
}

/* ---------- v1.6.1: notificaciones en pantalla ----------
   Avisos grandes arriba del todo: ataques a ti/tus planetas, bajas de tu
   flota, construcción completada… No sustituyen al chat: son lo urgente. */
const notifyEl = document.getElementById('notify');
const alertCd = {};   // cooldown por clave para no spamear (p. ej. un planeta bajo fuego)
function notify(text, kind = 'info', cdKey = null, cdSecs = 0) {
  if (!notifyEl) return;
  if (cdKey) {
    const now = performance.now() / 1000;
    if (alertCd[cdKey] && now - alertCd[cdKey] < cdSecs) return;
    alertCd[cdKey] = now;
  }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = text;
  notifyEl.appendChild(t);
  while (notifyEl.children.length > 4) notifyEl.removeChild(notifyEl.firstChild);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 550); }, 5200);
}
function sendChat() {
  const t = chatInput.value.trim();
  if (t) { chatMsg(player.name, player.color, t); net.sendChat(t); }
  chatInput.value = '';
  chatInput.style.display = 'none';
  chatInput.blur();
}
function updateChat(dt) {
  chatTimer -= dt;
  if (chatTimer <= 0) {
    chatTimer = rnd(7, 16);
    const b = bots[rndi(0, bots.length - 1)];
    chatMsg(b.name, b.color, CHAT_LINES[rndi(0, CHAT_LINES.length - 1)]);
  }
}

/* =========================================================
   MULTIJUGADOR REAL (WebSocket)
   Si no hay servidor, el juego funciona en modo simulado.
   ========================================================= */
const net = {
  ws: null, connected: false,
  remotes: new Map(),       // id -> {name,color,x,y,a,credits,kills}
  posAcc: 0,
  connect() {
    try {
      this.ws = new WebSocket('wss://' + location.host);
      this.ws.onopen = () => {
        this.connected = true;
        this.send({ t: 'join', name: player.name, color: player.color });
        chatSys('🌐 Conectado al servidor. ¡Pilotos reales en la galaxia!');
      };
      this.ws.onclose = () => { this.connected = false; this.remotes.clear(); };
      this.ws.onmessage = ev => this.handle(JSON.parse(ev.data));
    } catch (e) { /* sin servidor: modo simulado */ }
  },
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
  sendPos(dt) {
    this.posAcc += dt;
    if (this.posAcc < 0.1) return;
    this.posAcc = 0;
    this.send({ t: 'pos', x: player.x, y: player.y, a: player.angle });
  },
  sendShoot() { this.send({ t: 'shoot', x: player.x, y: player.y, a: player.angle }); },
  sendChat(text) { this.send({ t: 'chat', text }); },
  handle(msg) {
    switch (msg.t) {
      case 'state':
        for (const [id, name, color, x, y, a] of msg.players) {
          if (id === undefined) continue;
          let r = this.remotes.get(id);
          if (!r) { r = { name, color, credits: 0, kills: 0 }; this.remotes.set(id, r); }
          r.name = name; r.color = color; r.x = x; r.y = y; r.a = a;
        }
        break;
      case 'shoot':
        shoot(msg.x, msg.y, msg.a, '#ffffff', null);
        break;
      case 'chat':
        chatMsg(msg.name || '???', msg.color || '#fff', msg.text || '');
        break;
    }
  },
};

/* =========================================================
   INTERFAZ — menú y arranque
   ========================================================= */
const $ = id => document.getElementById(id);

const picker = $('color-picker');
FACTION_COLORS.forEach((c, i) => {
  const dot = document.createElement('div');
  dot.className = 'color-dot' + (i === 0 ? ' selected' : '');
  dot.style.background = c;
  dot.onclick = () => {
    player.color = c;
    picker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
  };
  picker.appendChild(dot);
});

$('input-name').addEventListener('input', e => {
  player.name = e.target.value.trim() || 'PilotoAnónimo';
});

$('btn-play').onclick = startGame;
$('btn-help').onclick = () => { $('panel-help').classList.remove('hidden'); $('panel-settings').classList.add('hidden'); };
$('btn-settings').onclick = () => { $('panel-settings').classList.remove('hidden'); $('panel-help').classList.add('hidden'); };
document.querySelectorAll('.btn-close').forEach(b => b.onclick = () => {
  $('panel-help').classList.add('hidden');
  $('panel-settings').classList.add('hidden');
});

function startGame() {
  $('menu').classList.add('hidden');
  $('game').classList.remove('hidden');
  const save = readSave();
  if (save && save.player) {
    // CONTINUAR PARTIDA: nombre y color vienen del save (los bots guardados
    // se generaron excluyendo ese color; no se pueden cambiar al continuar)
    applySave(save);
    chatSys('▶ Partida restaurada. La galaxia seguía girando sin ti, ' + player.name + '.');
  } else {
    newGameInit();
  }
  $('hud-name').textContent = '▲ ' + player.name;
  $('hud-name').style.color = player.color;
  resize();
  inGame = true;
  lastT = performance.now();
  net.connect();
  requestAnimationFrame(loop);
}

function newGameInit() {
  // v0.5: elegir planeta CAPITAL — uno neutral lejos de otros dueños
  // (v0.8: la galaxia nace virgen, todos los planetas son neutros)
  // v2.0: separación entre capitales escalada a la galaxia de sistemas (≥6000 u)
  let cap = null, bestD = -1;
  for (let i = 0; i < 40; i++) {
    const p = planets[rndi(0, planets.length - 1)];
    if (p.owner) continue;
    let dmin = Infinity;
    for (const q of planets) if (q.owner) dmin = Math.min(dmin, dist2(p.x, p.y, q.x, q.y));
    if (dmin > bestD) { bestD = dmin; cap = p; }
    if (bestD > 6000 * 6000) break;
  }
  if (!cap) cap = planets.find(p => !p.owner) || planets[0];
  playerCapital = cap;
  cap.owner = player.color;
  cap.capital = true;
  cap.shieldMax = 100; cap.shield = 100;   // escudo grande de capital
  cap.name = 'CAPITAL ' + player.name;
  cap.res = 'mineral'; cap.stock = CAP_START_STOCK;   // v1.7: regla «capital minera» — arranque con 30⛏
  const sa = rnd(0, TAU);
  player.x = clamp(cap.x + Math.cos(sa) * (cap.r + 90), 16, WORLD.w - 16);
  player.y = clamp(cap.y + Math.sin(sa) * (cap.r + 90), 16, WORLD.h - 16);
  cam.x = player.x; cam.y = player.y;
  prepT = 300;   // 5 minutos de preparación protegida
  // v0.8: cada facción IA empieza DE CERO — capital propia (lejos de la tuya) y 1 nave.
  // Su IA conquista, mina y construye; tu flota se construye en tu capital.
  initFactions();
  // v0.9: niebla nueva para la partida nueva
  explored.fill(0); visibleNow.fill(0); fogT = 0;
  for (const p of planets) p.knownOwner = null;
  // v1.2: reiniciar victoria/derrota
  victory = false;
  const eb = document.getElementById('end-banner');
  if (eb) eb.classList.add('hidden');
  // v0.6: partida nueva — 1 caza (tu nave), hangar vacío, fondos iniciales
  player.ship = 'caza';
  player.tech = {}; player.deflCd = 0;   // v1.4
  player.hangarLvl = 0;   // v1.6: hangar nv.1 en partida nueva
  player.auto = false; player.role = 'hold'; player.ox = player.oy = player.oplanet = null;   // v2.0
  hangarShips.length = 0;
  buildQueue.length = 0;
  shipyardIdx = null;   // v1.7: astillero por defecto = la capital
  applyUpgrades();
  player.hp = player.maxHp; player.fuel = player.maxFuel;
  if (player.credits < 40) player.credits = 40;   // fondos iniciales
  tutStep = 0; tutT = 0; tutorialOn = true;       // tutorial solo en partida nueva
  if (typeof resetStory === 'function') resetStory();   // v2.1: historia desde el capítulo 1
  chatSys('🚀 Bienvenido a la galaxia, ' + player.name + '. Tu capital te espera: tienes 5 minutos de preparación.');
}

function backToMenu() {
  inGame = false;
  $('game').classList.add('hidden');
  $('menu').classList.remove('hidden');
}

/* ---------- bucle principal ---------- */
let inGame = false;
let lastT = performance.now();
function loop(t) {
  if (!inGame) return;
  const dt = Math.min((t - lastT) / 1000, 0.05);
  lastT = t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* =========================================================
   SISTEMAS v0.3 — minería, diplomacia, tienda, persistencia
   (bloque de ampliación: se auto-engancha al motor existente)
   ========================================================= */

/* ---------- asteroides minables ---------- */
function makeAsteroid(r, rng) {
  const s = document.createElement('canvas');
  s.width = s.height = r * 2;
  const c = s.getContext('2d');
  const pal = ['#718096', '#a0aec0', '#4a5568', '#e2e8f0'];
  for (let y = 0; y < r * 2; y++) for (let x = 0; x < r * 2; x++) {
    const dx = x - r + 0.5, dy = y - r + 0.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r * (0.75 + rng() * 0.25)) continue; // borde irregular
    c.fillStyle = pal[rndi(0, pal.length - 1)];
    c.fillRect(x, y, 1, 1);
  }
  return s;
}
const asteroids = [];
{
  const ra = mulberry32(777001);
  for (let i = 0; i < 30; i++) {              // v2.0: 30 campos (mundo 24000, sistemas solares)
    let cx = 0, cy = 0, tries = 0;
    do {   // el centro del campo (±200 de dispersión) lejos de soles y planetas
      cx = ra() * WORLD.w; cy = ra() * WORLD.h;
      tries++;
    } while (tries < 40 && (
      suns.some(s => dist2(cx, cy, s.x, s.y) < (s.r + 1100) ** 2) ||
      planets.some(p => dist2(cx, cy, p.x, p.y) < (p.r + 500) ** 2)));
    for (let j = 0; j < 7; j++) {
      const r = 4 + ra() * 6;
      asteroids.push({
        x: clamp(cx + (ra() - 0.5) * 400, 30, WORLD.w - 30),
        y: clamp(cy + (ra() - 0.5) * 400, 30, WORLD.h - 30),
        r, hp: 2, alive: true, respawnT: 0,
        sprite: makeAsteroid(Math.ceil(r), ra),
      });
    }
  }
}
function asteroidsUpdate(dt) {
  for (const a of asteroids) {
    if (!a.alive) { a.respawnT -= dt; if (a.respawnT <= 0) { a.alive = true; a.hp = 2; } }
  }
}
function asteroidsDraw() {
  const z = cam.zoom;
  if (z < 0.45) return;   // en el mapa de estrategia no se dibujan
  const vL = cam.x - VW / 2 / z, vR = cam.x + VW / 2 / z;
  const vT = cam.y - VH / 2 / z, vB = cam.y + VH / 2 / z;
  for (const a of asteroids) {
    if (!a.alive) continue;
    if (a.x < vL - 20 || a.x > vR + 20 || a.y < vT - 20 || a.y > vB + 20) continue;
    ctx.drawImage(a.sprite, a.x - a.r, a.y - a.r);
  }
}

/* ---------- diplomacia ---------- */
const standings = {};
FACTION_COLORS.forEach(c => standings[c] = 0);
function changeStanding(color, delta) {
  if (color === player.color || !standings.hasOwnProperty(color)) return;
  const before = standings[color];
  standings[color] = clamp(before + delta, -100, 100);
  const after = standings[color];
  if (before > -30 && after <= -30) chatSys('🔥 ¡La facción ' + color + ' te ha declarado la GUERRA!');
  if (before <= -30 && after > -30) chatSys('🕊️ La facción ' + color + ' ha firmado la paz contigo.');
}
function relationLabel(v) {
  if (v <= -30) return ['GUERRA', '#ff6b8a'];
  if (v <= -10) return ['hostil', '#ff9f5a'];
  if (v < 20)   return ['neutral', '#8fa8d0'];
  return ['amistosa', '#8aff80'];
}

/* ---------- tienda ---------- */
const SHOP_ITEMS = [
  { key: 'motor',    name: 'Motor',     desc: '+15% velocidad',         base: 60 },
  { key: 'cadencia', name: 'Cadencia',  desc: '+25% cadencia de fuego', base: 60 },
  { key: 'blindaje', name: 'Blindaje',  desc: '+2 puntos de vida',      base: 80 },
  { key: 'deposito', name: 'Depósito',  desc: '+25 de combustible',     base: 40 },
];
const MAX_UPG = 5;
const upgCost = it => Math.floor(it.base * (player.upgrades[it.key] + 1) * 1.4);

/* ---------- v1.4: árbol de tecnología (nivel 2, excluyente por rama) ---------- */
const TECH_TREE = [
  { key: 'hipermotor', name: 'Hipermotor',       req: 'motor',    rival: 'crucero',    cost: 400, desc: 'Impulso ×3,2 y -25 % de consumo' },
  { key: 'crucero',    name: 'Motor crucero',    req: 'motor',    rival: 'hipermotor', cost: 400, desc: '+35 % de velocidad sin impulso' },
  { key: 'blaster',    name: 'Bláster pesado',   req: 'cadencia', rival: 'enjambre',   cost: 400, desc: 'Daño ×2, cadencia -25 %' },
  { key: 'enjambre',   name: 'Enjambre',         req: 'cadencia', rival: 'blaster',    cost: 400, desc: 'Cadencia de fuego +60 %' },
  { key: 'deflector',  name: 'Escudo deflector', req: 'blindaje', rival: 'casco',      cost: 400, desc: 'Bloquea 1 impacto cada 20 s' },
  { key: 'casco',      name: 'Casco reforzado',  req: 'blindaje', rival: 'deflector',  cost: 400, desc: '+8 HP' },
  { key: 'extractor',  name: 'Extractor',        req: 'deposito', rival: 'hangarplus', cost: 400, desc: 'Minería +1◈ y mineral +50 %' },
  { key: 'hangarplus', name: 'Hangar ampliado',  req: 'deposito', rival: 'extractor',  cost: 400, desc: '+10 flota máx. y +20 hangar' },
];
function techState(t) {
  if (player.tech[t.key]) return 'done';
  if (player.tech[t.rival]) return 'blocked';          // la rama rival ya fue elegida
  if (player.upgrades[t.req] < 3) return 'locked';     // requiere la mejora base a nv.3
  return 'open';
}
function buyTech(key) {
  const t = TECH_TREE.find(x => x.key === key);
  if (!t || techState(t) !== 'open') return;
  if (player.credits < t.cost) { chatSys('◈ Créditos insuficientes.'); return; }
  player.credits -= t.cost;
  player.tech[t.key] = true;
  applyUpgrades();
  chatSys('🔬 Tecnología investigada: ' + t.name + '.');
  saveGame();
  renderShop();
}
function applyUpgrades() {
  player.maxHp   = 12 + 2 * player.upgrades.blindaje;   // v1.1: HP alto
  player.maxFuel = 100 + 25 * player.upgrades.deposito;
  player.hp   = Math.min(player.hp, player.maxHp);
  player.fuel = Math.min(player.fuel, player.maxFuel);
}
function buyUpgrade(key) {
  const it = SHOP_ITEMS.find(i => i.key === key);
  if (!it || player.upgrades[key] >= MAX_UPG) return;
  const cost = upgCost(it);
  if (player.credits < cost) { chatSys('◈ Créditos insuficientes.'); return; }
  player.credits -= cost;
  player.upgrades[key]++;
  applyUpgrades();
  chatSys('🔧 Mejora instalada: ' + it.name + ' nv.' + player.upgrades[key]);
  saveGame();
  renderShop();
}

/* ---------- persistencia total (v0.6) ---------- */
// UN solo save/load coherente. Clave nueva: el save v1 queda obsoleto y se ignora.
const SAVE_KEY = 'pixelfleet_save_v2';
function readSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    // v0.8: los saves anteriores (240 pilotos, sin facciones imperio) no son compatibles
    // v1.0: tampoco los de otro tamaño de mundo (8000 → 12000 → 24000 en v2.0)
    if (d && (!d.factions || d.world !== WORLD.w)) { localStorage.removeItem(SAVE_KEY); return null; }
    return d;
  } catch (e) { return null; }
}
function saveGame() {
  if (!inGame || !playerCapital) return;   // nunca pisar el save desde el menú
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 2,
      world: WORLD.w,   // v1.0: si el mundo cambia de tamaño, el save queda inválido
      player: {
        name: player.name, color: player.color,
        x: player.x, y: player.y, angle: player.angle,
        hp: player.hp, fuel: player.fuel,
        credits: Math.floor(player.credits), kills: player.kills, deaths: player.deaths,
        upgrades: player.upgrades, ship: player.ship,
        tech: player.tech,   // v1.4
        hangarLvl: player.hangarLvl,   // v1.6
        auto: player.auto, role: player.role,   // v2.0: piloto automático
        ox: player.ox, oy: player.oy, oplanet: player.oplanet,
      },
      capitalIdx: planets.indexOf(playerCapital),
      prepT: Math.max(0, prepT),
      // solo planetas con dueño (los neutros son el estado inicial determinista)
      // v1.7: se guarda también el stock local de suministros de cada planeta
      planets: planets.map((p, i) => p.owner ? { i, owner: p.owner, shield: p.shield, cap: p.capital ? 1 : 0, known: p.knownOwner || null, stock: Math.round(p.stock * 100) / 100 } : null).filter(Boolean),
      fog: Array.from(explored).join(''),   // v0.9: mapa explorado (1600 celdas 0/1)
      bots: bots.filter(b => !b.pirate).map(b => ({   // v1.3: los piratas son del evento, no se guardan
        name: b.name, color: b.color, x: b.x, y: b.y,
        hp: b.hp, credits: Math.floor(b.credits), kills: b.kills || 0,
        homeIdx: planets.indexOf(b.home), expandR: b.expandR,
        alive: b.alive, built: !!b.built, imp: !!b.imp, role: b.role || null, shipType: b.shipType || null,
        ox: b.ox ?? null, oy: b.oy ?? null, oplanet: b.oplanet ?? null,   // v0.7: orden activa
      })),
      // v0.8: estado de las facciones imperio (economía, diplomacia, construcción)
      factions: (() => {
        const o = {};
        for (const c in facState) o[c] = {
          credits: Math.floor(facState[c].credits), rel: facState[c].rel, warT: facState[c].warT,
          buildT: facState[c].buildT, building: facState[c].building, dead: !!facState[c].dead,
          personality: facState[c].personality || null,   // v1.3
          hangarLvl: facState[c].hangarLvl || 0,   // v2.0
        };
        return o;
      })(),
      playerAggro,
      victory,   // v1.2
      hangarShips: hangarShips.slice(),
      buildQueue: buildQueue.map(q => ({ type: q.type, t: q.t, planet: q.planet })),   // v1.7: con su astillero
      standings,
      contracts: { offers: contracts.offers, active: contracts.active, seq: contracts.seq },
      story: { step: story.step, prog: story.prog, done: story.done, data: story.data },   // v2.1
    }));
  } catch (e) {}
}
function applySave(d) {
  // jugador
  player.name = d.player.name || player.name;
  player.color = d.player.color || player.color;
  player.x = d.player.x; player.y = d.player.y;
  player.angle = d.player.angle || 0;
  player.vx = player.vy = 0;
  player.credits = d.player.credits || 0;
  // v1.7: player.mineral ya no existe — el viejo valor se vuelca a la capital (abajo)
  player.kills = d.player.kills || 0;
  player.deaths = d.player.deaths || 0;
  Object.assign(player.upgrades, d.player.upgrades || {});
  player.tech = d.player.tech || {};   // v1.4
  // v1.6: nivel de hangar. Migración de saves viejos: nivel equivalente al
  // antiguo tope por planetas (2 + planetas propios ≈ 3 + 2·nivel).
  player.hangarLvl = d.player.hangarLvl ?? Math.max(0, Math.min(HANGAR_LVL_MAX,
    Math.ceil(((d.planets || []).filter(sp => sp.owner === player.color).length - 1) / 2)));
  player.ship = d.player.ship || 'caza';
  // v2.0: piloto automático restaurado (tu nave sigue ejecutando su orden)
  player.auto = !!d.player.auto; player.role = d.player.role || 'hold';
  player.ox = d.player.ox ?? null; player.oy = d.player.oy ?? null;
  player.oplanet = d.player.oplanet ?? null;
  // mundo: reset dinámico sobre el universo determinista
  for (const p of planets) {
    p.owner = null; p.shield = 0; p.shieldMax = 25;
    p.capture = 0; p.capturer = null; p.capital = false;
    p.stock = 0;   // v1.7
  }
  playerCapital = planets[d.capitalIdx] || null;
  if (playerCapital) {
    playerCapital.capital = true;
    playerCapital.shieldMax = 100;   // antes de aplicar escudos guardados
    playerCapital.name = 'CAPITAL ' + player.name;
  }
  // v0.8: esqueleto de facciones imperio (antes de restaurar capitales)
  for (const c of FACTION_COLORS) {
    if (c === player.color) continue;
    if (!facState[c]) facState[c] = { capital: null, credits: 10, rel: {}, warT: {}, aiT: rnd(2, 6), buildT: 0, building: false, hangarLvl: 0 };
    for (const o of FACTION_COLORS) if (o !== c && facState[c].rel[o] == null) facState[c].rel[o] = 0;
  }
  for (const sp of d.planets || []) {
    const p = planets[sp.i];
    if (!p) continue;
    p.owner = sp.owner; p.shield = sp.shield;
    p.knownOwner = sp.known ?? null;   // v0.9: último dueño conocido
    // v1.7: stock local. Migración de saves viejos (sin stock): 0, salvo las
    // capitales, que arrancan con 30⛏ (regla «capital minera»)
    p.stock = sp.stock != null ? Math.min(STOCK_CAP, sp.stock) : (sp.cap ? CAP_START_STOCK : 0);
    // v0.8: restaurar capitales de facción (escudo grande + nombre + enlace en facState)
    if (sp.cap && sp.owner !== player.color) {
      p.capital = true; p.shieldMax = 100; p.name = 'CAPITAL ' + facName(sp.owner);
      if (facState[sp.owner]) facState[sp.owner].capital = p;
    }
  }
  // v0.9: mapa explorado
  explored.fill(0); visibleNow.fill(0); fogT = 0;
  if (d.fog && d.fog.length === explored.length)
    for (let i = 0; i < explored.length; i++) explored[i] = d.fog[i] === '1' ? 1 : 0;
  // v0.8: capital de respaldo y datos guardados de cada facción
  for (const c of FACTION_COLORS) {
    if (c === player.color || !facState[c]) continue;
    if (!facState[c].capital) facState[c].capital = planets.find(p => p.owner === c && p.capital) || planets.find(p => p.owner === c) || null;
  }
  // v1.7: regla «capital minera» — la res es determinista y no se guarda, así que
  // toda capital (tuya y de la IA) se fuerza a mineral tras cargar la partida
  for (const p of planets) if (p.capital && p.owner) p.res = 'mineral';
  // v1.7: migración — el viejo player.mineral global (saves ≤ v1.6) se vuelca al
  // stock de tu capital (tope 100)
  if (d.player.mineral != null && playerCapital)
    playerCapital.stock = Math.min(STOCK_CAP, playerCapital.stock + Math.max(0, d.player.mineral));
  if (d.factions) for (const c in d.factions) {
    if (!facState[c]) continue;
    const sv = d.factions[c];
    facState[c].credits = sv.credits || 0;
    facState[c].buildT = sv.buildT || 0; facState[c].building = !!sv.building;
    facState[c].dead = !!sv.dead;   // v1.2
    facState[c].personality = sv.personality || PERS_KEYS[rndi(0, PERS_KEYS.length - 1)];   // v1.3
    facState[c].hangarLvl = sv.hangarLvl || 0;   // v2.0
    if (sv.rel) facState[c].rel = sv.rel;
    if (sv.warT) facState[c].warT = sv.warT;
  }
  victory = !!d.victory;   // v1.2
  for (const k in playerAggro) delete playerAggro[k];
  if (d.playerAggro) Object.assign(playerAggro, d.playerAggro);
  // bots (incluye wingmen del jugador: built/role/shipType, e imperiales: imp)
  bots.length = 0;
  for (const sb of d.bots || []) {
    const b = {
      name: sb.name, color: sb.color,
      x: clamp(sb.x, 20, WORLD.w - 20), y: clamp(sb.y, 20, WORLD.h - 20),
      angle: rnd(0, TAU), speed: rnd(9, 20), waypoint: null,   // v1.0
      hp: sb.hp, alive: sb.alive !== false, respawnT: 0,
      shootCd: rnd(0.5, 2), credits: sb.credits || 0, kills: sb.kills || 0,
      vx: 0, vy: 0, flash: 0,
      home: planets[sb.homeIdx] || planets[0], expandR: sb.expandR || 1500,
      imp: !!sb.imp, task: null, retalT: 0, lastHitBy: null,   // v0.8
    };
    if (b.alive === false) b.respawnT = rnd(3, 6);
    if (sb.built) {
      b.built = true; b.role = sb.role || 'defend'; b.shipType = sb.shipType || 'caza';
      b.speed = 42; b.home = playerCapital || b.home; b.uid = ++wingUid;
      b.maxHp = 10 + ((SHIPS.find(s => s.id === b.shipType) || SHIPS[0]).hp);   // v1.1
      b.ox = sb.ox ?? null; b.oy = sb.oy ?? null; b.oplanet = sb.oplanet ?? null;   // v0.7
    }
    bots.push(b);
  }
  // flota y cola de construcción
  hangarShips.length = 0;
  for (const t of d.hangarShips || []) hangarShips.push(t);
  buildQueue.length = 0;
  // v1.7: la cola guarda su astillero; entradas de saves viejos sin planet → la capital
  const capIdx = planets.indexOf(playerCapital);
  for (const q of d.buildQueue || []) buildQueue.push({ type: q.type, t: q.t, planet: q.planet ?? capIdx });
  shipyardIdx = null;
  // diplomacia y contratos
  if (d.standings) Object.assign(standings, d.standings);
  if (d.contracts) {
    contracts.offers = d.contracts.offers || [];
    contracts.active = d.contracts.active || [];
    contracts.seq = d.contracts.seq || 1;
  }
  // v2.1: historia. Migración: saves sin `story` no se invalidan — si la
  // preparación ya acabó, la historia arranca en el capítulo 1.
  if (d.story) {
    story.step = d.story.step ?? -1; story.prog = d.story.prog || 0;
    story.done = !!d.story.done; story.data = d.story.data || {};
    storyResume();   // los piratas/gusanos del capítulo son transitorios: se respawnean
  } else if ((d.prepT || 0) > 0) resetStory();
  else storyActivate(0);
  prepT = d.prepT || 0;
  // stats derivadas y posición (si murió justo al guardar, reaparece en capital)
  applyUpgrades();
  if (d.player.hp > 0) {
    player.hp = Math.min(d.player.hp, player.maxHp);
    player.fuel = Math.min(d.player.fuel, player.maxFuel);
  } else {
    player.hp = player.maxHp; player.fuel = player.maxFuel;
    if (playerCapital) {
      player.x = clamp(playerCapital.x + rnd(-150, 150), 16, WORLD.w - 16);
      player.y = clamp(playerCapital.y + rnd(-150, 150), 16, WORLD.h - 16);
    }
  }
  player.alive = true; player.invuln = 2; player.respawnT = 0;
  cam.x = player.x; cam.y = player.y;
  const inp = document.getElementById('input-name');
  if (inp) inp.value = player.name;
}
addEventListener('beforeunload', saveGame);

/* ---------- paneles in-game ---------- */
const shopEl = document.getElementById('shop');
const diploEl = document.getElementById('diplo');
const empireEl = document.getElementById('empire');        // v0.9 (panel de imperio, TAB)
const empireBody = document.getElementById('empire-body');
let saveAcc = 0;
function renderShop() {
  document.getElementById('shop-credits').textContent = Math.floor(player.credits);
  document.getElementById('shop-items').innerHTML = SHOP_ITEMS.map(it => {
    const lvl = player.upgrades[it.key];
    const maxed = lvl >= MAX_UPG;
    const cost = upgCost(it);
    return `<div class="shop-item${maxed ? ' maxed' : ''}">
      <div class="info"><b>${it.name}</b><span>${it.desc}</span></div>
      <span class="pips">${'●'.repeat(lvl)}${'○'.repeat(MAX_UPG - lvl)}</span>
      <button data-key="${it.key}" ${maxed || player.credits < cost ? 'disabled' : ''}>${maxed ? 'MAX' : cost + '◈'}</button>
    </div>`;
  }).join('');
  shopEl.querySelectorAll('button[data-key]').forEach(b => b.onclick = () => buyUpgrade(b.dataset.key));
  // v1.4: árbol de tecnología (nivel 2, excluyente por rama)
  document.getElementById('shop-tech').innerHTML = TECH_TREE.map(t => {
    const st = techState(t);
    const note = st === 'done' ? '✔ investigada'
      : st === 'blocked' ? '✖ rama rival'
      : st === 'locked' ? 'req. ' + t.req + ' nv.3'
      : t.cost + '◈';
    return `<div class="shop-item${st !== 'open' ? ' maxed' : ''}">
      <div class="info"><b>${t.name}</b><span>${t.desc}</span></div>
      <button data-tech="${t.key}" ${st !== 'open' || player.credits < t.cost ? 'disabled' : ''}>${note}</button>
    </div>`;
  }).join('');
  shopEl.querySelectorAll('button[data-tech]').forEach(b => b.onclick = () => buyTech(b.dataset.tech));
}
function renderDiplo() {
  document.getElementById('diplo-list').innerHTML = FACTION_COLORS
    .filter(c => c !== player.color)
    .map(c => {
      const v = standings[c];
      const [label, col] = relationLabel(v);
      const persLabel = facState[c] && facState[c].personality ? ' · ' + persOf(c).label : '';
      return `<div class="diplo-row">
        <div class="dot" style="background:${c}"></div>
        <div class="name">${c}${persLabel}<span class="rel-status">${Math.round(v)} · ${label}</span></div>
        <span class="rel" style="color:${col}">${label}</span>
        <button data-c="${c}" data-act="tribute">100◈ tributo</button>
        <button class="war" data-c="${c}" data-act="war">guerra</button>
      </div>`;
    }).join('');
  diploEl.querySelectorAll('button').forEach(b => b.onclick = () => {
    const c = b.dataset.c;
    if (b.dataset.act === 'tribute') {
      if (player.credits < 100) { chatSys('◈ No tienes 100◈ para el tributo.'); return; }
      player.credits -= 100; changeStanding(c, +40);
      chatSys('🤝 Has enviado un tributo a la facción ' + c + '.');
    } else changeStanding(c, -80);
    saveGame();
    renderDiplo();
  });
}
addEventListener('keydown', e => {
  if (document.activeElement === chatInput) return;
  const k = e.key.toLowerCase();
  if (k === 'b') { toggleGamePanel('shop'); }
  if (k === 'f') { toggleGamePanel('diplo'); }
  if (k === 'escape') closeAllPanels();
});

/* ---------- enganche al motor (wrappers) ---------- */
const _update = update;
update = function (dt) {
  asteroidsUpdate(dt);
  // deriva diplomática: las relaciones hostiles se suavizan lentamente hacia la paz,
  // pero una GUERRA declarada (≤ -30) ya no se desvanece sola: hay que pagar tributo (v1.2)
  for (const c of FACTION_COLORS) {
    if (c !== player.color && standings[c] < 0 && standings[c] > -30) standings[c] = Math.min(0, standings[c] + 0.25 * dt);
    else if (c !== player.color && standings[c] <= -30) standings[c] = Math.min(-30, standings[c] + 0.02 * dt);
  }
  saveAcc += dt;
  if (saveAcc > 15) { saveAcc = 0; saveGame(); }
  _update(dt);
  // v0.5.3: NO re-renderizar los paneles cada frame (rompía los clics al
  // recrear los botones entre mousedown y mouseup). Solo se actualizan
  // créditos y estados de botones, sin tocar innerHTML.
  if (!shopEl.classList.contains('hidden')) {
    document.getElementById('shop-credits').textContent = Math.floor(player.credits);
    shopEl.querySelectorAll('button[data-key]').forEach(b => {
      const it = SHOP_ITEMS.find(i => i.key === b.dataset.key);
      const lvl = player.upgrades[it.key];
      b.disabled = lvl >= MAX_UPG || player.credits < upgCost(it);
      b.textContent = lvl >= MAX_UPG ? 'MAX' : upgCost(it) + '◈';
    });
    shopEl.querySelectorAll('button[data-tech]').forEach(b => {   // v1.4
      const t = TECH_TREE.find(x => x.key === b.dataset.tech);
      b.disabled = techState(t) !== 'open' || player.credits < t.cost;
    });
  }
};
const _draw = draw;
draw = function () { _draw(); asteroidsDraw(); };
// v0.9: la niebla se pinta lo último en coords de mundo (tapa lo no explorado)
const _draw9 = draw;
draw = function () { _draw9(); eventsDraw(); fogDraw(); };   // v1.3: eventos bajo la niebla
const _mm = drawMinimap;
drawMinimap = function () {
  _mm();
  mctx.fillStyle = '#a0aec0';
  for (const a of asteroids) if (a.alive) mctx.fillRect(a.x * (150 / WORLD.w), a.y * (150 / WORLD.h), 1, 1);
};
const _back = backToMenu;
backToMenu = function () { saveGame(); _back(); };

/* =========================================================
   SISTEMAS v0.4 — hangar, contratos, escudos, salas/torneo
   ========================================================= */

/* ---------- hangar v0.6: catálogo de CONSTRUCCIÓN ---------- */
// Las naves ya no son "skins" instantáneos: se construyen en la capital,
// van al hangar y tú decides su rol (SEGUIRME / DEFENDER / PILOTAR).
// v1.7: cada nave paga ◈ + un RECURSO (resType/resCost) que se descuenta de los
// stocks de tus planetas de ese tipo (takeStock: del más lleno al más vacío)
const SHIPS = [   // v1.1: HP alto (10-20 impactos) — el mod de hp se escala ×3
  { id: 'caza',       name: 'Caza',       desc: 'Equilibrado',                  cost: 60,  resType: 'mineral', resCost: 15, buildTime: 15, accel: 1.0,  rof: 1.0,  hp: 0,  fuel: 1.0, size: 1.0 },
  { id: 'avispa',     name: 'Avispa',     desc: 'Muy rápida, frágil',           cost: 150, resType: 'gas',    resCost: 20, buildTime: 25, accel: 1.35, rof: 0.85, hp: -3, fuel: 1.0, size: 0.9 },
  { id: 'acorazado',  name: 'Acorazado',  desc: 'Lento, +9 blindaje',           cost: 300, resType: 'mineral', resCost: 45, buildTime: 40, accel: 0.8,  rof: 1.3,  hp: 9,  fuel: 1.0, size: 1.2 },
  { id: 'explorador', name: 'Explorador', desc: 'Depósito de combustible ×1.6', cost: 200, resType: 'gas',    resCost: 25, buildTime: 30, accel: 1.05, rof: 1.0,  hp: 0,  fuel: 1.6, size: 1.0 },
];
const shipDef = id => SHIPS.find(s => s.id === id) || SHIPS[0];
function getShipMod() { return shipDef(player.ship); }

// aplicar modificadores del modelo sobre las mejoras
const _applyUpg = applyUpgrades;
applyUpgrades = function () {
  _applyUpg();
  const m = getShipMod();
  player.maxHp   = 12 + 2 * player.upgrades.blindaje + m.hp + (player.tech.casco ? 8 : 0);   // v1.1/v1.4
  player.maxFuel = (100 + 25 * player.upgrades.deposito) * m.fuel;
  player.hp   = Math.min(player.hp, player.maxHp);
  player.fuel = Math.min(player.fuel, player.maxFuel);
};

/* ---------- contratos ---------- */
const contracts = { offers: [], active: [], timer: 0, seq: 1 };
function makeOffer() {
  const types = ['caza', 'mineria', 'conquista'];
  const type = types[rndi(0, 2)];
  const id = contracts.seq++;
  if (type === 'caza') {
    const any = Math.random() < 0.5;
    const others = FACTION_COLORS.filter(c => c !== player.color);
    const fc = others[rndi(0, others.length - 1)];
    const n = rndi(3, 5);
    return { id, type, faction: any ? null : fc, target: n, progress: 0, reward: 30 * n,
      title: 'Caza' + (any ? '' : ' ' + fc),
      desc: any ? 'Destruye ' + n + ' naves enemigas' : 'Destruye ' + n + ' naves ' + fc };
  }
  if (type === 'mineria') {
    const n = rndi(5, 8);
    return { id, type, target: n, progress: 0, reward: 8 * n, title: 'Minería', desc: 'Destruye ' + n + ' asteroides' };
  }
  const n = rndi(2, 3);
  return { id, type, target: n, progress: 0, reward: 60 * n, title: 'Conquista', desc: 'Conquista ' + n + ' planetas' };
}
for (let i = 0; i < 3; i++) contracts.offers.push(makeOffer());

function acceptContract(id) {
  if (contracts.active.length >= 2) { chatSys('📋 Máximo 2 contratos activos.'); return; }
  const i = contracts.offers.findIndex(o => o.id === id);
  if (i < 0) return;
  contracts.active.push(contracts.offers.splice(i, 1)[0]);
  chatSys('📋 Contrato aceptado: ' + contracts.active[contracts.active.length - 1].title);
}
function completeContract(c) {
  player.credits += c.reward;
  chatSys('✅ Contrato completado: ' + c.title + ' (+' + c.reward + '◈)');
  saveGame();
}
// hooks llamados desde el núcleo
function onPlayerKill(victim) {
  if (net.room) {
    roomKills++;
    const t = document.getElementById('tourney');
    if (roomKills >= TOURNEY_GOAL) {
      chatSys('🏆 ¡GANAS EL TORNEO de la sala ' + net.room + ' con ' + TOURNEY_GOAL + ' bajas!');
      roomKills = 0;
    }
    if (t && net.room) t.innerHTML = '🏟️ TORNEO · sala ' + net.room + ' · ' + roomKills + '/' + TOURNEY_GOAL + ' bajas<small>primero en ' + TOURNEY_GOAL + ' bajas gana</small>';
  }
  for (const c of contracts.active) {
    if (c.type === 'caza' && (!c.faction || c.faction === victim.color)) c.progress++;
  }
}
function onAsteroidMined() {
  for (const c of contracts.active) if (c.type === 'mineria') c.progress++;
}
function onPlanetCaptured() {
  for (const c of contracts.active) if (c.type === 'conquista') c.progress++;
}
function contractsUpdate(dt) {
  contracts.timer += dt;
  if (contracts.timer > 45 && contracts.offers.length < 3) {
    contracts.timer = 0;
    contracts.offers.push(makeOffer());
  }
  for (let i = contracts.active.length - 1; i >= 0; i--) {
    if (contracts.active[i].progress >= contracts.active[i].target) {
      completeContract(contracts.active[i]);
      contracts.active.splice(i, 1);
    }
  }
}

/* ---------- torneo en salas ---------- */
let roomKills = 0;
const TOURNEY_GOAL = 10;

/* ---------- paneles ---------- */
const contractsEl = document.getElementById('contracts');
const missionsEl = document.getElementById('missions');   // v2.1 (junto a los demás …El: regla TDZ v0.9)
const hangarEl = document.getElementById('hangar');
function renderContracts() {
  document.getElementById('contract-active').innerHTML = contracts.active.length
    ? contracts.active.map(c => `<div class="contract active"><div class="ctitle">▶ ${c.title}</div>
        <div class="cdesc">${c.desc}</div><div class="cprog">${Math.min(c.progress, c.target)}/${c.target} · ${c.reward}◈</div></div>`).join('')
    : '<div style="color:#44557a;font-size:11px">Sin contratos activos (máx. 2)</div>';
  document.getElementById('contract-offers').innerHTML = contracts.offers.map(c =>
    `<div class="contract"><div class="ctitle">${c.title}</div><div class="cdesc">${c.desc}</div>
     <div class="cprog">${c.reward}◈</div><button data-id="${c.id}">ACEPTAR</button></div>`).join('');
  contractsEl.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => { acceptContract(+b.dataset.id); renderContracts(); });
}
function roleLabel(b) {
  switch (b.role) {
    case 'follow':   return 'siguiéndote';
    case 'garrison': return 'en guarnición (capital)';
    case 'move':     return 'en ruta';
    case 'hold':     return 'manteniendo posición';
    case 'attack':   return 'atacando una zona';
    case 'defendP':  { const p = planets[b.oplanet]; return 'defendiendo ' + (p ? p.name : 'un planeta'); }
    default:         return 'defendiendo la capital';
  }
}
function renderHangar() {
  // v0.6: innerHTML SOLO al abrir el panel o tras una acción (regla v0.5.3b).
  // Por frame se actualiza con refreshHangar() (textContent/disabled únicamente).
  $('hangar-current').textContent = shipDef(player.ship).name;
  // v1.7: selector de astillero — cualquier planeta propio construye (★ capital por defecto)
  const own = planets.map((p, i) => [p, i]).filter(([p]) => p.owner === player.color);
  if (shipyardIdx == null || !planets[shipyardIdx] || planets[shipyardIdx].owner !== player.color)
    shipyardIdx = playerCapital ? planets.indexOf(playerCapital) : (own.length ? own[0][1] : null);
  const yardSel = $('hangar-yard');
  yardSel.innerHTML = own.map(([p, i]) =>
    `<option value="${i}"${i === shipyardIdx ? ' selected' : ''}>${p === playerCapital ? '★ ' : ''}${p.name} ${RES_ICON[p.res]}</option>`).join('');
  yardSel.onchange = () => { shipyardIdx = +yardSel.value; renderHangar(); };
  // v1.7: cada nave cuesta ◈ + un recurso del stock de tus planetas
  $('hangar-build').innerHTML = SHIPS.map(s =>
    `<div class="hangar-item"><div class="info"><b>${s.name}</b><span>${s.desc} · ${s.buildTime}s</span></div>
     <button data-build="${s.id}">${s.cost}◈ + ${s.resCost}${RES_ICON[s.resType]}</button></div>`).join('');
  // v1.7: cola de construcción agrupada por planeta astillero (las cuentas
  // atrás viven en spans data-qt para actualizar solo texto por frame)
  const groups = {};
  buildQueue.forEach((q, i) => { (groups[q.planet] = groups[q.planet] || []).push(i); });
  $('hangar-queue').innerHTML = Object.keys(groups).map(pi => {
    const p = planets[pi];
    return `<div class="hangar-queue-row">🏗️ ${p && p.capital ? '★ ' : ''}${p ? p.name : '?'}: ` +
      groups[pi].map(i => `<span data-qt="${i}">${shipDef(buildQueue[i].type).name} ${Math.ceil(buildQueue[i].t)}s</span>`).join(' · ') +
      `</div>`;
  }).join('');
  const fleet = bots.filter(b => b.built);
  $('hangar-fleet').innerHTML = fleet.length ? fleet.map(b =>
    `<div class="hangar-item"><div class="info"><b>${b.name}</b><span>${shipDef(b.shipType).name} · <span data-hp="${b.uid}">${Math.ceil(b.hp)}</span> HP · ${roleLabel(b)}</span></div>
     <div class="acts">
       <button data-fact="follow" data-uid="${b.uid}" ${b.role === 'follow' ? 'disabled' : ''}>📡 SEGUIR</button>
       <button data-fact="defend" data-uid="${b.uid}" ${b.role === 'defend' ? 'disabled' : ''}>🛡️ DEFENDER</button>
       <button data-fact="recall" data-uid="${b.uid}">📥 RECOGER</button>
     </div></div>`).join('')
    : '<div class="hangar-empty">Sin naves desplegadas</div>';
  $('hangar-store').innerHTML = hangarShips.length ? hangarShips.map((t, i) =>
    `<div class="hangar-item"><div class="info"><b>${shipDef(t).name}</b><span>${shipDef(t).desc}</span></div>
     <div class="acts">
       <button data-hact="follow" data-hi="${i}">🚀 SEGUIRME</button>
       <button data-hact="garrison" data-hi="${i}">🏰 GUARNICIÓN</button>
       <button data-hact="defend" data-hi="${i}">🛡️ DEFENDER</button>
       <button data-hact="pilot" data-hi="${i}">🧑‍🚀 PILOTAR</button>
     </div></div>`).join('')
    : '<div class="hangar-empty">Hangar vacío: construye naves arriba</div>';
  hangarEl.querySelectorAll('button[data-build]').forEach(btn => btn.onclick = () => { queueShip(btn.dataset.build, shipyardIdx); renderHangar(); });
  hangarEl.querySelectorAll('button[data-fact]').forEach(btn => btn.onclick = () => {
    const uid = +btn.dataset.uid;
    if (btn.dataset.fact === 'recall') recallShip(uid); else setWingRole(uid, btn.dataset.fact);
    renderHangar();
  });
  hangarEl.querySelectorAll('button[data-hact]').forEach(btn => btn.onclick = () => {
    const i = +btn.dataset.hi;
    if (btn.dataset.hact === 'pilot') pilotShip(i); else deployShip(i, btn.dataset.hact);
    renderHangar();
  });
  $('hangar-upg').onclick = () => upgradeHangar();   // v1.6 (upgradeHangar ya re-renderiza)
  refreshHangar();
}
// actualiza SOLO textos y estados disabled (los clics nunca se pierden)
function refreshHangar() {
  if (hangarEl.classList.contains('hidden')) return;
  $('hangar-credits').textContent = Math.floor(player.credits);
  $('hangar-current').textContent = shipDef(player.ship).name;
  const q = buildQueue.length
    ? ' · 🏗️ ' + shipDef(buildQueue[0].type).name + ' ' + Math.ceil(buildQueue[0].t) + 's' +
      (buildQueue.length > 1 ? ' (+' + (buildQueue.length - 1) + ' en cola)' : '')
    : '';
  $('hangar-qstat').textContent = q;
  $('hangar-fstat').textContent = fleetCount() + '/' + fleetMax();
  $('hangar-hstat').textContent = hangarShips.length + '/' + hangarMax();
  // v1.6: nivel de hangar y botón de ampliación (solo texto/disabled por frame)
  $('hangar-lvl').textContent = (player.hangarLvl + 1) + '/' + (HANGAR_LVL_MAX + 1);
  const upgBtn = $('hangar-upg');
  if (player.hangarLvl >= HANGAR_LVL_MAX) { upgBtn.textContent = 'MÁXIMO'; upgBtn.disabled = true; }
  else { upgBtn.textContent = 'AMPLIAR (' + hangarUpgCost() + '◈)'; upgBtn.disabled = player.credits < hangarUpgCost(); }
  // v1.5.2: construir y desplegar funcionan DESDE CUALQUIER LUGAR (órdenes por
  // radio); solo PILOTAR sigue requiriendo atracar en la capital
  $('hangar-where').textContent = nearCapital() ? '' : ' · ⚠ PILOTAR solo junto a tu capital';
  const near = nearCapital();
  // v1.7: construir exige ◈ Y el recurso de la nave (del stock de tus planetas);
  // el botón se bloquea si falta cualquiera y el title explica qué falta
  const yard = shipyard();
  const yardFull = yard ? buildQueue.filter(qi => qi.planet === planets.indexOf(yard)).length >= QUEUE_PER_PLANET : false;
  hangarEl.querySelectorAll('button[data-build]').forEach(btn => {
    const s = shipDef(btn.dataset.build);
    const noCred = player.credits < s.cost;
    const noRes = stockOf(player.color, s.resType) < s.resCost;
    const full = hangarShips.length + buildQueue.length >= hangarMax();
    btn.disabled = noCred || noRes || full || yardFull;
    btn.title = noCred ? 'Te faltan ◈: cuesta ' + s.cost + '◈'
      : noRes ? 'Te falta ' + RES_ICON[s.resType] + ': cuesta ' + s.resCost + ' y tienes ' + Math.floor(stockOf(player.color, s.resType))
      : yardFull ? 'Astillero saturado (máx. ' + QUEUE_PER_PLANET + ' en cola en este planeta)'
      : full ? 'Hangar lleno' : '';
  });
  // v1.7: cuentas atrás de la cola agrupada por planeta (solo texto por frame)
  hangarEl.querySelectorAll('span[data-qt]').forEach(sp => {
    const qi = buildQueue[+sp.dataset.qt];
    if (qi) sp.textContent = shipDef(qi.type).name + ' ' + Math.ceil(qi.t) + 's';
  });
  hangarEl.querySelectorAll('button[data-hact]').forEach(btn => {
    btn.disabled = btn.dataset.hact === 'pilot' ? !near : fleetCount() >= fleetMax();
  });
  hangarEl.querySelectorAll('span[data-hp]').forEach(sp => {
    const b = bots.find(o => o.uid === +sp.dataset.hp);
    if (b) sp.textContent = Math.max(0, Math.ceil(b.hp));
  });
}
addEventListener('keydown', e => {
  if (document.activeElement === chatInput) return;
  const k = e.key.toLowerCase();
  if (k === 'c') { toggleGamePanel('contracts'); }
  if (k === 'h') { toggleGamePanel('hangar'); }
  if (k === 'tab') { e.preventDefault(); toggleGamePanel('empire'); }   // v0.9
  if (k === 'escape') closeAllPanels();
});

/* ---------- sala privada: leer código en el menú ---------- */
document.getElementById('btn-play').addEventListener('click', () => {
  const r = (document.getElementById('input-room').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  net.room = r;
  const t = document.getElementById('tourney');
  if (r) {
    roomKills = 0;
    t.classList.remove('hidden');
    t.innerHTML = '🏟️ TORNEO · sala ' + r + ' · 0/' + TOURNEY_GOAL + ' bajas<small>primero en ' + TOURNEY_GOAL + ' bajas gana</small>';
    chatSys('🔑 Sala privada: ' + r + ' (comparte el código con tus amigos)');
  } else t.classList.add('hidden');
});

/* ---------- enganche al motor ---------- */
const _update4 = update;
update = function (dt) { contractsUpdate(dt); _update4(dt); };

/* =========================================================
   v0.4.1 — SOPORTE MÓVIL (táctil)
   Mitad izquierda: joystick virtual para moverse.
   Mitad derecha: tocar = apuntar, mantener = disparar.
   ========================================================= */
const touch = { moveId: null, mx0: 0, my0: 0, dx: 0, dy: 0, aimId: null };
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth / 2 && touch.moveId === null) {
      touch.moveId = t.identifier;
      touch.mx0 = t.clientX; touch.my0 = t.clientY;
      touch.dx = touch.dy = 0;
    } else if (touch.aimId === null) {
      touch.aimId = t.identifier;
      mouse.x = t.clientX; mouse.y = t.clientY;
      mouse.down = true;
    }
  }
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) {
      touch.dx = t.clientX - touch.mx0;
      touch.dy = t.clientY - touch.my0;
      // límite del joystick (radio 60 px)
      const d = Math.hypot(touch.dx, touch.dy);
      if (d > 60) { touch.dx = touch.dx / d * 60; touch.dy = touch.dy / d * 60; }
    } else if (t.identifier === touch.aimId) {
      mouse.x = t.clientX; mouse.y = t.clientY;
    }
  }
}, { passive: false });
function touchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) { touch.moveId = null; touch.dx = touch.dy = 0; }
    if (t.identifier === touch.aimId)  { touch.aimId = null; mouse.down = false; }
  }
}
canvas.addEventListener('touchend', touchEnd, { passive: false });
canvas.addEventListener('touchcancel', touchEnd, { passive: false });

// traducir el joystick a las teclas WASD que ya entiende el motor
const _updateMobile = update;
update = function (dt) {
  if (touch.moveId !== null) {
    keys['w'] = touch.dy < -15; keys['s'] = touch.dy > 15;
    keys['a'] = touch.dx < -15; keys['d'] = touch.dx > 15;
  }
  _updateMobile(dt);
  drawJoystick();
};
// dibujar el joystick virtual
function drawJoystick() {
  if (touch.moveId === null) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);   // el joystick se dibuja en coords de pantalla
  const cx = VW / 2, cy = VH / 2;
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#7ef9ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(touch.mx0 / 2, touch.my0 / 2, 30, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#7ef9ff';
  ctx.beginPath(); ctx.arc(touch.mx0 / 2 + touch.dx / 2, touch.my0 / 2 + touch.dy / 2, 12, 0, TAU); ctx.fill();
  ctx.restore();
  void cx; void cy;
}

/* =========================================================
   v0.6 — FLOTA REAL CONSTRUIBLE
   Las naves se construyen en la capital (cola con cuenta
   atrás), van al HANGAR y desde ahí se despliegan
   con un rol: SEGUIRME / DEFENDER CAPITAL. La flota activa y el
   almacén los limita el NIVEL DE HANGAR (v1.6: se amplía con ◈,
   ya no por planetas conquistados). RECOGER las devuelve
   al hangar. PILOTAR te cambia
   a esa nave. Si caen, se pierden de verdad (built/gone).
   ========================================================= */
// v2.0: hangar masivo — 60 niveles, +5 flota y +5 almacén por nivel
const HANGAR_MAX = 10;       // almacén base (hangar nv.1)
const HANGAR_LVL_MAX = 59;   // ampliaciones comprables (nv.60 = máximo)
const hangarUpgCost = () => 50 * (player.hangarLvl + 1);   // 50/100/150… 3000◈
function hangarMax() { return HANGAR_MAX + 5 * player.hangarLvl + (player.tech.hangarplus ? 20 : 0); }   // v1.4/v1.6/v2.0
// v1.6: la flota activa la limita el nivel de hangar (se compra con ◈), no los planetas
function fleetMax() { return 5 + 5 * player.hangarLvl + (player.tech.hangarplus ? 10 : 0); }
function upgradeHangar() {
  if (player.hangarLvl >= HANGAR_LVL_MAX) return;
  const cost = hangarUpgCost();
  if (player.credits < cost) { chatSys('◈ Necesitas ' + cost + '◈ para ampliar el hangar.'); return; }
  player.credits -= cost;
  player.hangarLvl++;
  chatSys('🏗️ Hangar ampliado a nv.' + (player.hangarLvl + 1) + ': flota ' + fleetMax() + ' · almacén ' + hangarMax() + '.');
  saveGame();
  renderHangar();
}
let hangarShips = [];      // ids de SHIPS guardados en la capital
// v1.7: la cola es POR PLANETA — {type, t, planet} (índice del astillero).
// Cada planeta propio procesa el primer ítem de su cola en paralelo.
const buildQueue = [];
const QUEUE_PER_PLANET = 3;   // máximo de ítems encolados por astillero
let shipyardIdx = null;       // astillero elegido en el hangar (null → la capital)
function shipyard() {         // planeta astillero actual (si lo pierdes, vuelve la capital)
  const p = shipyardIdx != null ? planets[shipyardIdx] : null;
  return (p && p.owner === player.color) ? p : playerCapital;
}
let wingUid = 0;
function nearCapital() {
  return playerCapital && player.alive &&
    dist2(player.x, player.y, playerCapital.x, playerCapital.y) < (playerCapital.r + 300) ** 2;
}
function fleetCount() { return frameFleetCount; }   // v2.0: cache por frame (antes: filter O(n) por llamada)
function queueShip(type, planetIdx) {
  const s = shipDef(type);
  // v1.7: el astillero es un planeta PROPIO cualquiera (por defecto, la capital)
  const yard = (planetIdx != null && planets[planetIdx] && planets[planetIdx].owner === player.color)
    ? planets[planetIdx] : playerCapital;
  if (!yard) return;
  // v1.5.2: las órdenes llegan por radio — ya no hace falta estar junto a la capital
  if (hangarShips.length + buildQueue.length >= hangarMax()) { chatSys('🏗️ Hangar lleno (' + hangarMax() + ' naves).'); return; }
  if (buildQueue.filter(q => q.planet === planets.indexOf(yard)).length >= QUEUE_PER_PLANET) {
    notify('🏗️ Astillero de ' + yard.name + ' saturado (máx. ' + QUEUE_PER_PLANET + ' en cola)', 'warn');
    chatSys('🏗️ El astillero de ' + yard.name + ' ya tiene ' + QUEUE_PER_PLANET + ' naves en cola.');
    return;
  }
  if (player.credits < s.cost) { chatSys('◈ Necesitas ' + s.cost + '◈ para construir un ' + s.name + '.'); return; }
  if (!takeStock(player.color, s.resType, s.resCost)) {   // v1.7: el recurso sale de los stocks de tus planetas
    notify('Sin ' + RES_ICON[s.resType] + ' suficiente: un ' + s.name + ' cuesta ' + s.cost + '◈ + ' + s.resCost + RES_ICON[s.resType], 'warn');
    chatSys(RES_ICON[s.resType] + ' Necesitas ' + s.resCost + ' de ' + s.resType + ' en tus planetas para un ' + s.name +
            ' (tienes ' + Math.floor(stockOf(player.color, s.resType)) + ').');
    return;
  }
  player.credits -= s.cost;
  buildQueue.push({ type, t: s.buildTime, planet: planets.indexOf(yard) });
  chatSys('🏗️ Orden por radio: construyendo ' + s.name + ' en ' + yard.name + ' (' + s.buildTime + 's)…');
  saveGame();
}
function buildUpdate(dt) {
  if (!buildQueue.length) return;
  // v1.7: si el planeta astillero se pierde, su cola se CANCELA (sin reembolso) —
  // coherente con «la construcción muere con la capital» (v1.2)
  let cancelled = false;
  for (let i = buildQueue.length - 1; i >= 0; i--) {
    const p = planets[buildQueue[i].planet];
    if (p && p.owner === player.color) continue;
    chatSys('🏗️ Construcción de ' + shipDef(buildQueue[i].type).name + ' CANCELADA: ' + (p ? p.name : 'el astillero') + ' ya no es tuyo.');
    buildQueue.splice(i, 1);
    cancelled = true;
  }
  if (cancelled) notify('🏗️ Cola de construcción cancelada: astillero perdido', 'danger');
  // v1.7: cada planeta propio procesa el PRIMER ítem de su cola en paralelo
  const seen = {};
  for (const q of buildQueue) {
    if (seen[q.planet]) continue;
    seen[q.planet] = true;
    q.t -= dt;
  }
  // recoger las naves terminadas (pueden ser varias a la vez, una por planeta)
  let done = false;
  for (let i = buildQueue.length - 1; i >= 0; i--) {
    const q = buildQueue[i];
    if (q.t > 0) continue;
    buildQueue.splice(i, 1);
    hangarShips.push(q.type);   // la nave va AL HANGAR: la despliegas tú
    const yardName = planets[q.planet] ? planets[q.planet].name : 'la capital';
    chatSys('🛰️ ' + shipDef(q.type).name + ' construido y en el hangar (' + hangarShips.length + '/' + hangarMax() + ') — astillero: ' + yardName);
    notify('🛰️ ' + shipDef(q.type).name + ' listo en el hangar', 'good');   // v1.6.1
    done = true;
  }
  // evento discreto: si el hangar está abierto, se re-renderiza (regla v0.5.3b)
  if ((done || cancelled) && typeof hangarEl !== 'undefined' && !hangarEl.classList.contains('hidden')) renderHangar();
}
function makeWingman(type, role) {
  const mod = shipDef(type);
  const b = {
    uid: ++wingUid,
    name: mod.name + '-' + rndi(10, 99),
    color: player.color,
    x: clamp(playerCapital.x + rnd(-200, 200), 20, WORLD.w - 20),
    y: clamp(playerCapital.y + rnd(-200, 200), 20, WORLD.h - 20),
    angle: rnd(0, TAU), speed: 42, waypoint: null,
    hp: 10 + mod.hp, maxHp: 10 + mod.hp, alive: true, respawnT: 0,   // v1.1: HP alto
    shootCd: rnd(0.5, 1.5), credits: 0, kills: 0,
    vx: 0, vy: 0, flash: 0,
    home: playerCapital, expandR: 900,
    built: true, shipType: type, role: role || 'follow',
    ox: null, oy: null, oplanet: null, gorbit: null,   // v0.7: datos de la orden activa
  };
  bots.push(b);
  return b;
}
function deployShip(hi, role) {
  // v1.5.2: despliegue remoto — la nave sale de la capital y viene sola
  if (fleetCount() >= fleetMax()) { chatSys('🚀 Flota activa al máximo (' + fleetMax() + ' naves: amplía el hangar con H).'); return; }
  const type = hangarShips[hi];
  if (!type) return;
  hangarShips.splice(hi, 1);
  const b = makeWingman(type, role);
  frameFleetCount++;   // v2.0: mantener el cache exacto entre frames
  const roleMsg = { defend: 'defendiendo la capital', garrison: 'en guarnición sobre tu capital', follow: 'en formación contigo' };
  chatSys('🚀 ' + b.name + ' desplegado' + (nearCapital() ? '' : ' por radio (sale de la capital)') + ': ' + (roleMsg[role] || 'en formación contigo') +
    ' (' + fleetCount() + '/' + fleetMax() + ')');
  saveGame();
}
function recallShip(uid) {
  const i = bots.findIndex(b => b.uid === uid && b.built);
  if (i < 0) return;
  const b = bots[i];
  if (hangarShips.length >= hangarMax()) { chatSys('🏗️ Hangar lleno: no cabe ' + b.name + '.'); return; }
  bots.splice(i, 1);
  frameFleetCount--;   // v2.0: mantener el cache exacto entre frames
  selection.delete(b.uid);   // v0.7: si estaba seleccionada, deja de estarlo
  hangarShips.push(b.shipType);
  chatSys('🛬 ' + b.name + ' ha vuelto al hangar.');
  saveGame();
}
function setWingRole(uid, role) {
  const b = bots.find(o => o.uid === uid && o.built);
  if (!b) return;
  b.role = role;
  b.waypoint = null;
  b.ox = b.oy = b.oplanet = null;   // v0.7: limpiar la orden anterior
  chatSys('🛰️ ' + b.name + (role === 'defend' ? ' pasa a defender la capital.' : ' pasa a seguirte.'));
  saveGame();
}
function pilotShip(hi) {
  if (!nearCapital()) { chatSys('🚀 Solo puedes cambiar de nave junto a tu capital.'); return; }
  const type = hangarShips[hi];
  if (!type) return;
  hangarShips[hi] = player.ship;   // tu nave actual pasa al hangar
  player.ship = type;
  applyUpgrades();
  player.hp = player.maxHp; player.fuel = player.maxFuel;
  chatSys('🧑‍🚀 Ahora pilotas: ' + shipDef(type).name + '. Tu nave anterior queda en el hangar.');
  saveGame();
}
// IA de wingmen. Roles: follow (formación contigo), defend (patrulla la capital),
// garrison (órbita cerrada de la capital), defendP (patrulla el planeta oplanet),
// move (ir a ox,oy → al llegar pasa a hold), hold (mantener posición), attack
// (ir a ox,oy y patrullar atacando con más alcance). v0.7: control RTS.
function wingmanUpdate(b, dt) {
  b.flash = Math.max(0, b.flash - dt);
  const mod = shipDef(b.shipType);
  const patrol = (ax, ay, r) => {
    if (!b.waypoint || dist2(b.x, b.y, b.waypoint.x, b.waypoint.y) < 900) {
      b.waypoint = {
        x: clamp(ax + rnd(-r, r), 20, WORLD.w - 20),
        y: clamp(ay + rnd(-r, r), 20, WORLD.h - 20),
      };
    }
    return b.waypoint;
  };
  let tx, ty, fireAnchor = null, fireRange = 420;
  if (b.role === 'follow' && player.alive) {
    // v2.0: la lista de seguidores es un cache del frame (antes: un filter por wingman)
    let fi = -1, fn = 0;
    for (const o of frameFollowers) { if (!o.alive) continue; if (o === b) fi = fn; fn++; }
    const i = Math.max(0, fi), n = fn;
    const a = player.angle + Math.PI + (i - (n - 1) / 2) * 0.6;
    tx = player.x + Math.cos(a) * 60;
    ty = player.y + Math.sin(a) * 60;
    fireAnchor = player;
  } else if (b.role === 'garrison' && playerCapital) {
    // guarnición: órbita cerrada y ordenada alrededor de tu capital
    b.gorbit = (b.gorbit ?? rnd(0, TAU)) + 0.22 * dt;
    const or = playerCapital.r + 90 + (b.uid % 3) * 34;
    tx = playerCapital.x + Math.cos(b.gorbit) * or;
    ty = playerCapital.y + Math.sin(b.gorbit) * or;
    fireAnchor = playerCapital;
  } else if ((b.role === 'move' || b.role === 'attack') && b.ox != null) {
    fireAnchor = b;                                    // ataca lo que ve ELLA, no el ancla
    if (b.role === 'attack') fireRange = 560;
    if (dist2(b.x, b.y, b.ox, b.oy) < 40 * 40) {
      if (b.role === 'move') { b.role = 'hold'; b.waypoint = null; tx = b.x; ty = b.y; }
      else { const wp = patrol(b.ox, b.oy, 320); tx = wp.x; ty = wp.y; }   // ataque: patrulla la zona
    } else { tx = b.ox; ty = b.oy; }
  } else if (b.role === 'hold') {
    fireAnchor = b;
    const hx = b.ox ?? b.x, hy = b.oy ?? b.y;
    if (dist2(b.x, b.y, hx, hy) > 200 * 200) { tx = hx; ty = hy; }
    else { const wp = patrol(hx, hy, 160); tx = wp.x; ty = wp.y; }
  } else if (b.role === 'defendP' && (planets[b.oplanet] || playerCapital)) {
    const anchor = planets[b.oplanet] || playerCapital;
    const wp = patrol(anchor.x, anchor.y, 900);
    tx = wp.x; ty = wp.y;
    fireAnchor = anchor;
  } else if (playerCapital) {
    // 'defend' (capital) — comportamiento original
    const wp = patrol(playerCapital.x, playerCapital.y, 900);
    tx = wp.x; ty = wp.y;
    fireAnchor = playerCapital;
  } else return;
  const dd = Math.sqrt(dist2(b.x, b.y, tx, ty));
  const wa = sunAvoid(b.x, b.y, Math.atan2(ty - b.y, tx - b.x));   // v2.0: evasión solar
  b.angle = angleLerp(b.angle, wa, 1 - Math.pow(0.05, dt));
  // v1.5: nivel de estela según lo lejos del objetivo (lejos = acelera a tope)
  b.thrustLvl = dd > 30 ? (dd > 300 ? 2 : 1) : 0;
  if (dd > 30) {
    const sp = 34 * mod.accel * clamp(dd / 80, 0.5, 2.5);   // v1.0: wingmen acordes al ritmo ÷3
    b.x = clamp(b.x + Math.cos(b.angle) * sp * dt, 20, WORLD.w - 20);
    b.y = clamp(b.y + Math.sin(b.angle) * sp * dt, 20, WORLD.h - 20);
  }
  // disparo: SOLO a facciones en guerra contigo o provocadas por ti/tu flota
  // (v0.8: en paz tus naves no atacan a nadie); en preparación nadie pelea
  b.shootCd -= dt;
  if (b.shootCd <= 0 && prepT <= 0 && fireAnchor) {
    let tgt = null, td = fireRange * fireRange;
    gridEach(fireAnchor.x, fireAnchor.y, fireRange, o => {   // v2.0: candidatos por grid (mismo criterio)
      if (o === b || !o.alive || o.color === player.color) return false;
      if (!o.pirate && !wingmanCanEngage(o.color)) return false;   // v0.8 disciplina · v1.3 piratas siempre · v2.1.1 helper
      const d = dist2(o.x, o.y, fireAnchor.x, fireAnchor.y);
      if (d < td) { td = d; tgt = o; }
      return false;
    });
    if (tgt) {
      const ta = Math.atan2(tgt.y - b.y, tgt.x - b.x) + rnd(-0.12, 0.12);
      shoot(b.x + Math.cos(ta) * 8, b.y + Math.sin(ta) * 8, ta, b.color, b);
      b.shootCd = rnd(0.9, 1.7) * mod.rof;
    } else b.shootCd = 0.3;
  }
}

/* ---------- enganche al motor ---------- */
const _update5 = update;
update = function (dt) {
  buildUpdate(dt);
  _update5(dt);
  if (typeof hangarEl !== 'undefined') refreshHangar();
};

/* =========================================================
   v0.7 — CONTROL RTS DE FLOTA
   SHIFT+arrastre = selección por cuadro (tipo Age of Empires).
   Con naves seleccionadas: CLIC izquierdo = mover el grupo ahí;
   CLIC DERECHO = menú de órdenes (mover/atacar esta zona,
   defender un planeta propio, seguirme, guarnición, parar,
   recoger). Dar cualquier orden suelta la selección (v0.7.1:
   vuelves a pilotar y disparar); ESC la cancela sin ordenar.
   Las órdenes se guardan en el save (ox/oy/oplanet de cada nave).
   ========================================================= */
const selection = new Set();          // uids de wingmen seleccionados
let playerSel = false;                // v2.0: tu propia nave seleccionada en el panel de flota
let selectBox = null;                 // {x0,y0,x1,y1} en px de cliente durante el arrastre
const fleetMenuEl = document.getElementById('fleet-menu');

function selectedShips() {
  return bots.filter(b => b.built && b.alive && selection.has(b.uid));
}
function clientToWorld(cx, cy) {
  return { x: cam.x + (cx / 2 - VW / 2) / cam.zoom, y: cam.y + (cy / 2 - VH / 2) / cam.zoom };
}
function pickWingAt(cx, cy, tolPx) {
  const w = clientToWorld(cx, cy);
  let best = null, bd = (tolPx / 2 / cam.zoom) ** 2;
  for (const b of bots) {
    if (!b.built || !b.alive) continue;
    const d = dist2(b.x, b.y, w.x, w.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function selStart(cx, cy) { selectBox = { x0: cx, y0: cy, x1: cx, y1: cy }; }
function selFinish() {
  const box = selectBox; selectBox = null;
  selection.clear();
  if (Math.abs(box.x1 - box.x0) < 8 && Math.abs(box.y1 - box.y0) < 8) {
    // SHIFT+clic sin arrastre: seleccionar la nave bajo el cursor
    const b = pickWingAt(box.x1, box.y1, 36);
    if (b) selection.add(b.uid);
  } else {
    const w0 = clientToWorld(box.x0, box.y0), w1 = clientToWorld(box.x1, box.y1);
    const x1 = Math.min(w0.x, w1.x), x2 = Math.max(w0.x, w1.x);
    const y1 = Math.min(w0.y, w1.y), y2 = Math.max(w0.y, w1.y);
    for (const b of bots)
      if (b.built && b.alive && b.x >= x1 && b.x <= x2 && b.y >= y1 && b.y <= y2)
        selection.add(b.uid);
  }
  if (selection.size)
    chatSys('🛰️ ' + selection.size + ' nave(s) seleccionada(s). CLIC: mover · CLIC DERECHO: órdenes (al dar la orden se suelta la selección) · ESC: cancelar.');
}
function orderGroup(role, x, y, pidx) {
  const list = selectedShips();
  if (!list.length && !playerSel) { selection.clear(); return; }   // v2.0: también vale tener seleccionada TU nave
  for (const b of list) {
    b.role = role;
    b.ox = x == null ? b.x : x;
    b.oy = y == null ? b.y : y;
    b.oplanet = pidx ?? null;
    b.waypoint = null;
  }
  // v2.0: tu propia nave obedece la orden entrando en piloto automático
  // ('follow' no aplica: no puedes seguirte a ti mismo; 'recall' no pasa por aquí)
  let n = list.length;
  if (playerSel && player.alive && role !== 'follow') {
    player.role = role;
    player.ox = x == null ? player.x : x;
    player.oy = y == null ? player.y : y;
    player.oplanet = pidx ?? null;
    player.auto = true;
    n++;
  }
  const names = {
    move: 'en ruta al punto marcado', attack: 'atacando la zona marcada',
    defendP: 'defendiendo ' + (planets[pidx] ? planets[pidx].name : 'un planeta'),
    follow: 'siguiéndote', garrison: 'en guarnición sobre la capital',
    hold: 'manteniendo posición',
  };
  chatSys('🛰️ Orden para ' + n + ' nave(s): ' + (names[role] || role) + '.');
  if (typeof hangarEl !== 'undefined' && !hangarEl.classList.contains('hidden')) renderHangar();
  saveGame();
}
function orderMoveTo(cx, cy) {
  if (!selectedShips().length && !playerSel) { selection.clear(); return; }
  const w = clientToWorld(cx, cy);
  orderGroup('move', clamp(w.x, 20, WORLD.w - 20), clamp(w.y, 20, WORLD.h - 20), null);
  selection.clear(); playerSel = false;   // v0.7.1: dar la orden suelta la selección (vuelves a pilotar/disparar)
}

/* --- menú contextual de órdenes (botón derecho) --- */
function closeFleetMenu() { if (fleetMenuEl) fleetMenuEl.classList.add('hidden'); }
function openFleetMenu(cx, cy) {
  // sin selección: intentar seleccionar la nave bajo el cursor
  if (!selection.size) {
    const b = pickWingAt(cx, cy, 40);
    if (b) selection.add(b.uid); else return;
  }
  const list = selectedShips();
  if (!list.length) { selection.clear(); return; }
  const w = clientToWorld(cx, cy);
  const own = planets.map((p, i) => [p, i]).filter(([p]) => p.owner === player.color);
  fleetMenuEl.innerHTML =
    '<div class="fm-title">🛰️ ' + list.length + ' nave(s) — orden:</div>' +
    '<button data-fm="move">➡️ MOVER AQUÍ</button>' +
    '<button data-fm="attack">⚔️ ATACAR ESTA ZONA</button>' +
    '<button data-fm="deflist">🛡️ DEFENDER PLANETA ▸</button>' +
    '<div id="fm-planets" class="hidden">' +
      own.map(([p, i]) => '<button data-fm="defp" data-pi="' + i + '">' +
        (p === playerCapital ? '★ ' : '') + p.name + '</button>').join('') +
    '</div>' +
    '<button data-fm="follow">👥 SEGUIRME</button>' +
    '<button data-fm="garrison">🏰 GUARNICIÓN (capital)</button>' +
    '<button data-fm="hold">✋ PARAR (mantener posición)</button>' +
    '<button data-fm="recall">🛬 RECOGER (al hangar)</button>';
  // que no se salga de la pantalla
  fleetMenuEl.style.left = Math.min(cx, innerWidth - 250) + 'px';
  fleetMenuEl.style.top  = Math.min(cy, innerHeight - 340) + 'px';
  fleetMenuEl.classList.remove('hidden');
  fleetMenuEl.querySelectorAll('button[data-fm]').forEach(btn => btn.onclick = () => {
    const act = btn.dataset.fm;
    if (act === 'deflist') {   // solo despliega la lista de planetas propios
      fleetMenuEl.querySelector('#fm-planets').classList.toggle('hidden');
      return;
    }
    if (act === 'move')     orderGroup('move', clamp(w.x, 20, WORLD.w - 20), clamp(w.y, 20, WORLD.h - 20), null);
    if (act === 'attack')   orderGroup('attack', clamp(w.x, 20, WORLD.w - 20), clamp(w.y, 20, WORLD.h - 20), null);
    if (act === 'defp')     orderGroup('defendP', null, null, +btn.dataset.pi);
    if (act === 'follow')   orderGroup('follow', null, null, null);
    if (act === 'garrison') orderGroup('garrison', null, null, null);
    if (act === 'hold')     orderGroup('hold', null, null, null);
    if (act === 'recall')   { for (const b of selectedShips()) recallShip(b.uid); }
    selection.clear();      // v0.7.1: cualquier orden dada suelta la selección
    closeFleetMenu();
  });
}
addEventListener('contextmenu', e => {
  if (e.target !== canvas) return;
  e.preventDefault();   // sin menú del navegador sobre el juego
  if (!inGame) return;
  openFleetMenu(e.clientX, e.clientY);
});
addEventListener('mousedown', e => {
  // clic fuera del menú de flota = cerrarlo (sin tocar la selección)
  if (fleetMenuEl && !fleetMenuEl.classList.contains('hidden') && !fleetMenuEl.contains(e.target))
    closeFleetMenu();
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') { selection.clear(); playerSel = false; closeFleetMenu(); fpDisarm(); }   // v2.0: también desarma la orden del panel
});
// limpieza automática: naves destruidas o recogidas salen de la selección
const _update7 = update;
update = function (dt) {
  _update7(dt);
  if (selection.size && !selectedShips().length) selection.clear();
  if (!player.alive) { playerSel = false; player.auto = false; }   // v2.0: al morir tu nave, el automático muere con ella
  // v0.8: la provocación de facciones se enfría con el tiempo
  for (const c in playerAggro) { playerAggro[c] -= dt; if (playerAggro[c] <= 0) delete playerAggro[c]; }
};
const _back7 = backToMenu;
backToMenu = function () { selection.clear(); playerSel = false; closeFleetMenu(); _back7(); };

/* =========================================================
   v2.0 — PILOTO AUTOMÁTICO DE TU NAVE
   Si tu nave está seleccionada en el panel de flota y recibe una orden,
   la IA la vuela sola (misma disciplina de fuego que los wingmen: solo
   guerra, provocación o piratas). WASD/clic/ESPACIO = control manual.
   ========================================================= */
function playerAutoUpdate(dt, accel) {
  let tx = null, ty = null;
  if ((player.role === 'move' || player.role === 'attack') && player.ox != null) {
    tx = player.ox; ty = player.oy;
  } else if (player.role === 'defendP' || player.role === 'garrison') {
    const p = player.role === 'garrison' ? playerCapital : planets[player.oplanet];
    if (p && p.owner === player.color) {   // órbita lenta del objetivo
      const a = performance.now() / 3000;
      tx = p.x + Math.cos(a) * (p.r + 110); ty = p.y + Math.sin(a) * (p.r + 110);
    } else player.role = 'hold';
  }
  if (tx == null) {   // hold: frenar y quedarse
    player.vx *= Math.pow(0.02, dt); player.vy *= Math.pow(0.02, dt);
  } else {
    const dd = Math.sqrt(dist2(player.x, player.y, tx, ty));
    if (player.role === 'move' && dd < 40) player.role = 'hold';
    else {
      const wa = sunAvoid(player.x, player.y, Math.atan2(ty - player.y, tx - player.x));
      player.angle = angleLerp(player.angle, wa, 1 - Math.pow(0.05, dt));
      if (dd > 30) {
        player.vx += Math.cos(player.angle) * accel * dt;
        player.vy += Math.sin(player.angle) * accel * dt;
      }
    }
  }
  player.vx *= Math.pow(0.12, dt); player.vy *= Math.pow(0.12, dt);
  player.x = clamp(player.x + player.vx * dt, 16, WORLD.w - 16);
  player.y = clamp(player.y + player.vy * dt, 16, WORLD.h - 16);
  // fuego con disciplina (v0.8): solo guerra declarada, provocación o piratas
  player.shootCd -= dt;
  if (player.shootCd <= 0 && prepT <= 0) {
    let tgt = null, td = 420 * 420;
    gridEach(player.x, player.y, 420, o => {
      if (!o.alive || o.color === player.color) return false;
      if (!o.pirate && !wingmanCanEngage(o.color)) return false;   // v2.1.1: misma disciplina que los wingmen
      const d = dist2(o.x, o.y, player.x, player.y);
      if (d < td) { td = d; tgt = o; }
      return false;
    });
    if (tgt) {
      const ta = Math.atan2(tgt.y - player.y, tgt.x - player.x) + rnd(-0.12, 0.12);
      shoot(player.x + Math.cos(ta) * 8, player.y + Math.sin(ta) * 8, ta, player.color, player,
            player.tech.blaster ? 2 : 1);
      player.shootCd = 0.22 * getShipMod().rof * (player.tech.enjambre ? 1 / 1.6 : 1) * (player.tech.blaster ? 1 / 0.75 : 1) / (1 + 0.25 * player.upgrades.cadencia);
      net.sendShoot();
    }
  }
}

/* =========================================================
   v2.0 — PANEL PERMANENTE DE FLOTA (a la derecha, entre la
   clasificación y el minimapa)
   Lista TODAS las naves desplegadas con su orden y HP; clic en una fila la
   (de)selecciona (misma `selection` que el RTS, se sincronizan solos); los
   botones dan órdenes a la selección — MOVER/ATACAR arman la orden y el
   siguiente clic en el mapa fija el objetivo.
   Regla v0.5.3b: innerHTML solo cuando cambia la composición; por tick
   solo textContent/classList de nodos ya creados.
   ========================================================= */
const fleetPanelEl = $('fleet-panel');
const fpListEl = $('fp-list');
const fpCountEl = $('fp-count');
const fpDefpSel = $('fp-defp-sel');
let pendingOrder = null;   // null | 'move' | 'attack' — orden armada esperando clic en el mapa
let fpSig = '';            // firma de composición (re-render solo si cambia)
let fpRows = {};           // uid -> {row, hp, order}

function fpDisarm() {
  pendingOrder = null;
  document.querySelectorAll('#fp-orders button').forEach(x => x.classList.remove('armed'));
}
function roleLabelFP(b) {
  switch (b.role) {
    case 'follow':   return '👥 te sigue';
    case 'defend':   return '🛡️ def. capital';
    case 'garrison': return '🏰 guarnición';
    case 'hold':     return '✋ parada';
    case 'move':     return '➡️ en ruta';
    case 'attack':   return '⚔️ atacando';
    case 'defendP':  return '🛡️ ' + (planets[b.oplanet] ? planets[b.oplanet].name : 'planeta');
    default:         return b.role || '';
  }
}
function fpRender() {
  const ships = bots.filter(b => b.built && b.alive);
  const own = planets.map((p, i) => [p, i]).filter(([p]) => p.owner === player.color);
  const sig = player.ship + '|' +   // v2.0: la fila de TU nave se reconstruye si cambias de nave
    ships.map(b => b.uid + ':' + b.role + ':' + (b.oplanet == null ? '' : b.oplanet)).join('|') +
    '#' + own.map(([p, i]) => i).join(',');
  const nSel = selection.size + (playerSel ? 1 : 0);
  fpCountEl.textContent = ships.length + '/' + fleetMax() + (nSel ? ' · ' + nSel + ' sel.' : '');
  if (sig !== fpSig) {
    fpSig = sig;
    fpRows = {};
    // v2.0: primera fila = TU nave (clic = seleccionarla para darle órdenes en automático)
    const pro = document.createElement('div');
    pro.className = 'fp-row fp-player';
    pro.innerHTML = '<span class="fp-name">★ TÚ · ' + shipDef(player.ship).name + '</span>' +
      '<span class="fp-order"></span><span class="fp-hp"></span>';
    pro.onclick = () => { playerSel = !playerSel; };
    fpListEl.innerHTML = '';
    fpListEl.appendChild(pro);
    fpRows['player'] = { row: pro, hp: pro.querySelector('.fp-hp'), order: pro.querySelector('.fp-order') };
    for (const b of ships) {
      const row = document.createElement('div');
      row.className = 'fp-row';
      row.innerHTML = '<span class="fp-name">' + shipDef(b.shipType).name + ' <b>' + b.name + '</b></span>' +
        '<span class="fp-order"></span><span class="fp-hp"></span>';
      row.onclick = () => {
        if (selection.has(b.uid)) selection.delete(b.uid);
        else selection.add(b.uid);
      };
      fpListEl.appendChild(row);
      fpRows[b.uid] = { row, hp: row.querySelector('.fp-hp'), order: row.querySelector('.fp-order') };
    }
    if (!ships.length) fpListEl.insertAdjacentHTML('beforeend',
      '<div id="fp-empty">Sin más naves desplegadas: construye en el hangar (H) y despliega.</div>');
    fpDefpSel.innerHTML = own.map(([p, i]) =>
      '<option value="' + i + '">' + (p === playerCapital ? '★ ' : '') + p.name + '</option>').join('');
  }
  // por tick: solo textos y resaltado en nodos existentes
  const pr = fpRows['player'];
  if (pr) {
    pr.hp.textContent = Math.ceil(player.hp) + '❤';
    pr.hp.classList.toggle('low', player.hp <= player.maxHp * 0.35);
    const pl = player.auto ? '🤖 ' + roleLabelFP(player) : '🕹️ manual';
    if (pr.order.textContent !== pl) pr.order.textContent = pl;
    pr.order.classList.toggle('auto', player.auto);
    pr.row.classList.toggle('sel', playerSel);
  }
  for (const b of ships) {
    const r = fpRows[b.uid];
    if (!r) continue;
    r.hp.textContent = Math.ceil(b.hp) + '❤';
    r.hp.classList.toggle('low', b.hp <= (b.maxHp || 10) * 0.35);
    const ol = roleLabelFP(b);
    if (r.order.textContent !== ol) r.order.textContent = ol;
    r.row.classList.toggle('sel', selection.has(b.uid));
  }
}
$('fp-all').onclick = () => {
  for (const b of bots) if (b.built && b.alive) selection.add(b.uid);
  playerSel = player.alive;   // v2.0: TODAS incluye tu propia nave
};
document.querySelectorAll('#fp-orders button[data-fpo]').forEach(btn => btn.onclick = () => {
  const act = btn.dataset.fpo;
  if (!selectedShips().length && !playerSel) { notify('🛰️ Selecciona naves primero (clic en la lista o SHIFT+arrastre).', 'info', 'fp-sel', 3); return; }
  if (act === 'move' || act === 'attack') {
    fpDisarm();
    pendingOrder = act;
    btn.classList.add('armed');
    notify((act === 'move' ? '➡️ MOVIMIENTO armado' : '⚔️ ATAQUE armado') +
      ': haz CLIC en el mapa para fijar el objetivo (ESC cancela).', 'info', 'fp-arm', 2);
    return;
  }
  fpDisarm();
  if (act === 'defendP') {
    if (fpDefpSel.value === '') { notify('🛡️ No tienes planetas que defender.', 'info', 'fp-sel', 3); return; }
    orderGroup('defendP', null, null, +fpDefpSel.value);
  }
  if (act === 'follow')   orderGroup('follow', null, null, null);
  if (act === 'garrison') orderGroup('garrison', null, null, null);
  if (act === 'hold')     orderGroup('hold', null, null, null);
  if (act === 'recall') {
    for (const b of selectedShips()) recallShip(b.uid);
    if (playerSel) notify('🛬 Tu nave no puede recogerse: la pilotas tú (usa GUARNICIÓN para mandarla sola a la capital).', 'info', 'fp-rec', 4);
  }
  selection.clear(); playerSel = false;   // v0.7.1: toda orden dada suelta la selección
});
// tick del panel: 4 veces por segundo basta (estado, HP, resaltado)
const _updateFP = update;
let fpTick = 0;
update = function (dt) {
  _updateFP(dt);
  fleetPanelEl.classList.toggle('hidden', !inGame);
  fpTick -= dt;
  if (inGame && fpTick <= 0) { fpTick = 0.25; fpRender(); }
};
const _backFP = backToMenu;
backToMenu = function () { fpDisarm(); _backFP(); };

/* =========================================================
   v0.5.2 — TUTORIAL GUIADO
   Pasos que se completan con acciones reales del jugador.
   T para cerrarlo. Se reinicia en cada partida.
   ========================================================= */
const tutEl = document.getElementById('tutorial');
let tutStep = 0, tutT = 0, tutorialOn = false;
const TUT = [
  { html: '👋 Ese planeta con <b>aro blanco</b> es tu <b>CAPITAL</b>: produce <b>+3◈/s</b> sola. Las naves de <b>tu color</b> son de tu facción: no podéis dañaros.',
    done: () => tutT > 8 },
  { html: 'Muévete sin prisa con <b>WASD</b> o las <b>flechas</b>. El espacio es grande y los viajes largos.',
    done: () => Math.abs(player.vx) + Math.abs(player.vy) > 40 },
  { html: 'Usa la <b>rueda del ratón</b>: aléjate para ver el <b>mapa de la galaxia</b> y acércate para pilotar.',
    done: () => cam.zoomTarget < 0.8 || cam.zoomTarget > 1.25 },
  { html: 'Pulsa <b>H</b> y <b>construye un caza</b> (60◈ + 15⛏ · 15 s). Tu capital es <b>minera</b>: genera créditos y acumula ⛏ sola, tú espera junto a ella. Al terminar irá al <b>hangar</b>: despliégalo con SEGUIRME o DEFENDER.',
    done: () => buildQueue.length > 0 || hangarShips.length > 0 || fleetCount() > 0 },
  { html: 'Acércate a un <b>planeta neutral</b> cercano y permanece a su lado para <b>conquistarlo</b> (unos segundos). Más planetas = más ◈/s.',
    done: () => planets.some(p => p.owner === player.color && p !== playerCapital) },
  { html: '✅ <b>¡Listo!</b> Cuando acabe la preparación, la galaxia entra en juego. Pulsa <b>T</b> para cerrar el tutorial.',
    done: () => false },
];
function tutorialUpdate(dt) {
  if (!tutorialOn || !tutEl) return;
  const step = TUT[tutStep];
  if (!step) { tutorialOn = false; tutEl.classList.add('hidden'); return; }
  tutT += dt;
  tutEl.classList.remove('hidden');
  tutEl.innerHTML = '<b>GUÍA ' + (tutStep + 1) + '/' + TUT.length + '</b> ' + step.html +
    ' <span class="tut-skip">[T] cerrar</span>';
  if (step.done()) { tutStep++; tutT = 0; }
}
addEventListener('keydown', e => {
  if (document.activeElement === chatInput) return;   // escribir "t" en el chat no cierra el tutorial
  if (e.key.toLowerCase() === 't' && tutorialOn) {
    tutorialOn = false;
    if (tutEl) tutEl.classList.add('hidden');
  }
});
// v0.6: el tutorial y los fondos iniciales se arrancan en newGameInit()
// (solo en partida NUEVA — al continuar no se pisa nada del save)
const _update52 = update;
update = function (dt) { _update52(dt); tutorialUpdate(dt); };

/* =========================================================
   v0.5.3 — BARRA LATERAL DE ACCESOS
   Iconos clicables para cada sección (con el atajo en el
   tooltip). Los atajos de teclado siguen funcionando.
   ========================================================= */
function toggleGamePanel(which) {
  const map = { shop: shopEl, diplo: diploEl, contracts: contractsEl, missions: missionsEl, hangar: hangarEl, empire: empireEl };
  for (const k in map) if (k !== which) map[k].classList.add('hidden');
  map[which].classList.toggle('hidden');
  if (which === 'shop') renderShop();
  else if (which === 'diplo') renderDiplo();
  else if (which === 'contracts') renderContracts();
  else if (which === 'missions') renderMissions();
  else if (which === 'hangar') renderHangar();
  else if (which === 'empire') renderEmpire();
}
function closeAllPanels() {
  for (const el of [shopEl, diploEl, contractsEl, missionsEl, hangarEl, empireEl]) el.classList.add('hidden');
}
// v1.6.1: botón ✕ para cerrar cada panel (además de su tecla y ESC)
document.querySelectorAll('.panel-x').forEach(b => b.onclick = () => b.parentElement.classList.add('hidden'));
const tbButtons = Array.from(document.querySelectorAll('#toolbar button[data-panel]'));
tbButtons.forEach(b => { b.onclick = () => toggleGamePanel(b.dataset.panel); });
const tbChat = document.getElementById('tb-chat');
if (tbChat) tbChat.onclick = () => { chatInput.style.display = 'block'; chatInput.focus(); };
const tbMenu = document.getElementById('tb-menu');
if (tbMenu) tbMenu.onclick = () => { if (inGame) backToMenu(); };
const tbPairs = tbButtons.map(b => [b, { shop: shopEl, diplo: diploEl, contracts: contractsEl, missions: missionsEl, hangar: hangarEl, empire: empireEl }[b.dataset.panel]]);

// resaltar el icono del panel que esté abierto (también si se abre con teclado)
const _update53 = update;
update = function (dt) {
  _update53(dt);
  for (const [b, panel] of tbPairs) b.classList.toggle('active', !panel.classList.contains('hidden'));
};

/* =========================================================
   v0.6 — MENÚ SEGÚN PARTIDA GUARDADA
   Con save v2 → «▶ CONTINUAR PARTIDA»; sin save → «▶ NUEVA
   PARTIDA». En AJUSTES, botón para borrar la partida.
   ========================================================= */
{
  const sv = readSave();
  $('btn-play').textContent = sv ? '▶ CONTINUAR PARTIDA' : '▶ NUEVA PARTIDA';
  if (sv && sv.player) {
    // precargar nombre/color en el menú (al continuar se restaura todo el save)
    if (sv.player.name) { player.name = sv.player.name; $('input-name').value = sv.player.name; }
    if (sv.player.color && FACTION_COLORS.includes(sv.player.color)) {
      player.color = sv.player.color;
      Array.from(picker.children).forEach((d, i) =>
        d.classList.toggle('selected', FACTION_COLORS[i] === player.color));
    }
  }
}
$('btn-wipe').onclick = () => {
  if (confirm('¿BORRAR la partida guardada? Perderás tu piloto, tu flota y tu imperio. Esta acción no se puede deshacer.')) {
    localStorage.removeItem('pixelfleet_save_v2');
    localStorage.removeItem('pixelfleet_save_v1');   // limpieza del formato viejo
    location.reload();
  }
};

/* =========================================================
   v0.9 — PANEL DE IMPERIO (TAB)
   Resumen del imperio, planetas propios, flota y estado
   diplomático de la galaxia (guerras/alianzas entre facciones).
   Sin botones: se re-renderiza entero a 2 Hz mientras esté abierto.
   (empireEl/empireBody se declaran junto a shopEl/diploEl)
   ========================================================= */
function renderEmpire() {
  const own = planets.filter(p => p.owner === player.color);
  const inc = own.reduce((s, p) => s + (p === playerCapital ? PLANET_INCOME * 3 : (p.res === 'creditos' ? PLANET_INCOME : PLANET_INCOME * 0.5)), 0);
  const fleet = bots.filter(b => b.built && b.alive);
  // v1.7: el resumen muestra los TOTALES de suministros (suma de los stocks propios)
  let html = '<p class="panel-sub">🪐 ' + own.length + ' planeta(s) · +' + inc.toFixed(1) + '◈/s · ⛏ ' + Math.floor(stockOf(player.color, 'mineral')) +
    ' · ⛽ ' + Math.floor(stockOf(player.color, 'gas')) + ' · 🛰 ' +
    fleet.length + '/' + fleetMax() + ' · hangar ' + hangarShips.length +
    (buildQueue.length ? ' · 🏗️ ' + Math.ceil(buildQueue[0].t) + ' s' : '') + '</p>';
  html += '<h4 class="panel-sub2">PLANETAS PROPIOS</h4>';
  html += own.length
    ? own.map(p => '<div class="diplo-row"><span style="color:' + player.color + '">' +
        (p === playerCapital ? '★ ' : '') + p.name + ' ' + RES_ICON[p.res] + '</span><span>🛡 ' + Math.floor(p.shield) + '/' + p.shieldMax +
        ' · +' + (p === playerCapital ? PLANET_INCOME * 3 : (p.res === 'creditos' ? PLANET_INCOME : PLANET_INCOME * 0.5)) + '◈/s' +
        (p.res !== 'creditos' ? ' · ' + RES_ICON[p.res] + ' ' + Math.floor(p.stock) + '/' + STOCK_CAP : '') + '</span></div>').join('')
    : '<div class="diplo-row"><span>sin planetas</span></div>';
  html += '<h4 class="panel-sub2">FLOTA</h4>';
  html += fleet.length
    ? fleet.map(b => '<div class="diplo-row"><span>🛰 ' + b.name + '</span><span>' + roleLabel(b) + '</span></div>').join('')
    : '<div class="diplo-row"><span>sin naves desplegadas (hangar: H)</span></div>';
  html += '<h4 class="panel-sub2">LA GALAXIA (relación contigo)</h4>';
  for (const c of FACTION_COLORS) {
    if (c === player.color) continue;
    const [label, col] = relationLabel(standings[c] || 0);
    // v1.3: la personalidad solo se muestra si has «contactado» con esa facción
    const met = (standings[c] || 0) !== 0 || planets.some(p => (p.knownOwner || null) === c);
    const pers = met && facState[c] ? ' · ' + persOf(c).label : '';
    html += '<div class="diplo-row"><span style="color:' + c + '">' + facName(c) + pers + '</span>' +
            '<span style="color:' + col + '">' + label + '</span></div>';
  }
  const relRows = [];
  for (let i = 0; i < FACTION_COLORS.length; i++) for (let j = i + 1; j < FACTION_COLORS.length; j++) {
    const a = FACTION_COLORS[i], b = FACTION_COLORS[j];
    if (a === player.color || b === player.color) continue;
    const r = (facState[a] && facState[a].rel[b]) || 0;
    if (r <= -30)      relRows.push('⚔️ GUERRA: <span style="color:' + a + '">' + facName(a) + '</span> vs <span style="color:' + b + '">' + facName(b) + '</span>');
    else if (r >= 50)  relRows.push('🤝 alianza: <span style="color:' + a + '">' + facName(a) + '</span> + <span style="color:' + b + '">' + facName(b) + '</span>');
  }
  html += '<h4 class="panel-sub2">GUERRAS Y ALIANZAS ENTRE FACCIONES IA</h4>';
  html += relRows.length ? relRows.map(r => '<div class="diplo-row">' + r + '</div>').join('')
                         : '<div class="diplo-row"><span>galaxia en paz… de momento</span></div>';
  empireBody.innerHTML = html;
}
let empireT = 0;
const _update9 = update;
update = function (dt) {
  _update9(dt);
  if (!empireEl.classList.contains('hidden')) {
    empireT -= dt;
    if (empireT <= 0) { empireT = 0.5; renderEmpire(); }   // vivo, sin romper clics (no hay botones)
  }
};

/* =========================================================
   v1.2 — VICTORIA Y DERROTA REALES
   Una facción muere cuando no le quedan planetas NI naves NI
   construcción en curso. El jugador gana cuando no queda
   ninguna facción IA viva; pierde (de momento) si se queda
   sin planetas. La partida continúa tras el banner (sandbox).
   ========================================================= */
const endBanner = document.getElementById('end-banner');
let victory = false;
function facAlive(c) {
  return planets.some(p => p.owner === c) ||
         bots.some(b => b.imp && b.alive && b.color === c) ||
         !!(facState[c] && facState[c].building);
}
let endT = 0;
const _update12 = update;
update = function (dt) {
  _update12(dt);
  endT -= dt;
  if (endT > 0) return;
  endT = 2;   // chequeo cada 2 s
  // eliminaciones de facciones IA
  for (const c of FACTION_COLORS) {
    if (c === player.color) continue;
    const f = facState[c];
    if (!f) continue;
    if (!f.dead && !facAlive(c)) {
      f.dead = true;
      chatSys('☠️ El imperio de ' + facName(c) + ' ha CAÍDO. No queda nada de él.');
    }
  }
  // victoria: no queda ninguna facción IA viva
  if (!victory && FACTION_COLORS.every(c => c === player.color || (facState[c] && facState[c].dead))) {
    victory = true;
    chatSys('🏆 ¡VICTORIA! La galaxia es tuya, ' + player.name + '. (Puedes seguir jugando.)');
  }
  // banner de fin
  if (victory) {
    endBanner.textContent = '🏆 ¡VICTORIA! LA GALAXIA ES TUYA — la partida sigue en modo libre';
    endBanner.classList.remove('hidden', 'defeat');
  } else if (!planets.some(p => p.owner === player.color)) {
    endBanner.textContent = '💀 TU IMPERIO HA CAÍDO — conquista un planeta para levantarte';
    endBanner.classList.remove('hidden'); endBanner.classList.add('defeat');
  } else {
    endBanner.classList.add('hidden');
  }
};

/* =========================================================
   v1.3 — EVENTOS GALÁCTICOS
   Cada 90-180 s (tras la preparación): oleada de PIRATAS
   hostiles a todos, VETA RICA (asteroides de una zona ×2) o
   AGUJERO DE GUSANO temporal entre dos puntos lejanos.
   Son transitorios: no se guardan en el save.
   ========================================================= */
const PIRATE_COLOR = '#9aa5b1';
let eventT = 100;            // primer evento ~100 s tras la preparación
let richVein = null;         // { x, y, t }
const wormholes = [];        // { x, y, tx, ty, t }

function spawnPirate(x, y) {
  const b = {
    name: 'Saqueador-' + rndi(10, 99), color: PIRATE_COLOR,
    x: clamp(x, 20, WORLD.w - 20), y: clamp(y, 20, WORLD.h - 20),
    angle: rnd(0, TAU), speed: rnd(14, 22), waypoint: null,
    hp: 8, alive: true, respawnT: 0, shootCd: rnd(0.5, 2), credits: 0, kills: 0,
    vx: 0, vy: 0, flash: 0, home: { x, y }, expandR: 0,
    pirate: true, task: null, retalT: 0, lastHitBy: null,
  };
  bots.push(b);
  return b;
}
function pirateThink(b, dt) {
  b.flash = Math.max(0, b.flash - dt);
  b.shootCd -= dt;
  // objetivo: la nave más cercana, de quien sea (los piratas no conocen la paz)
  // v2.0: candidatos por grid — más allá del alcance de persecución (2500 u) da
  // igual quién sea el más cercano: el pirata patrulla su zona igual que antes
  let tgt = null, td = 2500 * 2500;
  gridEach(b.x, b.y, 2500, o => {
    if (o === b || !o.alive || o.pirate) return false;
    const d = dist2(b.x, b.y, o.x, o.y);
    if (d < td) { td = d; tgt = o; }
    return false;
  });
  if (player.alive) {
    const d = dist2(b.x, b.y, player.x, player.y);
    if (d < td) { td = d; tgt = player; }
  }
  let tx, ty;
  if (tgt) { tx = tgt.x; ty = tgt.y; }
  else {
    if (!b.waypoint || dist2(b.x, b.y, b.waypoint.x, b.waypoint.y) < 900)
      b.waypoint = { x: clamp(b.home.x + rnd(-800, 800), 20, WORLD.w - 20),
                     y: clamp(b.home.y + rnd(-800, 800), 20, WORLD.h - 20) };
    tx = b.waypoint.x; ty = b.waypoint.y;
  }
  const wa = sunAvoid(b.x, b.y, Math.atan2(ty - b.y, tx - b.x));   // v2.0: evasión solar
  b.angle = angleLerp(b.angle, wa, 1 - Math.pow(0.05, dt));
  b.thrustLvl = dist2(b.x, b.y, tx, ty) > 40 * 40 ? 1 : 0;   // v1.5
  if (b.thrustLvl) {
    b.x = clamp(b.x + Math.cos(b.angle) * b.speed * dt, 20, WORLD.w - 20);
    b.y = clamp(b.y + Math.sin(b.angle) * b.speed * dt, 20, WORLD.h - 20);
  }
  if (b.shootCd <= 0 && tgt && td < 420 * 420 && prepT <= 0) {
    const a = Math.atan2(tgt.y - b.y, tgt.x - b.x) + rnd(-0.15, 0.15);
    shoot(b.x + Math.cos(a) * 8, b.y + Math.sin(a) * 8, a, b.color, b);
    b.shootCd = rnd(0.8, 1.4);
  }
}
function fireEvent(force) {
  const kind = force || ['piratas', 'veta', 'gusano'][rndi(0, 2)];
  if (kind === 'piratas') {
    let x = 0, y = 0, tries = 0;   // v2.0: nunca dentro de un sol
    do {
      x = rnd(1000, WORLD.w - 1000); y = rnd(1000, WORLD.h - 1000);
      tries++;
    } while (tries < 20 && suns.some(s => dist2(x, y, s.x, s.y) < (s.r + 400) ** 2));
    const n = rndi(2, 3);
    for (let i = 0; i < n; i++) spawnPirate(x + rnd(-150, 150), y + rnd(-150, 150));
    chatSys('🏴‍☠️ ¡PIRATAS detectados en (' + Math.floor(x) + ',' + Math.floor(y) + ')! Atacan a todo el mundo.');
  } else if (kind === 'veta') {
    const alive = asteroids.filter(a => a.alive);
    if (!alive.length) return;
    const a = alive[rndi(0, alive.length - 1)];
    richVein = { x: a.x, y: a.y, t: 60 };
    chatSys('🌟 VETA RICA en (' + Math.floor(a.x) + ',' + Math.floor(a.y) + '): los asteroides de la zona dan ◈×2 durante 60 s.');
  } else {
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0, tries = 0;
    const inSun = (x, y) => suns.some(s => dist2(x, y, s.x, s.y) < (s.r + 400) ** 2);   // v2.0
    do {
      x1 = rnd(800, WORLD.w - 800); y1 = rnd(800, WORLD.h - 800);
      x2 = rnd(800, WORLD.w - 800); y2 = rnd(800, WORLD.h - 800);
      tries++;
    } while ((dist2(x1, y1, x2, y2) < 4000 * 4000 || inSun(x1, y1) || inSun(x2, y2)) && tries < 20);
    wormholes.push({ x: x1, y: y1, tx: x2, ty: y2, t: 90 });
    chatSys('🕳️ AGUJERO DE GUSANO estable entre (' + Math.floor(x1) + ',' + Math.floor(y1) +
            ') y (' + Math.floor(x2) + ',' + Math.floor(y2) + ') durante 90 s.');
  }
}
function eventsUpdate(dt) {
  if (prepT > 0) return;   // durante la preparación no hay eventos
  eventT -= dt;
  if (eventT <= 0) { eventT = rnd(90, 180); fireEvent(); }
  if (richVein) {
    richVein.t -= dt;
    if (richVein.t <= 0) { richVein = null; chatSys('🌟 La veta rica se ha agotado.'); }
  }
  for (let i = wormholes.length - 1; i >= 0; i--) {
    wormholes[i].t -= dt;
    if (wormholes[i].t <= 0) { wormholes.splice(i, 1); chatSys('🕳️ El agujero de gusano se ha colapsado.'); }
  }
  if (wormholes.length) {
    for (const s of [player, ...bots]) {
      if (!s.alive) continue;
      s.whCd = Math.max(0, (s.whCd || 0) - dt);
      if (s.whCd > 0) continue;
      for (const w of wormholes) {
        if (dist2(s.x, s.y, w.x, w.y) < 45 * 45) {
          s.x = clamp(w.tx + rnd(-60, 60), 20, WORLD.w - 20); s.y = clamp(w.ty + rnd(-60, 60), 20, WORLD.h - 20);
          s.whCd = 3;
          if (s === player) { chatSys('🕳️ ¡Salto por el agujero de gusano!'); if (typeof storyHook === 'function') storyHook('wormhole'); }
          explode(s.x, s.y, '#c792ff');
          break;
        }
        if (dist2(s.x, s.y, w.tx, w.ty) < 45 * 45) {
          s.x = clamp(w.x + rnd(-60, 60), 20, WORLD.w - 20); s.y = clamp(w.y + rnd(-60, 60), 20, WORLD.h - 20);
          s.whCd = 3;
          if (s === player) { chatSys('🕳️ ¡Salto por el agujero de gusano!'); if (typeof storyHook === 'function') storyHook('wormhole'); }
          explode(s.x, s.y, '#c792ff');
          break;
        }
      }
    }
  }
}
function eventsDraw() {   // bajo la niebla: solo lo visible se dibuja
  const t = performance.now() / 1000;
  for (const w of wormholes) {
    for (const [x, y] of [[w.x, w.y], [w.tx, w.ty]]) {
      if (!fogVisible(x, y)) continue;
      const pr = 30 + 8 * Math.sin(t * 4);
      ctx.strokeStyle = '#c792ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(199,146,255,0.35)';
      ctx.beginPath(); ctx.arc(x, y, pr + 12, 0, TAU); ctx.stroke();
    }
  }
  if (richVein) {
    ctx.strokeStyle = 'rgba(255,209,102,0.55)'; ctx.lineWidth = 2;
    for (const a of asteroids) {
      if (!a.alive || dist2(a.x, a.y, richVein.x, richVein.y) > 400 * 400) continue;
      if (!fogVisible(a.x, a.y)) continue;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 6, 0, TAU); ctx.stroke();
    }
  }
}
const _update13 = update;
update = function (dt) { _update13(dt); eventsUpdate(dt); };


/* =========================================================
   v2.1 — MISIONES-HISTORIA: «LA SEÑAL DEL VACÍO»
   Cadena lineal de 6 capítulos con narrativa que guía la
   partida. El objetivo se marca en el mundo y el minimapa
   (la señal se conoce: el marcador atraviesa la niebla).
   Persistente en el save (migración sin invalidar); local,
   no toca salas ni server.js. Panel con la tecla J.
   ========================================================= */
const STORY = [
  { id: 'eco', title: 'Eco lejano', obj: { type: 'reach' }, reward: 100,
    brief: 'Alcanza la sonda abandonada (marcador ◆)',
    lines: [
      '📡 [SEÑAL DESCONOCIDA] …recibiendo transmisión del borde de la galaxia…',
      '📜 HISTORIA — LA SEÑAL DEL VACÍO · Capítulo 1: Eco lejano.',
      '📜 Una sonda antiquísima emite desde el punto marcado ◆. Ve a ver qué es.',
    ],
    outro: '📜 La sonda repite un mensaje: «no estáis solos». Algo ha detectado tu escaneo…' },
  { id: 'piratas', title: 'No estás solo', obj: { type: 'killPirates', n: 4 }, reward: 150,
    brief: 'Destruye la oleada de piratas',
    lines: [
      '📜 Capítulo 2: No estás solo.',
      '📜 La señal también la oyeron otros. Piratas saqueadores vienen a por la sonda… y a por ti.',
    ],
    outro: '📜 Entre los restos, un diario de a bordo habla de un «atajo» para cruzar la galaxia… pero hace falta combustible.' },
  { id: 'gas', title: 'Combustible para el salto', obj: { type: 'stock', res: 'gas', n: 60 }, reward: 120,
    brief: 'Acumula 60⛽ de stock entre tus planetas',
    lines: [
      '📜 Capítulo 3: Combustible para el salto.',
      '📜 El diario describe un salto imposible sin reservas. Acumula 60⛽ de gas en tus planetas.',
    ],
    outro: '📜 Depósitos llenos. El «atajo» resulta ser un agujero de gusano inestable…' },
  { id: 'atajo', title: 'El atajo', obj: { type: 'wormhole' }, reward: 150,
    brief: 'Salta por un agujero de gusano (◆ marca el más cercano)',
    lines: [
      '📜 Capítulo 4: El atajo.',
      '📜 Salta por un agujero de gusano. El diario marca uno cerca de ti (◆).',
    ],
    outro: '📜 Al otro lado la señal suena más clara, pero cruza espacio disputado.' },
  { id: 'territorio', title: 'Territorio hostil', obj: { type: 'conquer', n: 2 }, reward: 200,
    brief: 'Conquista 2 planetas para asegurar la ruta',
    lines: [
      '📜 Capítulo 5: Territorio hostil.',
      '📜 La ruta de la señal cruza espacio disputado. Conquista 2 planetas para asegurarla.',
    ],
    outro: '📜 Ruta asegurada. La fuente de la señal está al alcance: el origen del Vacío.' },
  { id: 'origen', title: 'El origen', obj: { type: 'reach', final: true }, reward: 500,
    brief: 'Alcanza el origen de la señal (marcador ◆)',
    lines: [
      '📜 Capítulo 6: El origen.',
      '📜 Viaja al punto marcado ◆, en el borde de la galaxia, y descubre qué emite la señal.',
    ],
    outro: '📜 El origen: una baliza de una civilización anterior. Su último regalo: el MAPA DEL VACÍO.' },
];
// step: índice del capítulo activo (-1 = aún no empieza, espera al fin de la preparación)
const story = { step: -1, prog: 0, done: false, data: {} };
const missionTrackerEl = document.getElementById('mission-tracker');

function resetStory() { story.step = -1; story.prog = 0; story.done = false; story.data = {}; }
function storyTarget(ch) { const o = ch.obj; return (o.type === 'reach' || o.type === 'wormhole') ? 1 : o.n; }

function storyPickPoint(final) {
  const from = playerCapital || player;
  const minD = final ? 9000 : 4000, maxD = final ? 20000 : 8000;
  let x = WORLD.w / 2, y = WORLD.h / 2, tries = 0;
  do {
    const a = rnd(0, TAU), d = rnd(minD, maxD);
    x = clamp(from.x + Math.cos(a) * d, 400, WORLD.w - 400);
    y = clamp(from.y + Math.sin(a) * d, 400, WORLD.h - 400);
    tries++;
  } while (tries < 30 && (suns.some(s => dist2(x, y, s.x, s.y) < (s.r + 500) ** 2) ||
           dist2(x, y, from.x, from.y) < minD * minD));
  return { x, y };
}
function storySpawnPirates(n) {
  for (let k = 0; k < n; k++) {
    let x = 0, y = 0, tries = 0;   // v2.0: nunca dentro de un sol
    do {
      const a = rnd(0, TAU), d = rnd(600, 900);
      x = clamp(player.x + Math.cos(a) * d, 200, WORLD.w - 200);
      y = clamp(player.y + Math.sin(a) * d, 200, WORLD.h - 200);
      tries++;
    } while (tries < 12 && suns.some(s => dist2(x, y, s.x, s.y) < (s.r + 400) ** 2));
    // v2.1.1: la oleada queda marcada como TUYA — el capítulo cuenta los
    // piratas de la oleada que caen, los destruya quien los destruya (si la
    // IA se carga a dos, no se atasca la misión: feedback de Pedro)
    const b = spawnPirate(x, y);
    b.storyWave = story.step;
  }
}
function storySpawnWormhole() {
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0, tries = 0;
  const inSun = (x, y) => suns.some(s => dist2(x, y, s.x, s.y) < (s.r + 400) ** 2);
  do {
    const a = rnd(0, TAU);
    x1 = clamp(player.x + Math.cos(a) * rnd(500, 800), 800, WORLD.w - 800);
    y1 = clamp(player.y + Math.sin(a) * rnd(500, 800), 800, WORLD.h - 800);
    x2 = rnd(800, WORLD.w - 800); y2 = rnd(800, WORLD.h - 800);
    tries++;
  } while ((dist2(x1, y1, x2, y2) < 4000 * 4000 || inSun(x1, y1) || inSun(x2, y2)) && tries < 20);
  wormholes.push({ x: x1, y: y1, tx: x2, ty: y2, t: 600 });   // dura 10 min: da tiempo a llegar
  story.data.wh = true;
}
function storyActivate(i) {
  story.step = i; story.prog = 0; story.data = {};
  const ch = STORY[i];
  if (!ch) return;
  for (const l of ch.lines) chatSys(l);
  notify('📜 Capítulo ' + (i + 1) + '/' + STORY.length + ': ' + ch.title, 'info', 'story', 1);
  const o = ch.obj;
  if (o.type === 'reach') story.data = storyPickPoint(!!o.final);
  else if (o.type === 'killPirates') storySpawnPirates(o.n);
  else if (o.type === 'wormhole' && !wormholes.length) storySpawnWormhole();
}
function storyComplete() {
  const ch = STORY[story.step];
  if (!ch || story.done) return;
  player.credits += ch.reward;
  notify('📜 Capítulo completado: ' + ch.title + ' (+' + ch.reward + '◈)', 'good');
  chatSys('📜 ✅ ' + ch.title + ' completada (+' + ch.reward + '◈).');
  if (ch.outro) chatSys(ch.outro);
  if (story.step >= STORY.length - 1) {
    story.done = true;
    explored.fill(1);   // recompensa final: el Mapa del Vacío revela toda la galaxia
    chatSys('🌌 LA SEÑAL DEL VACÍO — historia completada. El Mapa del Vacío revela toda la galaxia.');
    notify('🌌 ¡Historia completada! Mapa del Vacío: galaxia revelada', 'good');
  } else {
    storyActivate(story.step + 1);
  }
  saveGame();
}
function storyCheckDone() {
  const ch = STORY[story.step];
  if (ch && story.prog >= storyTarget(ch)) storyComplete();
}
// hooks: los llaman el núcleo (conquistas) y los saltos de gusano
function storyHook(ev, d) {
  if (story.done || story.step < 0) return;
  const ch = STORY[story.step];
  if (!ch) return;
  const o = ch.obj;
  if (o.type === 'conquer' && ev === 'conquer') story.prog++;
  else if (o.type === 'wormhole' && ev === 'wormhole') story.prog = 1;
  else return;
  storyCheckDone();
}
// al cargar una partida a media historia: respawn de lo transitorio (piratas, gusano)
function storyResume() {
  if (story.done || story.step < 0) return;
  const ch = STORY[story.step];
  if (!ch) return;
  if (ch.obj.type === 'killPirates') storySpawnPirates(Math.max(0, ch.obj.n - story.prog));
  if (ch.obj.type === 'wormhole' && !wormholes.length) storySpawnWormhole();
}
function storyProgressText() {
  const ch = STORY[story.step];
  if (!ch) return '';
  const o = ch.obj;
  if (o.type === 'killPirates') return 'piratas destruidos: ' + Math.min(story.prog, o.n) + '/' + o.n;
  if (o.type === 'stock') return RES_ICON[o.res] + ' acumulado: ' + Math.min(story.prog, o.n) + '/' + o.n;
  if (o.type === 'conquer') return 'planetas conquistados: ' + Math.min(story.prog, o.n) + '/' + o.n;
  if (o.type === 'wormhole') return 'salta por un agujero de gusano';
  return 'viaja a (' + Math.floor(story.data.x || 0) + ',' + Math.floor(story.data.y || 0) + ')';
}
function storyMarkerPos() {   // [x, y] del marcador ◆ actual, o null
  if (story.done || story.step < 0) return null;
  const ch = STORY[story.step];
  if (!ch) return null;
  if (ch.obj.type === 'reach' && story.data.x != null) return [story.data.x, story.data.y];
  if (ch.obj.type === 'killPirates') {
    // v2.1.1: el ◆ marca el pirata de la oleada más cercano (para encontrarlos)
    let mx = null, my = null, bd = Infinity;
    for (const b of bots) {
      if (!b.pirate || !b.alive || b.storyWave !== story.step) continue;
      const d = dist2(player.x, player.y, b.x, b.y);
      if (d < bd) { bd = d; mx = b.x; my = b.y; }
    }
    return mx == null ? null : [mx, my];
  }
  if (ch.obj.type === 'wormhole' && wormholes.length) {
    let mx = null, my = null, bd = Infinity;
    for (const w of wormholes) {
      for (const [x, y] of [[w.x, w.y], [w.tx, w.ty]]) {
        const d = dist2(player.x, player.y, x, y);
        if (d < bd) { bd = d; mx = x; my = y; }
      }
    }
    return mx == null ? null : [mx, my];
  }
  return null;
}
function missionsUpdate(dt) {
  if (story.done) {
    if (missionTrackerEl) missionTrackerEl.classList.add('hidden');
    return;
  }
  if (story.step < 0) {
    if (prepT <= 0) storyActivate(0);   // la historia arranca al acabar la preparación
    return;
  }
  const ch = STORY[story.step];
  if (!ch) return;
  const o = ch.obj;
  if (o.type === 'reach') {
    if (player.alive && story.data.x != null &&
        dist2(player.x, player.y, story.data.x, story.data.y) < 150 * 150) story.prog = 1;
  } else if (o.type === 'stock') {
    story.prog = Math.min(o.n, Math.floor(stockOf(player.color, o.res)));
  } else if (o.type === 'killPirates') {
    // v2.1.1: cuenta la oleada destruida, la mate quien la mate (jugador, flota o IA)
    let alive = 0;
    for (const b of bots) if (b.pirate && b.alive && b.storyWave === story.step) alive++;
    story.prog = o.n - alive;
  }
  storyCheckDone();
  // tracker en HUD (solo textContent: regla v0.5.3b) y progreso del panel si está abierto
  if (missionTrackerEl) {
    missionTrackerEl.classList.remove('hidden');
    missionTrackerEl.textContent = '📜 ' + (story.step + 1) + '/' + STORY.length + ' ' +
      ch.title + ' — ' + storyProgressText();
  }
  const mp = document.getElementById('mission-prog');
  if (mp && missionsEl && !missionsEl.classList.contains('hidden')) mp.textContent = storyProgressText();
}
// el marcador se dibuja ENCIMA de la niebla: la señal se conoce (landmark como los soles)
function missionsDraw() {
  const pos = storyMarkerPos();
  if (!pos) return;
  const [mx, my] = pos;
  const t = performance.now() / 1000;
  const z = Math.max(cam.zoom, 0.35);   // tamaño mínimo en el zoom de estrategia
  const pr = (26 + 7 * Math.sin(t * 3.5)) / z;
  ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3 / z;
  ctx.beginPath();
  ctx.moveTo(mx, my - pr); ctx.lineTo(mx + pr, my); ctx.lineTo(mx, my + pr); ctx.lineTo(mx - pr, my);
  ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,224,102,0.35)';
  ctx.beginPath(); ctx.arc(mx, my, pr + 14 / z, 0, TAU); ctx.stroke();
  if (cam.zoom >= 0.8) {
    ctx.fillStyle = '#ffe066'; ctx.font = (12 / cam.zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('📜 ' + STORY[story.step].title, mx, my - pr - 10 / cam.zoom);
  }
}
const _mmM = drawMinimap;
drawMinimap = function () {
  _mmM();
  const pos = storyMarkerPos();
  if (!pos) return;
  mctx.fillStyle = '#ffe066';
  mctx.fillRect(pos[0] * (150 / WORLD.w) - 1.5, pos[1] * (150 / WORLD.h) - 1.5, 3, 3);
};
function renderMissions() {
  const el = $('missions-body');
  if (!el) return;
  const rows = STORY.map((ch, i) => {
    const st = story.done || i < story.step ? '✅' : (i === story.step ? '▶' : '🔒');
    return '<div class="mchap' + (i === story.step && !story.done ? ' now' : '') + '">' + st + ' ' +
      (i + 1) + '. ' + ch.title + ' <span class="mrew">' + ch.reward + '◈</span></div>';
  }).join('');
  let body;
  if (story.done) {
    body = '<div class="contract active"><div class="ctitle">🌌 Historia completada</div>' +
      '<div class="cdesc">La baliza del Vacío te ha regalado el mapa completo de la galaxia.</div></div>';
  } else if (story.step < 0) {
    body = '<div class="contract"><div class="ctitle">📡 …</div>' +
      '<div class="cdesc">La historia empezará cuando acabe la fase de preparación.</div></div>';
  } else {
    const ch = STORY[story.step];
    body = '<div class="contract active"><div class="ctitle">▶ ' + ch.title + '</div>' +
      '<div class="cdesc">' + ch.brief + '</div>' +
      '<div class="cprog"><span id="mission-prog">' + storyProgressText() + '</span> · ' + ch.reward + '◈</div></div>';
  }
  el.innerHTML = body + '<h4 class="panel-sub2">LA SEÑAL DEL VACÍO</h4>' + rows;
}
// enganches al motor (patrón de wrappers)
const _onPlayerKillM = onPlayerKill;
onPlayerKill = function (victim) { _onPlayerKillM(victim); storyHook('kill', victim); };
const _onPlanetCapturedM = onPlanetCaptured;
onPlanetCaptured = function () { _onPlanetCapturedM(); storyHook('conquer'); };
const _drawM = draw;
draw = function () { _drawM(); missionsDraw(); };   // encima de la niebla
const _updateM = update;
update = function (dt) { _updateM(dt); missionsUpdate(dt); };
addEventListener('keydown', e => {
  if (document.activeElement === chatInput) return;
  if (e.key.toLowerCase() === 'j') toggleGamePanel('missions');
});
