/* =========================================================
   PIXEL FLEET — motor del juego (v0.7)
   Conquista de planetas · economía · combate · chat
   Flota real construible · control RTS de flota (selección por
   cuadro + órdenes) · persistencia total (save v2)
   Multijugador simulado localmente + servidor WS preparado.
   ========================================================= */

const WORLD = { w: 8000, h: 8000 };
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
const player = {
  name: 'PilotoAnónimo',
  color: FACTION_COLORS[0],
  x: WORLD.w / 2, y: WORLD.h / 2,
  angle: 0, vx: 0, vy: 0,
  hp: 5, maxHp: 5, alive: true,
  fuel: 100, maxFuel: 100,
  credits: 0, kills: 0, deaths: 0,
  invuln: 2, respawnT: 0, shootCd: 0,
  upgrades: { motor: 0, cadencia: 0, blindaje: 0, deposito: 0 },
  ship: 'caza',                 // modelo actual (catálogo SHIPS, v0.6)
};

/* ---------- sprites pixel-art ---------- */
const SHIP_SPRITE = [
  '........',
  '..#.....',
  '.###....',
  '#####...',
  '#####.#.',
  '#####...',
  '.###....',
  '..#.....',
];
function makeShipSprite(color) {
  const s = document.createElement('canvas');
  s.width = 8; s.height = 8;
  const c = s.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    c.fillStyle = SHIP_SPRITE[y][x] === '#' ? color : '#0a1628';
    c.fillRect(x, y, 1, 1);
  }
  c.fillStyle = '#ffffff'; c.fillRect(4, 3, 1, 1);
  return s;
}
const shipCache = {};
const shipSprite = color => shipCache[color] || (shipCache[color] = makeShipSprite(color));

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

/* ---------- generación del mundo ---------- */
// v0.6: mundo DETERMINISTA — mismo universo en cada carga (base de la persistencia)
const rngWorld = mulberry32(1234567);
const rndW  = (a, b) => a + rngWorld() * (b - a);
const rndiW = (a, b) => Math.floor(rndW(a, b + 1));
const planets = [];
for (let i = 0; i < 48; i++) {
  const r = rndiW(24, 70);
  planets.push({
    x: rndW(r * 2, WORLD.w - r * 2),
    y: rndW(r * 2, WORLD.h - r * 2),
    r,
    sprite: makePlanet(r, rngWorld),
    name: 'P-' + rndiW(100, 999),
    owner: null,        // color de facción o null
    capture: 0,         // progreso 0..1
    capturer: null,     // facción que está capturando
    shield: 0,          // puntos de escudo (solo planetas con dueño)
    shieldMax: 25,
  });
}
// algunos planetas pre-conquistados por facciones para dar vida a la galaxia
// (también deterministas: mismas pre-conquistas en cada partida nueva)
for (let i = 0; i < 10; i++) {
  const p = planets[rndiW(0, planets.length - 1)];
  p.owner = FACTION_COLORS[rndiW(1, FACTION_COLORS.length - 1)];
  p.shield = p.shieldMax;   // planetas conquistados nacen con escudo
}

// estrellas (3 capas de parallax)
const starLayers = [];
for (let L = 0; L < 3; L++) {
  const rs = mulberry32(999 + L);
  const stars = [];
  for (let i = 0; i < 220 + L * 140; i++) stars.push({ x: rs() * WORLD.w, y: rs() * WORLD.h });
  starLayers.push({ stars, par: 0.25 + L * 0.3 });
}

/* ---------- bots (pilotos simulados) ---------- */
const BOT_NAMES = ['Xx_Nova_xX', 'Zorg', 'PixelLord', 'Andromeda', 'Vega', 'CapitánFalkor',
  'Nebulosa', 'R2-Juan', 'Estelar', 'Troya', 'Quasar', 'Lyra', 'Orion', 'NovaPrime',
  'Astra', 'Cometa', 'Pulsar', 'Halley', 'Sagan', 'Kepler', 'Hubble', 'Cosmos',
  'Warp9', 'Eclipse', 'Foton', 'Gravedad', 'Zenith', 'Atlas', 'Rigel', 'Sirio'];
const bots = [];
function spawnBot(anywhere) {
  // v0.6: ningún bot aleatorio es del color del jugador — toda nave de tu
  // color en pantalla eres tú, un wingman tuyo u otro jugador real
  const pool = FACTION_COLORS.filter(c => c !== player.color);
  const color = pool[rndi(0, pool.length - 1)];
  const b = {
    name: BOT_NAMES[rndi(0, BOT_NAMES.length - 1)] + '_' + rndi(10, 99),
    color,
    x: rnd(0, WORLD.w),
    y: rnd(0, WORLD.h),
    angle: rnd(0, TAU), speed: rnd(18, 42),   // v0.5.2: bots más lentos
    waypoint: null, hp: 3, alive: true, respawnT: 0,
    shootCd: rnd(0.5, 2), credits: rndi(30, 70), kills: 0,   // v0.5.3: todos empiezan igual
    vx: 0, vy: 0, flash: 0,
    home: null, expandR: 1500,   // v0.5: cada bot expande desde su capital
  };
  b.x = clamp(b.x, 20, WORLD.w - 20);
  b.y = clamp(b.y, 20, WORLD.h - 20);
  bots.push(b);
  return b;
}
// v0.6: los bots se generan al empezar PARTIDA NUEVA (con el color del jugador
// ya elegido). Al continuar partida, vienen del save.
function initBots() {
  bots.length = 0;
  for (let i = 0; i < 240; i++) spawnBot(true);
  // v0.5: asignar a cada bot una "capital" y empezar cerca de ella (no junto al jugador)
  for (const b of bots) {
    const owned = planets.filter(p => p.owner === b.color);
    b.home = owned.length ? owned[rndi(0, owned.length - 1)]
                          : planets[rndi(0, planets.length - 1)];
    b.x = clamp(b.home.x + rnd(-700, 700), 20, WORLD.w - 20);
    b.y = clamp(b.home.y + rnd(-700, 700), 20, WORLD.h - 20);
  }
}

