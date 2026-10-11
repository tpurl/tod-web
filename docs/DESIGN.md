# tod-web Design Reference

Status: draft v0.1

This document is the source of truth for how the game works and how the code is organized. Anything marked **[CALIBRATE]** is a placeholder that must be replaced with values measured from the original running in an emulator. Anything marked **[EXT]** is an extension beyond the original and must be toggleable off.

---

## 1. Reference sources

| Source | Use |
|---|---|
| Original manual (scanned) | Rules, commands, item and spell descriptions, scenario goals |
| js99er.net (browser TI-99/4A emulator) | Side-by-side play, screenshots, timing, fight logs |
| Classic99 (Windows emulator) | Debugger, memory inspection when a formula is ambiguous |

Calibration procedure: play a fixed sequence in the emulator, record inputs and outcomes in `tools/calibration/*.md` (see section 17), then fit tables or formulas to the data.

---

## 2. Architecture

### 2.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Typed state, safe refactors |
| Build | Vite | Fast dev server, static output for GitHub Pages |
| Rendering | Canvas 2D, 256x192 back buffer, integer scale to window | Matches TMS9918A output exactly |
| Audio | WebAudio, custom SN76489 voice model | Authentic tone and noise |
| Persistence | IndexedDB | Multiple save slots, larger than localStorage |
| RNG | Seeded PRNG (mulberry32 or sfc32) | Reproducible floors and fights for testing |
| Tests | Vitest | Rules and generator unit tests |
| Content | JSON validated against `schemas/` | Scenarios swappable like the original's data files |

### 2.2 Source layout

```
src/
  engine/
    render/      tile engine, sprites, palette, font, corridor renderer
    audio/       SN76489 model, sfx table, music sequencer
    input/       keyboard map, key repeat, menu cursor
    rng.ts
    storage.ts   IndexedDB save slots
  state/         finite state machine and screen states
  game/
    party/       creation, rolling, leveling
    dungeon/     generator, floor model, visibility
    explore/     movement, search, food, events
    combat/      turn engine, actions, monster AI
    items/       definitions, identification, equip rules
    magic/       spells and effects
    store/       buy/sell
    scenario/    loader, goals, win/loss
  ui/            menus, status panels, message log
data/            JSON content
schemas/         JSON Schemas
tests/
```

### 2.3 Game loop

- The game is turn-based, so state advances only on input. A `requestAnimationFrame` loop handles animation, sound scheduling, and blinking cursors.
- Each state implements `enter()`, `exit()`, `onKey(key)`, `update(dt)`, `draw(screen)`.
- All game rules live in pure functions that take state + RNG and return new state + events. Rendering and audio subscribe to events. This keeps rules testable without a canvas.

---

## 3. State machine

| State | Enters from | Exits to |
|---|---|---|
| Title | boot, GameOver | ScenarioSelect, LoadGame |
| ScenarioSelect | Title | PartyCreation |
| LoadGame | Title | Explore |
| PartyCreation | ScenarioSelect | Store |
| Store | PartyCreation, Explore (store square) | Explore |
| Explore (map / corridor views) | Store, Combat, LevelUp | Combat, Store, Event, LevelUp, Victory, GameOver |
| Event (fountain, trap, treasure, message) | Explore | Explore |
| Combat | Explore | Explore, LevelUp, GameOver |
| LevelUp | Combat | Explore |
| Victory | Explore | Title |
| GameOver | Combat, Explore (starvation) | Title |

---

## 4. Display spec

### 4.1 Screen

| Property | Value |
|---|---|
| Resolution | 256 x 192 |
| Tile grid | 32 x 24 tiles of 8 x 8 pixels |
| Pattern table | 256 patterns, defined in `assets/patterns.json` |
| Color rule (Graphics I) | One foreground/background pair per group of 8 patterns |
| Color rule (Graphics II, corridor view) | One fg/bg pair per 8-pixel row of each tile |
| Sprites | 32 sprites, 16x16 or 8x8, single color each |
| Sprite line limit | 4 per scanline; emulate as an option (flicker), default off |
| Scaling | Largest integer multiple that fits; `image-rendering: pixelated` |
| Optional filter | Scanline / CRT shader overlay, default off |

### 4.2 Palette (TMS9918A)

