import { COLS, ROWS, type TileScreen } from '../engine/render/tileScreen.ts';
import { CODE, printHi } from './tiles.ts';

/**
 * Shared screen frame for menus:
 *
 *   row 0      heading (highlight color, centered)
 *   row 1      brick rule
 *   rows 3-19  content
 *   row 20     message line
 *   row 21     brick rule
 *   rows 22-23 key hints
 */
export const CONTENT_TOP = 3;
export const MESSAGE_ROW = 20;
export const HINT_ROWS = [22, 23] as const;

export function brickRule(screen: TileScreen, row: number): void {
  for (let c = 0; c < COLS; c++) screen.put(c, row, CODE.brick);
}

export function drawFrame(screen: TileScreen, heading: string, hints: readonly string[], message = ''): void {
  screen.clear();
  printHi(screen, Math.floor((COLS - heading.length) / 2), 0, heading);
  brickRule(screen, 1);
  brickRule(screen, ROWS - 3);
  if (message) printHi(screen, Math.floor((COLS - message.length) / 2), MESSAGE_ROW, message);
  HINT_ROWS.forEach((row, i) => {
    if (hints[i]) screen.print(0, row, hints[i]);
  });
}

/** One menu row: a highlighted '>' and label when selected, plain otherwise. */
export function menuItem(screen: TileScreen, row: number, label: string, selected: boolean, col = 2): void {
  if (selected) {
    printHi(screen, col, row, '>');
    printHi(screen, col + 2, row, label);
  } else {
    screen.print(col + 2, row, label);
  }
}

/** Right-aligns n within width. */
export function rjust(n: number | string, width: number): string {
  return String(n).padStart(width, ' ');
}

/** Formats a modifier as +1 / -1 / blank for zero. */
export function signed(n: number): string {
  return n === 0 ? '' : n > 0 ? `+${n}` : String(n);
}
