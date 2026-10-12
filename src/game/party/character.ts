import type { Rng } from '../../engine/rng.ts';
import { maxRoll, roll } from '../dice.ts';
import { STAT_KEYS, getClass, getRace, type ClassId, type StatMods, type Stats } from './rules.ts';

/**
 * Characters, matching schemas/character.schema.json.
 * Every formula here is a placeholder until calibrated against the original
 * (DESIGN.md section 6.4) and is kept in one place so calibration is a
 * one-file change.
 */
export const NAME_MAX = 10;
export const STAT_DICE = '3d6'; // [CALIBRATE]

export interface ItemInstance {
  instanceId: string;
  itemId: string;
  identified?: boolean;
  quantity?: number;
  charges?: number;
}

export interface Character {
  id: string;
  name: string;
  classId: ClassId;
  raceId: string | null;
  baseStats: Stats;
  stats: Stats;
  hp: { current: number; max: number };
  spellPoints?: { current: number; max: number };
  level: number;
  xp: number;
  inventory: ItemInstance[];
  equipped: { weapon: string | null; armor: string | null; shield: string | null; ring: string | null };
  status: string[];
}

export function rollStats(rng: Rng): Stats {
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = roll(STAT_DICE, rng);
  return out;
}

export function applyMods(base: Stats, mods: StatMods): Stats {
  const out = { ...base };
  for (const k of STAT_KEYS) out[k] = Math.max(1, base[k] + (mods[k] ?? 0));
  return out;
}

/** Standard bonus curve: 10-11 is +0, each 2 points beyond is +/-1. [CALIBRATE] */
export function statBonus(value: number): number {
  return Math.floor((value - 10) / 2);
}

/** Level-1 hit points: the class die at maximum plus the Constitution bonus, never below 1. [CALIBRATE] */
export function startingHp(classId: ClassId, stats: Stats): number {
  return Math.max(1, maxRoll(getClass(classId).hpDie) + statBonus(stats.constitution));
}

/** Level-1 spell points for casters, else undefined. [CALIBRATE] */
export function startingSpellPoints(classId: ClassId, stats: Stats): number | undefined {
  const c = getClass(classId);
  if (!c.canCast || !c.spellPointStat) return undefined;
  return Math.max(1, Math.floor(stats[c.spellPointStat] / 3));
}

const NAME_RE = /^[A-Z0-9 .'-]+$/;

/** Normalizes a typed name (uppercase, trimmed, inner spaces collapsed). */
export function normalizeName(raw: string): string {
  return raw.toUpperCase().trim().replace(/\s+/g, ' ');
}

export type NameProblem = 'empty' | 'too_long' | 'bad_chars' | 'taken' | null;

export function checkName(raw: string, taken: readonly string[]): NameProblem {
  const name = normalizeName(raw);
  if (name.length === 0) return 'empty';
  if (name.length > NAME_MAX) return 'too_long';
  if (!NAME_RE.test(name)) return 'bad_chars';
  if (taken.includes(name)) return 'taken';
  return null;
}

export function createCharacter(opts: {
  id: string;
  name: string;
  classId: ClassId;
  raceId: string | null;
  baseStats: Stats;
}): Character {
  const stats = opts.raceId ? applyMods(opts.baseStats, getRace(opts.raceId).mods) : { ...opts.baseStats };
  const hp = startingHp(opts.classId, stats);
  const sp = startingSpellPoints(opts.classId, stats);
  return {
    id: opts.id,
    name: normalizeName(opts.name),
    classId: opts.classId,
    raceId: opts.raceId,
    baseStats: { ...opts.baseStats },
    stats,
    hp: { current: hp, max: hp },
    ...(sp !== undefined ? { spellPoints: { current: sp, max: sp } } : {}),
    level: 1,
    xp: 0,
    inventory: [],
    equipped: { weapon: null, armor: null, shield: null, ring: null },
    status: [],
  };
}
