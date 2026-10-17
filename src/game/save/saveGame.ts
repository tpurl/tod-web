import { createRng, type Rng } from '../../engine/rng.ts';
import { createDungeon, getView, type Dungeon } from '../dungeon/dungeon.ts';
import type { Floor } from '../dungeon/floor.ts';
import type { Party } from '../party/party.ts';
import type { RoomContents } from '../rooms/contents.ts';
import { SCENARIOS, type QuestSpec, type ScenarioDef } from '../scenario/scenarios.ts';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type DifficultyId } from '../scenario/difficulty.ts';

/**
 * Save games (DESIGN.md section 14). A save holds the party, the random
 * number generator's state, and the dungeon's seed plus what the party has
 * changed on each floor it visited: explored squares, found secret doors,
 * and room contents (monsters slain, treasure taken). Floors themselves are
 * regenerated from the seed; a fingerprint of each floor's layout catches
 * saves made by a version whose generator laid floors out differently.
 */
export const SAVE_VERSION = 1;

export type SavePlace = 'entrance' | 'dungeon';

export interface SavedFloor {
  depth: number;
  /** Fingerprint of the generated layout. */
  layout: number;
  /** One character per square: '1' explored, '0' not. */
  explored: string;
  found: number[];
  contents: RoomContents[];
}

export interface SaveData {
  version: number;
  savedAt: string;
  place: SavePlace;
  scenarioId: string | null;
  /** Missing in saves made before difficulty levels; those load as medium. */
  difficulty?: DifficultyId;
  rngState: number;
  party: Party;
  dungeon: {
    seed: number;
    floorCount: number;
    view3d: boolean;
    quest: QuestSpec | null;
    floors: SavedFloor[];
  } | null;
}

export interface Restored {
  difficulty: DifficultyId;
  party: Party;
  dungeon: Dungeon | null;
  scenario: ScenarioDef | null;
  rng: Rng;
  place: SavePlace;
}

export class SaveError extends Error {}

/** FNV-1a hash of a floor's cells, rooms, and stairs. */
export function layoutHash(f: Floor): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const c of f.cells) mix(c);
  for (const r of f.rooms) [r.x, r.y, r.w, r.h].forEach(mix);
  [f.stairsUp.x, f.stairsUp.y, f.stairsDown?.x ?? 255, f.stairsDown?.y ?? 255].forEach(mix);
  return h >>> 0;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function makeSave(opts: {
  party: Party;
  dungeon: Dungeon | null;
  scenario: ScenarioDef | null;
  rng: Rng;
  place: SavePlace;
  difficulty?: DifficultyId;
  now?: Date;
}): SaveData {
  const d = opts.dungeon;
  return {
    version: SAVE_VERSION,
    savedAt: (opts.now ?? new Date()).toISOString(),
    place: opts.place,
    scenarioId: opts.scenario?.id ?? null,
    difficulty: opts.dungeon?.difficulty ?? opts.difficulty ?? DEFAULT_DIFFICULTY,
    rngState: opts.rng.state,
    party: clone(opts.party),
    dungeon: d
      ? {
          seed: d.seed,
          floorCount: d.floorCount,
          view3d: d.view3d,
          quest: d.quest ? clone(d.quest) : null,
          floors: [...d.views.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([depth, v]) => ({
              depth,
              layout: layoutHash(v.floor),
              explored: Array.from(v.explored, (b) => (b ? '1' : '0')).join(''),
              found: [...v.found].sort((a, b) => a - b),
              contents: clone(v.contents),
            })),
        }
      : null,
  };
}

function check(ok: unknown, what: string): asserts ok {
  if (!ok) throw new SaveError(`SAVE IS DAMAGED (${what})`);
}

/** Rebuilds the game from a save; throws SaveError if it can't be trusted. */
export function restoreSave(raw: unknown): Restored {
  const s = raw as SaveData;
  check(s && typeof s === 'object', 'not a save');
  if (s.version !== SAVE_VERSION) throw new SaveError('SAVE IS FROM ANOTHER VERSION');
  check(s.place === 'entrance' || s.place === 'dungeon', 'place');
  check(Number.isInteger(s.rngState), 'random state');
  const p = s.party;
  check(p && Array.isArray(p.members) && p.members.length >= 1 && p.members.length <= 4, 'party');
  check(Number.isFinite(p.gold) && Number.isFinite(p.food) && Number.isInteger(p.depth), 'party numbers');
  const scenario = s.scenarioId ? (SCENARIOS.find((x) => x.id === s.scenarioId) ?? null) : null;
  if (s.scenarioId) check(scenario, 'scenario');

  const difficulty = s.difficulty ?? DEFAULT_DIFFICULTY;
  check(DIFFICULTIES.some((d) => d.id === difficulty), 'difficulty');
  let dungeon: Dungeon | null = null;
  if (s.dungeon) {
    const sd = s.dungeon;
    check(Number.isInteger(sd.seed) && Number.isInteger(sd.floorCount), 'dungeon');
    dungeon = createDungeon(sd.seed, sd.floorCount, sd.quest ? clone(sd.quest) : null, difficulty);
    dungeon.view3d = sd.view3d !== false;
    for (const f of sd.floors) {
      check(Number.isInteger(f.depth) && f.depth >= 1 && f.depth <= sd.floorCount, 'floor depth');
      const v = getView(dungeon, f.depth);
      if (layoutHash(v.floor) !== f.layout) throw new SaveError('SAVE IS FROM ANOTHER VERSION');
      check(f.explored.length === v.explored.length, 'explored squares');
      for (let i = 0; i < f.explored.length; i++) v.explored[i] = f.explored[i] === '1' ? 1 : 0;
      v.found = new Set(f.found.filter((i) => Number.isInteger(i) && i >= 0 && i < v.floor.doors.length));
      check(Array.isArray(f.contents) && f.contents.length === v.floor.rooms.length, 'room contents');
      v.contents = clone(f.contents);
    }
    check(p.depth >= 1 && p.depth <= sd.floorCount, 'party depth');
  } else {
    check(s.place === 'entrance', 'dungeon missing');
  }
  return { party: clone(p), dungeon, scenario, difficulty, rng: createRng(s.rngState), place: s.place };
}

/** One line per slot for the save and load screens. */
export interface SaveSummary {
  slot: number;
  savedAt: string;
  title: string;
  leader: string;
  members: number;
  depth: number;
  place: SavePlace;
}

export function summarize(slot: number, s: SaveData): SaveSummary {
  const sc = s.scenarioId ? SCENARIOS.find((x) => x.id === s.scenarioId) : null;
  return {
    slot,
    savedAt: s.savedAt,
    title: sc?.title ?? 'ADVENTURE',
    leader: s.party.members[0]?.name ?? '?',
    members: s.party.members.length,
    depth: s.party.depth,
    place: s.place,
  };
}

/** "10/17 09:03" in local time. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