| # | Name | Hex |
|---|---|---|
| 0 | Transparent | (backdrop) |
| 1 | Black | #000000 |
| 2 | Medium green | #21C842 |
| 3 | Light green | #5EDC78 |
| 4 | Dark blue | #5455ED |
| 5 | Light blue | #7D76FC |
| 6 | Dark red | #D4524D |
| 7 | Cyan | #42EBF5 |
| 8 | Medium red | #FC5554 |
| 9 | Light red | #FF7978 |
| 10 | Dark yellow | #D4C154 |
| 11 | Light yellow | #E6CE80 |
| 12 | Dark green | #21B03B |
| 13 | Magenta | #C95BBA |
| 14 | Gray | #CCCCCC |
| 15 | White | #FFFFFF |

### 4.3 Views

| View | Description |
|---|---|
| Map view | Top-down floor map of explored squares; party marker; rooms, doors, stairs shown once seen |
| Corridor view | First-person stepped perspective, depth 0 to 4 squares, walls/doors/openings drawn as filled polygons from a precomputed table |
| Room/combat view | Top-down room interior on a tile grid with party and monster sprites |
| Status panel | Names, HP, gold, food, floor number |

Corridor renderer: for each depth d (0..4) and each side (left, center, right) store the polygon for wall, door, and open passage. Build the table by tracing emulator screenshots **[CALIBRATE]**.

---

## 5. Audio spec (SN76489 model)

| Property | Value |
|---|---|
| Voices | 3 square-wave tone channels + 1 noise channel |
| Tone frequency | f = 111860.8 / N Hz, N = 10-bit divider (1..1023) |
| Volume | 16 attenuation steps of 2 dB (step 15 = off) |
| Noise | Periodic or white; rate = N/512, N/1024, N/2048, or tone channel 3 |
| Implementation | AudioWorklet generating samples directly, so square edges and noise LFSR match the chip |
| Scheduling | Events timestamped against `AudioContext.currentTime`, never `setTimeout` |
| Autoplay | Resume the AudioContext on the first keypress at the title screen |

### 5.1 Sound effect table (all newly composed)

| Id | Trigger |
|---|---|
| `step` | Each square moved |
| `bump` | Walk into wall |
| `door_open` | Door opened |
| `secret_found` | Secret door revealed |
| `stairs` | Change floor |
| `hit` / `miss` | Melee result |
| `shoot` | Ranged attack |
| `cast` | Spell cast |
| `monster_die` / `hero_die` | Deaths |
| `treasure` | Treasure found |
| `fountain` | Drink from fountain |
| `trap` | Trap triggered |
| `level_up` | Character gains a level |
| `music_title`, `music_victory`, `music_gameover` | Tunes |

---

## 6. Party and characters

### 6.1 Party

| Rule | Value |
|---|---|
| Party size | 1 to 4 |
| Solo play | A single character becomes the Hero class |
| Shared resources | Gold and food are party-wide |
| Names | Up to 10 characters **[CALIBRATE]** |

### 6.2 Classes

| Class | Role | Can cast | Weapon/armor limits |
|---|---|---|---|
| Fighter | Front-line melee | No | Any **[CALIBRATE]** |
| Wizard | Spellcaster | Yes | Light weapons, no heavy armor **[CALIBRATE]** |
| Rogue | Ranged / utility, better at searching **[CALIBRATE]** | No | Light armor **[CALIBRATE]** |
| Hero (solo only) | Combined abilities | Yes **[CALIBRATE]** | Any **[CALIBRATE]** |

Class data lives in `data/classes.json`.

### 6.3 Races [EXT]

Races are not in the original. When enabled they apply flat stat modifiers after rolling and may restrict classes. Defaults in `data/races.json`; "Human" has no modifiers so a classic game is equivalent to all-human.

### 6.4 Stats and rolling

| Stat | Purpose |
|---|---|
| Strength | Melee hit and damage bonus |
| Dexterity | Ranged hit, defense, initiative |
| Intelligence | Spell power and spell points (Wizard/Hero) |
| Constitution | Max HP bonus |
| HP | Hit points; 0 = dead |

The original's exact stat list and roll ranges are **[CALIBRATE]**. Working rule until calibrated:

1. Roll each stat as 3d6.
2. Apply race modifiers [EXT].
3. Max HP = class hit die (max at level 1) + Constitution bonus.
4. Player may reroll the whole character any number of times before accepting.

