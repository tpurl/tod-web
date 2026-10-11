import { COLOR, isColor } from './palette.ts';

/**
 * Model of the TMS9918A in Graphics I mode: a 32x24 name table of 8x8
 * patterns, one fg/bg color pair per group of 8 pattern codes, and 32
 * single-color sprites. render() produces one palette index per pixel.
 *
 * Simplifications vs. the real chip (documented, intentional):
 * - Sprites draw at their exact y (the chip draws at y+1).
 * - No y=208 sprite-list terminator; use Sprite.visible instead.
 * - The 4-sprites-per-line limit is optional (limitSpritesPerLine).
 */
export const SCREEN_WIDTH = 256;
export const SCREEN_HEIGHT = 192;
export const COLS = 32;
export const ROWS = 24;
export const MAX_SPRITES = 32;
export const SPRITES_PER_LINE = 4;

export interface Sprite {
  x: number;
  y: number;
  /** Sprite pattern code. For 16x16 sprites the low 2 bits are ignored. */
  pattern: number;
  color: number;
  visible: boolean;
}

function checkCode(code: number): void {
  if (!Number.isInteger(code) || code < 0 || code > 255) {
    throw new RangeError(`pattern code out of range: ${code}`);
  }
}

function checkRows(rows: ArrayLike<number>): void {
  if (rows.length !== 8) throw new RangeError(`pattern needs 8 rows, got ${rows.length}`);
}

/** Maps a character to its pattern code. Lowercase folds to uppercase; unknown becomes '?'. */
export function charToCode(ch: string): number {
  let c = ch.charCodeAt(0);
  if (c >= 97 && c <= 122) c -= 32;
  if (c < 32 || c > 95) return 63;
  return c;
}

export class TileScreen {
  readonly patterns = new Uint8Array(256 * 8);
  readonly spritePatterns = new Uint8Array(256 * 8);
  /** One byte per group of 8 codes: high nibble fg, low nibble bg. */
  readonly colorTable = new Uint8Array(32);
  readonly nameTable = new Uint8Array(COLS * ROWS);
  readonly sprites: Sprite[] = [];

  backdrop: number = COLOR.black;
  spriteSize: 8 | 16 = 16;
  spriteMagnify = false;
  limitSpritesPerLine = false;

  constructor() {
    this.colorTable.fill((COLOR.white << 4) | COLOR.transparent);
    this.nameTable.fill(32);
    for (let i = 0; i < MAX_SPRITES; i++) {
      this.sprites.push({ x: 0, y: 0, pattern: 0, color: COLOR.white, visible: false });
    }
  }

  definePattern(code: number, rows: ArrayLike<number>): void {
    checkCode(code);
    checkRows(rows);
    for (let i = 0; i < 8; i++) this.patterns[code * 8 + i] = rows[i] & 0xff;
  }

  defineSpritePattern(code: number, rows: ArrayLike<number>): void {
    checkCode(code);
    checkRows(rows);
    for (let i = 0; i < 8; i++) this.spritePatterns[code * 8 + i] = rows[i] & 0xff;
  }

  /** Defines a 16x16 sprite from 32 bytes in chip order: TL, BL, TR, BR quadrants. */
  defineSprite16(code: number, bytes: ArrayLike<number>): void {
    if (bytes.length !== 32) throw new RangeError(`16x16 sprite needs 32 bytes, got ${bytes.length}`);
    const base = code & 0xfc;
    for (let q = 0; q < 4; q++) {
      this.defineSpritePattern(base + q, Array.from({ length: 8 }, (_, i) => bytes[q * 8 + i]));
    }
  }

  setGroupColor(group: number, fg: number, bg: number): void {
    if (!Number.isInteger(group) || group < 0 || group > 31) {
      throw new RangeError(`color group out of range: ${group}`);
    }
    if (!isColor(fg) || !isColor(bg)) throw new RangeError(`bad color ${fg}/${bg}`);
    this.colorTable[group] = (fg << 4) | bg;
  }

  setCodeColor(code: number, fg: number, bg: number): void {
    checkCode(code);
    this.setGroupColor(code >> 3, fg, bg);
  }

