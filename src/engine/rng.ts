/**
 * Seeded pseudo-random numbers (mulberry32). Every random decision in the
 * game goes through an Rng so floors, rolls, and fights are reproducible
 * from a seed, which makes tests and bug reports deterministic.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Internal state, for save games. */
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`bad int range ${min}..${max}`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    get state() {
      return s;
    },
  };
}

/** A seed from the clock, for new games. */
export function timeSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}
