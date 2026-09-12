# PIXEL FLEET — Prompt de continuación (v0.5 “Estrategia real”)

Estado actual: juego web pixel-art vista cenital multijugador (archivos: `index.html`,
`style.css`, `game.js`, `server.js`, `README.md`). Tiene: movimiento, disparos, bots,
conquista de planetas con escudos, economía, tienda, hangar, diplomacia, contratos,
chat, minimapa, salas por código y persistencia en localStorage. El motor está en
`game.js` (vanilla JS + canvas, sin frameworks).

## PROBLEMA DE DISEÑO DETECTADO
El juego es demasiado rápido: parece un arena de disparos. Se quiere un juego de
**estrategia pausada**: pensar, prepararse, expandirse. No encontrarse enemigos a
los 10 segundos.

## PILARES DE DISEÑO (no negociables)
1. **Empiezas en TU planeta** (capital elegida al inicio), con una fase de preparación
   protegida. Nada de spawns aleatorios en mitad de la nada.
2. **Distancias largas**: viajar entre planetas tarda minutos reales de juego. Al
   inicio apenas puedes ir más allá de tu sistema vecino.
3. **Zoom estratégico**: rueda del ratón. Zoom out = ver TODO el mapa (iconos,
   territorios, colores de facción). Zoom in = detalle pixel de tu zona.
4. **Exploración**: niebla de guerra / radio de visión. Los enemigos lejanos no se ven
   ni en el mapa; hay que explorar con naves.
5. **Combate costoso**: las naves son caras y lentas de reemplazar. Matar a lo loco
   arruina tu economía. La retirada y la reparación son opciones válidas.
6. **Ritmo por fases**: preparación → expansión temprana → contacto → guerra. Cada
   fase debe durar varios minutos.

## CAMBIOS CONCRETOS (hacer en este orden, paso a paso)

### Fase A — Cámara y zoom estratégico
- [x] Zoom con rueda del ratón (ej. ×0.15 a ×3), suavizado. En zoom out lejano,
      dibujar el mapa completo como mapa de estrategia: planetas como círculos con
      color de facción, naves como puntitos, sin detalle pixel.
- [x] En zoom cercano, mantener el render pixel-art actual.
- [x] Límites: en zoom out máximo se ve TODO el mundo de 8000×8000.

### Fase B — Planeta hogar y preparación
- [x] Al entrar (partida nueva), elegir un planeta como **capital**: aparecer junto a
      él con un escudo grande (ej. 100 pts) y 2-3 naves iniciales (no una).
- [x] **Fase de preparación**: 5 minutos en los que tu capital es invulnerable y los
      bots no pueden atacarte ni entrar en tu radio. Banner con cuenta atrás.
- [x] Los bots ya no aparecen cerca del jugador: cada bot tiene su propia “capital”
      repartida por el mapa y expande desde ahí lentamente.
- [x] **Inicio tranquilo (v0.5.1)**: sin naves alrededor al empezar, la capital produce
      ×3 y tiene **cola de construcción** de defensores (80◈ · 20 s · máx. 5; si caen,
      se pierden). Adelanta parte de la Fase E.
- [x] **v0.5.2**: tutorial guiado de 6 pasos (se cierra con T), ritmo más lento
      (naves, bots, proyectiles, conquista 6 s), **sin fuego amigo** (tu color es
      inmune a tus disparos y viceversa), fondos iniciales de 40◈.
- [x] **v0.5.3**: **barra lateral de iconos** clicable (hangar, tienda, diplomacia,
      contratos, chat, menú) con el atajo en el tooltip y resaltado del panel abierto.
      **Fix**: los paneles ya no se re-renderizan cada frame (recrear los botones con
      innerHTML a 60 fps hacía que los clics se perdieran entre mousedown y mouseup);
      ahora solo se actualizan textos/estados. **Economía igualada**: bots con las
      mismas reglas de ingresos que el jugador y sin combates durante la preparación.
      Test E2E real con Playwright en `tools/verify_ui.py`.
- [x] **v0.6 — Flota real y persistencia total**: las naves se **construyen** (los 4
      tipos con coste y tiempo), van al **hangar** y por cada una eliges **SEGUIRME /
      DEFENDER CAPITAL / RECOGER / PILOTAR** (flota activa = 2 + 1 por planeta propio,
      hangar máx. 10).
      **Muerte real** también para tu nave (rotación desde el hangar o caza de
      emergencia). Ningún bot aleatorio es de tu color: toda nave aliada la creas tú.
      **Mundo determinista** (planetario con seed) + **save v2 completo**: jugador,
      240 bots con su economía/IA, planetas y escudos, flota, diplomacia, contratos
      y preparación restante. Menú **CONTINUAR/NUEVA PARTIDA** y **🗑 Borrar partida**
      en ajustes. **Diplomacia simétrica**: dañar en paz cabrea a la facción (y el
      daño de tus wingmen cuenta como tuyo). E2E reescrito: **54 checks** en verde.

