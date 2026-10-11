import { describe, expect, it } from 'vitest';
import { COLOR, PALETTE, isColor } from '../src/engine/render/palette.ts';

describe('palette', () => {
  it('has 16 entries of RGB bytes', () => {
    expect(PALETTE).toHaveLength(16);
    for (const c of PALETTE) {
      expect(c).toHaveLength(3);
      for (const v of c) expect(v >= 0 && v <= 255).toBe(true);
    }
  });

  it('names map to indices 0..15 without gaps', () => {
    const values = Object.values(COLOR).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('black and white are exact', () => {
    expect(PALETTE[COLOR.black]).toEqual([0, 0, 0]);
    expect(PALETTE[COLOR.white]).toEqual([255, 255, 255]);
  });

  it('validates color indices', () => {
    expect(isColor(0)).toBe(true);
    expect(isColor(15)).toBe(true);
    expect(isColor(16)).toBe(false);
    expect(isColor(-1)).toBe(false);
    expect(isColor(1.5)).toBe(false);
  });
});
