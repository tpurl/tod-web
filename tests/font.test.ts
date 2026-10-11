import { describe, expect, it } from 'vitest';
import { FONT_FIRST, GLYPHS, glyphToBytes, loadFont } from '../src/engine/render/font.ts';
import { TileScreen } from '../src/engine/render/tileScreen.ts';

describe('font', () => {
  it('covers codes 32..95', () => {
    expect(GLYPHS).toHaveLength(64);
  });

  it('every glyph converts to 8 bytes with a blank last row and blank edge columns', () => {
    for (const g of GLYPHS) {
      const bytes = glyphToBytes(g);
      expect(bytes).toHaveLength(8);
      expect(bytes[7]).toBe(0);
      for (const b of bytes) expect(b & 0b10000011).toBe(0);
    }
  });

  it('space is blank and every other glyph has pixels', () => {
    GLYPHS.forEach((g, i) => {
      const lit = glyphToBytes(g).some((b) => b !== 0);
      expect(lit).toBe(i !== 0);
    });
  });

  it('glyphs are unique', () => {
    expect(new Set(GLYPHS).size).toBe(GLYPHS.length);
  });

  it('encodes A correctly', () => {
    const a = glyphToBytes(GLYPHS['A'.charCodeAt(0) - FONT_FIRST]);
    expect(a).toEqual([0x38, 0x44, 0x44, 0x7c, 0x44, 0x44, 0x44, 0x00]);
  });

  it('loads into the pattern table', () => {
    const s = new TileScreen();
    loadFont(s);
    expect(Array.from(s.patterns.slice(65 * 8, 66 * 8))).toEqual([0x38, 0x44, 0x44, 0x7c, 0x44, 0x44, 0x44, 0x00]);
  });

  it('rejects malformed glyphs', () => {
    expect(() => glyphToBytes('#####')).toThrow();
  });
});
