import type { FloorView } from './dungeon.ts';
import { CELL, STEP, cellAt, doorIndexAt, type Dir, type Point } from './floor.ts';

/**
 * What the party sees looking down a corridor, as a list of slices from
 * the square they stand on (depth 0) outward. Each slice says what is to
 * the left, to the right, and (for the last slice) straight ahead. This is
 * the pure, testable half of the 3D view; corridorRenderer draws it.
 *
 * 'space' is open room floor beside a room square: nothing is drawn there.
 */
export type Side = 'wall' | 'open' | 'door' | 'space';

export interface Slice {
  depth: number;
  left: Side;
  right: Side;
  /** What blocks the view beyond this slice, or 'open' if it continues. */
  ahead: Side;
}

/** How far ahead the view reaches, in squares. */
export const MAX_DEPTH = 4;

export const LEFT_OF: Readonly<Record<Dir, Dir>> = { n: 'w', e: 'n', s: 'e', w: 's' };
export const RIGHT_OF: Readonly<Record<Dir, Dir>> = { n: 'e', e: 's', s: 'w', w: 'n' };

/** How a square looks from outside it. Undiscovered secret doors look like wall. */
export function sideAt(v: FloorView, x: number, y: number): Side {
  const c = cellAt(v.floor, x, y);
  if (c === CELL.wall) return 'wall';
  if (c === CELL.door) {
    const i = doorIndexAt(v.floor, x, y);
    return v.floor.doors[i].kind === 'secret' && !v.found.has(i) ? 'wall' : 'door';
  }
  return 'open';
}

export function corridorSlices(v: FloorView, from: Point, facing: Dir, maxDepth = MAX_DEPTH): Slice[] {
  const f = STEP[facing];
  const l = STEP[LEFT_OF[facing]];
  const r = STEP[RIGHT_OF[facing]];
  const slices: Slice[] = [];
  for (let d = 0; d <= maxDepth; d++) {
    const x = from.x + f.dx * d;
    const y = from.y + f.dy * d;
    const ahead = d === maxDepth ? 'open' : sideAt(v, x + f.dx, y + f.dy);
    const inRoomHere = cellAt(v.floor, x, y) === CELL.room;
    const side = (sx: number, sy: number): Side => {
      const s = sideAt(v, sx, sy);
      return s === 'open' && inRoomHere && cellAt(v.floor, sx, sy) === CELL.room ? 'space' : s;
    };
    slices.push({ depth: d, left: side(x + l.dx, y + l.dy), right: side(x + r.dx, y + r.dy), ahead });
    if (ahead !== 'open') break;
  }
  return slices;
}
