import { glyphRows, GLYPHS, FONT_FIRST } from '../engine/render/font.ts';
import { charToCode, type TileScreen } from '../engine/render/tileScreen.ts';

/**
 * Draws text at 8x size: each lit font pixel becomes one tile of `code`.
 * Letters are 5 tiles wide with a 1-tile gap. Returns the width in tiles.
 */
export function bigTextWidth(text: string): number {
  return text.length === 0 ? 0 : text.length * 6 - 1;
}

export function drawBigText(screen: TileScreen, col: number, row: number, text: string, code: number): number {
  let x = col;
  for (const ch of text) {
    const rows = glyphRows(GLYPHS[charToCode(ch) - FONT_FIRST]);
    rows.forEach((r, dy) => {
      for (let dx = 0; dx < 5; dx++) if (r[dx] === '#') screen.put(x + dx, row + dy, code);
    });
    x += 6;
  }
  return bigTextWidth(text);
}