/* ---------- proyectiles y partículas ---------- */
const projectiles = [];
const particles = [];
function shoot(x, y, angle, color, owner) {
  projectiles.push({
    x, y,
    vx: Math.cos(angle) * 300, vy: Math.sin(angle) * 300,   // v0.5.2: proyectiles más lentos
    color, owner, life: 1.4,
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
  if (k === 'enter') { chatInput.style.display = 'block'; chatInput.focus(); e.preventDefault(); }
  if (k === 'm' && inGame) backToMenu();
});
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
  if (selection.size) { orderMoveTo(e.clientX, e.clientY); return; }
  mouse.down = true;
});
addEventListener('mouseup',   () => { mouse.down = false; if (selectBox) selFinish(); });
// zoom estratégico con la rueda del ratón
addEventListener('wheel', e => {
  if (!inGame) return;
  cam.zoomTarget = clamp(cam.zoomTarget * Math.pow(1.2, -e.deltaY / 100), ZMIN, ZMAX);
}, { passive: true });

/* ---------- cámara ---------- */
const cam = { x: player.x, y: player.y, zoom: 1, zoomTarget: 1 };

/* ---------- v0.5: fase de preparación y capital ---------- */
let prepT = 0;                 // segundos restantes de preparación (0 = fase superada)
let playerCapital = null;      // planeta capital del jugador
const prepBanner = document.getElementById('prep-banner');

/* =========================================================
   LÓGICA DE ACTUALIZACIÓN
   ========================================================= */
const CAPTURE_RANGE_EXTRA = 24;
const CAPTURE_TIME = 6;      // segundos para capturar (v0.5.2: conquista más pausada)
const KILL_REWARD = 25;
const PLANET_INCOME = 1;       // créditos/s por planeta propio

