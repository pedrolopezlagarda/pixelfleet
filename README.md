# 🚀 PIXEL FLEET — v1.4

Juego de **estrategia espacial** vista cenital, pixel-art, multijugador.
**Todas las facciones empiezan de cero**: su planeta capital y **una sola nave**,
igual que tú. La IA juega de verdad: conquista planetas, mina asteroides y
construye naves; negocia guerras y alianzas por pura **estrategia**. El espacio
es **grande de verdad** (12000×12000) y la **niebla de guerra** lo oculta todo:
explorar, expandirte y elegir tus guerras es el juego. Empiezas en tu **capital**
(escudo de 100 pts) con un caza y **5 minutos de preparación protegida**.
Construyes tu flota nave a nave y la controlas como en un **RTS**: selección por
cuadro, órdenes de grupo con el botón derecho. Y **todo se guarda**: tu partida,
la de las facciones y tu mapa explorado continúan donde los dejaste.

---

## Menú de inicio

- **▶ CONTINUAR PARTIDA / NUEVA PARTIDA** — si hay partida guardada la retomas
  (con la economía de los bots incluida); si no, empiezas de cero
- **¿CÓMO JUGAR?** — objetivo, controles y reglas
- **AJUSTES** — nombre de piloto, color de facción y **🗑 BORRAR PARTIDA**
  (empieza todo de nuevo; solo en partida nueva puedes cambiar nombre/color)
- **CÓDIGO DE SALA** (opcional) — juega solo con quien comparta el código + torneo a 10 bajas

## Controles

Todas las secciones tienen **icono clicable en la barra lateral izquierda** (el tooltip
muestra el atajo de teclado). No hace falta memorizar nada.

| Tecla | Acción |
|---|---|
| **WASD / Flechas** | Mover la nave |
| **Ratón** | Apuntar la nave |
| **Rueda del ratón** | Zoom estratégico (mapa completo ↔ detalle pixel) |
| **Clic (mantener)** | Disparar (mina asteroides y escudos) |
| **SHIFT + arrastrar** | Seleccionar naves de tu flota (cuadro, estilo Age of Empires) |
| **Clic** (con naves seleccionadas) | Mover el grupo a ese punto |
| **Clic derecho** | Menú de órdenes para la selección (o la nave bajo el cursor) |
| **ESPACIO** | Impulso (gasta combustible) |
| **B** | Tienda de mejoras |
| **F** | Panel de diplomacia |
| **C** | Contratos |
| **H** | Hangar: construir, desplegar y organizar tu flota |
| **TAB** | Panel de imperio: planetas, flota, guerras y alianzas de la galaxia |
| **T** | Cerrar el tutorial guiado |
| **ENTER** | Abrir chat |
| **ESC** | Cerrar paneles / chat / soltar la selección de flota |
| **M** | Volver al menú |

## Sistemas del juego

### 🏰 Capital y preparación (v0.5)
- Al entrar se elige tu **capital**: planeta propio con **escudo de 100 pts**, lejos de
  otras facciones. **Empiezas solo**: ningún bot tiene su hogar cerca ni aparece en tu zona.
- **Preparación (5:00)**: tu capital es invulnerable y los bots no te atacan ni entran
  en su radio. Banner con cuenta atrás; al acabar, la galaxia entra en juego.
- La capital **produce ×3 créditos** desde el primer segundo (partida nueva: 40◈ de fondos).
  **Economía igualada**: las facciones IA juegan con las mismas reglas — su capital
  produce igual y ganan por sus planetas; nadie empieza con ventaja.
- **Tutorial guiado** al entrar (partida nueva): 6 pasos que se completan con acciones
  reales. Se cierra con **T**.
- **Sin fuego amigo**: las naves y planetas de tu color son inmunes a tus disparos
  (y tú a los suyos). Los aliados nunca se atacan entre sí.
- Ritmo pausado: naves, bots, proyectiles y conquistas más lentos (la conquista tarda 6 s).
- Las facciones IA tienen **capitales propias** lejos de la tuya y expanden su
  imperio con su IA (v0.8): ya nadie aparece a tu lado a los 10 segundos.

### 🚀 Flota real (v0.6)
**Nada aparece gratis**: toda nave de tu color la has construido tú (las facciones
imperio son siempre de otros colores). Desde el hangar (H), junto a tu capital:

| Nave | Características | Coste | Construcción |
|---|---|---|---|
| Caza | Equilibrada | 60◈ | 15 s |
| Avispa | +35% velocidad, frágil | 150◈ | 25 s |
| Explorador | depósito ×1.6 | 200◈ | 30 s |
| Acorazado | +9 HP, lenta, fuego pesado | 300◈ | 40 s |

