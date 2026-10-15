import { createRng, type Rng } from '../../engine/rng.ts';
import {
  CELL,
  DIRS,
  STEP,
  cellAt,
  inRoom,
  reachable,
  roomAt,
  samePoint,
  type Dir,
  type Door,
  type Floor,
  type Point,
  type Room,
} from './floor.ts';

/**
 * Seeded floor generator (DESIGN.md section 7.2).
 *
 *   1. Place non-overlapping rooms with space for corridors between them.
 *   2. Join them with a minimum spanning tree of corridors plus a few loops.
 *   3. Put a door where each corridor meets a room; make some secret.
 *   4. Put stairs up and down in rooms far apart.
 *   5. Validate; if anything fails, retry with a derived seed.
 *
 * The same seed always produces the same floor.
 */
export interface GenOptions {
  width: number;
  height: number;
  roomsMin: number;
  roomsMax: number;
  /** Fraction of doors made secret. [CALIBRATE] */
  secretRate: number;
  /** Extra corridors beyond the spanning tree, so floors have loops. */
  extraLinks: number;
  /** False on the deepest floor. */
  hasDown: boolean;
}

/** 30x20 fills the map view exactly (one cell per 8x8 tile). [CALIBRATE] */
export const DEFAULT_GEN: GenOptions = {
  width: 30,
  height: 20,
  roomsMin: 5,
  roomsMax: 9,
  secretRate: 0.15,
  extraLinks: 2,
  hasDown: true,
};

/** Gap between room interiors: one wall ring each plus a corridor lane. */
const ROOM_GAP = 3;
const MAX_ATTEMPTS = 25;

export function generateFloor(seed: number, depth: number, opts: Partial<GenOptions> = {}): Floor {
  const o = { ...DEFAULT_GEN, ...opts };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = createRng((seed + attempt * 104729) >>> 0);
    const floor = build(rng, seed, depth, o);
    if (floor && validateFloor(floor).length === 0) return floor;
  }
  throw new Error(`could not generate floor ${depth} from seed ${seed}`);
}

// ---- building -------------------------------------------------------------

function build(rng: Rng, seed: number, depth: number, o: GenOptions): Floor | null {
  const { width, height } = o;
  const cells = new Uint8Array(width * height); // all wall
  const floor: Floor = { depth, seed, width, height, cells, rooms: [], doors: [], stairsUp: { x: 0, y: 0 }, stairsDown: null };

  placeRooms(rng, floor, o);
  if (floor.rooms.length < 3) return null;
  for (const r of floor.rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells[y * width + x] = CELL.room;
  }

  const ring = ringMask(floor);
  const links = chooseLinks(rng, floor.rooms, o.extraLinks);
  const joined: [number, number][] = [];
  for (const [a, b] of links) {
    if (connect(rng, floor, ring, floor.rooms[a], floor.rooms[b])) joined.push([a, b]);
  }

  // Stairs: up in a random room, down in the room farthest from it.
  const upRoom = rng.int(0, floor.rooms.length - 1);
  floor.stairsUp = randomInside(rng, floor.rooms[upRoom]);
  if (o.hasDown) {
    const dist = roomDistances(floor.rooms.length, joined, upRoom);
    let far = -1;
    dist.forEach((d, i) => {
      if (i !== upRoom && d >= 0 && (far < 0 || d > dist[far])) far = i;
    });
    if (far < 0) return null;
    floor.stairsDown = randomInside(rng, floor.rooms[far]);
  }

  makeSecrets(rng, floor, o.secretRate);
  return floor;
}

function placeRooms(rng: Rng, f: Floor, o: GenOptions): void {
  const target = rng.int(o.roomsMin, o.roomsMax);
  for (let tries = 0; tries < 400 && f.rooms.length < target; tries++) {
    const w = rng.int(3, 7);
    const h = rng.int(3, 5);
    // Interior keeps its wall ring off the outer border, which stays solid.
    if (f.width - 2 - w < 2 || f.height - 2 - h < 2) continue;
    const x = rng.int(2, f.width - 2 - w);
    const y = rng.int(2, f.height - 2 - h);
    const clash = f.rooms.some(
      (r) => !(x + w + ROOM_GAP <= r.x || r.x + r.w + ROOM_GAP <= x || y + h + ROOM_GAP <= r.y || r.y + r.h + ROOM_GAP <= y),
    );
    if (!clash) f.rooms.push({ id: f.rooms.length, x, y, w, h });
  }
}

