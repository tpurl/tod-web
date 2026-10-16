import { pattern8 } from '../engine/render/bitmap.ts';
import { COLOR } from '../engine/render/palette.ts';
import type { TileScreen } from '../engine/render/tileScreen.ts';

/**
 * Map-view tiles, in the per-screen range (codes 128+). One color group
 * per tile kind, since Graphics I colors by group of 8 codes.
 */
export const MAP_TILE = {
  wall: 128, // group 16
  corridor: 136, // group 17
  room: 144, // group 18
  door: 152, // group 19
  stairsUp: 160, // group 20
  stairsDown: 168, // group 21
} as const;

// prettier-ignore
const WALL = pattern8([
  '########',
  '...#....',
  '...#....',
  '...#....',
  '########',
  '.......#',
  '.......#',
  '.......#',
]);

// prettier-ignore
const CORRIDOR = pattern8([
  '........',
  '........',
  '........',
  '...##...',
  '...##...',
  '........',
  '........',
  '........',
]);

// prettier-ignore
const ROOM = pattern8([
  '#.......',
  '........',
  '........',
  '........',
  '....#...',
  '........',
  '........',
  '........',
]);

// prettier-ignore
const DOOR = pattern8([
  '########',
  '#......#',
  '#......#',
  '#......#',
  '#....#.#',
  '#......#',
  '#......#',
  '########',
]);

// prettier-ignore
const STAIRS_UP = pattern8([
  '......##',
  '......##',
  '....####',
  '....##..',
  '..####..',
  '..##....',
  '####....',
  '##......',
]);

// prettier-ignore
const STAIRS_DOWN = pattern8([
  '##......',
  '##......',
  '####....',
  '..##....',
  '..####..',
  '....##..',
  '....####',
  '......##',
]);

export function loadMapTiles(screen: TileScreen): void {
  screen.definePattern(MAP_TILE.wall, WALL);
  screen.definePattern(MAP_TILE.corridor, CORRIDOR);
  screen.definePattern(MAP_TILE.room, ROOM);
  screen.definePattern(MAP_TILE.door, DOOR);
  screen.definePattern(MAP_TILE.stairsUp, STAIRS_UP);
  screen.definePattern(MAP_TILE.stairsDown, STAIRS_DOWN);
  // Brick mortar in black over blue stone.
  screen.setCodeColor(MAP_TILE.wall, COLOR.black, COLOR.darkBlue);
  screen.setCodeColor(MAP_TILE.corridor, COLOR.gray, COLOR.black);
  screen.setCodeColor(MAP_TILE.room, COLOR.darkBlue, COLOR.black);
  screen.setCodeColor(MAP_TILE.door, COLOR.black, COLOR.darkYellow);
  screen.setCodeColor(MAP_TILE.stairsUp, COLOR.white, COLOR.black);
  screen.setCodeColor(MAP_TILE.stairsDown, COLOR.lightRed, COLOR.black);
}

// prettier-ignore
const ARROW_N = [
  '...##...',
  '..####..',
  '.######.',
  '########',
  '...##...',
  '...##...',
  '...##...',
  '........',
];

/** Rotates an 8x8 string grid 90 degrees clockwise. */
export function rotateCW(rows: readonly string[]): string[] {
  const n = rows.length;
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => rows[n - 1 - x][y]).join(''));
}

/** Party marker sprites 0..3, pointing n, e, s, w. */
export const PARTY_SPRITE = { n: 0, e: 1, s: 2, w: 3 } as const;

export function loadPartySprites(screen: TileScreen): void {
  let rows = ARROW_N;
  for (const code of [PARTY_SPRITE.n, PARTY_SPRITE.e, PARTY_SPRITE.s, PARTY_SPRITE.w]) {
    screen.defineSpritePattern(code, pattern8(rows));
    rows = rotateCW(rows);
  }
}