- La cola de construcción trabaja en la capital; al terminar, la nave va **al hangar**
  (máx. 10 guardadas) — no sale sola.
- Por cada nave decides: **SEGUIRME** (escolta en formación que dispara a tus
  agresores), **DEFENDER CAPITAL** (patrulla tu planeta), **RECOGER** (vuelve al
  hangar) o **PILOTAR** (la usas tú; tu nave anterior pasa al hangar).
  **La flota activa escala con tu imperio: 2 + 1 por cada planeta propio** —
  expandirse es la única forma de tener una flota grande.
- **Muerte real**: los wingmen caídos se pierden. Si TU nave es destruida, también la
  pierdes: reapareces en la capital con otra nave del hangar — o con un **caza de
  emergencia** si no te queda ninguna.

### 🎖️ Control RTS de flota (v0.7)
Tus naves desplegadas se controlan como en un **Age of Empires**:

- **Despliegue en GUARNICIÓN**: desde el hangar (H) la nave sale y **orbita tu
  capital** sin seguirte, lista para recibir órdenes.
- **Selección por cuadro**: mantén **SHIFT y arrastra** un rectángulo; las naves
  propias dentro quedan **marcadas con un aro blanco** (SHIFT+clic selecciona una sola).
- **Mover con el puntero**: con la selección activa, **clic izquierdo** en cualquier
  punto = el grupo va allí (verás la línea y el marcador de destino).
- **Menú de órdenes con clic derecho**: **MOVER AQUÍ · ATACAR ESTA ZONA · DEFENDER
  PLANETA** (lista de tus planetas conquistados, capital incluida) **· SEGUIRME ·
  GUARNICIÓN · PARAR · RECOGER** al hangar. Vale para **una nave o todo el grupo**
  (el menú indica a cuántas aplica).
- **ESC** cancela la selección sin dar orden. Con selección activa el clic da
  órdenes (no dispara); **al dar cualquier orden la selección se suelta sola**
  (v0.7.1) y vuelves a pilotar y disparar al instante.
- Las órdenes **se guardan en la partida**: al continuar, tu flota sigue ejecutándolas.

### 🧭 Ritmo y distancias (v1.0)
- El mundo es **12000×12000** (antes 8000): cruzarlo son **minutos reales**.
  Todas las velocidades ~÷3: tu nave, las imperiales, los wingmen y los
  proyectiles. Viajar es una decisión, no un paseo.
- **Combustible serio**: el impulso (ESPACIO) quema 40/s — úsalo en rachas
  cortas. **Solo repostas junto a planetas**: propios (30/s), de facciones
  aliadas (12/s) o neutros (8/s). En mitad del espacio no recuperas nada, y los
  asteroides ya no dan ⛽. *(Nunca te quedas varado: el crucero no gasta
  combustible, solo el impulso.)*

### 🌫️ Niebla de guerra (v0.9)
- Solo ves lo que está a **600 de tus naves** o **1000 de tus planetas**: naves
  enemigas, jugadores, disparos y explosiones fuera de visión **no se dibujan**.
- Lo explorado **queda para siempre**: atenuado, con el **último dueño conocido**
  de cada planeta. El mapa explorado **se guarda** con la partida.
- El minimapa y la clasificación respetan la niebla: de otros imperios solo ves
  lo que conoces (planetas vistos y naves avistadas).

### 🏛️ Panel de imperio (v0.9)
**TAB** o icono 🏛️: resumen del imperio (planetas, ◈/s, flota, hangar, cola de
construcción), tus planetas con escudo y producción, tu flota con su rol y el
**estado diplomático de la galaxia** (guerras ⚔️ y alianzas 🤝 entre facciones IA).

### 🌌 Facciones imperio: IA real (v0.8)
- **Inicio de cero**: galaxia virgen, sin planetas pre-conquistados. Cada facción
  IA (Aqua, Áurea, Carmesí, Verdi, Violeta, Ámbar — las que no elijas) empieza con
  su **capital** (★ visible, escudo 100) lejos de las demás y **1 sola nave**.
- **La IA juega**: sus naves **conquistan** planetas neutrales por presencia,
  **minan** asteroides (los ◈ van a la hucha de la facción) y **defienden** su
  capital. Con 60◈ la facción **construye una nave nueva** (20 s; tope = 2 +
  planetas propios). Las naves imperiales **mueren de verdad**.
- **Neutralidad por defecto**: nadie ataca a nadie en paz. Cada ~40 s cada
  facción decide por **estrategia**: si es mucho más fuerte que otra puede
  **declararle la guerra**; si están igualadas, **aliarse**; y si la guerra va
  mal, **firmar la paz**. Todo se anuncia en el chat (también la caída de
  capitales). Solo hay combate facción↔facción en guerra declarada o como
  **represalia** si les disparas.