/** Cells in any room's wall ring. Corridors may not run through these except at doors. */
function ringMask(f: Floor): Uint8Array {
  const mask = new Uint8Array(f.width * f.height);
  for (const r of f.rooms) {
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (!inRoom(r, x, y)) mask[y * f.width + x] = 1;
      }
    }
  }
  return mask;
}

const center = (r: Room): Point => ({ x: r.x + (r.w - 1) / 2, y: r.y + (r.h - 1) / 2 });
const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Minimum spanning tree over room centers (Prim), plus a few short extra links for loops. */
function chooseLinks(rng: Rng, rooms: Room[], extra: number): [number, number][] {
  const n = rooms.length;
  const inTree = [0];
  const links: [number, number][] = [];
  while (inTree.length < n) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const a of inTree) {
      for (let b = 0; b < n; b++) {
        if (inTree.includes(b)) continue;
        const d = manhattan(center(rooms[a]), center(rooms[b]));
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    links.push(best);
    inTree.push(best[1]);
  }
  const has = (a: number, b: number) => links.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  for (let i = 0, tries = 0; i < extra && tries < 30; tries++) {
    const a = rng.int(0, n - 1);
    // Prefer near neighbours so loops stay short.
    const others = rooms
      .map((r, j) => ({ j, d: manhattan(center(rooms[a]), center(r)) }))
      .filter((o) => o.j !== a && !has(a, o.j))
      .sort((p, q) => p.d - q.d);
    if (others.length === 0) continue;
    links.push([a, others[Math.min(others.length - 1, rng.int(0, 1))].j]);
    i++;
  }
  return links;
}

interface DoorSpot {
  door: Point;
  out: Point;
  side: Dir;
}

