# verify_ui.py — prueba E2E real de PixelFleet v0.6 (headless Chromium)
# Uso: ../.venv/Scripts/python tools/verify_ui.py   (desde app/)
# Cubre: menú/ajustes, arranque, tienda, diplomacia, contratos, hangar/flota,
# chat, persistencia total (continuar) y borrado de partida.
# Nota: los clics son reales; solo se aceleran créditos/tiempos de
# construcción vía evaluate para no hacer el test eterno.
import sys
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
    check('TesterV6' in page.locator('#hud-name').inner_text(), 'HUD muestra el nombre elegido')

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

    # ===== 5. hangar y flota =====
    print('— hangar: construir → hangar → desplegar —')
    page.evaluate("player.credits += 200")
    page.click('#toolbar button[data-panel="hangar"]')
    page.wait_for_timeout(300)
    check(page.locator('#hangar').is_visible(), 'icono 🚀 abre el hangar')
    check(page.locator('#hangar-build').is_visible()
          and page.locator('#hangar-fleet').is_visible()
          and page.locator('#hangar-store').is_visible(), 'hangar con 3 secciones')
    page.click('button[data-build="caza"]')
    page.wait_for_timeout(300)
    check(page.evaluate("buildQueue.length") == 1, 'clic en construir mete el caza en cola')
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

    print('— hangar: PILOTAR —')
    page.evaluate("player.credits += 200")
    page.click('button[data-build="avispa"]')
    page.wait_for_timeout(200)
    page.evaluate("buildQueue[0].t = 0.05")
    page.wait_for_timeout(500)
    check(page.evaluate("hangarShips.join(',')") == 'caza,avispa', 'avispa construida: hangar [caza, avispa]')
    page.click('button[data-hact="pilot"][data-hi="1"]')
    page.wait_for_timeout(300)
    check(page.evaluate("player.ship") == 'avispa'
          and page.evaluate("hangarShips.filter(t => t === 'caza').length") == 2,
          'PILOTAR: pilotas la avispa y tu caza pasa al hangar')
    check('Avispa' in page.locator('#hangar-current').inner_text(), 'panel muestra «Pilotando: Avispa»')
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
    page.evaluate(f"playerAggro['{other}'] = 45; window.__wing.shootCd = 0;")
    page.wait_for_timeout(1800)
    check(page.evaluate("projectiles.some(pr => pr.owner === window.__wing)"),
          'si TÚ atacas primero (provocación), el wingman sí dispara')
    page.evaluate(f"delete playerAggro['{other}']")

    # la IA conquista planetas neutrales por presencia
    page.evaluate("""(() => {
      const b = bots.find(x => x.imp);
      window.__conq = b;
      facState[b.color].aiT = 999;   // que no le reasignen la tarea durante el check
      // el planeta neutral más alejado de otras naves imperiales (sin disputas)
      let p = null, best = -1;
      for (const q of planets) {
        if (q.owner) continue;
        let dmin = 1e18;
        for (const o of bots) {
          if (o === b || !o.imp || !o.alive) continue;
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
    creds0 = page.evaluate("""(() => {
      const b = bots.find(x => x.imp && x !== window.__conq) || window.__conq;
      window.__miner = b;
      facState[b.color].aiT = 999;
      let best = null, bd = 1e18;
      for (const a of asteroids) { if (!a.alive) continue;
        const d = (a.x-b.x)**2 + (a.y-b.y)**2; if (d < bd) { bd = d; best = a; } }
      b.task = { type: 'mine', a: best };
      b.x = best.x + 120; b.y = best.y; b.shootCd = 0;
      return Math.floor(facState[b.color].credits);
    })()""")
    page.wait_for_timeout(2500)
    check(page.evaluate("projectiles.some(pr => pr.owner === window.__miner)")
          or page.evaluate("Math.floor(facState[window.__miner.color].credits)") > creds0,
          'la IA dispara a asteroides (minería)')

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
    fog0 = page.evaluate("explored.reduce((a, v) => a + v, 0)")
    page.evaluate("saveGame()")
    saved = page.evaluate("({credits: Math.floor(player.credits), bots: bots.length, "
                          "hangar: hangarShips.join(','), ship: player.ship, "
                          "kills: player.kills, motor: player.upgrades.motor})")
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
    page.screenshot(path=str(SHOTS / 'ui_continuar.png'))

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
