import classData from '../../../data/classes.json';
import raceData from '../../../data/races.json';
import { parseDice } from '../dice.ts';

/**
 * Class and race definitions, loaded from data/*.json (the single source of
 * truth) and checked at startup so a bad edit fails loudly instead of
 * producing odd characters.
 */
export const STAT_KEYS = ['strength', 'dexterity', 'intelligence', 'constitution'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;
export type StatMods = Partial<Stats>;

export const STAT_ABBR: Readonly<Record<StatKey, string>> = {
  strength: 'STR',
  dexterity: 'DEX',
  intelligence: 'INT',
  constitution: 'CON',
};

export type ClassId = 'fighter' | 'wizard' | 'rogue' | 'hero';

export interface CharacterClass {
  id: ClassId;
  name: string;
  /** One-line description for menus (28 characters max). */
  blurb: string;
  hpDie: string;
  canCast: boolean;
  spellPointStat?: StatKey;
  searchBonus: number;
  /** Better chance to avoid traps (manual p.20: rogues and heroes). */
  trapAvoidance: boolean;
  soloOnly: boolean;
  /** Item ids this class may wield; null means any weapon its item rules allow. */
  weaponLimits: string[] | null;
  /** Armor and shield ids this class may wear; null means any. */
  armorLimits: string[] | null;
}

export interface Race {
  id: string;
  name: string;
  /** One-line description for menus (28 characters max). */
  blurb: string;
  mods: StatMods;
  allowedClasses: ClassId[];
  perks: string[];
}

export const BLURB_MAX = 28;

function checkBlurb(v: unknown, id: string): string {
  const s = v === undefined ? '' : String(v);
  if (s.length > BLURB_MAX) throw new Error(`blurb for ${id} is longer than ${BLURB_MAX} characters`);
  return s;
}

function idList(v: unknown, id: string, field: string): string[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new Error(`classes.json: ${field} on ${id} must be null or a list of item ids`);
  }
  return v as string[];
}

const CLASS_IDS: readonly ClassId[] = ['fighter', 'wizard', 'rogue', 'hero'];

export function validateClasses(raw: unknown): CharacterClass[] {
  const list = (raw as { classes?: unknown }).classes;
  if (!Array.isArray(list) || list.length === 0) throw new Error('classes.json: no classes');
  return list.map((c: Record<string, unknown>) => {
    if (!CLASS_IDS.includes(c.id as ClassId)) throw new Error(`classes.json: unknown id ${String(c.id)}`);
    parseDice(String(c.hpDie));
    if (c.spellPointStat !== undefined && !STAT_KEYS.includes(c.spellPointStat as StatKey)) {
      throw new Error(`classes.json: bad spellPointStat on ${String(c.id)}`);
    }
    return {
      id: c.id as ClassId,
      name: String(c.name),
      blurb: checkBlurb(c.blurb, String(c.id)),
      hpDie: String(c.hpDie),
      canCast: Boolean(c.canCast),
      spellPointStat: c.spellPointStat as StatKey | undefined,
      searchBonus: Number(c.searchBonus ?? 0),
      trapAvoidance: c.trapAvoidance === true,
      soloOnly: Boolean(c.soloOnly),
      weaponLimits: idList(c.weaponLimits, String(c.id), 'weaponLimits'),
      armorLimits: idList(c.armorLimits, String(c.id), 'armorLimits'),
    };
  });
}

export function validateRaces(raw: unknown): Race[] {
  const list = (raw as { races?: unknown }).races;
  if (!Array.isArray(list) || list.length === 0) throw new Error('races.json: no races');
  return list.map((r: Record<string, unknown>) => {
    const mods = (r.mods ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(mods)) {
      if (!STAT_KEYS.includes(k as StatKey) || !Number.isInteger(v)) {
        throw new Error(`races.json: bad mod ${k} on ${String(r.id)}`);
      }
    }
    const allowed = r.allowedClasses as unknown[];
    if (!Array.isArray(allowed) || allowed.some((a) => !CLASS_IDS.includes(a as ClassId))) {
      throw new Error(`races.json: bad allowedClasses on ${String(r.id)}`);
    }
    return {
      id: String(r.id),
      name: String(r.name),
      blurb: checkBlurb(r.blurb, String(r.id)),
      mods: mods as StatMods,
      allowedClasses: allowed as ClassId[],
      perks: (r.perks as string[]) ?? [],
    };
  });
}

export const CLASSES: readonly CharacterClass[] = validateClasses(classData);
export const RACES: readonly Race[] = validateRaces(raceData);

export function getClass(id: ClassId): CharacterClass {
  const c = CLASSES.find((x) => x.id === id);
  if (!c) throw new Error(`unknown class ${id}`);
  return c;
}

export function getRace(id: string): Race {
  const r = RACES.find((x) => x.id === id);
  if (!r) throw new Error(`unknown race ${id}`);
  return r;
}

/** A solo adventurer is always the Hero; parties choose from the regular classes. */
export function classesForPartySize(size: number): CharacterClass[] {
  return CLASSES.filter((c) => (size === 1 ? c.soloOnly : !c.soloOnly));
}

export function racesForClass(classId: ClassId): Race[] {
  return RACES.filter((r) => r.allowedClasses.includes(classId));
}
