import monsterData from '../../../data/monsters.json';
import { isColor } from '../../engine/render/palette.ts';
import { parseDice } from '../dice.ts';

/** Monster definitions loaded from data/monsters.json and checked at startup. */
export const BEHAVIORS = ['melee', 'ranged', 'caster', 'coward'] as const;
export type Behavior = (typeof BEHAVIORS)[number];

export interface MonsterDef {
  id: string;
  name: string;
  sprite: { pattern: string; color: number };
  hp: string;
  attack: number;
  defense: number;
  damage: string;
  ranged: { damage: string; range: number } | null;
  move: number;
  xp: number;
  gold: string | null;
  depth: { min: number; max: number };
  groupSize: string;
  behavior: Behavior;
  specials: string[];
  /** Weighted outcomes when the party tries to talk; empty means it won't listen. */
  talk: TalkOption[];
}

export type TalkOutcome = 'pass' | 'demand_gold' | 'give_hint' | 'attack';

export interface TalkOption {
  weight: number;
  outcome: TalkOutcome;
  gold?: string;
  message?: string;
}

/** Longest name that fits messages like "3 CAVE SPIDERS!". */
export const MONSTER_NAME_MAX = 12;

export function validateMonsters(raw: unknown, knownPatterns: readonly string[]): MonsterDef[] {
  const list = (raw as { monsters?: unknown }).monsters;
  if (!Array.isArray(list) || list.length === 0) throw new Error('monsters.json: no monsters');
  const seen = new Set<string>();
  return list.map((m: Record<string, unknown>) => {
    const id = String(m.id);
    if (seen.has(id)) throw new Error(`monsters.json: duplicate id ${id}`);
    seen.add(id);
    const name = String(m.name);
    if (name.length > MONSTER_NAME_MAX) throw new Error(`monsters.json: name of ${id} is too long`);
    const sprite = m.sprite as { pattern?: unknown; color?: unknown };
    if (!knownPatterns.includes(String(sprite?.pattern))) throw new Error(`monsters.json: unknown sprite for ${id}`);
    if (!isColor(Number(sprite.color))) throw new Error(`monsters.json: bad color for ${id}`);
    for (const k of ['hp', 'damage', 'groupSize'] as const) parseDice(String(m[k]));
    if (m.gold) parseDice(String(m.gold));
    const depth = m.depth as { min: number; max: number };
    if (!depth || depth.min < 1 || depth.max < depth.min) throw new Error(`monsters.json: bad depth for ${id}`);
    if (!BEHAVIORS.includes(m.behavior as Behavior)) throw new Error(`monsters.json: bad behavior for ${id}`);
    const ranged = m.ranged as { damage: string; range: number } | undefined;
    if (ranged) parseDice(ranged.damage);
    return {
      id,
      name,
      sprite: { pattern: String(sprite.pattern), color: Number(sprite.color) },
      hp: String(m.hp),
      attack: Number(m.attack),
      defense: Number(m.defense),
      damage: String(m.damage),
      ranged: ranged ?? null,
      move: Number(m.move ?? 3),
      xp: Number(m.xp),
      gold: m.gold ? String(m.gold) : null,
      depth,
      groupSize: String(m.groupSize),
      behavior: m.behavior as Behavior,
      specials: (m.specials as string[]) ?? [],
      talk: validateTalk(m.talk, id),
    };
  });
}

const OUTCOMES: readonly TalkOutcome[] = ['pass', 'demand_gold', 'give_hint', 'attack'];

function validateTalk(raw: unknown, id: string): TalkOption[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error(`monsters.json: talk on ${id} must be a list`);
  return raw.map((t: Record<string, unknown>) => {
    if (!OUTCOMES.includes(t.outcome as TalkOutcome)) throw new Error(`monsters.json: bad talk outcome on ${id}`);
    if (t.gold) parseDice(String(t.gold));
    return {
      weight: Math.max(1, Number(t.weight ?? 1)),
      outcome: t.outcome as TalkOutcome,
      gold: t.gold ? String(t.gold) : undefined,
      message: t.message ? String(t.message) : undefined,
    };
  });
}

/** Sprite pattern names that exist in src/ui/monsterSprites.ts. */
export const MONSTER_PATTERNS = ['rat', 'goblin', 'skeleton', 'orc', 'spider', 'mage', 'wraith'] as const;

export const MONSTERS: readonly MonsterDef[] = validateMonsters(monsterData, MONSTER_PATTERNS);

export function getMonster(id: string): MonsterDef {
  const m = MONSTERS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown monster ${id}`);
  return m;
}

export function monstersForDepth(depth: number): MonsterDef[] {
  return MONSTERS.filter((m) => depth >= m.depth.min && depth <= m.depth.max);
}

/** "A GOBLIN", "AN ORC", "3 GOBLINS" for messages. */
export function groupName(m: MonsterDef, count: number): string {
  const n = m.name.toUpperCase();
  if (count !== 1) return `${count} ${n}S`;
  return /^[AEIOU]/.test(n) ? `AN ${n}` : `A ${n}`;
}
