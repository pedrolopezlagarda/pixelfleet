# verify_ui.py — prueba E2E real de PixelFleet v2.0 (headless Chromium)
# Uso: ../.venv/Scripts/python tools/verify_ui.py   (desde app/)
# Cubre: menú/ajustes, arranque, tienda, diplomacia, contratos, hangar/flota,
# chat, persistencia total (continuar), borrado de partida, v1.7 (suministros
# por planeta: stocks, costes ◈+recurso, colas por astillero, migración de
# saves) y v2.0 (sistemas solares: 12 soles, órbitas, daño solar, evasión;
# hangar masivo de 60 niveles; panel permanente de flota con órdenes armadas).
# Nota: los clics son reales; solo se aceleran créditos/tiempos de
# construcción vía evaluate para no hacer el test eterno.
import sys
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent / 'index.html'
SHOTS = Path(__file__).resolve().parent / 'shots'
SHOTS.mkdir(exist_ok=True)

errors = []
ok = True

def check(cond, label):
    global ok
    print(('  ✅ ' if cond else '  ❌ ') + label)
    if not cond:
        ok = False

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1600, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

    # ===== 0. estado limpio: sin save v2 =====
    page.goto(APP.as_uri())
    page.evaluate("localStorage.removeItem('pixelfleet_save_v2')")
    page.reload()
    page.wait_for_timeout(400)

    print('— menú —')
    check('NUEVA PARTIDA' in page.locator('#btn-play').inner_text(), 'sin save: botón «▶ NUEVA PARTIDA»')

    print('— ajustes: nombre y color —')
    page.click('#btn-settings')
    page.wait_for_timeout(200)
    check(page.locator('#panel-settings').is_visible(), 'panel de ajustes abre')
    page.fill('#input-name', 'TesterV6')
    page.locator('#color-picker .color-dot').nth(2).click()   # #ff6b8a
    page.wait_for_timeout(200)
    check(page.evaluate("player.name") == 'TesterV6', 'nombre aplicado al piloto')
    check(page.evaluate("player.color") == '#ff6b8a', 'color de facción elegido')
    page.click('#panel-settings .btn-close:not(#btn-wipe)')
    page.screenshot(path=str(SHOTS / 'ui_menu.png'))

    # ===== 1. partida nueva =====
    print('— arranque (partida nueva) —')
    page.click('#btn-play')
    page.wait_for_timeout(1500)
    check(page.locator('#prep-banner').is_visible(), 'banner de preparación visible')
    check(page.locator('#tutorial').is_visible(), 'tutorial visible')
    # v0.8: facciones imperio — 5 facciones IA, cada una con capital y 1 sola nave
    check(page.evaluate("bots.length") == 5, '5 facciones IA con 1 nave cada una (inicio de cero)')
    check(page.evaluate("bots.filter(b => b.color === player.color).length") == 0,
          'ningún bot con el color del jugador')
    check(page.evaluate("planets.filter(p => p.capital && p.owner && p.owner !== player.color).length") == 5,
          'cada facción IA tiene su capital (5 capitales enemigas)')
    check(page.evaluate("planets.filter(p => p.owner).length") == 6,
          'galaxia virgen: solo las 6 capitales tienen dueño')
    check(page.evaluate("Object.keys(facState).every(c => Object.values(facState[c].rel).every(v => v === 0))"),
          'todas las facciones empiezan NEUTRALES entre sí')
    check(page.evaluate("Math.floor(player.credits)") >= 40, 'fondos iniciales (40◈)')
    check(page.evaluate("player.ship") == 'caza' and page.evaluate("hangarShips.length") == 0,
          'empieza con 1 caza y hangar vacío')
    # v1.1: HP alto y recursos por planeta
    check(page.evaluate("player.maxHp") == 12, 'HP alto: empiezas con 12 HP (v1.1)')
    check(page.evaluate("planets.every(p => ['mineral','gas','creditos'].includes(p.res))"),
          'cada planeta tiene recurso (⛏/⛽/◈)')
    check(page.evaluate("new Set(planets.map(p => p.res)).size") == 3, 'hay planetas de los 3 recursos')
    check(page.locator('#mineral').inner_text().startswith('⛏'), 'HUD muestra el mineral')
    check(page.locator('#gas').inner_text().startswith('⛽'), 'v1.7: HUD muestra el gas')
    check('TesterV6' in page.locator('#hud-name').inner_text(), 'HUD muestra el nombre elegido')
    # v1.7: suministros por planeta — la capital es minera y acumula stock local
    check(page.evaluate("playerCapital.res") == 'mineral', 'v1.7: la capital es MINERA (regla capital minera)')
    check(page.evaluate("planets.filter(p => p.capital).every(p => p.res === 'mineral')"),
          'v1.7: TODAS las capitales (IA incluidas) son mineras')
    check(page.evaluate("Math.floor(playerCapital.stock)") == 30, 'v1.7: la capital arranca con 30⛏ de stock')
    stock0 = page.evaluate("playerCapital.stock")
    page.wait_for_timeout(2000)
    check(page.evaluate("playerCapital.stock") > stock0, 'v1.7: el stock del planeta crece con el tiempo (+0,4/s)')

    # ===== 1b. v2.0: galaxia de sistemas solares =====
    print('— v2.0: sistemas solares —')
    check(page.evaluate("WORLD.w") == 24000 and page.evaluate("WORLD.h") == 24000, 'v2.0: mundo 24000×24000')
    check(page.evaluate("suns.length") == 12, 'v2.0: 12 soles')
    seps = page.evaluate("""(() => {
      let mn = Infinity, edge = Infinity;
      for (let i = 0; i < suns.length; i++) {
        edge = Math.min(edge, suns[i].x - suns[i].r, WORLD.w - suns[i].x - suns[i].r,
                        suns[i].y - suns[i].r, WORLD.h - suns[i].y - suns[i].r);
        for (let j = i + 1; j < suns.length; j++)
          mn = Math.min(mn, Math.hypot(suns[i].x - suns[j].x, suns[i].y - suns[j].y));
      }
      return { mn, edge };
    })()""")
    check(seps['mn'] >= 4500, f"v2.0: separación entre soles ≥4500 u ({seps['mn']:.0f})")
    check(seps['edge'] >= 3000, f"v2.0: soles a ≥3000 u de los bordes ({seps['edge']:.0f})")
    orb = page.evaluate("""(() => {
      let bad = 0, noname = 0;
      for (const p of planets) {
        if (p.sys == null || !suns[p.sys]) { bad++; continue; }
        const s = suns[p.sys];
        const d = Math.hypot(p.x - s.x, p.y - s.y);
        if (d < s.r + 400 || d > s.r + 450 + 5 * 480 + 100) bad++;
        if (!/^S\\d+ · P-\\d+$/.test(p.name) && !p.capital) noname++;
      }
      return { bad, noname };
    })()""")
    check(orb['bad'] == 0, 'v2.0: todos los planetas pertenecen a un sistema y están en su órbita')
    check(orb['noname'] == 0, 'v2.0: los nombres llevan su sistema («S<n> · P-xxx»)')
    caps = page.evaluate("""(() => {
      const cs = planets.filter(p => p.capital);
      let mn = Infinity;
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++)
        mn = Math.min(mn, Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y));
      return { mn, sys: new Set(cs.map(p => p.sys)).size };
    })()""")
    check(caps['sys'] == 6, 'v2.0: cada capital en un sistema distinto')
    check(caps['mn'] >= 6000, f"v2.0: capitales a ≥6000 u entre sí ({caps['mn']:.0f})")
    avoid = page.evaluate("""(() => {
      const s = suns[0];
      return { into: sunAvoid(s.x - s.r - 250, s.y, 0), away: sunAvoid(s.x + 5000, s.y, 0) };
    })()""")
    check(abs(avoid['into']) > 0.5, 'v2.0: sunAvoid gira al apuntar a un sol')
    check(abs(avoid['away']) < 1e-9, 'v2.0: sunAvoid no toca trayectorias limpias')
    hp0 = page.evaluate("player.maxHp")
    page.evaluate("""(() => {
      const s = suns[0];
      player.x = s.x + s.r + 60; player.y = s.y; player.invuln = 0; player.hp = player.maxHp;
    })()""")
    page.wait_for_timeout(1200)
    check(page.evaluate("player.hp") < hp0 - 2, 'v2.0: el sol quema al jugador (3 HP/s)')
    check(page.evaluate("player.alive"), 'v2.0: la quemadura es lenta (sigue vivo)')
    page.evaluate("player.x = suns[0].x + suns[0].r + 2000; player.hp = player.maxHp")
    page.wait_for_timeout(800)
    check(page.evaluate("player.hp") >= page.evaluate("player.maxHp") - 0.01,
          'v2.0: fuera de la zona solar no hay daño')
    # devolver al jugador junto a su capital para no contaminar los tests siguientes
    page.evaluate("player.x = playerCapital.x + 150; player.y = playerCapital.y; player.vx = player.vy = 0; cam.x = player.x; cam.y = player.y;")

    # ===== 2. tienda =====
    print('— tienda: compra real con clic —')
    page.evaluate("player.credits += 100")   # acelerar: no esperar 30 s de ingresos
    page.click('#toolbar button[data-panel="shop"]')
    page.wait_for_timeout(300)
    check(page.locator('#shop').is_visible(), 'icono 🔧 abre la tienda')
    credits0 = int(page.locator('#shop-credits').inner_text())
    page.click('#shop-items button[data-key="motor"]')
    page.wait_for_timeout(400)
    credits1 = int(page.locator('#shop-credits').inner_text())
    check(credits1 < credits0, f'comprar Motor descuenta créditos ({credits0} → {credits1})')
    check(page.evaluate("player.upgrades.motor") == 1, 'mejora Motor nv.1 aplicada')

    # ===== 2b. v1.4: árbol de tecnología =====
    print('— tecnología: ramas excluyentes —')
    page.evaluate("player.credits += 3000")
    page.click('#shop-items button[data-key="motor"]')
    page.wait_for_timeout(250)
    page.click('#shop-items button[data-key="motor"]')
    page.wait_for_timeout(250)
    check(page.evaluate("player.upgrades.motor") == 3, 'Motor a nv.3 (requisito de rama)')
    check(page.locator('button[data-tech="hipermotor"]').is_enabled()
          and page.locator('button[data-tech="crucero"]').is_enabled(),
          'con motor nv.3 la rama de propulsión se desbloquea')
    check(page.locator('button[data-tech="blaster"]').is_disabled(), 'sin cadencia nv.3 el bláster sigue bloqueado')
    page.click('button[data-tech="hipermotor"]')
    page.wait_for_timeout(300)
    check(page.evaluate("!!player.tech.hipermotor"), 'Hipermotor investigado')
    check(page.locator('button[data-tech="crucero"]').is_disabled()
          and '✖' in page.locator('button[data-tech="crucero"]').inner_text(),
          'la rama rival (crucero) queda bloqueada para siempre')
    page.click('#shop-items button[data-key="cadencia"]')
    page.wait_for_timeout(200)
    page.click('#shop-items button[data-key="cadencia"]')
    page.wait_for_timeout(200)
    page.click('#shop-items button[data-key="cadencia"]')
    page.wait_for_timeout(200)
    page.click('button[data-tech="blaster"]')
    page.wait_for_timeout(300)
    check(page.evaluate("!!player.tech.blaster"), 'Bláster pesado investigado')
    page.keyboard.press('Escape')

    # ===== 3. diplomacia =====
    print('— diplomacia: tributo y guerra —')
    page.evaluate("player.credits += 150")
    page.click('#toolbar button[data-panel="diplo"]')
    page.wait_for_timeout(300)
    check(page.locator('#diplo').is_visible(), 'icono 🤝 abre diplomacia')
    check(not page.locator('#shop').is_visible(), 'la tienda se cerró sola')
    fac = page.locator('#diplo-list button[data-act="tribute"]').first.get_attribute('data-c')
    page.locator('#diplo-list button[data-act="tribute"]').first.click()
    page.wait_for_timeout(300)
    st1 = page.evaluate(f"standings['{fac}']")
    check(st1 == 40, f'tributo sube relación con {fac} (0 → {st1})')
    page.locator('#diplo-list button[data-act="war"]').first.click()
    page.wait_for_timeout(300)
    st2 = page.evaluate(f"standings['{fac}']")
    check(st2 <= -30, f'declarar guerra la desploma ({st1} → {st2})')
    check('GUERRA' in page.locator('#chat-log').inner_text(), 'declaración de guerra anunciada en el chat')
    page.screenshot(path=str(SHOTS / 'ui_diplo.png'))

    # ===== 4. contratos =====
    print('— contratos: aceptar —')
    page.click('#toolbar button[data-panel="contracts"]')
    page.wait_for_timeout(300)
    check(page.locator('#contracts').is_visible(), 'icono 📋 abre contratos')
    page.locator('#contract-offers button[data-id]').first.click()
    page.wait_for_timeout(300)
    check(page.evaluate("contracts.active.length") == 1, 'contrato aceptado pasa a activos')
    check('▶' in page.locator('#contract-active').inner_text(), 'contrato activo visible en el panel')

    # FIX v1.4: la minería suma en los contratos (+ el bláster hace daño ×2)
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    page.evaluate("contracts.active.push({ id: 999, type: 'mineria', faction: null, target: 2, progress: 0, reward: 16, title: 'Minería', desc: 'test' })")
    page.evaluate("""(() => {
      const a = asteroids.find(x => x.alive);
      window.__ast = a;
      player.x = a.x + 100; player.y = a.y; player.vx = player.vy = 0;
      cam.x = player.x; cam.y = player.y;   // teletransporte: mover también la cámara
    })()""")
    page.wait_for_timeout(400)   # la cámara sigue al jugador
    astpos = page.evaluate("({ x: 2*((window.__ast.x - cam.x)*cam.zoom + VW/2), y: 2*((window.__ast.y - cam.y)*cam.zoom + VH/2) })")
    page.mouse.move(astpos['x'], astpos['y'])   # apuntar con el ratón (el ángulo sigue al cursor)
    page.mouse.down()
    page.wait_for_timeout(700)
    page.mouse.up()
    check(page.evaluate("projectiles.some(pr => pr.owner === player && pr.dmg === 2) || !window.__ast.alive"),
          'el bláster dispara proyectiles de daño ×2')
    page.wait_for_timeout(900)
    check(page.evaluate("!window.__ast.alive"), 'asteroide de 2 HP destruido de UN hit con bláster')
    check(page.evaluate("(contracts.active.find(c => c.id === 999) || { progress: -1 }).progress") >= 1,
          'FIX: destruir asteroides SUMA en el contrato de minería')
    # volver a la capital (las construcciones de hangar la requieren)
    page.evaluate("player.x = playerCapital.x + playerCapital.r + 10; player.y = playerCapital.y; player.vx = player.vy = 0; cam.x = player.x; cam.y = player.y;")
    page.wait_for_timeout(300)

    # ===== 5. hangar y flota =====
    print('— hangar: construir → hangar → desplegar —')
    page.evaluate("player.credits += 200")
    page.click('#toolbar button[data-panel="hangar"]')
    page.wait_for_timeout(300)
    check(page.locator('#hangar').is_visible(), 'icono 🚀 abre el hangar')
    check(page.locator('#hangar-build').is_visible()
          and page.locator('#hangar-fleet').is_visible()
          and page.locator('#hangar-store').is_visible(), 'hangar con 3 secciones')
    check('15⛏' in page.locator('button[data-build="caza"]').inner_text(),
          'v1.7: el botón de construir muestra el coste ◈ + ⛏')
    check(page.locator('#hangar-yard').count() == 1
          and '★' in page.locator('#hangar-yard').inner_text(), 'v1.7: selector de astillero (★ capital)')
    ore0 = page.evaluate("stockOf(player.color, 'mineral')")
    page.click('button[data-build="caza"]')
    page.wait_for_timeout(300)
    check(page.evaluate("buildQueue.length") == 1, 'clic en construir mete el caza en cola')
    check(page.evaluate("buildQueue[0].planet") == page.evaluate("planets.indexOf(playerCapital)"),
          'v1.7: la cola guarda su planeta astillero (la capital por defecto)')
    ore1 = page.evaluate("stockOf(player.color, 'mineral')")
    check(ore1 < ore0, f'v1.7: construir un caza descuenta ⛏ del stock ({ore0:.1f} → {ore1:.1f})')
    check('🏗️' in page.locator('#hangar-qstat').inner_text(), 'cuenta atrás visible sin recargar panel')
    page.evaluate("buildQueue[0].t = 0.05")   # acelerar construcción
    page.wait_for_timeout(500)
    check('construido y en el hangar' in page.locator('#chat-log').inner_text(),
          'al completarse la nave va AL HANGAR (chat)')
    check(page.evaluate("hangarShips.length") == 1 and page.evaluate("fleetCount()") == 0,
          'la nave no sale sola: hangar 1, flota activa 0')
    check(page.locator('#hangar-store .hangar-item').count() == 1,
          'la nave aparece en la sección HANGAR sin reabrir el panel')

    print('— flota: roles SEGUIRME / DEFENDER / RECOGER —')
    page.click('button[data-hact="follow"][data-hi="0"]')
    page.wait_for_timeout(300)
    check(page.evaluate("fleetCount()") == 1 and page.evaluate("hangarShips.length") == 0,
          'SEGUIRME despliega el wingman (hangar vacío)')
    check(page.evaluate("bots.find(b => b.built).role") == 'follow', 'rol follow asignado')
    check(page.locator('#hangar-fleet .hangar-item').count() == 1, 'wingman visible en FLOTA ACTIVA')
    page.click('#hangar-fleet button[data-fact="defend"]')
    page.wait_for_timeout(300)
    check(page.evaluate("bots.find(b => b.built).role") == 'defend', 'cambio de rol a DEFENDER')
    page.click('#hangar-fleet button[data-fact="recall"]')
    page.wait_for_timeout(300)
    check(page.evaluate("fleetCount()") == 0 and page.evaluate("hangarShips.length") == 1,
          'RECOGER devuelve la nave al hangar')

    # ===== v1.6/v2.0: hangar por niveles (la flota ya NO depende de planetas) =====
    print('— v2.0: ampliar hangar con ◈ (curva masiva +5/+5) —')
    check(page.evaluate("fleetMax()") == 5 and page.evaluate("hangarMax()") == 10,
          'hangar nv.1: flota 5 · almacén 10 (sin conquistar nada)')
    page.evaluate("player.credits = 0")
    page.wait_for_timeout(250)
    check(page.locator('#hangar-upg').is_disabled(), 'sin ◈ el botón AMPLIAR está desactivado')
    page.evaluate("player.credits = 500")
    page.wait_for_timeout(250)
    check(not page.locator('#hangar-upg').is_disabled(), 'con ◈ el botón AMPLIAR se activa')
    page.click('#hangar-upg')
    page.wait_for_timeout(300)
    credits_now = page.evaluate("Math.floor(player.credits)")
    check(page.evaluate("player.hangarLvl") == 1 and 450 <= credits_now <= 456,
          f'ampliar cuesta 50◈ y sube a nv.2 (quedan {credits_now}◈, +ingresos del tiempo real)')
    check(page.evaluate("fleetMax()") == 10 and page.evaluate("hangarMax()") == 15,
          'nv.2: flota 10 · almacén 15')
    check('Hangar ampliado a nv.2' in page.locator('#chat-log').inner_text(), 'ampliación anunciada en el chat')
    check('2/60' in page.locator('#hangar-lvl').inner_text(), 'panel muestra el nivel de hangar (60 niveles, v2.0)')
    # los planetas ya NO amplían la flota (ojo: un planeta propio DA VISIÓN — elegir
    # el neutral más lejano de toda capital enemiga para no contaminar la niebla)
    page.evaluate("""(() => {
      const caps = planets.filter(p => p.capital && p.owner && p.owner !== player.color);
      let best = null, bd = -1;
      for (const p of planets) {
        if (p.owner || p === playerCapital) continue;
        const d = Math.min(...caps.map(c => (p.x - c.x) ** 2 + (p.y - c.y) ** 2));
        if (d > bd) { bd = d; best = p; }
      }
      window.__tmpP = best; best.owner = player.color;
    })()""")
    page.wait_for_timeout(250)
    check(page.evaluate("fleetMax()") == 10, 'conquistar un planeta NO cambia el tope de flota (v1.6)')
    page.evaluate("window.__tmpP.owner = null")

    # ===== v1.5.2: órdenes por radio + ESPACIO no activa botones =====
    print('— v1.5.2: radio y ESPACIO —')
    page.evaluate("player.x = playerCapital.x + 3000; player.y = playerCapital.y; player.vx = player.vy = 0; cam.x = player.x; cam.y = player.y;")
    page.evaluate("player.credits += 300")
    page.evaluate("queueShip('caza')")   # directo, sin panel
    check(page.evaluate("buildQueue.length") == 1, 'construir funciona LEJOS de la capital (órdenes por radio)')
    page.evaluate("buildQueue.length = 0; player.credits -= 60; playerCapital.stock = Math.min(100, playerCapital.stock + 15)")   # deshacer: no romper los checks siguientes (v1.7: devolver también el ⛏)
    page.click('button[data-hact="follow"][data-hi="0"]')   # hangar abierto, 1 caza guardada
    page.wait_for_timeout(250)
    check(page.evaluate("fleetCount()") == 1, 'desplegar funciona LEJOS de la capital (sale y viene sola)')
    page.click('#hangar-fleet button[data-fact="recall"]')
    page.wait_for_timeout(250)
    check(page.evaluate("fleetCount()") == 0 and page.evaluate("hangarShips.length") == 1,
          'recogida de vuelta — estado restaurado')
    page.evaluate("player.x = playerCapital.x + playerCapital.r + 10; player.y = playerCapital.y; player.vx = player.vy = 0; cam.x = player.x; cam.y = player.y;")
    page.wait_for_timeout(300)
    page.click('#toolbar button[data-panel="shop"]')   # el clic deja el FOCO en el botón
    page.wait_for_timeout(250)
    check(page.locator('#shop').is_visible(), 'tienda abierta (con el foco en su icono)')
    page.keyboard.press(' ')
    page.wait_for_timeout(250)
    check(page.locator('#shop').is_visible(), 'ESPACIO ya NO reactiva el botón con foco (v1.5.2)')
    page.keyboard.press('Escape')
    page.wait_for_timeout(150)

    # ===== v1.6.1: scroll en menús sin zoom, botón ✕ y notificaciones =====
    print('— v1.6.1: scroll/zoom, ✕ y notificaciones —')
    page.click('#toolbar button[data-panel="hangar"]')
    page.wait_for_timeout(300)
    z0 = page.evaluate("cam.zoomTarget")
    page.hover('#hangar')
    page.mouse.wheel(0, -400)
    page.wait_for_timeout(250)
    check(page.evaluate("cam.zoomTarget") == z0, 'scroll DENTRO del hangar NO hace zoom')
    # el hangar tapa el centro del canvas: buscar un punto libre donde elementFromPoint sea el canvas
    pt = page.evaluate("""(() => {
      const c = document.getElementById('canvas');
      for (let y = 40; y < innerHeight; y += 50)
        for (let x = 40; x < innerWidth; x += 70)
          if (document.elementFromPoint(x, y) === c) return { x, y };
      return null;
    })()""")
    page.mouse.move(pt['x'], pt['y'])
    page.mouse.wheel(0, -400)
    page.wait_for_timeout(250)
    check(page.evaluate("cam.zoomTarget") > z0, 'scroll sobre el canvas SÍ hace zoom')
    page.evaluate("cam.zoomTarget = 1; cam.zoom = 1")
    page.evaluate("for (let i = 0; i < 6; i++) notify('Aviso ' + i, 'warn')")
    page.wait_for_timeout(150)
    check(page.locator('#notify .toast').count() == 4, 'notificaciones visibles (máx. 4 apiladas)')
    page.evaluate("damageShip(player, 1, {name: 'Pirata', color: '#888888', pirate: true})")
    page.wait_for_timeout(150)
    check('Bajo fuego enemigo' in page.locator('#notify').inner_text(),
          'recibir daño muestra aviso «bajo fuego enemigo»')
    page.click('#hangar .panel-x')
    page.wait_for_timeout(200)
    check(not page.locator('#hangar').is_visible(), 'el botón ✕ cierra el panel')

    print('— hangar: PILOTAR —')
    page.click('#toolbar button[data-panel="hangar"]')   # reabrir (la sección anterior cerró los paneles)
    page.wait_for_timeout(300)
    page.evaluate("player.credits += 200")
    # v1.7: la avispa pide ⛽ y el jugador aún no tiene planetas de gas
    check(page.locator('button[data-build="avispa"]').is_disabled(), 'v1.7: sin ⛽ el botón de la avispa queda desactivado')
    check('Te falta' in (page.locator('button[data-build="avispa"]').get_attribute('title') or ''),
          'v1.7: el title del botón explica qué recurso falta')
    page.evaluate("queueShip('avispa')")   # ni por consola: sin ⛽ no entra en cola
    check(page.evaluate("buildQueue.length") == 0, 'v1.7: sin ⛽ suficiente no se puede encolar la avispa')
    check('⛽' in page.locator('#notify').inner_text(), 'v1.7: aviso toast de recurso insuficiente')
    # le damos un planeta de GAS (lejos de toda capital enemiga) y lo soltamos después
    page.evaluate("""(() => {
      const caps = planets.filter(p => p.capital && p.owner && p.owner !== player.color);
      let g = null, bd = -1;
      for (const p of planets) {
        if (p.owner || p.res !== 'gas') continue;
        const d = Math.min(...caps.map(c => (p.x - c.x) ** 2 + (p.y - c.y) ** 2));
        if (d > bd) { bd = d; g = p; }
      }
      window.__gp = g; g.owner = player.color; g.stock = 60;
    })()""")
    page.wait_for_timeout(300)
    page.click('button[data-build="avispa"]')
    page.wait_for_timeout(200)
    page.evaluate("buildQueue[0].t = 0.05")
    page.wait_for_timeout(500)
    page.evaluate("window.__gp.owner = null; window.__gp.stock = 0")   # soltar el planeta de gas (la cola era de la capital)
    check(page.evaluate("hangarShips.join(',')") == 'caza,avispa', 'avispa construida: hangar [caza, avispa]')
    page.click('button[data-hact="pilot"][data-hi="1"]')
    page.wait_for_timeout(300)
    check(page.evaluate("player.ship") == 'avispa'
          and page.evaluate("hangarShips.filter(t => t === 'caza').length") == 2,
          'PILOTAR: pilotas la avispa y tu caza pasa al hangar')
    check('Avispa' in page.locator('#hangar-current').inner_text(), 'panel muestra «Pilotando: Avispa»')
    check(page.evaluate("shipSprite('#ffffff','caza') !== shipSprite('#ffffff','avispa')"),
          'sprites distintos por tipo de nave (v1.5)')
    page.screenshot(path=str(SHOTS / 'ui_hangar.png'))

    # ===== 5b. control RTS de flota (v0.7) =====
    print('— v0.7: guarnición + selección por cuadro + órdenes —')
    page.click('button[data-hact="garrison"][data-hi="0"]')
    page.wait_for_timeout(300)
    check(page.evaluate("bots.find(b => b.built).role") == 'garrison',
          'GUARNICIÓN: la nave desplegada orbita la capital')
    check(page.evaluate("fleetCount()") == 1, 'una nave en flota activa')
    page.keyboard.press('h')   # cerrar el hangar para que el canvas reciba los clics
    page.wait_for_timeout(200)
    # acercar la cámara a la nave (la cámara sigue al jugador; así la nave queda visible)
    page.evaluate("(() => { const b = bots.find(x => x.built); cam.zoomTarget = 0.6; })()")
    page.wait_for_timeout(700)
    pos = page.evaluate("(() => { const b = bots.find(x => x.built && x.alive);"
                        " return { x: 2*((b.x - cam.x)*cam.zoom + VW/2), y: 2*((b.y - cam.y)*cam.zoom + VH/2) }; })()")
    page.keyboard.down('Shift')
    page.mouse.move(pos['x'] - 90, pos['y'] - 90)
    page.mouse.down()
    page.mouse.move(pos['x'] + 90, pos['y'] + 90, steps=6)
    page.mouse.up()
    page.keyboard.up('Shift')
    page.wait_for_timeout(150)
    check(page.evaluate("selection.size") == 1, 'SHIFT+arrastre selecciona la nave (cuadro de selección)')
    check(page.evaluate("projectiles.length") == 0, 'el arrastre de selección NO dispara')
    page.screenshot(path=str(SHOTS / 'ui_rts_select.png'))

    page.mouse.click(500, 300)
    page.wait_for_timeout(200)
    check(page.evaluate("bots.find(b => b.built).role") == 'move', 'CLIC con selección = orden MOVER al punto')
    check(page.evaluate("bots.find(b => b.built).ox !== null"), 'la orden guarda el destino (ox/oy)')
    check(page.evaluate("projectiles.length") == 0, 'el clic de orden tampoco dispara')
    check(page.evaluate("selection.size") == 0, 'dar la orden MOVER suelta la selección (v0.7.1)')

    # sin selección, clic derecho sobre la nave la selecciona y abre el menú
    pos = page.evaluate("(() => { const b = bots.find(x => x.built && x.alive);"
                        " return { x: 2*((b.x - cam.x)*cam.zoom + VW/2), y: 2*((b.y - cam.y)*cam.zoom + VH/2) }; })()")
    page.mouse.click(pos['x'], pos['y'], button='right')
    page.wait_for_timeout(200)
    check(page.locator('#fleet-menu').is_visible(), 'CLIC DERECHO abre el menú de órdenes')
    check('1 nave(s)' in page.locator('#fleet-menu').inner_text(), 'el menú indica cuántas naves reciben la orden')
    page.click('#fleet-menu button[data-fm="deflist"]')
    page.wait_for_timeout(150)
    check(page.locator('#fm-planets').is_visible()
          and 'CAPITAL' in page.locator('#fm-planets').inner_text(),
          'DEFENDER despliega la lista de planetas propios (★ capital)')
    page.locator('#fm-planets button[data-fm="defp"]:has-text("★")').first.click()
    page.wait_for_timeout(200)
    check(page.evaluate("bots.find(b => b.built).role") == 'defendP', 'orden DEFENDER planeta aplicada (rol defendP)')
    check(page.evaluate("bots.find(b => b.built).oplanet") == page.evaluate("planets.indexOf(playerCapital)"),
          'el planeta a defender es la capital (oplanet correcto)')
    check(not page.locator('#fleet-menu').is_visible(), 'el menú se cierra tras elegir orden')
    check(page.evaluate("selection.size") == 0, 'orden del menú también suelta la selección (v0.7.1)')
    page.screenshot(path=str(SHOTS / 'ui_rts_menu.png'))

    pos = page.evaluate("(() => { const b = bots.find(x => x.built && x.alive);"
                        " return { x: 2*((b.x - cam.x)*cam.zoom + VW/2), y: 2*((b.y - cam.y)*cam.zoom + VH/2) }; })()")
    page.mouse.click(pos['x'], pos['y'], button='right')
    page.wait_for_timeout(150)
    page.click('#fleet-menu button[data-fm="attack"]')
    page.wait_for_timeout(150)
    check(page.evaluate("bots.find(b => b.built).role") == 'attack', 'orden ATACAR ESTA ZONA aplicada')
    check(page.evaluate("selection.size") == 0, 'ATACAR también suelta la selección')

    # ESC sigue cancelando una selección sin dar orden
    pos = page.evaluate("(() => { const b = bots.find(x => x.built && x.alive);"
                        " return { x: 2*((b.x - cam.x)*cam.zoom + VW/2), y: 2*((b.y - cam.y)*cam.zoom + VH/2) }; })()")
    page.keyboard.down('Shift')
    page.mouse.move(pos['x'] - 140, pos['y'] - 140)
    page.mouse.down()
    page.mouse.move(pos['x'] + 140, pos['y'] + 140, steps=6)
    page.mouse.up()
    page.keyboard.up('Shift')
    page.wait_for_timeout(150)
    ok = page.evaluate("selection.size") == 1
    if not ok:
        dbg = page.evaluate("""(() => { const b = bots.find(x => x.built && x.alive);
          const sx = 2*((b.x - cam.x)*cam.zoom + VW/2), sy = 2*((b.y - cam.y)*cam.zoom + VH/2);
          const el = document.elementFromPoint(sx - 90, sy - 90);
          return { sel: selection.size, sx: Math.round(sx), sy: Math.round(sy),
                   el: el ? (el.id || el.tagName) : 'none' }; })()""")
        print('  [debug reselect]', dbg)
    check(ok, 'SHIFT+arrastre vuelve a seleccionar')
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)
    check(page.evaluate("selection.size") == 0, 'ESC cancela la selección sin dar orden')
    page.mouse.move(500, 300)
    page.mouse.down()
    page.wait_for_timeout(400)
    page.mouse.up()
    check(page.evaluate("projectiles.length") > 0, 'sin selección el clic vuelve a disparar')

    # ===== 5b3. v2.0: panel permanente de flota (derecha) =====
    print('— v2.0: panel de flota permanente —')
    check(page.locator('#fleet-panel').is_visible(), 'panel de flota visible en partida')
    check(page.locator('.fp-row:not(.fp-player)').count() == 1, 'la nave desplegada aparece en la lista')
    check('atacando' in page.locator('.fp-row:not(.fp-player) .fp-order').inner_text(),
          'la fila muestra la orden actual (atacando)')
    page.click('#fp-orders button[data-fpo="follow"]')   # sin selección: no debe aplicar nada
    page.wait_for_timeout(150)
    check(page.evaluate("bots.find(b => b.built).role") == 'attack', 'orden sin selección no se aplica (aviso)')
    page.click('.fp-row:not(.fp-player)')
    page.wait_for_timeout(400)   # el resaltado se aplica en el tick del panel (0,25 s)
    check(page.evaluate("selection.size") == 1, 'clic en la fila selecciona la nave (misma selección RTS)')
    check('sel' in (page.locator('.fp-row:not(.fp-player)').get_attribute('class') or ''), 'la fila se resalta al seleccionar')
    page.click('.fp-row:not(.fp-player)')
    page.wait_for_timeout(150)
    check(page.evaluate("selection.size") == 0, 'clic de nuevo la deselecciona')
    page.click('#fp-all')
    page.wait_for_timeout(150)
    check(page.evaluate("selection.size") == 1, 'TODAS selecciona toda la flota')
    page.click('#fp-orders button[data-fpo="follow"]')
    page.wait_for_timeout(150)
    check(page.evaluate("bots.find(b => b.built).role") == 'follow', 'SEGUIRME desde el panel')
    check(page.evaluate("selection.size") == 0, 'la orden del panel también suelta la selección (v0.7.1)')
    # MOVER armado: el siguiente clic en el mapa fija el objetivo
    page.click('.fp-row:not(.fp-player)')
    page.wait_for_timeout(100)
    page.click('#fp-orders button[data-fpo="move"]')
    page.wait_for_timeout(100)
    check(page.evaluate("pendingOrder") == 'move', 'MOVER queda armado esperando clic en el mapa')
    check('armed' in (page.locator('#fp-orders button[data-fpo="move"]').get_attribute('class') or ''),
          'botón MOVER resaltado mientras está armado')
    page.mouse.click(500, 300)
    page.wait_for_timeout(150)
    check(page.evaluate("bots.find(b => b.built).role") == 'move', 'clic en el mapa aplica la orden MOVER armada')
    check(page.evaluate("pendingOrder") is None, 'la orden se desarma tras aplicarse')
    check(page.evaluate("selection.size") == 0, 'y también suelta la selección')
    # ATACAR armado y cancelado con ESC (no debe aplicarse)
    page.click('.fp-row:not(.fp-player)')
    page.wait_for_timeout(100)
    page.click('#fp-orders button[data-fpo="attack"]')
    page.wait_for_timeout(100)
    check(page.evaluate("pendingOrder") == 'attack', 'ATAQUE armado')
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)
    check(page.evaluate("pendingOrder") is None and page.evaluate("bots.find(b => b.built).role") == 'move',
          'ESC cancela la orden armada sin aplicarla')
    # RECOGER desde el panel
    page.click('.fp-row:not(.fp-player)')
    page.wait_for_timeout(100)
    page.click('#fp-orders button[data-fpo="recall"]')
    page.wait_for_timeout(400)
    check(page.evaluate("fleetCount()") == 0 and page.evaluate("hangarShips.length") == 2,
          'RECOGER desde el panel devuelve la nave al hangar')
    check(page.locator('#fp-empty').count() == 1, 'sin naves desplegadas el panel muestra el estado vacío')
    # v2.0: el panel está a la DERECHA (entre la clasificación y el minimapa)
    check(page.evaluate("document.getElementById('fleet-panel').getBoundingClientRect().left > innerWidth / 2"),
          'panel de flota a la derecha de la pantalla')
    # v2.0: tu propia nave en el panel + piloto automático
    check(page.locator('.fp-row.fp-player').count() == 1, 'tu nave aparece en el panel (★ TÚ)')
    check('manual' in page.locator('.fp-row.fp-player .fp-order').inner_text(), 'tu nave empieza en manual')
    page.click('.fp-row.fp-player')
    page.wait_for_timeout(400)
    check(page.evaluate("playerSel") == True, 'clic en tu fila selecciona tu nave')
    page.click('#fp-orders button[data-fpo="hold"]')
    page.wait_for_timeout(200)
    check(page.evaluate("player.auto") == True and page.evaluate("player.role") == 'hold',
          'dar orden a tu nave la pone en AUTOMÁTICO')
    check('🤖' in page.locator('.fp-row.fp-player .fp-order').inner_text(), 'la fila muestra 🤖 automático')
    page.click('.fp-row.fp-player')
    page.wait_for_timeout(100)
    page.click('#fp-orders button[data-fpo="move"]')
    page.wait_for_timeout(100)
    page.mouse.click(900, 300)
    page.wait_for_timeout(150)
    check(page.evaluate("player.role") == 'move' and page.evaluate("player.auto"),
          'MOVER armado también vale para tu nave')
    d0 = page.evaluate("Math.hypot(player.ox - player.x, player.oy - player.y)")
    page.wait_for_timeout(2000)
    d1 = page.evaluate("Math.hypot(player.ox - player.x, player.oy - player.y)")
    check(d1 < d0, f'el piloto automático vuela hacia el objetivo ({d0:.0f} → {d1:.0f})')
    page.keyboard.down('w')
    page.wait_for_timeout(250)
    page.keyboard.up('w')
    page.wait_for_timeout(150)
    check(page.evaluate("player.auto") == False, 'WASD desconecta el piloto automático (control manual)')
    # dejar la partida como la esperan los tests de persistencia (1 nave con orden attack + ox/oy)
    page.evaluate("""(() => {
      deployShip(0, 'follow');
      const b = bots.find(x => x.built);
      b.role = 'attack'; b.ox = player.x + 300; b.oy = player.y; b.oplanet = null;
    })()""")
    page.wait_for_timeout(300)

    # ===== 5b2. v1.7: colas por planeta — paralelas, límite 3 y cancelación =====
    print('— v1.7: colas de construcción por planeta —')
    page.evaluate("player.credits += 500; playerCapital.stock = 100")
    page.evaluate("""(() => {
      // segundo astillero: un planeta propio lejos de toda capital enemiga
      // (un planeta propio DA VISIÓN — se elige lejano y se suelta al acabar)
      const caps = planets.filter(p => p.capital && p.owner && p.owner !== player.color);
      let best = null, bd = -1;
      for (const p of planets) {
        if (p.owner || p === playerCapital) continue;
        const d = Math.min(...caps.map(c => (p.x - c.x) ** 2 + (p.y - c.y) ** 2));
        if (d > bd) { bd = d; best = p; }
      }
      window.__p2 = best; best.owner = player.color;
    })()""")
    page.evaluate("queueShip('caza', planets.indexOf(playerCapital))")
    page.evaluate("for (let i = 0; i < 4; i++) queueShip('caza', planets.indexOf(window.__p2))")
    check(page.evaluate("buildQueue.length") == 4, 'v1.7: máximo 3 ítems por astillero (el 4.º en el mismo planeta se rechaza)')
    check('saturado' in page.locator('#notify').inner_text(), 'v1.7: aviso de astillero saturado')
    t0 = page.evaluate("buildQueue.map(q => q.t)")
    page.wait_for_timeout(600)
    t1 = page.evaluate("buildQueue.map(q => q.t)")
    check(t1[0] < t0[0] and t1[1] < t0[1], 'v1.7: dos planetas construyen EN PARALELO (dos colas avanzan)')
    check(abs(t1[2] - t0[2]) < 0.01, 'v1.7: en un mismo planeta solo avanza el primer ítem')
    # perder el planeta astillero cancela su cola (con aviso, sin reembolso)
    page.evaluate("window.__p2.owner = null")
    page.wait_for_timeout(400)
    check(page.evaluate("buildQueue.length") == 1, 'v1.7: perder el astillero CANCELA su cola')
    check('cancelada' in page.locator('#notify').inner_text(), 'v1.7: notificación de cola cancelada')
    page.evaluate("buildQueue[0].t = 0.05")
    page.wait_for_timeout(500)
    check(page.evaluate("buildQueue.length") == 0 and page.evaluate("hangarShips.length") == 2,
          'v1.7: la cola de la capital sigue funcionando (caza completado al hangar)')

    # ===== 5c. v0.8: IA de facciones — neutralidad, provocación, conquista, minería =====
    print('— v0.8: facciones imperio (IA real) —')
    page.evaluate("prepT = 0")   # terminar la preparación: sin esto nadie dispara
    page.wait_for_timeout(300)
    page.evaluate("window.__wing = bots.find(b => b.built)")
    # otra facción (no la de la guerra declarada en el test de diplomacia)
    other = page.evaluate(f"FACTION_COLORS.find(c => c !== player.color && c !== '{fac}')")
    page.evaluate(f"""(() => {{
      const wing = window.__wing;
      const en = bots.find(b => b.imp && b.color === '{other}');
      window.__en = en;
      en.x = wing.x + 120; en.y = wing.y; wing.shootCd = 0; en.shootCd = 0;
    }})()""")
    page.wait_for_timeout(1500)
    check(not page.evaluate("projectiles.some(pr => pr.owner === window.__wing)"),
          'wingman NO dispara a una facción neutral aunque la tenga al lado')
    # tú provocas a esa facción → tus naves ya pueden atacarla
    page.evaluate(f"playerAggro['{other}'] = 45; window.__wing.shootCd = 0; window.__hpEn = window.__en.hp;")
    page.wait_for_timeout(2000)
    check(page.evaluate("""window.__en.hp < window.__hpEn
          || projectiles.some(pr => pr.owner === window.__wing)
          || window.__wing.shootCd > 0.4"""),
          'si TÚ atacas primero (provocación), el wingman sí dispara')
    page.evaluate(f"delete playerAggro['{other}']")

    # la IA conquista planetas neutrales por presencia
    page.evaluate("""(() => {
      const b = bots.find(x => x.imp);
      window.__conq = b;
      facState[b.color].aiT = 999;   // que no le reasignen la tarea durante el check
      // el planeta neutral más alejado de TODAS las naves (piratas incluidos) y del
      // jugador: cualquier nave cerca lo deja «contestado» y la conquista no arranca
      let p = null, best = -1;
      for (const q of planets) {
        if (q.owner) continue;
        let dmin = (player.x-q.x)**2 + (player.y-q.y)**2;
        for (const o of bots) {
          if (o === b || !o.alive) continue;
          const d = (o.x-q.x)**2 + (o.y-q.y)**2;
          if (d < dmin) dmin = d;
        }
        if (dmin > best) { best = dmin; p = q; }
      }
      window.__planet = p;
      b.task = { type: 'conquer', p };
      b.x = p.x + p.r + 5; b.y = p.y; b.waypoint = null;
    })()""")
    page.wait_for_timeout(7000)
    check(page.evaluate("window.__planet.owner") == page.evaluate("window.__conq.color"),
          'la IA conquista un planeta neutral por presencia')

    # la IA mina asteroides para la hucha de su facción
    page.evaluate("""(() => {
      const b = bots.find(x => x.imp && x !== window.__conq) || window.__conq;
      window.__miner = b;
      facState[b.color].aiT = 999;
      let best = null, bd = 1e18;
      for (const a of asteroids) { if (!a.alive) continue;
        const d = (a.x-b.x)**2 + (a.y-b.y)**2; if (d < bd) { bd = d; best = a; } }
      b.task = { type: 'mine', a: best };
      window.__minAst = best;
      b.x = best.x + 120; b.y = best.y; b.shootCd = 0;
    })()""")
    page.wait_for_timeout(2500)
    check(page.evaluate("""!window.__minAst.alive || window.__minAst.hp < 2
          || projectiles.some(pr => pr.owner === window.__miner)"""),
          'la IA dispara a asteroides (minería)')

    # v1.7: la IA también paga ⛏ por nave — sin mineral en sus minas no construye
    page.evaluate("""(() => {
      const c = window.__conq.color;
      window.__facC = c;
      facState[c].credits = 500; facState[c].building = false;
      for (const p of planets) if (p.owner === c && p.res === 'mineral') p.stock = 0;
    })()""")
    page.wait_for_timeout(1500)
    check(not page.evaluate("facState[window.__facC].building"), 'v1.7: la IA NO construye sin ⛏ en sus minas')
    page.evaluate("facState[window.__facC].capital.stock = 30")
    page.wait_for_timeout(1500)
    check(page.evaluate("facState[window.__facC].building"), 'v1.7: con ⛏ (capital minera) la IA SÍ construye')

    # guerra entre facciones IA: solo entonces se atacan entre ellas
    page.evaluate(f"""(() => {{
      const A = bots.find(b => b.imp && b.color !== '{other}');
      const B = bots.find(b => b.imp && b.color === '{other}');
      window.__wa = A; window.__wb = B;
      setRel(A.color, B.color, -100);
      facState[A.color].aiT = 999; facState[B.color].aiT = 999;
      A.task = {{ type: 'defend' }}; B.task = {{ type: 'defend' }};
      A.x = 4000; A.y = 4000; B.x = 4150; B.y = 4000;
      A.shootCd = 0; B.shootCd = 0;
      window.__hp0 = A.hp + B.hp;
    }})()""")
    page.wait_for_timeout(2000)
    check(page.evaluate("""(window.__wa.hp + window.__wb.hp) < window.__hp0
          || projectiles.some(pr => pr.owner === window.__wa || pr.owner === window.__wb)
          || window.__wa.shootCd > 0.4 || window.__wb.shootCd > 0.4"""),
          'dos facciones en GUERRA se disparan al verse')
    page.evaluate("setRel(window.__wa.color, window.__wb.color, 0)")
    page.screenshot(path=str(SHOTS / 'ui_facciones.png'))

    # ===== 5d. v0.9: niebla de guerra + panel de imperio =====
    print('— v0.9: niebla de guerra + panel de imperio —')
    page.wait_for_timeout(400)   # fogUpdate corre a 4 Hz
    tot = page.evaluate("explored.length")
    ex0 = page.evaluate("explored.reduce((a, v) => a + v, 0)")
    check(0 < ex0 < tot * 0.5, f'niebla activa: explorado {ex0}/{tot} celdas al inicio')
    # una capital enemiga lejana y neutral (ni la de la guerra ni la provocada): no explorada ni visible
    page.evaluate(f"""(() => {{
      const c = FACTION_COLORS.find(x => x !== player.color && x !== '{fac}' && x !== '{other}');
      window.__fcap = planets.find(p => p.capital && p.owner === c);
    }})()""")
    check(not page.evaluate("fogExplored(window.__fcap.x, window.__fcap.y)"),
          'la capital enemiga lejana NO está explorada')
    check(not page.evaluate("fogVisible(window.__fcap.x, window.__fcap.y)"),
          'ni bajo visión')
    # acércate (teletransporte de prueba): queda explorada y con dueño conocido
    page.evaluate("player.x = window.__fcap.x + 300; player.y = window.__fcap.y; player.vx = player.vy = 0;")
    page.wait_for_timeout(500)
    check(page.evaluate("fogExplored(window.__fcap.x, window.__fcap.y)"), 'al acercarte, la capital queda explorada')
    check(page.evaluate("window.__fcap.knownOwner") == page.evaluate("window.__fcap.owner"),
          'y recuerdas quién la gobierna (último dueño conocido)')
    # las naves enemigas solo se ven bajo visión: traemos una junto a ti y otra lejos
    page.evaluate("""(() => {
      const c = window.__fcap.owner;
      window.__shipNear = bots.find(x => x.imp && x.alive && x.color === c) ||
                          bots.find(x => x.imp && x.alive);
      window.__shipFar = bots.find(x => x.imp && x.alive && x !== window.__shipNear);
      window.__shipNear.x = player.x + 200; window.__shipNear.y = player.y;
      if (window.__shipFar) {
        // buscar un punto fuera de TODA visión (jugador, wingmen, planetas propios)
        const pts = [[player.x, player.y, 700]];
        for (const p of planets) if (p.owner === player.color) pts.push([p.x, p.y, 1100]);
        for (const w of bots) if (w.built && w.alive) pts.push([w.x, w.y, 700]);
        outer: for (let x = 400; x < WORLD.w; x += 500) for (let y = 400; y < WORLD.h; y += 500) {
          let ok = true;
          for (const q of pts) if ((x - q[0]) ** 2 + (y - q[1]) ** 2 < q[2] * q[2]) { ok = false; break; }
          if (ok) { window.__shipFar.x = x; window.__shipFar.y = y; break outer; }
        }
      }
    })()""")
    page.wait_for_timeout(500)
    check(page.evaluate("fogVisible(window.__shipNear.x, window.__shipNear.y)"),
          'una nave enemiga junto a ti SÍ se ve (bajo visión)')
    check(page.evaluate("window.__shipFar ? !fogVisible(window.__shipFar.x, window.__shipFar.y) : true"),
          'una nave enemiga lejos queda oculta en la niebla')
    # volver a casa para el resto del test
    page.evaluate("player.x = playerCapital.x + 150; player.y = playerCapital.y; player.vx = player.vy = 0;")
    page.wait_for_timeout(400)
    check(page.evaluate("fogVisible(playerCapital.x, playerCapital.y)"), 'tu capital siempre bajo visión')

    # panel de imperio con TAB
    page.keyboard.press('Tab')
    page.wait_for_timeout(300)
    check(page.locator('#empire').is_visible(), 'TAB abre el panel de imperio')
    body = page.locator('#empire-body').inner_text()
    check('CAPITAL' in body, 'el panel lista tu capital')
    check('⛏' in body and '⛽' in body, 'v1.7: el panel de imperio muestra los totales ⛏/⛽')
    check(re.search(r'⛏ \d+/100', body) is not None, 'v1.7: stock por planeta en el panel (tope 100)')
    check('🛰' in body and ('atacando' in body or 'siguiéndote' in body), 'el panel lista la flota con su rol')
    check('Áurea' in body or 'Carmesí' in body or 'Aqua' in body, 'el panel lista las facciones de la galaxia')
    page.evaluate(f"setRel('{other}', FACTION_COLORS.find(c => c !== player.color && c !== '{other}' && c !== '{fac}'), -100)")
    page.wait_for_timeout(700)   # el panel se re-renderiza a 2 Hz
    check('GUERRA:' in page.locator('#empire-body').inner_text(), 'el panel muestra guerras entre facciones IA')
    page.evaluate(f"setRel('{other}', FACTION_COLORS.find(c => c !== player.color && c !== '{other}' && c !== '{fac}'), 0)")
    page.screenshot(path=str(SHOTS / 'ui_imperio.png'))
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    check(not page.locator('#empire').is_visible(), 'ESC cierra el panel de imperio')
    page.click('#toolbar button[data-panel="empire"]')
    page.wait_for_timeout(200)
    check(page.locator('#empire').is_visible(), 'el icono 🏛️ de la toolbar abre el panel')
    check(page.locator('#toolbar button[data-panel="empire"]').get_attribute('class') and
          'active' in page.locator('#toolbar button[data-panel="empire"]').get_attribute('class'),
          'el icono queda resaltado con el panel abierto')
    page.keyboard.press('Escape')
    page.wait_for_timeout(150)

    # ===== 5d2. v1.3: personalidades + eventos galácticos =====
    print('— v1.3: personalidades y eventos —')
    check(page.evaluate("FACTION_COLORS.filter(c => c !== player.color).every(c => !!PERSONALITIES[facState[c].personality])"),
          'cada facción IA tiene una personalidad asignada')
    # la agresiva declara guerra cuando es mucho más fuerte (azar fijado para el test)
    page.evaluate("""(() => {
      const A = FACTION_COLORS.find(c => c !== player.color);
      const B = FACTION_COLORS.find(c => c !== player.color && c !== A);
      window.__fa = A; window.__fb = B;
      facState[A].personality = 'agresiva'; facState[B].personality = 'tortuga';
      setRel(A, B, 0);
      let n = 0;
      for (const p of planets) { if (!p.owner && n < 6) { p.owner = A; n++; } }   // A se hace fuerte
      const or = Math.random; Math.random = () => 0.01;
      facDiplomacy(A);
      Math.random = or;
    })()""")
    check(page.evaluate("facState[window.__fa].rel[window.__fb]") == -100,
          'la facción AGRESIVA declara la guerra si es mucho más fuerte')
    check('declara la GUERRA' in page.locator('#chat-log').inner_text(), 'la guerra se anuncia en el chat')
    page.evaluate("setRel(window.__fa, window.__fb, 0)")
    # eventos forzados
    page.evaluate("fireEvent('veta')")
    check(page.evaluate("!!richVein"), 'evento: VETA RICA activa (asteroides ×2)')
    page.evaluate("fireEvent('gusano')")
    check(page.evaluate("wormholes.length") >= 1, 'evento: AGUJERO DE GUSANO creado')
    page.evaluate("player.x = wormholes[0].x; player.y = wormholes[0].y; player.vx = player.vy = 0;")
    page.wait_for_timeout(500)
    check(page.evaluate("dist2(player.x, player.y, wormholes[0].tx, wormholes[0].ty) < 200*200"),
          'el agujero de gusano TELETRANSPORTA al jugador')
    page.evaluate("fireEvent('piratas')")
    check(page.evaluate("bots.filter(b => b.pirate).length") >= 2, 'evento: oleada de PIRATAS (naves grises)')
    page.evaluate("""(() => {
      const p = bots.find(b => b.pirate);
      window.__pir = p; p.x = player.x + 150; p.y = player.y; p.shootCd = 0;
      player.invuln = 0; window.__hpP = player.hp;
    })()""")
    page.wait_for_timeout(2000)
    check(page.evaluate("""player.hp < window.__hpP
          || projectiles.some(pr => pr.owner === window.__pir)
          || window.__pir.shootCd > 0.4"""),
          'el pirata te ataca aunque estéis en paz')
    check(page.evaluate("bots.filter(b => b.pirate).every(b => b.color === '#9aa5b1')"),
          'los piratas son grises (no son de ninguna facción)')
    page.screenshot(path=str(SHOTS / 'ui_eventos.png'))

    # ===== 5e. v1.1: escudos con mineral + reparación · v1.2: victoria real =====
    print('— v1.1: economía estratégica —')
    page.evaluate("player.x = playerCapital.x + playerCapital.r + 10; player.y = playerCapital.y; player.vx = player.vy = 0;")
    page.evaluate("playerCapital.shield = 50; playerCapital.stock = 10;")   # v1.7: el ⛏ vive en el stock del planeta
    page.wait_for_timeout(2000)
    check(page.evaluate("playerCapital.shield") > 51, 'el escudo de tu planeta se RECARGA con ⛏ del stock')
    # la capital es minera (produce mientras consume): margen +1 por producción
    check(page.evaluate("stockOf(player.color, 'mineral')") < 10.5, 'la recarga consume ⛏ de tus planetas mineros (v1.7)')
    creds0 = page.evaluate("Math.floor(player.credits)")
    page.evaluate("player.hp = 5;")
    page.wait_for_timeout(2000)
    check(page.evaluate("player.hp") > 5, 'junto a tu planeta la nave se REPARA (+1 HP/1,5 s)')
    check(page.evaluate("Math.floor(player.credits)") <= creds0 + 2, 'la reparación cuesta créditos (5◈/HP)')

    print('— v1.2: victoria y derrota reales —')
    page.evaluate(f"""(() => {{
      for (const b of bots) if (b.imp && b.color === '{other}') b.alive = false;
      for (const p of planets) if (p.owner === '{other}') p.owner = null;
      facState['{other}'].building = false;   // sin capital, la construcción muere
    }})()""")
    page.wait_for_timeout(2500)
    check('ha CAÍDO' in page.locator('#chat-log').inner_text(), 'eliminar planetas+naves de una facción la da por CAÍDA (chat)')
    page.evaluate("""(() => {
      for (const b of bots) if (b.imp) b.alive = false;
      for (const p of planets) if (p.owner && p.owner !== player.color) p.owner = null;
      for (const c in facState) facState[c].building = false;
    })()""")
    page.wait_for_timeout(2500)
    check(page.locator('#end-banner').is_visible()
          and 'VICTORIA' in page.locator('#end-banner').inner_text(),
          'sin facciones IA vivas → banner de VICTORIA')
    check(page.evaluate("victory === true"), 'estado de victoria activo (y la partida sigue)')
    page.screenshot(path=str(SHOTS / 'ui_victoria.png'))

    # ===== 5f. v2.1: misiones-historia «La señal del Vacío» =====
    print('— v2.1: misiones-historia —')
    page.evaluate("player.invuln = 9999;")   # los piratas de la historia no deben matar al tester
    # la historia arrancó sola al terminar la preparación (prepT=0 en 5c)
    check(page.evaluate("story.step") == 0, 'la historia empieza en el capítulo 1 al acabar la preparación')
    check(page.evaluate("story.data.x != null"), 'cap 1 (Eco lejano): objetivo «reach» con coordenadas')
    check(page.locator('#mission-tracker').is_visible()
          and 'Eco lejano' in page.locator('#mission-tracker').inner_text(),
          'el tracker del HUD muestra el capítulo activo')
    check('SEÑAL DESCONOCIDA' in page.locator('#chat-log').inner_text(), 'la historia se narra por el chat')
    # panel de misiones: tecla J y botón de la toolbar
    page.keyboard.press('j')
    page.wait_for_timeout(300)
    check(page.locator('#missions').is_visible()
          and 'LA SEÑAL DEL VACÍO' in page.locator('#missions').inner_text(),
          'tecla J abre el panel de misiones con la cadena de capítulos')
    page.keyboard.press('j')
    page.wait_for_timeout(300)
    check(not page.locator('#missions').is_visible(), 'tecla J cierra el panel')
    page.click('#toolbar button[data-panel="missions"]')
    page.wait_for_timeout(300)
    check(page.locator('#missions').is_visible()
          and 'Eco lejano' in page.locator('#missions').inner_text(),
          'botón 📜 de la toolbar abre el panel y muestra el capítulo activo')
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    # cap 1 → reach: teletransportar al objetivo
    creds0 = page.evaluate("Math.floor(player.credits)")
    page.evaluate("""(() => {
      for (const b of bots) if (b.pirate) b.alive = false;   // limpiar piratas de eventos anteriores
      player.x = story.data.x; player.y = story.data.y; player.vx = player.vy = 0;
      cam.x = player.x; cam.y = player.y;
    })()""")
    page.wait_for_timeout(500)
    check(page.evaluate("story.step") == 1, 'llegar al marcador completa el cap 1 y activa el cap 2')
    check(page.evaluate("Math.floor(player.credits)") >= creds0 + 100, 'recompensa del cap 1 (+100◈)')
    check(page.evaluate("bots.filter(b => b.pirate && b.alive).length") == 4,
          'cap 2 (No estás solo): oleada de 4 piratas spawneada')
    # cap 2 → killPirates
    page.evaluate("for (let i = 0; i < 4; i++) storyHook('kill', { pirate: true })")
    page.wait_for_timeout(300)
    check(page.evaluate("story.step") == 2, 'destruir los 4 piratas completa el cap 2')
    # cap 3 → stock de gas: dar al jugador un planeta de gas con 60⛽
    page.evaluate("""(() => {
      const g = planets.find(p => p.res === 'gas' && !p.owner) || planets.find(p => p.res === 'gas');
      g.owner = player.color; g.stock = 60;
    })()""")
    page.wait_for_timeout(500)
    check(page.evaluate("story.step") == 3, 'acumular 60⛽ completa el cap 3')
    # cap 4 → wormhole: el capítulo garantiza un gusano si no hay ninguno
    check(page.evaluate("wormholes.length") >= 1, 'cap 4 (El atajo): hay un agujero de gusano disponible')
    check(page.evaluate("storyMarkerPos() !== null"), 'el marcador ◆ apunta al gusano más cercano')
    page.evaluate("storyHook('wormhole')")
    page.wait_for_timeout(300)
    check(page.evaluate("story.step") == 4, 'saltar por el gusano completa el cap 4')
    # cap 5 → conquistar 2 planetas
    page.evaluate("storyHook('conquer'); storyHook('conquer')")
    page.wait_for_timeout(300)
    check(page.evaluate("story.step") == 5, 'conquistar 2 planetas completa el cap 5')
    # cap 6 → el origen: reach final + recompensa Mapa del Vacío
    page.evaluate("player.x = story.data.x; player.y = story.data.y; player.vx = player.vy = 0; cam.x = player.x; cam.y = player.y;")
    page.wait_for_timeout(500)
    check(page.evaluate("story.done") is True, 'llegar al origen completa la historia')
    check(page.evaluate("explored.every(v => v === 1)"), 'recompensa final: el Mapa del Vacío revela toda la galaxia')
    check('MAPA DEL VACÍO' in page.locator('#chat-log').inner_text().upper(), 'el final se narra por el chat')
    check(not page.locator('#mission-tracker').is_visible(), 'con la historia terminada el tracker se oculta')
    page.evaluate("for (const b of bots) if (b.pirate) b.alive = false; player.invuln = 0;")   # limpieza para las secciones siguientes
    page.screenshot(path=str(SHOTS / 'ui_historia.png'))

    # ===== 6. chat =====
    print('— chat —')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check(page.locator('#chat-input').is_visible(), 'ENTER abre el chat')
    page.keyboard.type('hola flota')   # contiene "t": no debe cerrar el tutorial ni abrir paneles
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check('hola flota' in page.locator('#chat-log').inner_text(), 'mensaje enviado aparece en el log')
    check('TesterV6' in page.locator('#chat-log').inner_text(), 'mensaje firmado con el nombre del piloto')

    # ===== 7. zoom estratégico =====
    print('— zoom estratégico —')
    page.mouse.move(800, 450)
    for _ in range(14):
        page.mouse.wheel(0, 600)
        page.wait_for_timeout(60)
    page.wait_for_timeout(800)
    page.screenshot(path=str(SHOTS / 'ui_zoom_out.png'))
    for _ in range(20):
        page.mouse.wheel(0, -600)
        page.wait_for_timeout(50)
    page.wait_for_timeout(800)
    page.screenshot(path=str(SHOTS / 'ui_zoom_in.png'))

    # ===== 8. persistencia total: recargar y continuar =====
    print('— persistencia: CONTINUAR PARTIDA —')
    # congelar la construcción de las facciones para que el recuento sea determinista
    page.evaluate("for (const c in facState) { facState[c].building = false; facState[c].credits = 0; }")
    # v1.7: provocar un stock conocido y una cola con astillero para verificar su persistencia
    page.evaluate("player.credits += 100; playerCapital.stock = 100; queueShip('caza', planets.indexOf(playerCapital)); playerCapital.stock = 77")
    fog0 = page.evaluate("explored.reduce((a, v) => a + v, 0)")
    page.evaluate("saveGame()")
    saved = page.evaluate("({credits: Math.floor(player.credits), bots: bots.filter(b => !b.pirate).length, "
                          "hangar: hangarShips.join(','), ship: player.ship, hangarLvl: player.hangarLvl, "
                          "kills: player.kills, motor: player.upgrades.motor})")   # los piratas no se guardan (evento transitorio)
    page.reload()
    page.wait_for_timeout(500)
    check('CONTINUAR PARTIDA' in page.locator('#btn-play').inner_text(), 'con save: botón «▶ CONTINUAR PARTIDA»')
    check(page.locator('#input-name').input_value() == 'TesterV6', 'nombre precargado en ajustes')
    page.click('#btn-play')
    page.wait_for_timeout(1500)
    check(page.evaluate("bots.length") == saved['bots'], f"bots restaurados ({saved['bots']})")
    check(abs(page.evaluate("Math.floor(player.credits)") - saved['credits']) < 10,
          f"créditos restaurados (~{saved['credits']})")
    check(page.evaluate("hangarShips.join(',')") == saved['hangar'], f"hangar restaurado ({saved['hangar']})")
    check(page.evaluate("player.ship") == saved['ship'], f"nave actual restaurada ({saved['ship']})")
    check(page.evaluate("player.upgrades.motor") == saved['motor'], 'mejoras restauradas')
    check(page.evaluate("player.hangarLvl") == saved['hangarLvl']
          and page.evaluate("fleetMax()") == 5 + 5 * saved['hangarLvl'],
          f"nivel de hangar restaurado (nv.{saved['hangarLvl'] + 1}, v1.6/v2.0)")
    check(page.evaluate(f"standings['{fac}']") <= -30, 'guerra declarada sigue en pie tras recargar')
    check(page.evaluate("playerCapital !== null && playerCapital.capital === true"),
          'capital restaurada por índice')
    check(page.evaluate("bots.find(b => b.built) && bots.find(b => b.built).role") == 'attack',
          'orden RTS restaurada tras recargar (rol attack)')
    check(page.evaluate("bots.find(b => b.built) && bots.find(b => b.built).ox !== null"),
          'destino de la orden restaurado (ox/oy)')
    check(not page.locator('#tutorial').is_visible(), 'sin tutorial al continuar')
    check(page.evaluate("explored.reduce((a, v) => a + v, 0)") >= fog0,
          f'mapa explorado restaurado ({fog0} celdas)')
    st = page.evaluate("playerCapital.stock")
    check(74 <= st <= 82, f'v1.7: el stock de la capital se conserva tras recargar ({st:.1f})')
    check(page.evaluate("buildQueue.length") == 1
          and page.evaluate("buildQueue[0].planet") == page.evaluate("planets.indexOf(playerCapital)"),
          'v1.7: la cola de construcción se restaura con su planeta astillero')
    check(page.evaluate("planets.filter(p => p.capital && p.owner).every(p => p.res === 'mineral')"),
          'v1.7: tras cargar, todas las capitales vuelven a ser mineras')
    check(page.evaluate("story.done") is True, 'v2.1: la historia completada se conserva tras recargar')
    page.screenshot(path=str(SHOTS / 'ui_continuar.png'))

    # ===== 8b. v1.7: migración de saves viejos (sin stock ni astillero en la cola) =====
    print('— v1.7: migración de saves viejos —')
    page.evaluate("""(() => {
      inGame = false;   // que el saveGame del beforeunload NO pise el save manipulado
      const d = JSON.parse(localStorage.getItem('pixelfleet_save_v2'));
      d.player.mineral = 25;                          // el viejo stock global del jugador
      for (const sp of d.planets) delete sp.stock;    // save viejo: sin stock por planeta
      for (const q of d.buildQueue) delete q.planet;  // ni astillero en la cola
      delete d.story;                                 // v2.1: save viejo sin historia
      localStorage.setItem('pixelfleet_save_v2', JSON.stringify(d));
    })()""")
    page.reload()
    page.wait_for_timeout(500)
    check('CONTINUAR PARTIDA' in page.locator('#btn-play').inner_text(), 'v1.7: el save viejo sigue siendo válido')
    page.click('#btn-play')
    page.wait_for_timeout(1500)
    check(page.evaluate("Math.floor(playerCapital.stock)") >= 54,
          'v1.7: el viejo player.mineral se vuelca a la capital (30⛏ base + 25)')
    check(page.evaluate("buildQueue.every(q => q.planet === planets.indexOf(playerCapital))"),
          'v1.7: entradas de cola viejas sin planeta se asignan a la capital')
    check(page.evaluate("story.step") == 0 and page.evaluate("!story.done"),
          'v2.1: el save viejo sin historia migra al capítulo 1 (sin invalidar)')

    # ===== 9. borrar partida =====
    print('— ajustes: BORRAR PARTIDA —')
    page.evaluate("saveGame()")
    page.click('#tb-menu')
    page.wait_for_timeout(300)
    check(page.locator('#menu').is_visible(), 'vuelta al menú con 🏠')
    page.click('#btn-settings')
    page.wait_for_timeout(200)
    page.once('dialog', lambda d: d.accept())
    page.click('#btn-wipe')
    page.wait_for_timeout(1000)   # confirm aceptado → location.reload()
    check(page.evaluate("localStorage.getItem('pixelfleet_save_v2')") is None, 'save v2 eliminado')
    check('NUEVA PARTIDA' in page.locator('#btn-play').inner_text(), 'botón vuelve a «▶ NUEVA PARTIDA»')

    # ===== 10. equilibrio y errores =====
    print('— clasificación —')
    page.click('#btn-play')
    page.wait_for_timeout(1500)
    board = page.locator('#board-list').inner_text()
    print('  clasificación:', board.replace(chr(10), ' | ')[:200])

    print('— errores JS —')
    check(not errors, 'sin errores de consola/página' + ('' if not errors else ': ' + '; '.join(errors[:3])))

    browser.close()

print('RESULTADO:', 'TODO OK' if ok else 'FALLOS DETECTADOS')
sys.exit(0 if ok else 1)
