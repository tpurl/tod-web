import spellData from '../../../data/spells.json';
import { parseDice } from '../dice.ts';

/** Spells loaded from data/spells.json and checked at startup. */
export type SpellTarget = 'enemy' | 'ally' | 'all_enemies';

export interface SpellDef {
  id: string;
  name: string;
  /** Key that casts it from the spell menu ("1", "2", ...). */
  key: string;
  cost: number;
  target: SpellTarget;
  effect: 'damage' | 'heal';
  amount: string;
  range: number;
}

export function validateSpells(raw: unknown): SpellDef[] {
  const list = (raw as { spells?: unknown }).spells;
  if (!Array.isArray(list) || list.length === 0) throw new Error('spells.json: no spells');
  return list.map((s: Record<string, unknown>) => {
    const id = String(s.id);
    if (!['enemy', 'ally', 'all_enemies'].includes(String(s.target))) throw new Error(`spells.json: bad target on ${id}`);
    if (!['damage', 'heal'].includes(String(s.effect))) throw new Error(`spells.json: bad effect on ${id}`);
    parseDice(String(s.amount));
    const key = String(s.key);
    if (!/^[1-9]$/.test(key)) throw new Error(`spells.json: key on ${id} must be 1-9`);
    return {
      id,
      name: String(s.name),
      key,
      cost: Number(s.cost),
      target: s.target as SpellTarget,
      effect: s.effect as 'damage' | 'heal',
      amount: String(s.amount),
      range: Number(s.range ?? 8),
    };
  });
}

export const SPELLS: readonly SpellDef[] = validateSpells(spellData);

export function getSpell(id: string): SpellDef {
  const s = SPELLS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown spell ${id}`);
  return s;
}
