import type { KeyPress } from '../../engine/input/keyboard.ts';
import type { Rng } from '../../engine/rng.ts';
import type { Party } from '../party/party.ts';
import { getMonster, groupName } from '../monsters/monsters.ts';
import {
  aliveMonsters,
  drinkFountain,
  isWiped,
  lootMessage,
  monsterGroups,
  stepOnTrap,
  takeTreasure,
  type RoomContents,
} from '../rooms/contents.ts';
import { arrive, contentsAt, getView, search, step, type Dungeon, type FloorView } from './dungeon.ts';
import { LEFT_OF, RIGHT_OF } from './corridorView.ts';
import { OPPOSITE, STEP, roomAt, samePoint, type Dir } from './floor.ts';

/**
 * Key-driven exploration (same pattern as PartyBuilder and StoreModel).
 *
 *   3D view (default): Up walks forward, Down steps back, Left/Right turn.
 *   Map view:          arrows walk north/east/south/west.
 *   Both:              V switches view, Enter uses stairs, S searches,
 *                      D drinks from a fountain.
 *
 * Stepping on a square resolves what is there: treasure is picked up
 * (unless monsters guard it), traps spring, fountains wait for D. Monsters
 * block their squares; fighting them is milestone 7.
 *
 * Taking the up stairs on floor 1 asks before leaving the dungeon.
 */
export type DungeonMode = 'explore' | 'confirmExit' | 'exited' | 'dead';

const ARROWS: Partial<Record<KeyPress['key'], Dir>> = { up: 'n', right: 'e', down: 's', left: 'w' };

export class DungeonModel {
  mode: DungeonMode = 'explore';
  /** First-person corridor view; false shows the map. */
  view3d = true;
  message = '';
  readonly dungeon: Dungeon;
  readonly party: Party;
  private readonly rng: Rng;

  constructor(dungeon: Dungeon, party: Party, rng: Rng, opts: { enter?: boolean } = {}) {
    this.dungeon = dungeon;
    this.party = party;
    this.rng = rng;
    if (opts.enter ?? true) {
      const v = getView(dungeon, 1);
      arrive(v, party, 1, v.floor.stairsUp);
      this.message = 'YOU ENTER THE DUNGEON';
    }
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
      if (p.key === 'enter' || (p.key === 'char' && p.char === 'Y')) this.mode = 'exited';
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
        this.message = `${groupName(getMonster(blocker.monsterId), 1)} BLOCKS THE WAY`;
        return;
      }
      const roomBefore = roomAt(this.view.floor, this.party.position.x, this.party.position.y);
      const moved = step(this.view, this.party, dir);
      // Stepping back in the 3D view keeps the party looking the same way.
      if (this.view3d) this.party.facing = facing;
      if (moved === 'blocked') {
        if (this.view3d) this.message = 'A WALL BLOCKS THE WAY';
        return;
      }
      const roomNow = roomAt(this.view.floor, this.party.position.x, this.party.position.y);
      if (roomNow && roomNow !== roomBefore) this.message = this.entryMessage(this.view.contents[roomNow.id]);
      this.resolveSquare();
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
      return;
    }
    if (p.key === 'char' && p.char === 'D') {
      const f = this.here?.fountain;
      if (!f || !samePoint(f, this.party.position)) this.message = 'THERE IS NOTHING TO DRINK';
      else if (f.used) this.message = 'THE FOUNTAIN IS DRY';
      else {
        this.message = drinkFountain(this.party, f, this.rng).message;
        if (isWiped(this.party)) this.mode = 'dead';
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

  /** Treasure, traps, and fountains on the party's square. */
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
      }
    }
    const trap = c.trap;
    if (trap && samePoint(trap, pos)) {
      const msg = stepOnTrap(this.party, trap, this.party.depth, this.rng);
      if (msg) this.message = msg;
      if (isWiped(this.party)) this.mode = 'dead';
    }
    const f = c.fountain;
    if (f && samePoint(f, pos) && !this.message) this.message = f.used ? 'THE FOUNTAIN IS DRY' : 'A FOUNTAIN. D TO DRINK';
  }

  private useStairs(): void {
    const depth = this.party.depth;
    if (this.onStairsDown) {
      const below = getView(this.dungeon, depth + 1);
      arrive(below, this.party, depth + 1, below.floor.stairsUp);
      this.message = `YOU DESCEND TO FLOOR ${depth + 1}`;
    } else if (this.onStairsUp) {
      if (depth === 1) {
        this.mode = 'confirmExit';
        return;
      }
      const above = getView(this.dungeon, depth - 1);
      arrive(above, this.party, depth - 1, above.floor.stairsDown ?? above.floor.stairsUp);
      this.message = `YOU CLIMB TO FLOOR ${depth - 1}`;
    } else {
      this.message = 'NO STAIRS HERE';
    }
  }
}