Store both `baseStats` (as rolled) and `stats` (after modifiers) so races can be toggled for testing.

---

## 7. Dungeon generation

### 7.1 Floor model

| Property | Value |
|---|---|
| Grid | W x H squares, default 24 x 24 **[CALIBRATE]** |
| Square types | wall, corridor, room floor |
| Edges | Doors are stored on the edge between two squares |
| Door kinds | normal, locked **[CALIBRATE]**, secret |
| Floors per game | Chosen by scenario/difficulty |
| Seed | `scenarioSeed + depth`, so a saved game regenerates identically |

### 7.2 Algorithm

1. Place N non-overlapping rooms (N scales with floor size **[CALIBRATE]**).
2. Connect rooms with a minimum spanning tree of corridors, then add a few extra loops.
3. Place doors where corridors meet rooms. Convert a fraction to secret doors; guarantee at least one non-secret route from up-stairs to down-stairs unless the scenario says otherwise.
4. Place up-stairs and down-stairs in different rooms, far apart.
5. Fill rooms from the floor's content tables (section 7.3).
6. Validate: every room reachable (counting secret doors), stairs reachable.

### 7.3 Room contents

| Feature | Behavior |
|---|---|
| Monsters | Group drawn from the scenario monster table for this depth; fight on entry or on approach |
| Treasure | Gold and/or items; may be guarded or trapped |
| Fountain | Drink: random effect (heal, harm, stat change, nothing) **[CALIBRATE]** |
| Trap | Damage or effect on entry/search; Rogue detection bonus **[CALIBRATE]** |
| Store / merchant | Opens Store state **[CALIBRATE]** whether this exists below floor 1 |
| Quest item / target | Placed on the scenario's target floor |
| Empty | Nothing |

---

## 8. Exploration

| Command | Effect |
|---|---|
| Forward / back / turn left / turn right | Move or face; one step costs food per section 8.1 |
| Toggle view | Map view vs corridor view |
| Open door | Opens door ahead |
| Search | Chance to reveal secret doors and traps on adjacent edges/squares |
| Listen | Hint whether a room ahead holds monsters **[CALIBRATE]** |
| Use item / cast | Out-of-combat items and spells |
| Stairs | Ascend/descend on a stairs square |
| Status | Show party sheet |
| Save | Write save slot |

### 8.1 Food

- Each step (or each N steps) consumes food **[CALIBRATE]**.
- At zero food the party takes HP loss per step until food is found or bought **[CALIBRATE]**.

### 8.2 Secret doors

- Hidden edges render as walls in both views until discovered.
- Search chance per adjacent hidden edge: base + Rogue bonus + Intelligence factor **[CALIBRATE]**.
- Once found, the door is stored as `discovered: true` and persists in the save.

---

## 9. Combat

### 9.1 Sequence

1. Combat starts when the party enters or approaches an occupied room.
2. Switch to room view; place party at the entry edge and monsters per room layout.
3. Optional parley: party may Talk before the first round (section 9.3).
4. Each round, every living combatant acts once in initiative order (Dexterity + d6 **[CALIBRATE]**).
5. Combat ends when all monsters are dead or fled, or the party flees or dies.
6. Award XP and gold; check for level ups; return to Explore.

### 9.2 Actions

| Action | Notes |
|---|---|
| Move | Up to movement allowance squares **[CALIBRATE]** |
| Melee attack | Adjacent target |
| Ranged attack | Needs ranged weapon and ammo; line of sight |
| Cast | Wizard/Hero; costs spell points |
| Use item | Potion, scroll, ring |
| Defend | Defense bonus until next turn **[CALIBRATE]** whether present |
| Flee | Party leaves via an exit; monsters may get free attacks |
| Talk | Only before combat begins (9.3) |

### 9.3 Talk

Some monsters are willing to talk. Outcomes: pass peacefully, demand gold, give information, or attack anyway. Each talking monster has a `talk` table in its data **[CALIBRATE]**.

### 9.4 Formulas (placeholders)

```
hitChance  = clamp(50 + 5 * (attackerSkill - targetDefense), 5, 95)   [CALIBRATE]
damage     = roll(weapon.damage) + strBonus(attacker)                  [CALIBRATE]
defense    = armor.defense + shield.defense + dexBonus(target)         [CALIBRATE]
strBonus(s) = floor((s - 10) / 2)                                       [CALIBRATE]
```