- **Tus wingmen tienen disciplina**: en paz **no atacan a ninguna nave**, aunque
  la tengan al lado. Solo abren fuego si estáis en **GUERRA** con esa facción o
  si **tú empiezas** a dañarla (tus disparos y los de tu flota «provocan» a la
  facción ~45 s; dañar sus escudos también cuenta). Si os disparan primero,
  pueden responder en defensa propia.
- **Clasificación por imperios**: planetas 🪐, naves 🛰 y créditos ◈ de cada
  facción, ordenados por expansión.

### 💾 Persistencia total (v0.6/v0.8)
**Todo se guarda** (`localStorage`, save v2): tu posición, nave, mejoras y economía;
el **estado completo de cada facción imperio** (naves, hucha, relaciones,
construcción en curso); los planetas con sus dueños, escudos y capitales; tu flota
(hangar, wingmen, cola y órdenes RTS); la diplomacia; las provocaciones; los
contratos y el tiempo de preparación restante. El mundo es determinista: siempre
la misma galaxia.
Al continuar, la partida sigue exactamente donde la dejaste — para todos.
**🗑 BORRAR PARTIDA** (ajustes) lo reinicia todo.

### 🤝 Diplomacia con memoria (v0.6)
Relación por facción (-100…+100), persistente. **Si dañas a un bot en paz, su facción
se cabrea contigo** (-6 por impacto; -3 si el daño lo hace un wingman tuyo) y al revés
igual. A -10 son hostiles y te disparan; a -30 hay **GUERRA** declarada (anuncio en
chat). Tributo 100◈ (+40), guerra manual, deriva pacífica lenta.

### 🔭 Zoom estratégico (v0.5)
- **Rueda del ratón** para acercar/alejar (suavizado, de ×0,12 a ×3).
- Zoom lejano = **mapa de estrategia**: planetas como círculos del color de su facción,
  naves como puntitos, rejilla de referencia y tu capital marcada con un aro.
- Zoom cercano = render pixel-art de siempre. El HUD muestra el nivel de zoom.

### 🪐 Conquista y escudos
- Permanece cerca de un planeta ~6 s para conquistarlo (barra superior).
- Los planetas conquistados tienen **escudo de facción (25 pts)**: dispara al planeta para
  romperlo antes de capturar. El escudo **regenera 1,5 pts/s** — rompe rápido o vuelve a empezar.
- Conquistar: **+10 ◈**. Cada planeta propio: **+1 ◈/s** (la capital ×3). Zonas enemigas
  contestan la captura.

### 🎨 Gráficos (v1.5)
- **Sprite distinto por tipo de nave** (caza, avispa, acorazado, explorador), con
  escala según el modelo; los piratas van en dardo gris.
- **Estela de motor** en todas las naves al desplazarse (llama parpadeante).
- **Flash blanco** al recibir daño (antes la nave se transparentaba) y bots con
  **opacidad completa** (estaban al 75 %).

### 🔬 Árbol de tecnología (v1.4)
En la tienda (B), debajo de las mejoras base: cuando una mejora llega a **nivel 3**
se desbloquea su rama de tecnología — y solo puedes elegir **una de las dos**:
- **Propulsión**: Hipermotor (impulso ×3,2 y -25 % consumo) *o* Motor crucero
  (+35 % sin impulso).
- **Armas**: Bláster pesado (daño ×2, cadencia -25 %) *o* Enjambre (+60 % cadencia).
- **Defensa**: Escudo deflector (bloquea 1 impacto cada 20 s) *o* Casco reforzado
  (+8 HP).
- **Logística**: Extractor (minería +1◈ y ⛏ +50 %) *o* Hangar ampliado (+2 flota,
  +4 hangar).

Cuestan 400◈ y son permanentes (se guardan en la partida).

### 🎭 Personalidades y eventos galácticos (v1.3)
- **Cada facción IA tiene carácter** (se descubre al contactar con ella, en el
  panel de imperio o diplomacia): ⚔️ **conquistadora** (declara guerras con poca
  ventaja y manda más atacantes), 🛡️ **defensiva** (casi nunca ataca, poco a poco
  se expande), 💰 **mercantil** (+25 % de ingresos, prefiere alianzas), 🐦
  **oportunista** (se suma a guerras ya abiertas contra el débil).
- **Eventos galácticos** cada 90-180 s (tras la preparación), anunciados en el
  chat: 🏴‍☠️ **oleada de piratas** grises hostiles a todos, 🌟 **veta rica**
  (asteroides de una zona dan ◈×2 durante 60 s) y 🕳️ **agujeros de gusano**
  temporales que teletransportan entre dos puntos lejanos. Son transitorios:
  no se guardan en la partida.

