import type { SoundId } from '../../engine/audio/sounds.ts';
import type { KeyPress } from '../../engine/input/keyboard.ts';
import type { Rng } from '../../engine/rng.ts';
import { addItem } from '../items/inventory.ts';
import { getItem } from '../items/items.ts';
import { eatIfDue } from '../party/food.ts';
import type { Party } from '../party/party.ts';
import { FLAG_CAPTIVE, FLAG_ITEM, goalMet, type ScenarioDef } from '../scenario/scenarios.ts';
import { getMonster, groupName } from '../monsters/monsters.ts';
import {
  aliveMonsters,
  drinkFountain,
  isWiped,
  living,
  lootMessage,
  monsterGroups,
  stepOnTrap,
  takeTreasure,
  type RoomContents,
} from '../rooms/contents.ts';
import { arrive, contentsAt, getView, search, step, type Dungeon, type FloorView } from './dungeon.ts';
import { LEFT_OF, RIGHT_OF } from './corridorView.ts';
import { CELL, OPPOSITE, STEP, cellAt, roomAt, samePoint, type Dir, type Point } from './floor.ts';

/**
 * Key-driven exploration (same pattern as PartyBuilder and StoreModel).
 *
 *   3D view (default): Up walks forward, Down steps back, Left/Right turn.
 *   Map view:          arrows walk north/east/south/west.
 *   Both:              V switches view, Enter uses stairs, S searches,
 *                      D drinks from a fountain.
 *
 * Stepping on a square resolves what is there: treasure is picked up
 * (unless monsters guard it), traps spring, fountains wait for D, and on
 * the quest floor the captive and quest item are taken. Walking into a
 * room with hostile monsters, or bumping into one (even from a doorway it
 * blocks), starts a fight (mode 'combat'). Peaceful monsters step aside.
 * Every step may eat a ration.
 *
 * Taking the up stairs on floor 1 asks before leaving; leaving with the
 * scenario's goal met wins the game (mode 'won').
 *
 * Players knocked out by traps or fountains are disabled, not dead, and a
 * fully disabled party can still walk (and heal on rations). Meeting
 * monsters in that state ends the game (manual p.29).
 */
export type DungeonMode = 'explore' | 'confirmExit' | 'exited' | 'dead' | 'combat' | 'won';

/** Where a fight starts: the room, the square the party stepped onto, and where to retreat to. */
export interface CombatStart {
  roomId: number;
  entry: Point;
  retreat: Point;
  retreatFacing: Dir;
}

const ARROWS: Partial<Record<KeyPress['key'], Dir>> = { up: 'n', right: 'e', down: 's', left: 'w' };

export class DungeonModel {
  mode: DungeonMode = 'explore';
  message = '';
  /** Set when mode is 'combat'. */
  combat: CombatStart | null = null;
  /** Sounds the last key caused; the screen plays and clears them. */
  sounds: SoundId[] = [];
  readonly dungeon: Dungeon;
  readonly party: Party;
  readonly scenario: ScenarioDef | null;
  private readonly rng: Rng;

  constructor(dungeon: Dungeon, party: Party, rng: Rng, opts: { enter?: boolean; scenario?: ScenarioDef | null } = {}) {
    this.dungeon = dungeon;
    this.party = party;
    this.rng = rng;
    this.scenario = opts.scenario ?? null;
    if (opts.enter ?? true) {
      const v = getView(dungeon, 1);
      arrive(v, party, 1, v.floor.stairsUp);
      this.message = 'YOU ENTER THE DUNGEON';
    }
  }

  /** First-person corridor view; false shows the map. Kept on the dungeon so it survives fights. */
  get view3d(): boolean {
    return this.dungeon.view3d;
  }

  set view3d(on: boolean) {
    this.dungeon.view3d = on;
  }

  get view(): FloorView {
    return getView(this.dungeon, this.party.depth);
  }

  get onStairsUp(): boolean {
    return samePoint(this.party.position, this.view.floor.stairsUp);
  }

  get onStairsDown(): boolean {
    return samePoint(this.party.position, this.view.floor.stairsDown);
  }