Monster AI behaviors: `melee` (close and attack), `ranged` (keep distance), `caster`, `coward` (flees at low HP).

---

## 10. Items, weapons, store

| Kind | Key fields |
|---|---|
| Weapon | damage dice, melee or ranged, range, ammo item, hands, class limits |
| Armor / shield | defense, class limits |
| Potion | effect, single use |
| Scroll | spell effect, single use |
| Ring | passive or charged effect |
| Food | rations added to party food |
| Ammo | stackable |
| Quest | scenario-specific, cannot be sold |

- Unidentified magic items show `unidentifiedName` until identified **[CALIBRATE]** whether the original identifies items.
- Store: buy at `price`, sell at a fraction of price **[CALIBRATE]**. Stock comes from the scenario's `store` list.

---

## 11. Magic

Spell list, costs, and effects to be transcribed as mechanics from the manual and re-described in original wording **[CALIBRATE]**. Each spell: `id`, `cost`, `target` (self, ally, enemy, all enemies, floor), `effect`, `usableIn` (explore, combat, both).

---

## 12. Experience and levels

- XP from killed monsters, split among living party members **[CALIBRATE]** split rule.
- Level threshold placeholder: `xpForLevel(n) = 100 * 2^(n - 2)` for n >= 2 **[CALIBRATE]**.
- On level up: HP gain = class hit die + Constitution bonus; possible stat gain **[CALIBRATE]**; spell points increase for casters.

---

## 13. Scenarios

| Scenario | Goal | Notes |
|---|---|---|
| Beginner (gold hunt) | Collect gold/treasure and return | Short, shallow, forgiving |
| Quest (rescue) | Find a captive and a quest item on the deepest floor and return | Full-length game |

Both are newly written content that matches the original's structure. Scenario files follow `schemas/scenario.schema.json`.

---

## 14. Save format

- One IndexedDB record per slot: `{ version, scenarioId, seed, party, floors: { [depth]: floorDelta }, turn, rngState }`.
- Floors regenerate from seed; only deltas (opened/discovered doors, looted rooms, killed monsters, explored squares) are saved.
- `version` allows migrations.

---

## 15. Chrome specifics

| Concern | Approach |
|---|---|
| Autoplay policy | Resume audio on first keypress |
| Key handling | `keydown` with `preventDefault` for arrows/space so the page never scrolls |
| Fullscreen | Optional, via Fullscreen API on a key |
| Offline | Service worker caches the build so it runs offline after first load |
| Hosting | GitHub Pages from `main` build output |

---

## 16. Milestones

| # | Milestone | Acceptance |
|---|---|---|
| 1 | Scaffold, tile engine, palette, font, input | Text and tiles pixel-perfect at 1x to 4x |
| 2 | Party creation | Roll, reroll, name, class (and race [EXT]) for 1 to 4 members |
| 3 | Store | Buy/sell, gold math, equip rules enforced |
| 4 | Generator + map view | Seeded floors pass validation (7.2 step 6) on 10,000 seeds |
| 5 | Corridor view | Every depth/side/feature combo matches traced reference |
| 6 | Room contents and events | Treasure, fountains, traps, monster placement working |
| 7 | Combat | All actions in 9.2 plus Talk working; fights resolve |
| 8 | XP and leveling | Matches calibrated tables |
| 9 | Multi-floor and scenarios | Both scenarios winnable end to end |
| 10 | Audio | All sfx and tunes; no clicks or drift |
| 11 | Save/load, offline, polish | Saves survive reload; runs offline |
| 12 | Fidelity pass | Calibration checklist signed off |

---

## 17. Calibration log template

One file per topic in `tools/calibration/`:

| Date | Emulator | Setup (party, gear, floor) | Action | Observed result | Notes |
|---|---|---|---|---|---|

Topics: stat rolls, HP by class, hit rate vs defense, damage by weapon, XP per monster, level thresholds, food rate, search success, fountain outcomes, store prices, corridor geometry.

---

## 18. Open questions

| Question | Resolve by |
|---|---|
| Exact stat list and roll ranges | Manual + emulator rolls |
| Hero class abilities in solo play | Manual |
| Are there locked doors and keys? | Emulator |
| Merchants below floor 1? | Emulator |
| Item identification rules | Manual |
| XP split rule | Emulator |
| Default floor size and count | Emulator |
