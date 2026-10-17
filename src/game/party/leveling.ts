import type { Rng } from '../../engine/rng.ts';
import { roll } from '../dice.ts';
import { statBonus, type Character } from './character.ts';
import { STAT_KEYS, getClass, type StatKey } from './rules.ts';

/**
 * Experience and levels (DESIGN.md section 12). Every number here is a
 * placeholder until calibrated against the original. [CALIBRATE]
 */
export const MAX_LEVEL = 10;

/** Total XP needed to reach a level: 100, 200, 400, 800, ... */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 100 * 2 ** (level - 2);
}

export function xpToNext(c: Character): number | null {
  if (c.level >= MAX_LEVEL) return null;
  return Math.max(0, xpForLevel(c.level + 1) - c.xp);
}

export interface LevelGain {
  name: string;
  level: number;
  hp: number;
  sp: number;
  stat: StatKey | null;
}

/** The class's main stat, which grows at every other level. */
const PRIME: Readonly<Record<string, StatKey>> = {
  fighter: 'strength',
  wizard: 'intelligence',
  rogue: 'dexterity',
  hero: 'constitution',
};

/** Raises a character one level: HP from the class die plus CON bonus, more SP for casters, a stat on even levels. */
export function levelUp(c: Character, rng: Rng): LevelGain {
  const cls = getClass(c.classId);
  c.level++;
  const hp = Math.max(1, roll(cls.hpDie, rng) + statBonus(c.stats.constitution));
  c.hp.max += hp;
  c.hp.current += hp;
  let sp = 0;
  if (c.spellPoints && cls.spellPointStat) {
    sp = Math.max(1, 1 + statBonus(c.stats[cls.spellPointStat]));
    c.spellPoints.max += sp;
    c.spellPoints.current += sp;
  }
  let stat: StatKey | null = null;
  if (c.level % 2 === 0) {
    stat = PRIME[c.classId] ?? STAT_KEYS[rng.int(0, STAT_KEYS.length - 1)];
    c.stats[stat] += 1;
  }
  return { name: c.name, level: c.level, hp, sp, stat };
}

/** Levels up every living character with enough XP, possibly several levels at once. */
export function applyLevelUps(members: readonly Character[], rng: Rng): LevelGain[] {
  const gains: LevelGain[] = [];
  for (const c of members) {
    while (c.hp.current > 0 && c.level < MAX_LEVEL && c.xp >= xpForLevel(c.level + 1)) gains.push(levelUp(c, rng));
  }
  return gains;
}

/** Wraith-style drain: loses XP but never below the current level's floor. */
export function drainXp(c: Character, fraction: number): number {
  const floor = xpForLevel(c.level);
  const loss = Math.min(c.xp - floor, Math.max(1, Math.floor(c.xp * fraction)));
  c.xp -= Math.max(0, loss);
  return Math.max(0, loss);
}
