import { pattern8, sprite16 } from '../engine/render/bitmap.ts';
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
  treasure: 176, // group 22
  fountain: 184, // group 23
  trap: 192, // group 24
} as const;

// prettier-ignore
const TREASURE = pattern8([
  '........',
  '........',
  '.######.',
  '.######.',
  '.#....#.',
  '.######.',
  '.######.',
  '........',
]);

// prettier-ignore
const FOUNTAIN = pattern8([
  '........',
  '...##...',
  '..#..#..',
  '........',
  '.######.',
  '.#....#.',
  '..####..',
  '........',
]);

// prettier-ignore
const TRAP = pattern8([
  '........',
  '.#....#.',
  '..#..#..',
  '...##...',
  '...##...',
  '..#..#..',
  '.#....#.',
  '........',
]);

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
  screen.definePattern(MAP_TILE.treasure, TREASURE);
  screen.definePattern(MAP_TILE.fountain, FOUNTAIN);
  screen.definePattern(MAP_TILE.trap, TRAP);
  screen.setCodeColor(MAP_TILE.treasure, COLOR.darkYellow, COLOR.black);
  screen.setCodeColor(MAP_TILE.fountain, COLOR.lightBlue, COLOR.black);
  screen.setCodeColor(MAP_TILE.trap, COLOR.mediumRed, COLOR.black);
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

/** Party marker sprites: 8x8 codes 0..3 for the map, 16x16 codes 16..28 for the room view. */
export const PARTY_SPRITE = { n: 0, e: 1, s: 2, w: 3 } as const;
export const PARTY_SPRITE_16 = { n: 16, e: 20, s: 24, w: 28 } as const;

/** Doubles 8x8 art to 16x16. */
export function double(rows: readonly string[]): string[] {
  return rows.flatMap((r) => {
    const wide = [...r].map((c) => c + c).join('');
    return [wide, wide];
  });
}

export function loadPartySprites(screen: TileScreen): void {
  let rows = ARROW_N;
  for (const d of ['n', 'e', 's', 'w'] as const) {
    screen.defineSpritePattern(PARTY_SPRITE[d], pattern8(rows));
    screen.defineSprite16(PARTY_SPRITE_16[d], sprite16(double(rows)));
    rows = rotateCW(rows);
  }
}