  put(col: number, row: number, code: number): void {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    checkCode(code);
    this.nameTable[row * COLS + col] = code;
  }

  get(col: number, row: number): number {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1;
    return this.nameTable[row * COLS + col];
  }

  /** Writes text left to right, clipped at the right edge. Returns the column after the last character. */
  print(col: number, row: number, text: string): number {
    for (const ch of text) {
      this.put(col, row, charToCode(ch));
      col++;
    }
    return col;
  }

  /** Prints text centered on a row (left-biased when the width is odd). */
  printCentered(row: number, text: string): void {
    this.print(Math.floor((COLS - text.length) / 2), row, text);
  }

  fill(code: number): void {
    checkCode(code);
    this.nameTable.fill(code);
  }

  clear(): void {
    this.fill(32);
  }

  hideAllSprites(): void {
    for (const s of this.sprites) s.visible = false;
  }

  /** Renders to `out` (length 256*192), one resolved palette index (1..15) per pixel. */
  render(out: Uint8Array): void {
    if (out.length !== SCREEN_WIDTH * SCREEN_HEIGHT) {
      throw new RangeError(`render buffer must be ${SCREEN_WIDTH * SCREEN_HEIGHT} bytes`);
    }
    const backdrop = this.backdrop === COLOR.transparent ? COLOR.black : this.backdrop;
    this.renderTiles(out, backdrop);
    this.renderSprites(out);
  }

  private renderTiles(out: Uint8Array, backdrop: number): void {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const code = this.nameTable[row * COLS + col];
        const color = this.colorTable[code >> 3];
        const fg = color >> 4 || backdrop;
        const bg = color & 0x0f || backdrop;
        const pBase = code * 8;
        for (let y = 0; y < 8; y++) {
          const bits = this.patterns[pBase + y];
          const oBase = (row * 8 + y) * SCREEN_WIDTH + col * 8;
          for (let x = 0; x < 8; x++) out[oBase + x] = bits & (0x80 >> x) ? fg : bg;
        }
      }
    }
  }

  private renderSprites(out: Uint8Array): void {
    const scale = this.spriteMagnify ? 2 : 1;
    const span = this.spriteSize * scale;

    // Pass 1 (ascending index): decide which lines each sprite may draw on.
    const lineUse = new Uint8Array(SCREEN_HEIGHT);
    const allowed: (Uint8Array | null)[] = new Array(MAX_SPRITES).fill(null);
    for (let i = 0; i < MAX_SPRITES; i++) {
      const s = this.sprites[i];
      if (!s.visible) continue;
      const mask = new Uint8Array(span);
      for (let dy = 0; dy < span; dy++) {
        const y = s.y + dy;
        if (y < 0 || y >= SCREEN_HEIGHT) continue;
        if (this.limitSpritesPerLine && lineUse[y] >= SPRITES_PER_LINE) continue;
        lineUse[y]++;
        mask[dy] = 1;
      }
      allowed[i] = mask;
    }

    // Pass 2 (descending index): lower index draws on top.
    for (let i = MAX_SPRITES - 1; i >= 0; i--) {
      const s = this.sprites[i];
      const mask = allowed[i];
      if (!mask || s.color === COLOR.transparent) continue;
      const base = this.spriteSize === 16 ? s.pattern & 0xfc : s.pattern;
      for (let dy = 0; dy < span; dy++) {
        if (!mask[dy]) continue;
        const py = Math.floor(dy / scale);
        const y = s.y + dy;
        for (let dx = 0; dx < span; dx++) {
          const x = s.x + dx;
          if (x < 0 || x >= SCREEN_WIDTH) continue;
          const px = Math.floor(dx / scale);
          const quadrant = this.spriteSize === 16 ? (px >> 3) * 2 + (py >> 3) : 0;
          const byte = this.spritePatterns[(base + quadrant) * 8 + (py & 7)];
          if (byte & (0x80 >> (px & 7))) out[y * SCREEN_WIDTH + x] = s.color;
        }
      }
    }
  }
}
