import difficultyData from '../../../data/difficulties.json';

/**
 * Difficulty levels (manual p.20): how many monsters, how mean they are,
 * and how much gold the party starts with. Monsters also grow tougher on
 * deeper floors (manual p.28). Loaded from data/difficulties.json.
 */
export type DifficultyId = 'easiest' | 'medium' | 'hardest';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  blurb: string;
  /** Chance a room (other than the arrival room) holds monsters. */
  monsterChance: number;
  /** Added to each group's rolled size (still capped by the room). */
  extraMonsters: number;
  /** Multiplies each monster's rolled hit points. */
  hpScale: number;
  /** Added to monster attack ratings. */
  attackBonus: number;
  /** Added to each monster hit's damage. */
  damageBonus: number;
  /** Extra hit points per floor below the first, as a fraction (0.2 = +20% per floor). */
  hpPerFloor: number;
  /** Extra attack rating per floor below the first. */
  attackPerFloor: number;
  /** Multiplies the scenario's starting gold. */
  goldScale: number;
}

const IDS: readonly DifficultyId[] = ['easiest', 'medium', 'hardest'];

export function validateDifficulties(raw: unknown): Difficulty[] {
  const list = (raw as { difficulties?: unknown }).difficulties;
  if (!Array.isArray(list) || list.length !== 3) throw new Error('difficulties.json: need easiest, medium, hardest');
  return list.map((d: Record<string, unknown>, i) => {
    const id = String(d.id) as DifficultyId;
    if (id !== IDS[i]) throw new Error(`difficulties.json: expected ${IDS[i]} at position ${i}`);
    const num = (k: string, min: number, max: number) => {
      const v = Number(d[k]);
      if (!(v >= min && v <= max)) throw new Error(`difficulties.json: ${k} on ${id} must be ${min}..${max}`);
      return v;
    };
    return {
      id,
      name: String(d.name),
      blurb: String(d.blurb ?? ''),
      monsterChance: num('monsterChance', 0, 1),
      extraMonsters: num('extraMonsters', 0, 4),
      hpScale: num('hpScale', 0.25, 5),
      attackBonus: num('attackBonus', -5, 10),
      damageBonus: num('damageBonus', -5, 10),
      hpPerFloor: num('hpPerFloor', 0, 2),
      attackPerFloor: num('attackPerFloor', 0, 5),
      goldScale: num('goldScale', 0.1, 5),
    };
  });
}

export const DIFFICULTIES: readonly Difficulty[] = validateDifficulties(difficultyData);
export const DEFAULT_DIFFICULTY: DifficultyId = 'medium';

/** Monster hit-point multiplier on a floor. */
export function hpScaleAt(d: Difficulty, depth: number): number {
  return d.hpScale * (1 + d.hpPerFloor * (depth - 1));
}

/** Monster attack bonus on a floor. */
export function attackBonusAt(d: Difficulty, depth: number): number {
  return d.attackBonus + Math.round(d.attackPerFloor * (depth - 1));
}

export function getDifficulty(id: DifficultyId | null | undefined): Difficulty {
  return DIFFICULTIES.find((d) => d.id === (id ?? DEFAULT_DIFFICULTY)) ?? DIFFICULTIES[1];
}
