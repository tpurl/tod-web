import type { KeyPress } from '../../engine/input/keyboard.ts';
import type { Rng } from '../../engine/rng.ts';
import type { Party } from '../party/party.ts';
import { arrive, getView, search, step, type Dungeon, type FloorView } from './dungeon.ts';
import { LEFT_OF, RIGHT_OF } from './corridorView.ts';
import { OPPOSITE, samePoint, type Dir } from './floor.ts';

/**
 * Key-driven exploration (same pattern as PartyBuilder and StoreModel).
 *
 *   3D view (default): Up walks forward, Down steps back, Left/Right turn.
 *   Map view:          arrows walk north/east/south/west.
 *   Both:              V switches view, Enter uses stairs, S searches.
 *
 * Taking the up stairs on floor 1 asks before leaving the dungeon.
 */
export type DungeonMode = 'explore' | 'confirmExit' | 'exited';

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
      const moved = step(this.view, this.party, dir);
      // Stepping back in the 3D view keeps the party looking the same way.
      if (this.view3d) this.party.facing = facing;
      if (moved === 'blocked') {
        if (this.view3d) this.message = 'A WALL BLOCKS THE WAY';
        return;
      }
      if (this.onStairsDown) this.message = 'STAIRS DOWN. ENTER TO DESCEND';
      else if (this.onStairsUp) this.message = this.party.depth === 1 ? 'STAIRS UP. ENTER TO LEAVE' : 'STAIRS UP. ENTER TO CLIMB';
      return;
    }
    if (p.key === 'enter') return this.useStairs();
    if (p.key === 'char' && p.char === 'S') {
      const n = search(this.view, this.party, this.rng);
      this.message = n === 0 ? 'YOU FIND NOTHING' : n === 1 ? 'YOU FIND A SECRET DOOR!' : `YOU FIND ${n} SECRET DOORS!`;
    }
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