function damageShip(ship, dmg, killer) {
  if (ship === player && player.invuln > 0) return;
  ship.hp -= dmg;
  ship.flash = 0.15;
  // diplomacia: que te disparen empeora la relación con esa facción
  if (ship === player && killer && killer.color && killer !== player) {
    changeStanding(killer.color, -6);
  }
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
    } else {
      if (ship.built) {
        const sn = (SHIPS.find(s => s.id === ship.shipType) || SHIPS[0]).name;
        chatSys('💥 Has perdido a ' + ship.name + ' (' + sn + '). Las naves construidas no se reponen.');
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
  ship.hp = ship === player ? player.maxHp : 3;
  ship.alive = true;
  ship.vx = ship.vy = 0;
  if (ship === player) player.invuln = 2;
}

function update(dt) {
  /* --- jugador --- */
  if (player.alive) {
    const boosting = keys[' '] && player.fuel > 0;
    const accel = 130 * getShipMod().accel * (1 + 0.15 * player.upgrades.motor) * (boosting ? 2.2 : 1);   // v0.5.2: ritmo más pausado
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
      shoot(player.x + Math.cos(player.angle) * 8, player.y + Math.sin(player.angle) * 8, player.angle, player.color, player);
      player.shootCd = 0.22 * getShipMod().rof / (1 + 0.25 * player.upgrades.cadencia);
      net.sendShoot();
    }

    // combustible
    if (boosting) player.fuel = Math.max(0, player.fuel - 22 * dt);
    else {
      let regen = 6;
      for (const p of planets) {
        if (p.owner === player.color && dist2(p.x, p.y, player.x, player.y) < (p.r + 60) ** 2) { regen = 30; break; }
      }
      player.fuel = Math.min(player.maxFuel, player.fuel + regen * dt);
    }
    player.invuln = Math.max(0, player.invuln - dt);
    player.flash = Math.max(0, (player.flash || 0) - dt);
  } else {
    player.respawnT -= dt;
    if (player.respawnT <= 0) respawnShip(player);
  }

  /* --- bots --- */
  // v0.5.3: economía igualada — cada bot produce como tú (su capital + planetas de su facción)
  const facPlanets = {};
  for (const p of planets) if (p.owner) facPlanets[p.owner] = (facPlanets[p.owner] || 0) + 1;
  for (const b of bots) {
    // v0.5.1: las naves construidas se pierden de verdad (no reaparecen)
    if (!b.alive && b.built) { b.gone = true; continue; }
    if (!b.alive) { b.respawnT -= dt; if (b.respawnT <= 0) respawnShip(b); continue; }
    // v0.6: los wingmen (tus naves construidas) tienen su propia IA
    if (b.built) { wingmanUpdate(b, dt); continue; }
    // v0.5: expansión lenta desde su capital
    b.expandR = Math.min(4000, b.expandR + 1.5 * dt);
    if (!b.waypoint || dist2(b.x, b.y, b.waypoint.x, b.waypoint.y) < 900) {
      let wxp, wyp, tries = 0;
      do {
        wxp = clamp(b.home.x + rnd(-b.expandR, b.expandR), 20, WORLD.w - 20);
        wyp = clamp(b.home.y + rnd(-b.expandR, b.expandR), 20, WORLD.h - 20);
        tries++;
        // durante la preparación, los bots no entran en el radio de tu capital
      } while (prepT > 0 && playerCapital && tries < 6 &&
               dist2(wxp, wyp, playerCapital.x, playerCapital.y) < 2200 * 2200);
      b.waypoint = { x: wxp, y: wyp };
    }
    const wa = Math.atan2(b.waypoint.y - b.y, b.waypoint.x - b.x);
    b.angle = angleLerp(b.angle, wa, 1 - Math.pow(0.05, dt));
    b.x = clamp(b.x + Math.cos(b.angle) * b.speed * dt, 20, WORLD.w - 20);
    b.y = clamp(b.y + Math.sin(b.angle) * b.speed * dt, 20, WORLD.h - 20);
    b.flash = Math.max(0, b.flash - dt);
    b.credits += (PLANET_INCOME * 3 + 0.25 * (facPlanets[b.color] || 0)) * dt; // v0.5.3: mismas reglas que el jugador

    // IA de combate: disparar si el jugador (u otro bot) está cerca y a la vista
    b.shootCd -= dt;
    if (b.shootCd <= 0) {
      // diplomacia: solo te atacan si la facción está hostil (guerra = más alcance y agresividad)
      const st = standings[b.color] || 0;
      const hostile = st <= -10;
      const war = st <= -30;
      let tgt = null, td = (war ? 520 : 340) ** 2;
      if (hostile && prepT <= 0 && player.alive && player.invuln <= 0) {
        const d = dist2(b.x, b.y, player.x, player.y);
        if (d < td) { td = d; tgt = player; }
      }
      // v0.5.3: durante la preparación nadie pelea (inicio tranquilo y economía justa)
      if (!tgt && prepT <= 0 && Math.random() < 0.4) {
        for (const o of bots) {
          if (o === b || !o.alive || o.color === b.color) continue;   // v0.5.2: nada de fuego amigo
          const d = dist2(b.x, b.y, o.x, o.y);
          if (d < td * 0.5) { td = d; tgt = o; }
        }
      }
      if (tgt) {
        const ta = Math.atan2(tgt.y - b.y, tgt.x - b.x) + rnd(-0.15, 0.15);
        shoot(b.x + Math.cos(ta) * 8, b.y + Math.sin(ta) * 8, ta, b.color, b);
        b.shootCd = war ? rnd(0.7, 1.5) : rnd(1.1, 2.4);
      } else b.shootCd = war ? 0.25 : 0.4;
    }
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
        damageShip(player, 1, pr.owner); dead = true;
      }
      // colisión con bots (mismo color = misma facción = inmune)
      if (!dead) for (const b of bots) {
        if (b === pr.owner || !b.alive || b.color === pr.color) continue;
        if (dist2(pr.x, pr.y, b.x, b.y) < 49) { damageShip(b, 1, pr.owner); dead = true; break; }
      }
      // minería: los proyectiles dañan asteroides
      if (!dead) for (const a of asteroids) {
        if (!a.alive) continue;
        if (dist2(pr.x, pr.y, a.x, a.y) < (a.r + 2) ** 2) {
          a.hp--; dead = true;
          if (a.hp <= 0) {
            a.alive = false; a.respawnT = rnd(20, 40);
            explode(a.x, a.y, '#a0aec0');
            if (pr.owner === player) {
              player.credits += 3; player.fuel = Math.min(player.maxFuel, player.fuel + 8);
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
        if (dist2(pr.x, pr.y, p.x, p.y) < (p.r + 4) ** 2) {
          // v0.5: durante la preparación la capital es invulnerable
          if (prepT > 0 && p === playerCapital) {
            particles.push({ x: pr.x, y: pr.y, vx: rnd(-50, 50), vy: rnd(-50, 50), life: 0.25, color: '#8aff80' });
            dead = true; break;
          }
          p.shield--;
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
    for (const b of bots) {
      if (!b.alive) continue;
      if (dist2(p.x, p.y, b.x, b.y) < range) {
        botsHere++;
        if (botColor && botColor !== b.color) contested = true;
        botColor = b.color;
      }
    }
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
          } else if (was === player.color) {
            changeStanding(faction, -25);
            chatSys('⚠️ ' + p.name + ' ha caído en manos de la facción ' + faction);
          }
        }
      } else { p.capture = 0; p.capturer = null; }
    } else { p.capture = Math.max(0, p.capture - dt / CAPTURE_TIME); if (!p.capture) p.capturer = null; }
  }

  // ingresos por planetas propios (la capital produce ×3)
  let income = 0;
  for (const p of planets) if (p.owner === player.color) income += (p === playerCapital ? PLANET_INCOME * 3 : PLANET_INCOME);
  player.credits += income * dt;

  /* --- cámara y red --- */
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

  // planetas
  for (const p of planets) {
    if (p.x < vL - p.r * 2 || p.x > vR + p.r * 2 || p.y < vT - p.r * 2 || p.y > vB + p.r * 2) continue;
    if (strat) {
      // mapa de estrategia: círculo con color de facción, sin detalle pixel
      ctx.fillStyle = p.owner || '#44557a';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      if (p.shield > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10 / z, -Math.PI / 2, -Math.PI / 2 + (p.shield / p.shieldMax) * TAU); ctx.stroke();
      }
      if (p.capture > 0 && p.capturer) {
        ctx.strokeStyle = p.capturer; ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 20 / z, -Math.PI / 2, -Math.PI / 2 + p.capture * TAU); ctx.stroke();
      }
      if (p === playerCapital) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 34 / z, 0, TAU); ctx.stroke();
      }
      continue;
    }
    // render pixel-art (zoom cercano)
    if (p.owner) {
      ctx.strokeStyle = p.owner; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, TAU); ctx.stroke();
      // v0.4: arco de escudo proporcional a los puntos restantes
      if (p.shield > 0) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8, -Math.PI / 2, -Math.PI / 2 + (p.shield / p.shieldMax) * TAU); ctx.stroke();
      }
    }
    // progreso de captura
    if (p.capture > 0 && p.capturer) {
      ctx.strokeStyle = p.capturer; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + p.capture * TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(126,249,255,0.06)';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8, 0, TAU); ctx.fill();
    ctx.drawImage(p.sprite, p.x - p.r, p.y - p.r);
    if (z >= 0.8 && dist2(p.x, p.y, player.x, player.y) < 700 * 700) {
      ctx.font = (6 / z) + 'px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = p.owner || '#8fa8d0';
      ctx.fillText(p.name + (p.owner ? ' ●' : '') + (p === playerCapital ? ' ★' : ''), p.x, p.y - p.r - 4 / z);
    }
  }

  // bots
  for (const b of bots) {
    if (!b.alive) continue;
    if (b.x < vL - 60 || b.x > vR + 60 || b.y < vT - 60 || b.y > vB + 60) continue;
    if (strat) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - 1.5 / z, b.y - 1.5 / z, 3 / z, 3 / z);
    } else {
      const sz = b.built ? 3 * shipDef(b.shipType).size : 3;
      drawShipWithHalo(b.x, b.y, b.angle, b.color, sz, 0.75, b.flash > 0);
    }
  }

  // jugadores remotos (multijugador real)
  for (const r of net.remotes.values()) {
    if (r.x < vL - 60 || r.x > vR + 60 || r.y < vT - 60 || r.y > vB + 60) continue;
    if (strat) {
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x - 1.5 / z, r.y - 1.5 / z, 3 / z, 3 / z);
      continue;
    }
    drawShipWithHalo(r.x, r.y, r.a, r.color, 4, 1, false);
    if (z >= 0.8) {
      ctx.fillStyle = r.color; ctx.font = (6 / z) + 'px monospace'; ctx.textAlign = 'center';
      ctx.fillText(r.name, r.x, r.y - 14 / z);
    }
  }

  // proyectiles y partículas (solo en zoom cercano: a escala de mapa son ruido)
  if (!strat) {
    for (const pr of projectiles) {
      if (pr.x < vL - 4 || pr.x > vR + 4 || pr.y < vT - 4 || pr.y > vB + 4) continue;
      ctx.fillStyle = pr.color;
      ctx.fillRect(pr.x - 1, pr.y - 1, 3, 3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(pr.x, pr.y, 1, 1);
    }
    for (const pa of particles) {
      if (pa.x < vL - 4 || pa.x > vR + 4 || pa.y < vT - 4 || pa.y > vB + 4) continue;
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
      const moving = Math.abs(player.vx) + Math.abs(player.vy) > 30;
      drawShipWithHalo(player.x, player.y, player.angle, player.color, 4 * getShipMod().size, player.invuln > 0 ? 0.5 + 0.4 * Math.sin(performance.now() / 60) : 1, moving || undefined, player.flash > 0);
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
      ctx.fillText('🛰️ ' + selection.size + ' seleccionada(s) · CLIC: mover · CLIC DERECHO: órdenes · ESC: soltar', VW / 2, VH - 4);
    }
    // restaurar el transform de mundo: los wrappers posteriores (asteroides) lo necesitan
    ctx.setTransform(z, 0, 0, z, VW / 2 - cam.x * z, VH / 2 - cam.y * z);
  }
}