  onKey(p: KeyPress): void {
    this.message = '';
    if (this.mode === 'confirmExit') {
      if (p.key === 'enter' || (p.key === 'char' && p.char === 'Y')) {
        this.mode = this.scenario && goalMet(this.scenario, this.party) ? 'won' : 'exited';
      }
      else if (p.key === 'back' || (p.key === 'char' && p.char === 'N')) this.mode = 'explore';
      return;
    }
    if (this.mode !== 'explore') return;

    if (p.key === 'char' && p.char === 'V') {
      this.view3d = !this.view3d;
      return;
    }
    if (this.view3d && (p.key === 'left' || p.key === 'right')) {
      this.party.facing = (p.key === 'left' ? LEFT_OF : RIGHT_OF)[this.party.facing];
      return;
    }
    const dir = this.view3d ? (p.key === 'up' ? this.party.facing : p.key === 'down' ? OPPOSITE[this.party.facing] : undefined) : ARROWS[p.key];
    if (dir) {
      const facing = this.party.facing;
      const target = { x: this.party.position.x + STEP[dir].dx, y: this.party.position.y + STEP[dir].dy };
      const blocker = this.monsterAt(target.x, target.y);
      if (blocker) {
        if (!this.view3d) this.party.facing = dir;
        const c = contentsAt(this.view, target) as RoomContents;
        const room = roomAt(this.view.floor, target.x, target.y);
        if (!c.peaceful && room) {
          if (this.helpless()) return;
          // Bumping a hostile monster starts the fight, even from a doorway it is blocking.
          this.mode = 'combat';
          this.combat = { roomId: room.id, entry: { ...this.party.position }, retreat: { ...this.party.position }, retreatFacing: OPPOSITE[dir] };
          return;
        }
        // A peaceful monster steps aside so it can never seal a doorway.
        if (!this.stepAside(c, blocker)) {
          this.message = `${groupName(getMonster(blocker.monsterId), 1)} BLOCKS THE WAY`;
          return;
        }
        this.message = `THE ${getMonster(blocker.monsterId).name.toUpperCase()} STEPS ASIDE`;
      }
      const roomBefore = roomAt(this.view.floor, this.party.position.x, this.party.position.y);
      const from = { ...this.party.position };
      const moved = step(this.view, this.party, dir);
      // Stepping back in the 3D view keeps the party looking the same way.
      if (this.view3d) this.party.facing = facing;
      if (moved === 'blocked') {
        if (this.view3d) this.message = 'A WALL BLOCKS THE WAY';
        this.sounds.push('bump');
        return;
      }
      this.sounds.push(cellAt(this.view.floor, this.party.position.x, this.party.position.y) === CELL.door ? 'door_open' : 'step');
      const roomNow = roomAt(this.view.floor, this.party.position.x, this.party.position.y);
      const asideMsg = this.message;
      if (roomNow && roomNow !== roomBefore) {
        const c = this.view.contents[roomNow.id];
        if (!c.peaceful && aliveMonsters(c).length > 0) {
          if (this.helpless()) return;
          this.mode = 'combat';
          this.combat = { roomId: roomNow.id, entry: { ...this.party.position }, retreat: from, retreatFacing: OPPOSITE[dir] };
          return;
        }
        this.message = this.entryMessage(c) || asideMsg;
      }
      this.resolveSquare();
      const wasWiped = isWiped(this.party);
      const hunger = eatIfDue(this.party);
      if (hunger && !this.message.startsWith('FOUND')) this.message = hunger;
      if (wasWiped && !isWiped(this.party)) this.message = 'YOUR PARTY STIRS AGAIN';
      if (!this.message) {
        if (this.onStairsDown) this.message = 'STAIRS DOWN. ENTER TO DESCEND';
        else if (this.onStairsUp) this.message = this.party.depth === 1 ? 'STAIRS UP. ENTER TO LEAVE' : 'STAIRS UP. ENTER TO CLIMB';
      }
      return;
    }
    if (p.key === 'enter') return this.useStairs();
    if (p.key === 'char' && p.char === 'S') {
      const r = search(this.view, this.party, this.rng);
      const found: string[] = [];
      if (r.doors) found.push(r.doors === 1 ? 'A SECRET DOOR' : `${r.doors} SECRET DOORS`);
      if (r.traps) found.push(r.traps === 1 ? 'A TRAP' : `${r.traps} TRAPS`);
      this.message = found.length ? `YOU FIND ${found.join(' AND ')}!` : 'YOU FIND NOTHING';
      if (found.length) this.sounds.push('secret_found');
      return;
    }
    if (p.key === 'char' && p.char === 'D') {
      const f = this.here?.fountain;
      if (!f || !samePoint(f, this.party.position)) this.message = 'THERE IS NOTHING TO DRINK';
      else if (f.used) this.message = 'THE FOUNTAIN IS DRY';
      else {
        this.message = drinkFountain(this.party, f, this.rng).message;
        this.sounds.push('fountain');
        if (isWiped(this.party)) this.message = 'ALL YOUR PLAYERS ARE DISABLED';
      }
    }
  }

  /** Contents of the room the party is in, if any. */
  get here(): RoomContents | undefined {
    return contentsAt(this.view, this.party.position);
  }

  /** Whether the party stands on an unused fountain (for the DRINK button). */
  get atFountain(): boolean {
    const f = this.here?.fountain;
    return !!f && !f.used && samePoint(f, this.party.position);
  }