/** Candidate door positions on each side of a room, best-facing sides first. */
function doorSpots(rng: Rng, f: Floor, ring: Uint8Array, r: Room, toward: Point): DoorSpot[] {
  const c = center(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const order: Dir[] = [...DIRS].sort((p, q) => score(q) - score(p));
  function score(d: Dir): number {
    return STEP[d].dx * dx + STEP[d].dy * dy;
  }
  const spots: DoorSpot[] = [];
  for (const side of order) {
    const along: Point[] = [];
    if (side === 'n' || side === 's') {
      const y = side === 'n' ? r.y - 1 : r.y + r.h;
      for (let x = r.x; x < r.x + r.w; x++) along.push({ x, y });
    } else {
      const x = side === 'w' ? r.x - 1 : r.x + r.w;
      for (let y = r.y; y < r.y + r.h; y++) along.push({ x, y });
    }
    // Nearest to the target first, with a little jitter so doors vary.
    along.sort((p, q) => manhattan(p, toward) - manhattan(q, toward) + (rng.next() - 0.5) * 2);
    for (const door of along) {
      const out = { x: door.x + STEP[side].dx, y: door.y + STEP[side].dy };
      if (out.x < 1 || out.y < 1 || out.x > f.width - 2 || out.y > f.height - 2) continue;
      if (ring[out.y * f.width + out.x] || roomAt(f, out.x, out.y)) continue;
      // side here points away from the room; the stored door side points toward it.
      spots.push({ door, out, side });
    }
  }
  return spots;
}

function connect(rng: Rng, f: Floor, ring: Uint8Array, a: Room, b: Room): boolean {
  const fromA = doorSpots(rng, f, ring, a, center(b)).slice(0, 6);
  const fromB = doorSpots(rng, f, ring, b, center(a)).slice(0, 6);
  for (const sa of fromA) {
    for (const sb of fromB) {
      const path = corridorPath(f, ring, sa.out, sb.out);
      if (!path) continue;
      for (const p of path) f.cells[p.y * f.width + p.x] = CELL.corridor;
      addDoor(f, sa, a.id);
      addDoor(f, sb, b.id);
      return true;
    }
  }
  return false;
}

const TOWARD_ROOM: Readonly<Record<Dir, Dir>> = { n: 's', e: 'w', s: 'n', w: 'e' };

function addDoor(f: Floor, spot: DoorSpot, roomId: number): void {
  f.cells[spot.door.y * f.width + spot.door.x] = CELL.door;
  if (f.doors.some((d) => d.x === spot.door.x && d.y === spot.door.y)) return;
  const door: Door = { x: spot.door.x, y: spot.door.y, side: TOWARD_ROOM[spot.side], kind: 'normal', roomId };
  f.doors.push(door);
}

/** Shortest corridor through open rock (never through rooms or their walls). */
function corridorPath(f: Floor, ring: Uint8Array, from: Point, to: Point): Point[] | null {
  const W = f.width;
  const prev = new Int32Array(W * f.height).fill(-1);
  const start = from.y * W + from.x;
  const goal = to.y * W + to.x;
  prev[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (i === goal) break;
    const x = i % W;
    const y = (i - x) / W;
    for (const d of DIRS) {
      const nx = x + STEP[d].dx;
      const ny = y + STEP[d].dy;
      if (nx < 1 || ny < 1 || nx > W - 2 || ny > f.height - 2) continue;
      const ni = ny * W + nx;
      if (prev[ni] >= 0 || ring[ni] || cellAt(f, nx, ny) === CELL.room) continue;
      prev[ni] = i;
      queue.push(ni);
    }
  }
  if (prev[goal] < 0) return null;
  const path: Point[] = [];
  for (let i = goal; ; i = prev[i]) {
    path.push({ x: i % W, y: Math.floor(i / W) });
    if (i === start) break;
  }
  return path.reverse();
}

function randomInside(rng: Rng, r: Room): Point {
  return { x: rng.int(r.x, r.x + r.w - 1), y: rng.int(r.y, r.y + r.h - 1) };
}

/** Link-count distance from one room to every other (-1 if unreachable). */
function roomDistances(n: number, links: [number, number][], from: number): number[] {
  const dist = new Array(n).fill(-1);
  dist[from] = 0;
  const queue = [from];
  while (queue.length) {
    const a = queue.shift() as number;
    for (const [p, q] of links) {
      const b = p === a ? q : q === a ? p : -1;
      if (b >= 0 && dist[b] < 0) {
        dist[b] = dist[a] + 1;
        queue.push(b);
      }
    }
  }
  return dist;
}

/** Hides some doors, then reopens hidden ones until the stairs connect without them. */
function makeSecrets(rng: Rng, f: Floor, rate: number): void {
  for (const d of f.doors) if (rng.next() < rate) d.kind = 'secret';
  const target = f.stairsDown;
  if (!target) return;
  const W = f.width;
  while (!reachable(f, f.stairsUp)[target.y * W + target.x]) {
    const hidden = f.doors.filter((d) => d.kind === 'secret');
    if (hidden.length === 0) return;
    hidden[rng.int(0, hidden.length - 1)].kind = 'normal';
  }
}

// ---- validation -----------------------------------------------------------

/** Problems with a floor; an empty list means it is playable. */
export function validateFloor(f: Floor): string[] {
  const errors: string[] = [];
  const W = f.width;
  const up = roomAt(f, f.stairsUp.x, f.stairsUp.y);
  if (!up) errors.push('up stairs not in a room');
  if (f.stairsDown) {
    const down = roomAt(f, f.stairsDown.x, f.stairsDown.y);
    if (!down) errors.push('down stairs not in a room');
    else if (down === up) errors.push('stairs share a room');
    if (samePoint(f.stairsUp, f.stairsDown)) errors.push('stairs on one square');
    if (!reachable(f, f.stairsUp)[f.stairsDown.y * W + f.stairsDown.x]) errors.push('down stairs need a secret door');
  }

  const all = reachable(f, f.stairsUp, new Set(), true);
  for (const r of f.rooms) {
    if (!all[r.y * W + r.x]) errors.push(`room ${r.id} unreachable`);
  }

  for (let x = 0; x < W; x++) {
    if (cellAt(f, x, 0) !== CELL.wall || cellAt(f, x, f.height - 1) !== CELL.wall) errors.push('border breached');
  }
  for (let y = 0; y < f.height; y++) {
    if (cellAt(f, 0, y) !== CELL.wall || cellAt(f, W - 1, y) !== CELL.wall) errors.push('border breached');
  }

  for (const d of f.doors) {
    const inside = { x: d.x + STEP[d.side].dx, y: d.y + STEP[d.side].dy };
    const outside = { x: d.x - STEP[d.side].dx, y: d.y - STEP[d.side].dy };
    if (cellAt(f, d.x, d.y) !== CELL.door) errors.push(`door at ${d.x},${d.y} not marked`);
    if (cellAt(f, inside.x, inside.y) !== CELL.room) errors.push(`door at ${d.x},${d.y} not on a room`);
    const o = cellAt(f, outside.x, outside.y);
    if (o !== CELL.corridor && o !== CELL.door) errors.push(`door at ${d.x},${d.y} leads nowhere`);
  }
  return errors;
}