function drawShipWithHalo(x, y, angle, color, size, alpha, thrust, flash) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // halo direccional
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, size + 5, angle - 0.9, angle + 0.9); ctx.stroke();
  ctx.globalAlpha = alpha * 0.35;
  ctx.beginPath(); ctx.arc(x, y, size + 8, angle - 0.5, angle + 0.5); ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (flash) { ctx.globalAlpha = 0.4; }
  ctx.drawImage(shipSprite(color), -4, -4);
  if (thrust) {
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-6 - rndi(0, 1), 0, 2, 1);
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
  for (const p of planets) {
    mctx.fillStyle = p.owner || '#44557a';
    mctx.fillRect(p.x * k, p.y * k, 2, 2);
  }
  mctx.fillStyle = '#8fa8d0';
  for (const b of bots) if (b.alive) mctx.fillRect(b.x * k, b.y * k, 1, 1);
  for (const r of net.remotes.values()) {
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
  const rows = [{ name: player.name + ' (tú)', credits: Math.floor(player.credits), kills: player.kills, me: true, color: player.color }];
  for (const b of bots) if (b.alive) rows.push({ name: b.name, credits: Math.floor(b.credits), kills: b.kills || 0, me: false, color: b.color });
  for (const r of net.remotes.values()) rows.push({ name: r.name, credits: r.credits | 0, kills: r.kills || 0, me: false, color: r.color });
  rows.sort((a, b) => b.credits - a.credits);
  const list = document.getElementById('board-list');
  list.innerHTML = rows.slice(0, 8).map(r =>
    `<li class="${r.me ? 'me' : ''}"><span style="color:${r.color}">${r.name}</span><span class="c">◈${r.credits} 💀${r.kills}</span></li>`
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
  initBots();
  // v0.5: elegir planeta CAPITAL — uno neutral lejos de otros dueños
  let cap = null, bestD = -1;
  for (let i = 0; i < 40; i++) {
    const p = planets[rndi(0, planets.length - 1)];
    if (p.owner) continue;
    let dmin = Infinity;
    for (const q of planets) if (q.owner) dmin = Math.min(dmin, dist2(p.x, p.y, q.x, q.y));
    if (dmin > bestD) { bestD = dmin; cap = p; }
    if (bestD > 1500 * 1500) break;
  }
  if (!cap) cap = planets.find(p => !p.owner) || planets[0];
  playerCapital = cap;
  cap.owner = player.color;
  cap.capital = true;
  cap.shieldMax = 100; cap.shield = 100;   // escudo grande de capital
  cap.name = 'CAPITAL ' + player.name;
  const sa = rnd(0, TAU);
  player.x = clamp(cap.x + Math.cos(sa) * (cap.r + 90), 16, WORLD.w - 16);
  player.y = clamp(cap.y + Math.sin(sa) * (cap.r + 90), 16, WORLD.h - 16);
  cam.x = player.x; cam.y = player.y;
  prepT = 300;   // 5 minutos de preparación protegida
  // v0.5.1: inicio tranquilo — ningún bot tiene su hogar cerca de tu capital
  // ni aparece en tu zona. Empiezas solo; tu flota se construye en la capital.
  for (const b of bots) {
    if (dist2(b.home.x, b.home.y, cap.x, cap.y) < 2600 * 2600) {
      let nh = b.home, tries = 0;
      do { nh = planets[rndi(0, planets.length - 1)]; tries++; }
      while (dist2(nh.x, nh.y, cap.x, cap.y) < 2600 * 2600 && tries < 20);
      b.home = nh;
    }
    if (dist2(b.x, b.y, cap.x, cap.y) < 2200 * 2200) {
      b.x = clamp(b.home.x + rnd(-700, 700), 20, WORLD.w - 20);
      b.y = clamp(b.home.y + rnd(-700, 700), 20, WORLD.h - 20);
      b.waypoint = null;
    }
  }
  // v0.6: partida nueva — 1 caza (tu nave), hangar vacío, fondos iniciales
  player.ship = 'caza';
  hangarShips.length = 0;
  buildQueue.length = 0;
  applyUpgrades();
  player.hp = player.maxHp; player.fuel = player.maxFuel;
  if (player.credits < 40) player.credits = 40;   // fondos iniciales
  tutStep = 0; tutT = 0; tutorialOn = true;       // tutorial solo en partida nueva
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
  for (let i = 0; i < 14; i++) {              // 14 campos de asteroides
    const cx = ra() * WORLD.w, cy = ra() * WORLD.h;
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
  { key: 'blindaje', name: 'Blindaje',  desc: '+1 punto de vida',       base: 80 },
  { key: 'deposito', name: 'Depósito',  desc: '+25 de combustible',     base: 40 },
];
const MAX_UPG = 5;
const upgCost = it => Math.floor(it.base * (player.upgrades[it.key] + 1) * 1.4);
function applyUpgrades() {
  player.maxHp   = 5 + player.upgrades.blindaje;
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
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
}
function saveGame() {
  if (!inGame || !playerCapital) return;   // nunca pisar el save desde el menú
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 2,
      player: {
        name: player.name, color: player.color,
        x: player.x, y: player.y, angle: player.angle,
        hp: player.hp, fuel: player.fuel,
        credits: Math.floor(player.credits), kills: player.kills, deaths: player.deaths,
        upgrades: player.upgrades, ship: player.ship,
      },
      capitalIdx: planets.indexOf(playerCapital),
      prepT: Math.max(0, prepT),
      // solo planetas con dueño (los neutros son el estado inicial determinista)
      planets: planets.map((p, i) => p.owner ? { i, owner: p.owner, shield: p.shield } : null).filter(Boolean),
      bots: bots.map(b => ({
        name: b.name, color: b.color, x: b.x, y: b.y,
        hp: b.hp, credits: Math.floor(b.credits), kills: b.kills || 0,
        homeIdx: planets.indexOf(b.home), expandR: b.expandR,
        alive: b.alive, built: !!b.built, role: b.role || null, shipType: b.shipType || null,
        ox: b.ox ?? null, oy: b.oy ?? null, oplanet: b.oplanet ?? null,   // v0.7: orden activa
      })),
      hangarShips: hangarShips.slice(),
      buildQueue: buildQueue.map(q => ({ type: q.type, t: q.t })),
      standings,
      contracts: { offers: contracts.offers, active: contracts.active, seq: contracts.seq },
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
  player.kills = d.player.kills || 0;
  player.deaths = d.player.deaths || 0;
  Object.assign(player.upgrades, d.player.upgrades || {});
  player.ship = d.player.ship || 'caza';
  // mundo: reset dinámico sobre el universo determinista
  for (const p of planets) {
    p.owner = null; p.shield = 0; p.shieldMax = 25;
    p.capture = 0; p.capturer = null; p.capital = false;
  }
  playerCapital = planets[d.capitalIdx] || null;
  if (playerCapital) {
    playerCapital.capital = true;
    playerCapital.shieldMax = 100;   // antes de aplicar escudos guardados
    playerCapital.name = 'CAPITAL ' + player.name;
  }
  for (const sp of d.planets || []) {
    const p = planets[sp.i];
    if (!p) continue;
    p.owner = sp.owner; p.shield = sp.shield;
  }
  // bots (incluye wingmen del jugador: built/role/shipType)
  bots.length = 0;
  for (const sb of d.bots || []) {
    const b = {
      name: sb.name, color: sb.color,
      x: clamp(sb.x, 20, WORLD.w - 20), y: clamp(sb.y, 20, WORLD.h - 20),
      angle: rnd(0, TAU), speed: rnd(18, 42), waypoint: null,
      hp: sb.hp, alive: sb.alive !== false, respawnT: 0,
      shootCd: rnd(0.5, 2), credits: sb.credits || 0, kills: sb.kills || 0,
      vx: 0, vy: 0, flash: 0,
      home: planets[sb.homeIdx] || planets[0], expandR: sb.expandR || 1500,
    };
    if (b.alive === false) b.respawnT = rnd(3, 6);
    if (sb.built) {
      b.built = true; b.role = sb.role || 'defend'; b.shipType = sb.shipType || 'caza';
      b.speed = 42; b.home = playerCapital || b.home; b.uid = ++wingUid;
      b.maxHp = 3 + ((SHIPS.find(s => s.id === b.shipType) || SHIPS[0]).hp);
      b.ox = sb.ox ?? null; b.oy = sb.oy ?? null; b.oplanet = sb.oplanet ?? null;   // v0.7
    }
    bots.push(b);
  }
  // flota y cola de construcción
  hangarShips.length = 0;
  for (const t of d.hangarShips || []) hangarShips.push(t);
  buildQueue.length = 0;
  for (const q of d.buildQueue || []) buildQueue.push({ type: q.type, t: q.t });
  // diplomacia y contratos
  if (d.standings) Object.assign(standings, d.standings);
  if (d.contracts) {
    contracts.offers = d.contracts.offers || [];
    contracts.active = d.contracts.active || [];
    contracts.seq = d.contracts.seq || 1;
  }
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
}
function renderDiplo() {
  document.getElementById('diplo-list').innerHTML = FACTION_COLORS
    .filter(c => c !== player.color)
    .map(c => {
      const v = standings[c];
      const [label, col] = relationLabel(v);
      return `<div class="diplo-row">
        <div class="dot" style="background:${c}"></div>
        <div class="name">${c}<span class="rel-status">${Math.round(v)} · ${label}</span></div>
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
  if (k === 'b') { shopEl.classList.toggle('hidden'); diploEl.classList.add('hidden'); renderShop(); }
  if (k === 'f') { diploEl.classList.toggle('hidden'); shopEl.classList.add('hidden'); renderDiplo(); }
  if (k === 'escape') { shopEl.classList.add('hidden'); diploEl.classList.add('hidden'); }
});

/* ---------- enganche al motor (wrappers) ---------- */
const _update = update;
update = function (dt) {
  asteroidsUpdate(dt);
  // deriva diplomática: las relaciones hostiles se suavizan lentamente hacia la paz
  for (const c of FACTION_COLORS) {
    if (c !== player.color && standings[c] < 0) standings[c] = Math.min(0, standings[c] + 0.25 * dt);
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
  }
};
const _draw = draw;
draw = function () { _draw(); asteroidsDraw(); };
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
const SHIPS = [
  { id: 'caza',       name: 'Caza',       desc: 'Equilibrado',                  cost: 60,  buildTime: 15, accel: 1.0,  rof: 1.0,  hp: 0,  fuel: 1.0, size: 1.0 },
  { id: 'avispa',     name: 'Avispa',     desc: 'Muy rápida, frágil',           cost: 150, buildTime: 25, accel: 1.35, rof: 0.85, hp: -1, fuel: 1.0, size: 0.9 },
  { id: 'acorazado',  name: 'Acorazado',  desc: 'Lento, +3 blindaje',           cost: 300, buildTime: 40, accel: 0.8,  rof: 1.3,  hp: 3,  fuel: 1.0, size: 1.2 },
  { id: 'explorador', name: 'Explorador', desc: 'Depósito de combustible ×1.6', cost: 200, buildTime: 30, accel: 1.05, rof: 1.0,  hp: 0,  fuel: 1.6, size: 1.0 },
];
const shipDef = id => SHIPS.find(s => s.id === id) || SHIPS[0];
function getShipMod() { return shipDef(player.ship); }

// aplicar modificadores del modelo sobre las mejoras
const _applyUpg = applyUpgrades;
applyUpgrades = function () {
  _applyUpg();
  const m = getShipMod();
  player.maxHp   = 5 + player.upgrades.blindaje + m.hp;
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
  $('hangar-build').innerHTML = SHIPS.map(s =>
    `<div class="hangar-item"><div class="info"><b>${s.name}</b><span>${s.desc} · ${s.buildTime}s</span></div>
     <button data-build="${s.id}">${s.cost}◈</button></div>`).join('');
  const fleet = bots.filter(b => b.built);
  $('hangar-fleet').innerHTML = fleet.length ? fleet.map(b =>
    `<div class="hangar-item"><div class="info"><b>${b.name}</b><span>${shipDef(b.shipType).name} · <span data-hp="${b.uid}">${Math.ceil(b.hp)}</span> HP · ${roleLabel(b)}</span></div>
     <div class="acts">
       <button data-fact="follow" data-uid="${b.uid}" ${b.role === 'follow' ? 'disabled' : ''}>SEGUIR</button>
       <button data-fact="defend" data-uid="${b.uid}" ${b.role === 'defend' ? 'disabled' : ''}>DEFENDER</button>
       <button data-fact="recall" data-uid="${b.uid}">RECOGER</button>
     </div></div>`).join('')
    : '<div class="hangar-empty">Sin naves desplegadas</div>';
  $('hangar-store').innerHTML = hangarShips.length ? hangarShips.map((t, i) =>
    `<div class="hangar-item"><div class="info"><b>${shipDef(t).name}</b><span>${shipDef(t).desc}</span></div>
     <div class="acts">
       <button data-hact="follow" data-hi="${i}">SEGUIRME</button>
       <button data-hact="garrison" data-hi="${i}">GUARNICIÓN</button>
       <button data-hact="defend" data-hi="${i}">DEFENDER</button>
       <button data-hact="pilot" data-hi="${i}">PILOTAR</button>
     </div></div>`).join('')
    : '<div class="hangar-empty">Hangar vacío: construye naves arriba</div>';
  hangarEl.querySelectorAll('button[data-build]').forEach(btn => btn.onclick = () => { queueShip(btn.dataset.build); renderHangar(); });
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
  $('hangar-hstat').textContent = hangarShips.length + '/' + HANGAR_MAX;
  $('hangar-where').textContent = nearCapital() ? '' : ' · ⚠ solo junto a tu capital';
  const near = nearCapital();
  hangarEl.querySelectorAll('button[data-build]').forEach(btn => {
    const s = shipDef(btn.dataset.build);
    btn.disabled = !near || player.credits < s.cost || hangarShips.length + buildQueue.length >= HANGAR_MAX;
  });
  hangarEl.querySelectorAll('button[data-hact]').forEach(btn => {
    btn.disabled = btn.dataset.hact === 'pilot' ? !near : (!near || fleetCount() >= fleetMax());
  });
  hangarEl.querySelectorAll('span[data-hp]').forEach(sp => {
    const b = bots.find(o => o.uid === +sp.dataset.hp);
    if (b) sp.textContent = Math.max(0, Math.ceil(b.hp));
  });
}
addEventListener('keydown', e => {
  if (document.activeElement === chatInput) return;
  const k = e.key.toLowerCase();
  if (k === 'c') { contractsEl.classList.toggle('hidden'); hangarEl.classList.add('hidden'); renderContracts(); }
  if (k === 'h') { hangarEl.classList.toggle('hidden'); contractsEl.classList.add('hidden'); renderHangar(); }
  if (k === 'escape') { contractsEl.classList.add('hidden'); hangarEl.classList.add('hidden'); }
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
   atrás), van al HANGAR (máx. 10) y desde ahí se despliegan
   con un rol: SEGUIRME / DEFENDER CAPITAL (flota activa limitada
   por tu imperio: 2 + 1 por planeta propio). RECOGER las devuelve
   al hangar. PILOTAR te cambia
   a esa nave. Si caen, se pierden de verdad (built/gone).
   ========================================================= */
const HANGAR_MAX = 10;
// la flota activa escala con tu imperio: 2 + 1 por planeta propio
function fleetMax() { return 2 + planets.filter(p => p.owner === player.color).length; }
let hangarShips = [];      // ids de SHIPS guardados en la capital
const buildQueue = [];     // {type, t} — segundos restantes del primero
let wingUid = 0;
function nearCapital() {
  return playerCapital && player.alive &&
    dist2(player.x, player.y, playerCapital.x, playerCapital.y) < (playerCapital.r + 300) ** 2;
}
function fleetCount() { return bots.filter(b => b.built).length; }
function queueShip(type) {
  const s = shipDef(type);
  if (!playerCapital) return;
  if (!nearCapital()) { chatSys('🏗️ Debes estar junto a tu capital para construir.'); return; }
  if (hangarShips.length + buildQueue.length >= HANGAR_MAX) { chatSys('🏗️ Hangar lleno (' + HANGAR_MAX + ' naves).'); return; }
  if (player.credits < s.cost) { chatSys('◈ Necesitas ' + s.cost + '◈ para construir un ' + s.name + '.'); return; }
  player.credits -= s.cost;
  buildQueue.push({ type, t: s.buildTime });
  chatSys('🏗️ Construyendo ' + s.name + ' en la capital (' + s.buildTime + 's)…');
  saveGame();
}
function buildUpdate(dt) {
  if (!buildQueue.length || !playerCapital) return;
  buildQueue[0].t -= dt;
  if (buildQueue[0].t > 0) return;
  const item = buildQueue.shift();
  hangarShips.push(item.type);   // la nave va AL HANGAR: la despliegas tú
  chatSys('🛰️ ' + shipDef(item.type).name + ' construido y en el hangar (' + hangarShips.length + '/' + HANGAR_MAX + ')');
  // evento discreto: si el hangar está abierto, se re-renderiza (regla v0.5.3b)
  if (typeof hangarEl !== 'undefined' && !hangarEl.classList.contains('hidden')) renderHangar();
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
    hp: 3 + mod.hp, maxHp: 3 + mod.hp, alive: true, respawnT: 0,
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
  if (!nearCapital()) { chatSys('🚀 Solo puedes desplegar naves junto a tu capital.'); return; }
  if (fleetCount() >= fleetMax()) { chatSys('🚀 Flota activa al máximo (' + fleetMax() + ' naves: conquista planetas para ampliarla).'); return; }
  const type = hangarShips[hi];
  if (!type) return;
  hangarShips.splice(hi, 1);
  const b = makeWingman(type, role);
  const roleMsg = { defend: 'defendiendo la capital', garrison: 'en guarnición sobre tu capital', follow: 'en formación contigo' };
  chatSys('🚀 ' + b.name + ' desplegado: ' + (roleMsg[role] || 'en formación contigo') +
    ' (' + fleetCount() + '/' + fleetMax() + ')');
  saveGame();
}
function recallShip(uid) {
  const i = bots.findIndex(b => b.uid === uid && b.built);
  if (i < 0) return;
  const b = bots[i];
  if (hangarShips.length >= HANGAR_MAX) { chatSys('🏗️ Hangar lleno: no cabe ' + b.name + '.'); return; }
  bots.splice(i, 1);
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
    const follows = bots.filter(o => o.built && o.role === 'follow' && o.alive);
    const i = Math.max(0, follows.indexOf(b)), n = follows.length;
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
  const wa = Math.atan2(ty - b.y, tx - b.x);
  b.angle = angleLerp(b.angle, wa, 1 - Math.pow(0.05, dt));
  if (dd > 30) {
    const sp = 60 * mod.accel * clamp(dd / 80, 0.5, 2.5);   // acelera para alcanzar el objetivo
    b.x = clamp(b.x + Math.cos(b.angle) * sp * dt, 20, WORLD.w - 20);
    b.y = clamp(b.y + Math.sin(b.angle) * sp * dt, 20, WORLD.h - 20);
  }
  // disparo: hostiles cerca del ancla de fuego; en preparación nadie pelea
  b.shootCd -= dt;
  if (b.shootCd <= 0 && prepT <= 0 && fireAnchor) {
    let tgt = null, td = fireRange * fireRange;
    for (const o of bots) {
      if (o === b || !o.alive || o.color === player.color) continue;
      const d = dist2(o.x, o.y, fireAnchor.x, fireAnchor.y);
      if (d < td) { td = d; tgt = o; }
    }
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
   recoger). ESC suelta la selección. Las órdenes se guardan
   en el save (ox/oy/oplanet de cada nave).
   ========================================================= */
const selection = new Set();          // uids de wingmen seleccionados
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
    chatSys('🛰️ ' + selection.size + ' nave(s) seleccionada(s). CLIC: mover · CLIC DERECHO: órdenes · ESC: soltar.');
}
function orderGroup(role, x, y, pidx) {
  const list = selectedShips();
  if (!list.length) { selection.clear(); return; }
  for (const b of list) {
    b.role = role;
    b.ox = x == null ? b.x : x;
    b.oy = y == null ? b.y : y;
    b.oplanet = pidx ?? null;
    b.waypoint = null;
  }
  const names = {
    move: 'en ruta al punto marcado', attack: 'atacando la zona marcada',
    defendP: 'defendiendo ' + (planets[pidx] ? planets[pidx].name : 'un planeta'),
    follow: 'siguiéndote', garrison: 'en guarnición sobre la capital',
    hold: 'manteniendo posición',
  };
  chatSys('🛰️ Orden para ' + list.length + ' nave(s): ' + (names[role] || role) + '.');
  if (typeof hangarEl !== 'undefined' && !hangarEl.classList.contains('hidden')) renderHangar();
  saveGame();
}
function orderMoveTo(cx, cy) {
  if (!selectedShips().length) { selection.clear(); return; }
  const w = clientToWorld(cx, cy);
  orderGroup('move', clamp(w.x, 20, WORLD.w - 20), clamp(w.y, 20, WORLD.h - 20), null);
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
    if (act === 'recall')   { for (const b of selectedShips()) recallShip(b.uid); selection.clear(); }
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
  if (e.key === 'Escape') { selection.clear(); closeFleetMenu(); }
});
// limpieza automática: naves destruidas o recogidas salen de la selección
const _update7 = update;
update = function (dt) {
  _update7(dt);
  if (selection.size && !selectedShips().length) selection.clear();
};
const _back7 = backToMenu;
backToMenu = function () { selection.clear(); closeFleetMenu(); _back7(); };

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
  { html: 'Pulsa <b>H</b> y <b>construye un caza</b> (60◈ · 15 s). Tu capital genera los créditos sola, tú espera junto a ella. Al terminar irá al <b>hangar</b>: despliégalo con SEGUIRME o DEFENDER.',
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
  const map = { shop: shopEl, diplo: diploEl, contracts: contractsEl, hangar: hangarEl };
  for (const k in map) if (k !== which) map[k].classList.add('hidden');
  map[which].classList.toggle('hidden');
  if (which === 'shop') renderShop();
  else if (which === 'diplo') renderDiplo();
  else if (which === 'contracts') renderContracts();
  else if (which === 'hangar') renderHangar();
}
const tbButtons = Array.from(document.querySelectorAll('#toolbar button[data-panel]'));
tbButtons.forEach(b => { b.onclick = () => toggleGamePanel(b.dataset.panel); });
const tbChat = document.getElementById('tb-chat');
if (tbChat) tbChat.onclick = () => { chatInput.style.display = 'block'; chatInput.focus(); };
const tbMenu = document.getElementById('tb-menu');
if (tbMenu) tbMenu.onclick = () => { if (inGame) backToMenu(); };
const tbPairs = tbButtons.map(b => [b, { shop: shopEl, diplo: diploEl, contracts: contractsEl, hangar: hangarEl }[b.dataset.panel]]);

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
