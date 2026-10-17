# Calibration reference

How the remake's rules compare with the original 1982 *Tunnels of Doom*, and
what is left to settle. Sources:

- **Manual**: TI, *Tunnels of Doom* (1982), 40 pp. Copy at
  <https://www.mocagh.org/ti994a/tunnelsofdoom-manual.pdf>. Page numbers below
  are the manual's own.
- **Emulator**: not yet used. Items marked *needs emulator* can only be
  settled by playing the original (for example in Classic99 or MAME) and
  measuring.

Status values:

| Status | Meaning |
|---|---|
| **Applied** | The remake now follows the manual. |
| **Planned** | Documented in the manual; not built yet. |
| **Extension** | Deliberate difference, kept on purpose (see notes). |
| **Needs emulator** | The manual gives no number; measure the original. |

## Party and classes

| Rule | Manual | Remake | Status |
|---|---|---|---|
| Party size | 1–4 players (p.20) | 1–4 | Applied (M2) |
| Hero | Solo games only; all weapons, armor, and scrolls; rogue's trap avoidance (p.20) | Same, with spells instead of scrolls | Applied; see Magic |
| Fighter | All weapons and armor, no scrolls (p.20) | Same | Applied |
| Wizard | Limited weapons and armor; scrolls; starts with one scroll (p.20) | Dagger, staff, sling (the sample wizard carries a dagger and sling, p.14); robe only | Applied (weapons); scroll start planned |
| Rogue | All weapons, limited armor, no scrolls, better trap avoidance on vaults and chests (p.20) | All weapons; robe or leather; trap avoidance | Applied in M12 |
| Class bonus to searching | None mentioned (p.25) | Removed in M12 (rogue had +20) | Applied |
| Races | None; everyone is human | Optional races, on by default | Extension (M2); turn off with R for classic play |
| Player colors | Green, blue, magenta, red (p.21) | Cyan, yellow, green, red | Planned |

## Movement, time, and food

| Rule | Manual | Remake | Status |
|---|---|---|---|
| Floors | Player chooses 1–10 (p.20) | Fixed per scenario (3 or 5) | Planned |
| Difficulty | Easiest, medium, hardest: number and meanness of monsters, starting gold (p.20) | None | Planned (top priority; see Balance) |
| Rooms per floor | 20 in Quest of the King (p.24) | 5–9 | Needs emulator for room sizes before changing the generator |
| Time | Steps counted per hallway view; searching and listening cost a step; every 10 steps the quest countdown drops, rations are eaten, and players partly heal (p.19) | Food and healing every 10 steps | Applied (food, healing); countdown planned |
| Healing on rations | Wounded and disabled players heal while rations last (p.19, p.29) | 1 HP per meal for everyone below max | Applied in M12; amount needs emulator |
| Starvation | No penalty described beyond no healing | Removed in M12 (was 1 HP per missed meal) | Applied |
| Rations price | 10 rations for 20 gold (p.14) | 10 for 20 | Applied in M12 (was 50 food for 10 gold) |
| Maps | Must find a floor's map before descending (p.34) | Not required | Planned (as an option) |
| Hallway turning | Arrows turn and walk relative to facing (p.24) | Same in 3D view | Applied (M5) |
| Listening at doors | L key (p.26) | Not built | Planned |
| Breaking doors | B key; whole party enters at once (p.25) | Not built | Planned |
| Formation | O key; front two enter first (p.24–25) | Not built | Planned |
| Stores below | Also on floors 4 and 8 (p.23) | Only at the entrance | Planned |

## Combat

