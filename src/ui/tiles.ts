import { pattern8 } from '../engine/render/bitmap.ts';
import { COLOR } from '../engine/render/palette.ts';
import { loadFont } from '../engine/render/font.ts';
import type { TileScreen } from '../engine/render/tileScreen.ts';

/**
 * Pattern code allocation. Color is per group of 8 codes, so each distinct
 * fg/bg pairing needs its own group.
 *
 *   0..7     group 0      reserved (blank)
 *   8..15    group 1      brick
 *   16..23   group 2      solid block (big title letters)
 *   24..31   group 3      solid block, alternate color
 *   32..95   groups 4..11 font
 *   96..127  groups 12..15 free
 *   128..255 groups 16..31 per-screen use (e.g. palette swatches)
 */
export const CODE = {
  blank: 0,
  brick: 8,
  solid: 16,
  solidAlt: 24,
} as const;

export const FONT_GROUPS = [4, 5, 6, 7, 8, 9, 10, 11] as const;

export function setTextColor(screen: TileScreen, fg: number, bg: number = COLOR.transparent): void {
  for (const g of FONT_GROUPS) screen.setGroupColor(g, fg, bg);
}

/** Loads the font and shared UI patterns with default colors. */
export function loadUiTiles(screen: TileScreen): void {
  loadFont(screen);
  screen.definePattern(CODE.blank, [0, 0, 0, 0, 0, 0, 0, 0]);
  screen.definePattern(
    CODE.brick,
    pattern8([
      '########',
      '...#....',
      '...#....',
      '...#....',
      '########',
      '.......#',
      '.......#',
      '.......#',
    ]),
  );
  const full = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  screen.definePattern(CODE.solid, full);
  screen.definePattern(CODE.solidAlt, full);

  screen.setGroupColor(0, COLOR.transparent, COLOR.transparent);
  screen.setCodeColor(CODE.brick, COLOR.gray, COLOR.darkRed);
  screen.setCodeColor(CODE.solid, COLOR.darkYellow, COLOR.transparent);
  screen.setCodeColor(CODE.solidAlt, COLOR.darkRed, COLOR.transparent);
  setTextColor(screen, COLOR.white);
}