  /** A fully disabled party that meets monsters is destroyed (manual p.29). */
  private helpless(): boolean {
    if (!isWiped(this.party)) return false;
    this.mode = 'dead';
    this.message = 'MONSTERS FIND YOUR HELPLESS PARTY';
    return true;
  }

  /** Moves a peaceful monster to the free room square farthest from the party. */
  private stepAside(c: RoomContents, m: { x: number; y: number }): boolean {
    const room = this.view.floor.rooms[c.roomId];
    const p = this.party.position;
    let best: { x: number; y: number } | null = null;
    let bestD = -1;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (this.monsterAt(x, y) || samePoint({ x, y }, p) || samePoint({ x, y }, m)) continue;
        const d = Math.abs(x - p.x) + Math.abs(y - p.y);
        if (d > bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    if (!best) return false;
    m.x = best.x;
    m.y = best.y;
    return true;
  }

  private monsterAt(x: number, y: number) {
    const c = contentsAt(this.view, { x, y });
    return c ? aliveMonsters(c).find((m) => m.x === x && m.y === y) : undefined;
  }

  private entryMessage(c: RoomContents): string {
    const groups = monsterGroups(c);
    if (groups.length === 0) return '';
    const g = groups[0];
    return `${groupName(getMonster(g.monsterId), g.count)}!`;
  }

  /** Treasure, traps, fountains, and quest objects on the party's square. */
  private resolveSquare(): void {
    const c = this.here;
    if (!c) return;
    const pos = this.party.position;
    const t = c.treasure;
    if (t && !t.taken && samePoint(t, pos)) {
      const guards = monsterGroups(c);
      if (guards.length) {
        this.message = `THE ${getMonster(guards[0].monsterId).name.toUpperCase()}${guards[0].count > 1 ? 'S GUARD' : ' GUARDS'} IT`;
      } else {
        this.message = lootMessage(takeTreasure(this.party, t));
        this.sounds.push('treasure');
      }
    }
    const trap = c.trap;
    if (trap && samePoint(trap, pos)) {
      const wasSprung = trap.sprung;
      const msg = stepOnTrap(this.party, trap, this.party.depth, this.rng);
      if (msg) this.message = msg;
      if (trap.sprung && !wasSprung) this.sounds.push('trap');
      if (isWiped(this.party)) this.message = 'ALL YOUR PLAYERS ARE DISABLED';
    }
    const f = c.fountain;
    if (f && samePoint(f, pos) && !this.message) this.message = f.used ? 'THE FOUNTAIN IS DRY' : 'A FOUNTAIN. D TO DRINK';
    const q = c.quest;
    if (q) {
      const guarded = aliveMonsters(c).length > 0;
      if (!q.captive.freed && samePoint(q.captive, pos)) {
        if (guarded) this.message = 'THE GUARDS STAND IN YOUR WAY';
        else {
          q.captive.freed = true;
          this.party.questFlags[FLAG_CAPTIVE] = true;
          this.message = `YOU FREE ${q.captive.name}!`;
          this.sounds.push('level_up');
        }
      }
      if (!q.item.taken && samePoint(q.item, pos)) {
        if (guarded) this.message = 'THE GUARDS STAND IN YOUR WAY';
        else {
          q.item.taken = true;
          this.party.questFlags[FLAG_ITEM] = true;
          // Carried by whoever has room; the flag counts even if packs are full.
          living(this.party).some((m) => addItem(this.party, m, q.item.itemId).result === 'ok');
          this.message = `YOU TAKE THE ${getItem(q.item.itemId).name.toUpperCase()}!`;
          this.sounds.push('treasure');
        }
      }
    }
  }

  /** What to say when asked to confirm leaving the dungeon. */
  get exitPrompt(): string {
    if (!this.scenario) return 'LEAVE THE DUNGEON?';
    return goalMet(this.scenario, this.party) ? 'RETURN IN TRIUMPH?' : 'LEAVE? THE QUEST IS NOT DONE';
  }

  private useStairs(): void {
    const depth = this.party.depth;
    if (this.onStairsDown) {
      const below = getView(this.dungeon, depth + 1);
      arrive(below, this.party, depth + 1, below.floor.stairsUp);
      this.message = `YOU DESCEND TO FLOOR ${depth + 1}`;
      this.sounds.push('stairs');
    } else if (this.onStairsUp) {
      if (depth === 1) {
        this.mode = 'confirmExit';
        return;
      }
      const above = getView(this.dungeon, depth - 1);
      arrive(above, this.party, depth - 1, above.floor.stairsDown ?? above.floor.stairsUp);
      this.message = `YOU CLIMB TO FLOOR ${depth - 1}`;
      this.sounds.push('stairs');
    } else {
      this.message = 'NO STAIRS HERE';
    }
  }
}
