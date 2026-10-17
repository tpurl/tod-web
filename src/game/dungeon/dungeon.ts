import { createRng, type Rng } from '../../engine/rng.ts';
import { populateFloor, type RoomContents } from '../rooms/contents.ts';
import type { QuestSpec } from '../scenario/scenarios.ts';
import type { Party } from '../party/party.ts';
import { getClass, getRace } from '../party/rules.ts';
import { CELL, DIRS, STEP, cellAt, doorIndexAt, isPassable, roomAt, type Dir, type Floor, type Point } from './floor.ts';
import { generateFloor } from './generator.ts';

/**
 * A dungeon is a stack of floors generated lazily from one seed, plus what
 * the party has learned about each: explored squares and found secret
 * doors. Floors regenerate identically from the seed, so a save only needs
 * the seed and these discoveries (DESIGN.md section 14).
 */
export const DEFAULT_FLOORS = 5; // [CALIBRATE]

export interface FloorView {
  floor: Floor;
  explored: Uint8Array;
  /** Indexes into floor.doors of secret doors the party has found. */
  found: Set<number>;
  /** Monsters, treasure, fountains, and traps, indexed by room id. */
  contents: RoomContents[];
}

export interface Dungeon {
  seed: number;
  floorCount: number;
  views: Map<number, FloorView>;
  /** The player's view choice, kept across fights and visits. */
  view3d: boolean;
  /** Where the scenario's captive and quest item are, if it has them. */
  quest: QuestSpec | null;
}

export function createDungeon(seed: number, floorCount = DEFAULT_FLOORS, quest: QuestSpec | null = null): Dungeon {
  return { seed: seed >>> 0, floorCount, views: new Map(), view3d: true, quest };
}

export function floorSeed(d: Dungeon, depth: number): number {
  return (d.seed + depth * 7919) >>> 0;
}

export function getView(d: Dungeon, depth: number): FloorView {
  let v = d.views.get(depth);
  if (!v) {
    const floor = generateFloor(floorSeed(d, depth), depth, { hasDown: depth < d.floorCount });
    const contents = populateFloor(floor, createRng((floorSeed(d, depth) ^ 0x5eed) >>> 0), d.quest);
    v = { floor, explored: new Uint8Array(floor.width * floor.height), found: new Set(), contents };
    d.views.set(depth, v);
  }
  return v;
}

function mark(v: FloorView, x: number, y: number): void {
  const f = v.floor;
  if (x >= 0 && y >= 0 && x < f.width && y < f.height) v.explored[y * f.width + x] = 1;
}

/**
 * Marks what the party can see from a square: a whole room (with its walls)
 * when standing in one, otherwise the squares around them.
 */
export function revealAround(v: FloorView, p: Point): void {
  const room = roomAt(v.floor, p.x, p.y);
  if (room) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) mark(v, x, y);
    }
    return;
  }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(v, p.x + dx, p.y + dy);
}

export function isExplored(v: FloorView, x: number, y: number): boolean {
  return v.explored[y * v.floor.width + x] === 1;
}

export type MoveResult = 'moved' | 'blocked';

/** Moves the party one square, facing that way either way. */
export function step(v: FloorView, party: Party, dir: Dir): MoveResult {
  party.facing = dir;
  const nx = party.position.x + STEP[dir].dx;
  const ny = party.position.y + STEP[dir].dy;
  if (!isPassable(v.floor, nx, ny, v.found)) return 'blocked';
  party.position = { x: nx, y: ny };
  party.stepsTaken++;
  revealAround(v, party.position);
  return 'moved';
}

/** Base chance per hidden door per search, in percent. [CALIBRATE] */
export const SEARCH_BASE = 25;
const SECRET_SENSE_BONUS = 15;

/** Best search chance in the party: base + class bonus + race perk. */
export function searchChance(party: Party): number {
  let best = 0;
  for (const m of party.members) {
    if (m.hp.current <= 0) continue;
    let c = SEARCH_BASE + getClass(m.classId).searchBonus;
    if (m.raceId && getRace(m.raceId).perks.includes('secret_door_sense')) c += SECRET_SENSE_BONUS;
    best = Math.max(best, c);
  }
  return Math.min(95, best);
}

/** Hidden doors in the 8 squares around a point. */
export function hiddenDoorsNear(v: FloorView, p: Point): number[] {
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const i = doorIndexAt(v.floor, p.x + dx, p.y + dy);
      if (i >= 0 && v.floor.doors[i].kind === 'secret' && !v.found.has(i)) out.push(i);
    }
  }
  return out;
}

export interface SearchResult {
  doors: number;
  traps: number;
}

/** One search: each nearby hidden door or trap is found on a successful roll. */
export function search(v: FloorView, party: Party, rng: Rng): SearchResult {
  const chance = searchChance(party);
  const out = { doors: 0, traps: 0 };
  for (const i of hiddenDoorsNear(v, party.position)) {
    if (rng.int(1, 100) <= chance) {
      v.found.add(i);
      const d = v.floor.doors[i];
      v.explored[d.y * v.floor.width + d.x] = 1;
      out.doors++;
    }
  }
  const p = party.position;
  for (const c of v.contents) {
    const t = c.trap;
    if (!t || t.found || t.sprung || Math.abs(t.x - p.x) > 1 || Math.abs(t.y - p.y) > 1) continue;
    if (rng.int(1, 100) <= chance) {
      t.found = true;
      out.traps++;
    }
  }
  return out;
}

/** Contents of the room containing a point, if any. */
export function contentsAt(v: FloorView, p: Point): RoomContents | undefined {
  const room = roomAt(v.floor, p.x, p.y);
  return room ? v.contents[room.id] : undefined;
}

/** Places the party on a floor at a point, facing into open space if possible. */
export function arrive(v: FloorView, party: Party, depth: number, at: Point): void {
  party.depth = depth;
  party.position = { ...at };
  party.facing = DIRS.find((d) => cellAt(v.floor, at.x + STEP[d].dx, at.y + STEP[d].dy) !== CELL.wall) ?? 'n';
  revealAround(v, at);
}