### Fase C — Ritmo y distancias (v1.0, implementada 2026-09-11)
- [x] Velocidades base ~÷3: jugador 130→45 de aceleración, naves imperiales
      18-42→9-20, wingmen 60→34, proyectiles 300→200 (vida 1.8).
- [x] Mundo 8000→**12000×12000** (64 planetas, 22 campos de asteroides):
      cruzarlo son minutos reales; viajar es una decisión de partida.
      El save guarda `world` y se invalida si el tamaño cambia.
- [x] Combustible serio: impulso caro (-40/s, rachas cortas); **solo se reposta
      junto a planetas** — propios 30/s, aliados (relación ≥ 20) 12/s, neutros 8/s,
      en el espacio NADA. Los asteroides ya no dan combustible.
      *(No hay varada total: el crucero no gasta ⛽, solo el impulso.)*
- E2E: **101 checks verdes** (check de guerra fac-fac hecho robusto: detecta el
  disparo por shootCd/hp, no por proyectil en vuelo).

### Fase D — Niebla de guerra
- [x] Radio de visión por nave (600) y por planeta propio (1000). *(v0.9)*
- [x] Fuera de la visión: ni naves ni planetas enemigos se dibujan; en zoom out el
      mapa solo muestra lo explorado + territorio propio; lo explorado sin visión
      se ve atenuado con el último dueño conocido (`knownOwner`). *(v0.9)*
- [x] Explorado persistente en el save (rejilla de 1600 celdas). *(v0.9)*

### Fase E — Combate y economía estratégica
- [x] Las naves cuestan créditos y tardan en construirse (cola de construcción en la
      capital). Empezar con 2-3 naves, no con infinitas vidas gratis. *(v0.6: 4 tipos
      construibles; empiezas con 1 caza y hangar vacío)*
- [x] HP de naves altas (10-20 impactos) y daño por tipo de arma; reparar en
      planetas propios cuesta créditos y tiempo. *(v1.1: jugador 12 HP base +2/nivel
      de blindaje, wingmen 10+mod, imperiales 10; reparación junto a planeta propio
      +1 HP/1,5 s por 5◈; wingmen +1/2 s por 2◈; la IA repara gratis junto a los
      suyos — su coste es no estar luchando)*
- [x] Al morir una nave, se pierde de verdad: hay que construir otra. *(v0.6: también
      tu propia nave; caza de emergencia si el hangar está vacío)*
- [x] Recursos por planeta: ⛏ mineral (produce ⛏, alimenta la recarga de escudos),
      ⛽ gas (repostaje ×2), ◈ créditos (×1; los demás ×0,5). *(v1.1 — simplificación:
      el mineral es un stock global del jugador, no por planeta)*
- [x] Diplomacia más lenta: guerras se declaran, no pasan por un malentendido de 3
      disparos. Los bots no disparan salvo guerra declarada. *(v0.6: daño simétrico.
      **v0.8**: neutralidad total + guerras estratégicas + disciplina de wingmen.
      **v1.2**: la guerra declarada ya NO decae sola — hay que pagar tributo)*

### Fase F — UI estratégica
- [x] Panel de imperio (tecla TAB o icono 🏛️): resumen (planetas, ◈/s, flota,
      hangar, cola), planetas propios con escudo/producción, flota con roles y
      estado diplomático de la galaxia (guerras y alianzas entre facciones IA).
      *(v0.9)*
- [ ] ~~Órdenes con clic derecho: enviar nave seleccionada a planeta/coordenada.~~
      → **absorbido por la Fase G (v0.7)**, que lo amplía a selección de grupo + menú.
- [x] Minimapa: solo visión actual + explorado. *(v0.9)*

### Fase G — Control RTS de flota (v0.7, implementada 2026-09-11)
Control estilo Age of Empires de las naves desplegadas. Diseño completo en el vault:
`PixelFleet - Control RTS de flota (v0.7)`.
- [x] **Nuevo estado GUARNICIÓN**: al sacar una nave del hangar puede quedarse
      orbitando tu capital (botón GUARNICIÓN en el hangar; también desde el menú RTS).
- [x] **Selección por cuadro**: **SHIFT+arrastrar** dibuja el rectángulo; las naves
      propias dentro quedan seleccionadas con aro blanco. SHIFT+clic = selección
      individual. *(Decisión de Pedro: SHIFT+arrastre en lugar de umbral de arrastre,
      para no tocar el disparo con clic mantenido.)*
- [x] **Orden de movimiento con el puntero**: con selección activa, clic izquierdo =
      mover el grupo al punto (con línea y marcador de destino; ese clic no dispara).
- [x] **Menú contextual con botón derecho**: MOVER AQUÍ · ATACAR ESTA ZONA ·
      DEFENDER PLANETA (sublista de planetas propios, capital con ★) · SEGUIRME ·
      GUARNICIÓN · PARAR · RECOGER. Aplica a la nave individual o al grupo
      (el menú indica cuántas). Sin selección, el clic derecho sobre una nave la
      selecciona y abre su menú.
