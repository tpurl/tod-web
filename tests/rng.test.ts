import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng.ts';
import { maxRoll, minRoll, parseDice, roll } from '../src/game/dice.ts';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
  });

  it('int stays in range and hits both ends', () => {
    const r = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      expect(v >= 1 && v <= 6).toBe(true);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('rejects bad ranges', () => {
    expect(() => createRng(1).int(5, 1)).toThrow();
  });
});

describe('dice', () => {
  it('parses notation', () => {
    expect(parseDice('3d6')).toEqual({ count: 3, sides: 6, modifier: 0 });
    expect(parseDice('2d4+1')).toEqual({ count: 2, sides: 4, modifier: 1 });
    expect(parseDice('1d8-2')).toEqual({ count: 1, sides: 8, modifier: -2 });
    expect(() => parseDice('d6')).toThrow();
    expect(() => parseDice('0d6')).toThrow();
  });

  it('min and max', () => {
    expect(minRoll('3d6')).toBe(3);
    expect(maxRoll('3d6')).toBe(18);
    expect(maxRoll('1d10')).toBe(10);
  });

  it('rolls within bounds', () => {
    const r = createRng(9);
    for (let i = 0; i < 500; i++) {
      const v = roll('3d6', r);
      expect(v >= 3 && v <= 18).toBe(true);
    }
  });
});
