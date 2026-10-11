# tod-web

A Chrome-first web remake of the 1982 TI-99/4A dungeon crawler *Tunnels of Doom*.

**Play the latest build:** https://tpurl.github.io/tod-web/

**Fidelity policy**

- **Mechanics:** reproduce the original exactly (party creation, store, dungeon walking, secret doors, rooms, treasure, combat, XP, multiple floors, quests).
- **Assets:** all graphics, sound effects, music, and text are newly created in the original's style (TMS9918A tiles and palette, SN76489 sound). Nothing is extracted from the ROM or scenario files.
- **Name:** `tod-web` is a working title. The original's name is not used for any public release.
- **Extensions:** features not in the original (e.g. races and race bonuses) are flagged as extensions and can be switched off for a "classic rules" game.

## Running locally

Requires Node 20+.

```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # typecheck + production build to dist/
```

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Confirm | Enter | ENTER button, or tap the game screen |
| Move / select | Arrow keys | D-pad (hold to repeat) |
| Back / delete | Esc or Backspace | BACK button |
| Letters and names | Type | ABC button opens the phone keyboard |

Touch controls appear automatically on phones and tablets. Add `?touch=1` to the URL to force them on a desktop, or `?touch=0` to hide them.

Test screen: arrows move the sprite, M toggles magnify, L toggles the 4-sprites-per-line limit, B cycles the backdrop color, Esc returns.

## Repository layout

| Path | Contents |
|---|---|
| `docs/DESIGN.md` | Design reference: architecture, specs, rules, milestones |
| `schemas/` | JSON Schemas (draft 2020-12) for all game data and save state |
| `data/` | Starter content: classes, races, sample items and monsters |
| `src/engine/render/` | Palette, TMS9918A-style tile screen, font, scaling, canvas display |
| `src/engine/input/` | Keyboard translation and queue, touch controls |
| `src/state/` | State machine and screens |
| `src/ui/` | Shared UI patterns and helpers |
| `tests/` | Vitest unit tests |
| `tools/calibration/` | Emulator capture notes and fitted tables |

## Conventions

- Imports use explicit `.ts` extensions.
- Erasable TypeScript only: no `enum`, `namespace`, or constructor parameter properties. This keeps every module runnable by Node's type stripping as well as Vite.
- Game rules stay in pure functions/classes with no DOM access, so they are unit-testable; only `display.ts`, `keyboard.ts`, `touchControls.ts`, and `main.ts` touch the browser.

## Deployment

CI runs tests and the build on every push and PR. Every push to `main` (and any manual run from the Actions tab) also deploys to GitHub Pages. Pages must be set to Settings > Pages > Source = "GitHub Actions".

## Target platform

Desktop Chrome (current stable) and mobile Chromium browsers. Other browsers should work; nothing is tested elsewhere.

## Status

Milestone 1 (scaffold, tile engine, palette, font, input) complete, plus touch controls. Next: milestone 2, party creation. See the milestone table in `docs/DESIGN.md`.
