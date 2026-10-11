# tod-web

A Chrome-first web remake of the 1982 TI-99/4A dungeon crawler *Tunnels of Doom*.

**Fidelity policy**

- **Mechanics:** reproduce the original exactly (party creation, store, dungeon walking, secret doors, rooms, treasure, combat, XP, multiple floors, quests).
- **Assets:** all graphics, sound effects, music, and text are newly created in the original's style (TMS9918A tiles and palette, SN76489 sound). Nothing is extracted from the ROM or scenario files.
- **Name:** `tod-web` is a working title. The original's name is not used for any public release.
- **Extensions:** features not in the original (e.g. races and race bonuses) are flagged as extensions and can be switched off for a "classic rules" game.

## Repository layout

| Path | Contents |
|---|---|
| `docs/DESIGN.md` | Design reference: architecture, specs, rules, milestones |
| `schemas/` | JSON Schemas (draft 2020-12) for all game data and save state |
| `data/` | Starter content: classes, races, sample items and monsters |
| `src/` | Game source (TypeScript + Vite), to be scaffolded in milestone 1 |
| `tools/calibration/` | Emulator capture notes and fitted tables |

## Target platform

Desktop Chrome (current stable). Other Chromium browsers should work; nothing is tested elsewhere.

## Status

Design phase. See the milestone table in `docs/DESIGN.md`.
