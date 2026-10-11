import { describe, expect, it } from 'vitest';
import { cssSize, integerScale } from '../src/engine/render/scaling.ts';

describe('integerScale', () => {
  it('picks the largest whole multiple that fits', () => {
    expect(integerScale(1920, 1080)).toBe(5);
    expect(integerScale(1024, 768)).toBe(4);
    expect(integerScale(800, 600)).toBe(3);
  });

  it('never goes below 1', () => {
    expect(integerScale(100, 100)).toBe(1);
  });

  it('works in device pixels', () => {
    expect(integerScale(1280, 720, 2)).toBe(7);
    expect(cssSize(7, 2)).toEqual({ width: 896, height: 672 });
  });
});
