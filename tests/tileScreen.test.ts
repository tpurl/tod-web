import { describe, expect, it } from 'vitest';
import { sprite16 } from '../src/engine/render/bitmap.ts';
import { COLOR } from '../src/engine/render/palette.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH, TileScreen, charToCode } from '../src/engine/render/tileScreen.ts';

const buf = () => new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
const px = (out: Uint8Array, x: number, y: number) => out[y * SCREEN_WIDTH + x];
const solid16 = sprite16(Array.from({ length: 16 }, () => '#'.repeat(16)));

describe('charToCode', () => {
  it('maps ASCII, folds lowercase, and replaces unknowns with ?', () => {
    expect(charToCode('A')).toBe(65);
    expect(charToCode('a')).toBe(65);
    expect(charToCode(' ')).toBe(32);
    expect(charToCode('~')).toBe(63);
    expect(charToCode('\u00e9')).toBe(63);
  });
});

describe('TileScreen tiles', () => {
  it('print writes codes and clips at the right edge', () => {
    const s = new TileScreen();
    const end = s.print(30, 0, 'abc');
    expect(end).toBe(33);
    expect(s.get(30, 0)).toBe(65);
    expect(s.get(31, 0)).toBe(66);
    expect(s.get(32, 0)).toBe(-1);
  });

  it('renders fg and bg from the color group', () => {
    const s = new TileScreen();
    s.definePattern(8, [0x80, 0, 0, 0, 0, 0, 0, 0]);
    s.setCodeColor(8, COLOR.cyan, COLOR.darkBlue);
    s.put(1, 1, 8);
    const out = buf();
    s.render(out);
    expect(px(out, 8, 8)).toBe(COLOR.cyan);
    expect(px(out, 9, 8)).toBe(COLOR.darkBlue);
    expect(px(out, 8, 9)).toBe(COLOR.darkBlue);
  });

  it('transparent resolves to the backdrop', () => {
    const s = new TileScreen();
    s.backdrop = COLOR.magenta;
    s.definePattern(8, [0xff, 0, 0, 0, 0, 0, 0, 0]);
    s.setCodeColor(8, COLOR.transparent, COLOR.transparent);
    s.put(0, 0, 8);
    const out = buf();
    s.render(out);
    expect(px(out, 0, 0)).toBe(COLOR.magenta);
    expect(px(out, 0, 1)).toBe(COLOR.magenta);
  });

  it('never outputs index 0', () => {
    const s = new TileScreen();
    s.backdrop = COLOR.transparent;
    const out = buf();
    s.render(out);
    expect(out.every((v) => v !== 0)).toBe(true);
  });

  it('rejects bad input', () => {
    const s = new TileScreen();
    expect(() => s.definePattern(256, [0, 0, 0, 0, 0, 0, 0, 0])).toThrow();
    expect(() => s.definePattern(0, [0, 0])).toThrow();
    expect(() => s.setGroupColor(32, 1, 1)).toThrow();
    expect(() => s.setGroupColor(0, 16, 1)).toThrow();
    expect(() => s.render(new Uint8Array(10))).toThrow();
  });
});

describe('TileScreen sprites', () => {
  it('draws a 16x16 sprite in quadrant order', () => {
    const s = new TileScreen();
    const rows = Array.from({ length: 16 }, () => '.'.repeat(16));
    rows[0] = '#' + '.'.repeat(14) + '#';
    rows[15] = '#' + '.'.repeat(15);
    s.defineSprite16(0, sprite16(rows));
    Object.assign(s.sprites[0], { x: 10, y: 20, pattern: 0, color: COLOR.lightRed, visible: true });
    const out = buf();
    s.render(out);
    expect(px(out, 10, 20)).toBe(COLOR.lightRed);
    expect(px(out, 25, 20)).toBe(COLOR.lightRed);
    expect(px(out, 10, 35)).toBe(COLOR.lightRed);
    expect(px(out, 11, 20)).toBe(COLOR.black);
  });

  it('magnify doubles size', () => {
    const s = new TileScreen();
    s.defineSprite16(0, solid16);
    s.spriteMagnify = true;
    Object.assign(s.sprites[0], { x: 0, y: 0, pattern: 0, color: COLOR.white, visible: true });
    const out = buf();
    s.render(out);
    expect(px(out, 31, 31)).toBe(COLOR.white);
    expect(px(out, 32, 0)).toBe(COLOR.black);
  });

  it('lower index draws on top', () => {
    const s = new TileScreen();
    s.defineSprite16(0, solid16);
    Object.assign(s.sprites[0], { x: 0, y: 0, pattern: 0, color: COLOR.white, visible: true });
    Object.assign(s.sprites[1], { x: 0, y: 0, pattern: 0, color: COLOR.darkRed, visible: true });
    const out = buf();
    s.render(out);
    expect(px(out, 5, 5)).toBe(COLOR.white);
  });

  it('clips at screen edges without throwing', () => {
    const s = new TileScreen();
    s.defineSprite16(0, solid16);
    Object.assign(s.sprites[0], { x: -8, y: 184, pattern: 0, color: COLOR.white, visible: true });
    const out = buf();
    s.render(out);
    expect(px(out, 0, 191)).toBe(COLOR.white);
  });

  it('enforces the 4-per-line limit by index when enabled', () => {
    const s = new TileScreen();
    s.defineSprite16(0, solid16);
    for (let i = 0; i < 5; i++) {
      Object.assign(s.sprites[i], { x: i * 20, y: 50, pattern: 0, color: COLOR.white, visible: true });
    }
    const out = buf();
    s.render(out);
    expect(px(out, 85, 55)).toBe(COLOR.white);
    s.limitSpritesPerLine = true;
    s.render(out);
    expect(px(out, 65, 55)).toBe(COLOR.white);
    expect(px(out, 85, 55)).toBe(COLOR.black);
  });
});
