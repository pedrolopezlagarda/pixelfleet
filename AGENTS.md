# PIXEL FLEET — Instrucciones de sesión

## Protocolo de memoria (decisión de Pedro, 2026-09-25)

**Al INICIAR cada sesión leer ÚNICAMENTE:**
`01 - Proyectos/Activos/PixelFleet/PixelFleet - Continuación (lee solo esto).md`
en la vault de Obsidian. Es la nota corta de continuación y sustituye a la
lectura de la nota madre y de las notas atómicas (estas quedan como archivo
histórico, no se leen más en sesión).

**Antes de acabar cada sesión (o al quedarse sin tokens):** actualizar esa
misma nota con el punto exacto donde se quedó el trabajo.

## Vault de Obsidian

Vault: `D:/OBSIDIAN/OBSIDIAN GENERAL PROYECTOS/Obsidian_Vault_Proyectos`

**Tras CADA cambio en el proyecto:**
1. Actualizar/crear la nota atómica del sistema tocado (frontmatter
   `tags: [pixelfleet, sistema, aprendizaje]`, sección Conexiones con wikilinks).
2. Añadir entrada en la bitácora de la nota madre (fecha + entrada + wikilink).
3. Actualizar la nota de continuación (estado actual + próximo paso).
4. Todo en español. Se editan los archivos DIRECTAMENTE en la vault (el
   conector REST del 19-09 dejó una nota a 0 bytes; si se usa, verificar tamaño > 0).

## Proyecto

Juego web vanilla JS + canvas (sin frameworks): `game.js` es el motor, `server.js` el
WebSocket multijugador. Roadmap y checklist de fases en `PROMPT.md`. Test E2E:
`PYTHONIOENCODING=utf-8 ../.venv/Scripts/python tools/verify_ui.py`.