- [x] **Persistencia**: el save v2 guarda la orden activa de cada nave
      (rol + ox/oy/oplanet) — al continuar, la flota sigue ejecutándola.
- [x] ESC suelta la selección y cierra el menú; las naves destruidas o recogidas
      salen solas de la selección. E2E: 72 checks verdes.
- [ ] **Tutorial del control RTS** (pendiente, a petición de Pedro: hacerlo más
      adelante — p. ej. nuevos pasos del tutorial guiado enseñando SHIFT+arrastre
      y el menú de botón derecho).
- Subsume el ítem «órdenes con clic derecho» de la Fase F.

### Fase E completa + victoria real (v1.1/v1.2, implementadas 2026-09-11)
- [x] **HP alto** (10-20 impactos) y **reparación con coste** junto a planetas
      propios; **recursos por tipo de planeta** (⛏/⛽/◈) con icono en el nombre;
      escudos que se recargan consumiendo mineral (¡el README lo prometía desde
      v0.4 y no existía!).
- [x] **Victoria y derrota reales**: una facción CAE cuando se queda sin planetas,
      naves ni construcción (la construcción muere con la capital). Sin facciones
      IA vivas → banner 🏆 VICTORIA (la partida sigue en modo libre). Si TÚ te
      quedas sin planetas → banner 💀 de imperio caído hasta que reconquistes.
      La guerra declarada ya no decae sola. E2E: **112 checks verdes**.

### Fase D+F — Niebla de guerra y panel de imperio (v0.9, implementada 2026-09-11)
- [x] **Niebla de guerra**: rejilla de 200 u (1600 celdas). Ves 600 u desde tus
      naves y 1000 u desde tus planetas; lo explorado queda para siempre
      (atenuado, con último dueño conocido). Naves enemigas, jugadores remotos,
      proyectiles y partículas fuera de visión no se dibujan. Minimapa con niebla.
      Clasificación solo con lo que conoces de cada imperio. Explorado en el save.
- [x] **Panel de imperio (TAB / 🏛️)**: resumen, planetas propios (escudo y
      producción), flota con roles y guerras/alianzas entre facciones IA.
- E2E: **101 checks verdes**.

### Fase H — Facciones imperio: IA real (v0.8, implementada 2026-09-11)
Pedido de Pedro: «cada facción empieza de cero con una sola nave; la IA debe
capturar planetas y recoger asteroides; facciones neutrales por norma, que solo
atanquen si les conviene estratégicamente o se alíen; tus naves que te siguen no
atacan a nadie salvo que tú empieces o haya guerra». Nota del vault:
`PixelFleet - Facciones imperio IA (v0.8)`.
- [x] **Todas las facciones empiezan de cero**: galaxia virgen (sin planetas
      pre-conquistados); cada facción IA con capital propia (escudo 100, lejos de
      las demás) y **1 sola nave**. Adiós a los 240 pilotos sueltos.
- [x] **IA de verdad** (tareas por nave): CONQUISTAR el planeta neutral más
      cercano (por presencia, máx. 2 naves por planeta), MINAR asteroides (los ◈
      van a la hucha de la facción), DEFENDER la capital y ATACAR en guerra.
      La facción acumula ◈ y **construye naves** (60◈, 20 s; tope = 2 + planetas
      propios). Muerte real también para las naves imperiales.
- [x] **Diplomacia estratégica facción↔facción**: neutrales por defecto y NADIE
      ataca en paz. Cada ~40 s cada facción decide por poder relativo: guerra si
      muy superior (×1.6, 25 %), alianza si igualados (15 %), paz si la guerra va
      mal o se alarga. Guerras, paces, alianzas y caídas de capitales se anuncian
      en el chat.
- [x] **Disciplina de fuego de tus wingmen**: en paz no atacan a nadie; solo si
      estáis en GUERRA o si tú/tu flota dañáis primero a esa facción
      (provocación ~45 s; dañar escudos también cuenta). Defensa propia: si os
      disparan a ti o a tu flota, pueden responder.
- [x] **Clasificación por imperios** (🪐 planetas · 🛰 naves · ◈ créditos) y
      capitales enemigas visibles con ★ y anillo blanco.
- [x] Save v2 ampliado: estado de facciones (economía, relaciones, construcción),
      capitales de facción y provocaciones. E2E: **84 checks verdes**.

## RESTRICCIONES TÉCNICAS
- Vanilla JS + canvas, mismo estilo pixel-art. Nada de frameworks pesados.
- Mantener el sistema de guardado en localStorage (ampliarlo con las nuevas cosas).
- Mantener compatibilidad con el servidor WebSocket por salas (`server.js`).
- Cada fase debe quedar jugable y verificable antes de pasar a la siguiente.
- Actualizar `README.md` y este archivo marcando checkboxes según avances.

## PRIMERA TAREA PARA EMPEZAR
Empezar por la **Fase A (zoom estratégico)** y la **Fase B (planeta hogar +
preparación)**, que son las que transforman la sensación del juego.