### 💥 Combate y economía estratégica (v1.1)
- **HP alto**: naves de 10-20 impactos (tú: 12 base, +2 por nivel de blindaje;
  el Acorazado suma +9). Las bajas cuestan: **+25 ◈** por nave enemiga.
- **Reparación con coste**: junto a un planeta propio, tu nave se repara
  (+1 HP / 1,5 s por 5◈); tus wingmen también (+1/2 s por 2◈). La IA se repara
  junto a sus planetas.
- **Recursos por tipo de planeta** (icono junto al nombre): ⛏ **mineral**
  (produce ⛏ y alimenta la **recarga de escudos** de tus planetas — sin mineral
  no se regeneran), ⛽ **gas** (repostaje ×2), ◈ **créditos** (ingreso ×1; los
  demás ×0,5).
- **Victoria y derrota reales (v1.2)**: una facción **cae** cuando se queda sin
  planetas, naves ni construcción (la construcción muere con la capital).
  Elimina a las 5 facciones IA → **🏆 VICTORIA** (y puedes seguir en modo libre).
  Si tú te quedas sin planetas → **💀 imperio caído** hasta que reconquistes uno.
- La **guerra declarada ya no se enfría sola**: hay que pagar tributo para salir
  de ella. Las hostilidades leves sí se olvidan con el tiempo.

### ⛽ Combustible y minería
- Impulso caro (40/s); repostaje **solo junto a planetas** (propios 30/s, aliados
  12/s, neutros 8/s; en el espacio, nada). *(v1.0)*
- **Asteroides**: 22 campos de rocas, **+3 ◈** por asteroide, reaparición 20-40 s.

### 🔧 Tienda (B)
Motor +15% vel · Cadencia +25% fuego · Blindaje +2 HP · Depósito +25 combustible.
5 niveles por mejora, precio escalado ×1.4. Las mejoras son del piloto: se aplican
a cualquier nave que pilotes. Al llegar a nv.3 se desbloquea la **tecnología de la
rama** (ver arriba). La minería de tus **wingmen** también te da ◈ (v1.4).

### 📋 Contratos (C)
Hasta **2 contratos activos**: Caza (destruye naves, de una facción o cualquiera), Minería
(asteroides) y Conquista (planetas). Nuevas ofertas cada 45 s. Recompensas 16-200◈.

### 🏟️ Salas y torneos
Escribe un **código de sala** en el menú: solo ves y hablas con los de tu sala (con `server.js`).
En sala compite un **torneo: el primero en lograr 10 bajas gana**.

### 🏆 Clasificación · 💬 Chat · 🗺️ Minimapa
Top de **imperios** por planetas, naves y créditos · chat con ENTER · planetas por
facción, asteroides grises, tú en blanco.

### 👾 Multijugador
Modo simulado (5 facciones imperio con IA) sin servidor. Con `server.js`:

```bash
npm install ws
node server.js        # ws://localhost:8080
```

Posiciones a 10 Hz, disparos y chat retransmitidos **por sala**.

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Estructura e interfaz |
| `style.css` | Estilo retro pixelado |
| `game.js` | Motor completo + sistemas v0.3/v0.4/v0.5/v0.6 |
| `server.js` | Servidor WebSocket multijugador con salas |
| `tools/verify_ui.py` | Test E2E real (Playwright): 130 checks — menús, clics, tienda/tecnología, flota, RTS, facciones IA, niebla, economía, eventos, victoria, persistencia, zoom |
| `README.md` | Este documento |

### Tests E2E

```bash
python -m venv ../.venv && ../.venv/Scripts/pip install playwright && ../.venv/Scripts/python -m playwright install chromium
PYTHONIOENCODING=utf-8 ../.venv/Scripts/python tools/verify_ui.py   # desde app/
```

## Próximas ideas

Resto de la Fase E (HP alto 10-20 impactos, reparación con coste, recursos por
tipo de planeta) · tutorial del control RTS (Fase G, pendiente a petición de Pedro) ·
condición de victoria (eliminar facciones por su capital) · personalidades de
facción · misiones encadenadas en historia · jefes de facción · estaciones
espaciales comerciales · mapas con agujeros de gusano.

---

*v1.4 · árbol de tecnología (ramas excluyentes) · personalidades y eventos · victoria real · economía estratégica · niebla de guerra*

> ⚠️ El save v1.0 (`pixelfleet_save_v2`) no es compatible con partidas de versiones
> anteriores (el mundo cambia de tamaño): al entrar empezarás una partida nueva.
