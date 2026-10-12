import type { Rng } from '../engine/rng.ts';

/** Parsed dice notation such as 3d6 or 2d4+1. */
export interface Dice {
  count: number;
  sides: number;
  modifier: number;
}

const DICE_RE = /^(\d+)d(\d+)([+-]\d+)?$/;

export function parseDice(notation: string): Dice {
  const m = DICE_RE.exec(notation.trim());
  if (!m) throw new Error(`bad dice notation: ${notation}`);
  const count = Number(m[1]);
  const sides = Number(m[2]);
  if (count < 1 || sides < 1) throw new Error(`bad dice notation: ${notation}`);
  return { count, sides, modifier: m[3] ? Number(m[3]) : 0 };
}

export function roll(notation: string | Dice, rng: Rng): number {
  const d = typeof notation === 'string' ? parseDice(notation) : notation;
  let total = d.modifier;
  for (let i = 0; i < d.count; i++) total += rng.int(1, d.sides);
  return total;
}

export function maxRoll(notation: string | Dice): number {
  const d = typeof notation === 'string' ? parseDice(notation) : notation;
  return d.count * d.sides + d.modifier;
}

export function minRoll(notation: string | Dice): number {
  const d = typeof notation === 'string' ? parseDice(notation) : notation;
  return d.count + d.modifier;
}
