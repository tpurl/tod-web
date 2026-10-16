import itemData from '../../../data/items.json';
import { parseDice } from '../dice.ts';
import type { ClassId } from '../party/rules.ts';

/** Item definitions loaded from data/items.json and checked at startup. */
export const ITEM_KINDS = ['weapon', 'armor', 'shield', 'potion', 'scroll', 'ring', 'food', 'ammo', 'key', 'quest'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export interface WeaponStats {
  damage: string;
  hitBonus: number;
  ranged: boolean;
  range: number;
  ammoItemId: string | null;
  hands: 1 | 2;
}

export interface ItemEffect {
  type: string;
  amount?: string;
  passive?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  unidentifiedName?: string;
  kind: ItemKind;
  price: number;
  sellable: boolean;
  stackable: boolean;
  classes: ClassId[] | null;
  weapon: WeaponStats | null;
  defense: number;
  effect: ItemEffect | null;
}

/** Longest item name that fits the store list. */
export const ITEM_NAME_MAX = 14;

export function validateItems(raw: unknown): ItemDef[] {
  const list = (raw as { items?: unknown }).items;
  if (!Array.isArray(list) || list.length === 0) throw new Error('items.json: no items');
  const seen = new Set<string>();
  return list.map((r: Record<string, unknown>) => {
    const id = String(r.id);
    if (seen.has(id)) throw new Error(`items.json: duplicate id ${id}`);
    seen.add(id);
    if (!ITEM_KINDS.includes(r.kind as ItemKind)) throw new Error(`items.json: bad kind on ${id}`);
    const name = String(r.name);
    if (name.length > ITEM_NAME_MAX) throw new Error(`items.json: name of ${id} is longer than ${ITEM_NAME_MAX}`);
    const price = Number(r.price);
    if (!Number.isInteger(price) || price < 0) throw new Error(`items.json: bad price on ${id}`);

    let weapon: WeaponStats | null = null;
    if (r.weapon) {
      const w = r.weapon as Record<string, unknown>;
      parseDice(String(w.damage));
      weapon = {
        damage: String(w.damage),
        hitBonus: Number(w.hitBonus ?? 0),
        ranged: Boolean(w.ranged),
        range: Number(w.range ?? 1),
        ammoItemId: w.ammoItemId ? String(w.ammoItemId) : null,
        hands: w.hands === 2 ? 2 : 1,
      };
    }
    if (r.kind === 'weapon' && !weapon) throw new Error(`items.json: weapon ${id} has no weapon stats`);

    const effect = r.effect ? (r.effect as ItemEffect) : null;
    if (effect?.amount) parseDice(effect.amount);

    return {
      id,
      name,
      unidentifiedName: r.unidentifiedName ? String(r.unidentifiedName) : undefined,
      kind: r.kind as ItemKind,
      price,
      sellable: r.sellable !== false && r.kind !== 'quest',
      stackable: Boolean(r.stackable),
      classes: Array.isArray(r.classes) ? (r.classes as ClassId[]) : null,
      weapon,
      defense: Number(r.defense ?? 0),
      effect,
    };
  });
}

export const ITEMS: readonly ItemDef[] = validateItems(itemData);

export function getItem(id: string): ItemDef {
  const it = ITEMS.find((x) => x.id === id);
  if (!it) throw new Error(`unknown item ${id}`);
  return it;
}

/** Short stat label for lists: damage for weapons, defense for armor. */
export function statLabel(item: ItemDef): string {
  if (item.weapon) return `${item.weapon.damage.replace(/^1d/, 'D').toUpperCase()}${item.weapon.ranged ? ' RNG' : ''}`;
  if (item.kind === 'armor' || item.kind === 'shield') return `DEF ${item.defense}`;
  return '';
}
