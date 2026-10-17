import type { Character, ItemInstance } from '../party/character.ts';
import type { Party } from '../party/party.ts';
import { getClass } from '../party/rules.ts';
import { getItem, type ItemDef } from './items.ts';

/**
 * Inventory and equipment rules. Pure functions over Character/Party so the
 * store, the dungeon, and combat all share one set of rules.
 */
export type Slot = keyof Character['equipped'];

/** Distinct item slots per character (stacks count once). [CALIBRATE] */
export const MAX_ITEMS = 8;
/** Weapons a character may carry (manual p.22). */
export const MAX_WEAPONS = 2;

export function slotFor(item: ItemDef): Slot | null {
  switch (item.kind) {
    case 'weapon':
      return 'weapon';
    case 'armor':
      return 'armor';
    case 'shield':
      return 'shield';
    case 'ring':
      return 'ring';
    default:
      return null;
  }
}

/** Whether this character's class may equip or use the item. */
export function canUse(c: Character, item: ItemDef): boolean {
  if (item.classes && !item.classes.includes(c.classId)) return false;
  const cls = getClass(c.classId);
  if (item.kind === 'weapon' && cls.weaponLimits && !cls.weaponLimits.includes(item.id)) return false;
  if ((item.kind === 'armor' || item.kind === 'shield') && cls.armorLimits && !cls.armorLimits.includes(item.id)) {
    return false;
  }
  return true;
}

export function findInstance(c: Character, instanceId: string): ItemInstance | undefined {
  return c.inventory.find((i) => i.instanceId === instanceId);
}

export function isEquipped(c: Character, instanceId: string): boolean {
  return Object.values(c.equipped).includes(instanceId);
}

export function equippedItem(c: Character, slot: Slot): ItemDef | null {
  const id = c.equipped[slot];
  const inst = id ? findInstance(c, id) : undefined;
  return inst ? getItem(inst.itemId) : null;
}

export type AddResult = 'ok' | 'full' | 'weapons';

/**
 * Adds units of an item to a character. Stackable items merge into an
 * existing stack; everything else takes a new slot.
 */
export function addItem(party: Party, c: Character, itemId: string, quantity = 1): { result: AddResult; instance?: ItemInstance } {
  const item = getItem(itemId);
  if (item.stackable) {
    const stack = c.inventory.find((i) => i.itemId === itemId);
    if (stack) {
      stack.quantity = (stack.quantity ?? 1) + quantity;
      return { result: 'ok', instance: stack };
    }
  }
  if (c.inventory.length >= MAX_ITEMS) return { result: 'full' };
  if (item.kind === 'weapon' && c.inventory.filter((i) => getItem(i.itemId).kind === 'weapon').length >= MAX_WEAPONS) {
    return { result: 'weapons' };
  }
  const instance: ItemInstance = { instanceId: `it${party.nextItemId++}`, itemId, identified: true };
  if (item.stackable) instance.quantity = quantity;
  c.inventory.push(instance);
  return { result: 'ok', instance };
}

/** Removes an instance entirely, unequipping it first. */
export function removeInstance(c: Character, instanceId: string): ItemInstance | undefined {
  const idx = c.inventory.findIndex((i) => i.instanceId === instanceId);
  if (idx < 0) return undefined;
  for (const slot of Object.keys(c.equipped) as Slot[]) {
    if (c.equipped[slot] === instanceId) c.equipped[slot] = null;
  }
  return c.inventory.splice(idx, 1)[0];
}

export type EquipResult = 'equipped' | 'unequipped' | 'not_equippable' | 'cant_use' | 'two_handed' | 'missing';

/**
 * Toggles an item in its slot. Equipping a two-handed weapon removes any
 * shield; a shield can't go on while a two-handed weapon is held.
 */
export function toggleEquip(c: Character, instanceId: string): EquipResult {
  const inst = findInstance(c, instanceId);
  if (!inst) return 'missing';
  const item = getItem(inst.itemId);
  const slot = slotFor(item);
  if (!slot) return 'not_equippable';
  if (c.equipped[slot] === instanceId) {
    c.equipped[slot] = null;
    return 'unequipped';
  }
  if (!canUse(c, item)) return 'cant_use';
  if (slot === 'shield' && equippedItem(c, 'weapon')?.weapon?.hands === 2) return 'two_handed';
  if (slot === 'weapon' && item.weapon?.hands === 2) c.equipped.shield = null;
  c.equipped[slot] = instanceId;
  return 'equipped';
}

/** Total defense from worn armor and shield. */
export function armorDefense(c: Character): number {
  return (equippedItem(c, 'armor')?.defense ?? 0) + (equippedItem(c, 'shield')?.defense ?? 0);
}
