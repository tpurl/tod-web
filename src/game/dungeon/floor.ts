/**
 * Floor model, matching schemas/floor.schema.json.
 *
 * Cells are walls, corridors, room floor, or doors. Every room is a
 * rectangle of floor ringed by wall; a door is a cell in that ring that
 * joins the room to a corridor. Secret doors look and act like wall until
 * found.
 */
export const CELL = { wall: 0, corridor: 1, room: 2, door: 3 } as const;
export type Cell = (typeof CELL)[keyof typeof CELL];

export type Dir = 'n' | 'e' | 's' | 'w';
export const DIRS: readonly Dir[] = ['n', 'e', 's', 'w'];
export const STEP: Readonly<Record<Dir, { dx: number; dy: number }>> = {
  n: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 },
  s: { dx: 0, dy: 1 },
  w: { dx: -1, dy: 0 },
};
export const OPPOSITE: Readonly<Record<Dir, Dir>> = { n: 's', e: 'w', s: 'n', w: 'e' };

export interface Point {
  x: number;
  y: number;
}

/** Room interior rectangle (the ring of wall around it is not included). */
export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Door {
  x: number;
  y: number;
  /** Direction from the door toward the room it belongs to. */
  side: Dir;
  kind: 'normal' | 'secret';
  roomId: number;
}

export interface Floor {
  depth: number;
  seed: number;
  width: number;
  height: number;
  cells: Uint8Array;
  rooms: Room[];
  doors: Door[];
  stairsUp: Point;
  stairsDown: Point | null;
}

export function inBounds(f: Floor, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < f.width && y < f.height;
}

export function cellAt(f: Floor, x: number, y: number): Cell {
  return inBounds(f, x, y) ? (f.cells[y * f.width + x] as Cell) : CELL.wall;
}

export function inRoom(r: Room, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

export function roomAt(f: Floor, x: number, y: number): Room | undefined {
  return f.rooms.find((r) => inRoom(r, x, y));
}

export function doorIndexAt(f: Floor, x: number, y: number): number {
  return f.doors.findIndex((d) => d.x === x && d.y === y);
}

export function samePoint(a: Point | null, b: Point | null): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

/**
 * Whether a cell can be entered. Secret doors count only once found
 * (or when `allSecrets` is set, for "is everything reachable" checks).
 */
export function isPassable(
  f: Floor,
  x: number,
  y: number,
  found: ReadonlySet<number> = new Set(),
  allSecrets = false,
): boolean {
  const c = cellAt(f, x, y);
  if (c === CELL.wall) return false;
  if (c !== CELL.door) return true;
  const i = doorIndexAt(f, x, y);
  const d = f.doors[i];
  return d.kind === 'normal' || allSecrets || found.has(i);
}

/** Cells reachable from a start point, as a bitset. */
export function reachable(f: Floor, from: Point, found: ReadonlySet<number> = new Set(), allSecrets = false): Uint8Array {
  const seen = new Uint8Array(f.width * f.height);
  if (!isPassable(f, from.x, from.y, found, allSecrets)) return seen;
  const queue: number[] = [from.y * f.width + from.x];
  seen[queue[0]] = 1;
  while (queue.length) {
    const i = queue.shift() as number;
    const x = i % f.width;
    const y = Math.floor(i / f.width);
    for (const d of DIRS) {
      const nx = x + STEP[d].dx;
      const ny = y + STEP[d].dy;
      const ni = ny * f.width + nx;
      if (!inBounds(f, nx, ny) || seen[ni] || !isPassable(f, nx, ny, found, allSecrets)) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

/** Schema-style row strings: '#' wall, '.' corridor or door, 'r' room. */
export function toRows(f: Floor): string[] {
  const rows: string[] = [];
  for (let y = 0; y < f.height; y++) {
    let s = '';
    for (let x = 0; x < f.width; x++) {
      const c = cellAt(f, x, y);
      s += c === CELL.wall ? '#' : c === CELL.room ? 'r' : '.';
    }
    rows.push(s);
  }
  return rows;
}
