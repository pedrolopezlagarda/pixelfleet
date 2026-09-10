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

### Fase C — Ritmo y distancias
- [ ] Reducir todas las velocidades base (~÷3) y el consumo/ regeneración de
      combustible en consecuencia. El impulso solo en cortos, con coste alto.
- [ ] Escalas: el mundo se siente grande; cruzarlo debe ser una decisión de partida,
      no un paseo. Considerar aumentar el mundo a 12000×12000.
- [ ] Repostar combustible solo en planetas propios o neutrales “amistosos”, nunca
      en mitad del espacio.

### Fase D — Niebla de guerra
- [ ] Radio de visión por nave (ej. 600 px) y por planeta propio (ej. 1000 px).
- [ ] Fuera de la visión: ni naves ni planetas enemigos se dibujan (en zoom out,
      el mapa solo muestra lo explorado + territorio propio).
- [ ] Guardar en el save qué zonas están exploradas (persistente).

### Fase E — Combate y economía estratégica
- [x] Las naves cuestan créditos y tardan en construirse (cola de construcción en la
      capital). Empezar con 2-3 naves, no con infinitas vidas gratis. *(v0.6: 4 tipos
      construibles; empiezas con 1 caza y hangar vacío)*
- [ ] HP de naves altas (10-20 impactos) y daño por tipo de arma; reparar en
      planetas propios cuesta créditos y tiempo.
- [x] Al morir una nave, se pierde de verdad: hay que construir otra. *(v0.6: también
      tu propia nave; caza de emergencia si el hangar está vacío)*
- [ ] Recursos por planeta: además de créditos, cada planeta da mineral o
      combustible según su tipo (visual: paleta del planeta). Los escudos se
      recargan con mineral.
- [ ] Diplomacia más lenta: guerras se declaran, no pasan por un malentendido de 3
      disparos. Los bots no disparan salvo guerra declarada. *(v0.6: avance — daño
      simétrico con memoria persistente, hostil a -10 y guerra declarada a -30;
      falta que la paz sea totalmente segura)*

### Fase F — UI estratégica
- [ ] Panel de imperio (tecla TAB): lista de planetas propios, producción, naves,
      cola de construcción.
- [ ] ~~Órdenes con clic derecho: enviar nave seleccionada a planeta/coordenada.~~
      → **absorbido por la Fase G (v0.7)**, que lo amplía a selección de grupo + menú.
- [ ] Minimapa: solo visión actual + explorado.

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

## RESTRICCIONES TÉCNICAS
- Vanilla JS + canvas, mismo estilo pixel-art. Nada de frameworks pesados.
- Mantener el sistema de guardado en localStorage (ampliarlo con las nuevas cosas).
- Mantener compatibilidad con el servidor WebSocket por salas (`server.js`).
- Cada fase debe quedar jugable y verificable antes de pasar a la siguiente.
- Actualizar `README.md` y este archivo marcando checkboxes según avances.

## PRIMERA TAREA PARA EMPEZAR
Empezar por la **Fase A (zoom estratégico)** y la **Fase B (planeta hogar +
preparación)**, que son las que transforman la sensación del juego.
