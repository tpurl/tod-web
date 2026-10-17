import type { Rng } from '../../engine/rng.ts';
import { roll } from '../dice.ts';
import type { FloorView } from '../dungeon/dungeon.ts';
import type { Character, ItemInstance } from '../party/character.ts';
import type { Party } from '../party/party.ts';
import { getClass } from '../party/rules.ts';
import { heal } from '../rooms/contents.ts';
import { getItem, type ItemDef } from './items.ts';

/**
 * Using items outside combat (manual p.32-33, the U command). A player
 * chooses one of their items; healing items then ask who to heal. Disabled
 * players can't use items, but can be healed by someone else's (p.29), and
 * only wizards and heroes can read scrolls (p.20).
 */
export type UseTarget = 'none' | 'player';

/** Effects this screen knows how to apply. */
const USABLE = new Set(['heal', 'reveal_map']);

export function isUsable(item: ItemDef): boolean {
  return !!item.effect && USABLE.has(item.effect.type) && !item.effect.passive;
}

export function targetFor(item: ItemDef): UseTarget {
  return item.effect?.type === 'heal' ? 'player' : 'none';
}

/** The usable items a character carries, in pack order. */
export function usableItems(c: Character): ItemInstance[] {
  return c.inventory.filter((i) => isUsable(getItem(i.itemId)));
}

/** Whether anyone conscious in the party has something to use. */
export function partyHasUsable(party: Party): boolean {
  return party.members.some((m) => m.hp.current > 0 && usableItems(m).length > 0);
}

/** Why this character can't use this item, or '' if they can. */
export function cannotUse(user: Character, item: ItemDef): string {
  if (user.hp.current <= 0) return `${user.name} IS DISABLED`;
  if (item.kind === 'scroll' && !getClass(user.classId).canCast) return 'SCROLLS: WIZARDS AND HEROES ONLY';
  return '';
}

function consume(user: Character, inst: ItemInstance): void {
  inst.quantity = (inst.quantity ?? 1) - 1;
  if (!getItem(inst.itemId).stackable || inst.quantity <= 0) {
    user.inventory.splice(user.inventory.indexOf(inst), 1);
    for (const slot of Object.keys(user.equipped) as (keyof Character['equipped'])[]) {
      if (user.equipped[slot] === inst.instanceId) user.equipped[slot] = null;
    }
  }
}

export interface UseResult {
  used: boolean;
  message: string;
}

/** Applies an item. `target` is required for healing items; `view` for map scrolls. */
export function useItem(
  user: Character,
  inst: ItemInstance,
  opts: { target?: Character; view?: FloorView; rng: Rng },
): UseResult {
  const item = getItem(inst.itemId);
  const why = cannotUse(user, item);
  if (why) return { used: false, message: why };
  switch (item.effect?.type) {
    case 'heal': {
      const t = opts.target ?? user;
      if (t.hp.current >= t.hp.max) return { used: false, message: `${t.name} IS NOT HURT` };
      const n = heal(t, roll(item.effect.amount ?? '2d6', opts.rng));
      consume(user, inst);
      return { used: true, message: `${t.name} IS HEALED (+${n})` };
    }
    case 'reveal_map': {
      if (!opts.view) return { used: false, message: 'NOTHING TO MAP HERE' };
      opts.view.explored.fill(1);
      consume(user, inst);
      return { used: true, message: 'THE MAP OF THIS FLOOR APPEARS!' };
    }
    default:
      return { used: false, message: 'NOTHING HAPPENS' };
  }
}
