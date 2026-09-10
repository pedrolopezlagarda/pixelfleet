# PIXEL FLEET — Instrucciones de sesión

## Vault de Obsidian (memoria permanente)

Vault: `D:/OBSIDIAN/OBSIDIAN GENERAL PROYECTOS/Obsidian_Vault_Proyectos`

**Al INICIAR cada sesión (automático, sin preguntar):**
1. Leer la nota madre del proyecto: `01 - Proyectos/Activos/PixelFleet.md`.
2. Leer las notas atómicas relevantes en `01 - Proyectos/Activos/PixelFleet/`
   (empezar por `PixelFleet - Roadmap v0.5 (Estrategia real).md`, la memoria entre sesiones).
3. Leer `PROMPT.md` y `README.md` de este directorio para el estado del roadmap.

**Tras CADA cambio en el proyecto:**
1. Actualizar/crear la nota atómica del sistema tocado (frontmatter
   `tags: [pixelfleet, sistema, aprendizaje]`, sección Conexiones con wikilinks).
2. Añadir entrada en la bitácora de la nota madre (fecha + entrada + wikilink).
3. Todo en español.

**Guardado de código en Obsidian:** usar `D:/Scripts/obsidian_connector.py` con el venv
`D:/Kimi/.venv-obsidian` (ver `D:/Kimi/AGENTS.md` para el uso exacto; requiere Obsidian
abierto con el plugin Local REST API, puerto 27123, y `PYTHONIOENCODING=utf-8`).
Si la API no responde, avisar al usuario en lugar de fallar silenciosamente.

## Proyecto

Juego web vanilla JS + canvas (sin frameworks): `game.js` es el motor, `server.js` el
WebSocket multijugador. Roadmap y checklist de fases en `PROMPT.md`. Test E2E:
`PYTHONIOENCODING=utf-8 ../.venv/Scripts/python tools/verify_ui.py`.