| Rule | Manual | Remake | Status |
|---|---|---|---|
| Player turn | One step, then one attack; attacking first uses the turn (p.27) | Same | Applied in M12 (was 3 steps) |
| Experience | Goes to the player who lands the killing blow (p.28) | Same | Applied in M12 (was split) |
| Disabled players | Wounds equal to hit points disables a player; disabled players travel with the party and heal; a fully disabled party dies only if it meets monsters (p.29) | Same | Applied in M12 (was permanent death) |
| Hit-chance display | ++, +, 0, −, −− for the odds against each monster (p.27) | Not shown | Planned |
| Speed and mobility | Monsters have speed (attacks = speed − 1) and a chance to move (p.32) | Monsters move up to `move` squares and attack once | Needs emulator for values |
| Negotiation | N at any time; ends the round; success names a price, N again halves it; refusing ends talks for good and gives an extra move (p.29) | Talk only before the fight; one price | Planned |
| Weapons carried | Two per player; W swaps (p.22, p.30) | Two-weapon limit applied in M12; swapping not built | Applied (limit); swap planned |
| Roving monsters in halls | Yes (p.15) | Rooms only | Planned |

## Store and items

| Item | Manual | Remake | Status |
|---|---|---|---|
| Sling | 10 gold (p.22) | 10, 1d4, range 5 | Applied in M12 (damage needs emulator) |
| Short bow | 30 gold (p.22) | 30 (was 35) | Applied in M12 |
| Arrows | 20 for 20 gold (p.22) | 20 for 20 | Applied (M3) |
| Crossbow | 50 gold (p.22) | 50, 1d10, range 8 | Applied in M12 (damage needs emulator) |
| Quarrels | 10 for 20 gold (p.22) | 10 for 20 | Applied in M12 |
| Armor | Three types (p.22) | Robe, leather, chain mail | Applied; prices need emulator |
| Shields | One type (p.22) | One | Applied; price needs emulator |
| Healing | Bought per player; heals while walking (p.22, p.29) | Healing potions instead | Planned |
| Magic items | Up to 10 per player; one in five harmful in Quest of the King; uses unknown (p.32–33) | Potions, map scroll, ring | Planned |

## Rooms

| Feature | Manual | Remake | Status |
|---|---|---|---|
| Vaults | Combination puzzle with higher/lower clues; wrong guesses can wound (p.35) | Not built | Planned |
| Treasure chests | Usually two treasures; often trapped; rogues and heroes avoid traps (p.35) | Treasure piles; traps are on floor squares | Planned (move traps onto chests) |
| Fountains | In rooms and halls; each player chooses to drink; effects can change HP or luck (p.36) | Whole party drinks once; rooms only | Planned |
| Living statues | Identify magic items for gold (p.36) | Not built | Planned |
| Quest objects | Countdown to destruction every 10 steps (p.19, p.31) | No time limit | Planned |
| Victory level | Partly set by gold at the end (p.33) | Win or lose | Planned |

## Magic

The original has no spell points: wizards and heroes use **scrolls**, which
are magic items with an unknown number of uses (p.32–33). The remake's
spell-point system (Bolt, Heal, Blast) is an **Extension** for now. Replacing
it with scrolls is planned together with magic items, since both use the
same U command.

## Balance

Simulated in M12 with fresh 4-person parties (2 fighters, a rogue, a wizard;
store gear; party level equal to the floor) against every monster room in
150 generated dungeons:

| Floor | Party level | Fights | Party wins | Avg. rounds | HP left |
|---|---|---|---|---|---|
| 1 | 1 | 304 | 98.4% | 2.6 | 87% |
| 2 | 2 | 323 | 99.4% | 2.8 | 87% |
| 3 | 3 | 331 | 99.7% | 2.3 | 92% |
| 4 | 4 | 331 | 100.0% | 2.2 | 93% |
| 5 | 5 | 286 | 100.0% | 2.0 | 95% |

Single fights are too easy: the manual's sample quest describes its gremlin
and metalloid fights as "almost even" on the *easiest* setting (p.17–18).
The fix belongs with the planned difficulty setting, which the manual says
controls monster numbers and meanness (p.20): tune *medium* so a fresh party
at the floor's expected level ends a typical fight with about half its HP,
then derive *easiest* and *hardest* from it.
