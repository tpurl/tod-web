import storeData from '../../../data/store.json';
import type { KeyPress } from '../../engine/input/keyboard.ts';
import { maxRoll } from '../dice.ts';
import {
  MAX_ITEMS,
  addItem,
  canUse,
  findInstance,
  removeInstance,
  slotFor,
  toggleEquip,
  type EquipResult,
} from '../items/inventory.ts';
import { getItem, type ItemDef } from '../items/items.ts';
import type { Character, ItemInstance } from '../party/character.ts';
import type { Party } from '../party/party.ts';
import { getClass } from '../party/rules.ts';

/**
 * The general store: stock and prices from data/store.json, buy/sell rules
 * as pure functions, and StoreModel, a key-driven state machine the store
 * screen draws from (same pattern as PartyBuilder).
 */
export interface StockEntry {
  item: ItemDef;
  /** Units per purchase. */
  bundle: number;
}

export interface StoreConfig {
  sellRate: number;
  stock: StockEntry[];
}

export function validateStore(raw: unknown): StoreConfig {
  const r = raw as { sellRate?: unknown; stock?: unknown };
  const sellRate = Number(r.sellRate ?? 0.5);
  if (!(sellRate >= 0 && sellRate <= 1)) throw new Error('store.json: sellRate must be 0..1');
  if (!Array.isArray(r.stock) || r.stock.length === 0) throw new Error('store.json: empty stock');
  const stock = r.stock.map((e: Record<string, unknown>) => {
    const bundle = Number(e.bundle ?? 1);
    if (!Number.isInteger(bundle) || bundle < 1) throw new Error(`store.json: bad bundle for ${String(e.item)}`);
    return { item: getItem(String(e.item)), bundle };
  });
  return { sellRate, stock };
}

export const STORE: StoreConfig = validateStore(storeData);

/** Food added to the party per unit of a food item. */
export function foodPerUnit(item: ItemDef): number {
  return item.effect?.type === 'food' && item.effect.amount ? maxRoll(item.effect.amount) : 0;
}

export function buyPrice(entry: StockEntry): number {
  return entry.item.price * entry.bundle;
}

export function sellPrice(inst: ItemInstance, sellRate = STORE.sellRate): number {
  const item = getItem(inst.itemId);
  if (!item.sellable) return 0;
  return Math.floor(item.price * (inst.quantity ?? 1) * sellRate);
}

export type BuyResult = 'bought' | 'no_gold' | 'cant_use' | 'full';

/**
 * Buys one bundle for a character. Food goes straight into the party's
 * rations; equippable items are put on if that slot is empty.
 */
export function buy(party: Party, c: Character, entry: StockEntry): BuyResult {
  const cost = buyPrice(entry);
  if (party.gold < cost) return 'no_gold';
  const item = entry.item;
  if (item.kind === 'food') {
    party.gold -= cost;
    party.food += foodPerUnit(item) * entry.bundle;
    return 'bought';
  }
  if (!canUse(c, item)) return 'cant_use';
  const { result, instance } = addItem(party, c, item.id, entry.bundle);
  if (result === 'full' || !instance) return 'full';
  party.gold -= cost;
  const slot = slotFor(item);
  if (slot && c.equipped[slot] === null) toggleEquip(c, instance.instanceId);
  return 'bought';
}

export type SellResult = 'sold' | 'unsellable' | 'missing';

export function sell(party: Party, c: Character, instanceId: string, sellRate = STORE.sellRate): SellResult {
  const inst = findInstance(c, instanceId);
  if (!inst) return 'missing';
  if (!getItem(inst.itemId).sellable) return 'unsellable';
  party.gold += sellPrice(inst, sellRate);
  removeInstance(c, instanceId);
  return 'sold';
}

// ---- StoreModel ------------------------------------------------------------

export type StoreMode = 'buy' | 'sell' | 'leave' | 'left';

const EQUIP_MESSAGES: Readonly<Record<EquipResult, (name: string, item: string) => string>> = {
  equipped: (_n, i) => `READIED: ${i}`,
  unequipped: (_n, i) => `PUT AWAY: ${i}`,
  not_equippable: () => 'THAT CANNOT BE EQUIPPED',
  cant_use: (n) => `${n} CANNOT USE THAT`,
  two_handed: () => 'NEEDS A FREE HAND',
  missing: () => '',
};

export class StoreModel {
  mode: StoreMode = 'buy';
  buyer = 0;
  cursor = 0;
  message = '';
  readonly party: Party;
  readonly config: StoreConfig;

  constructor(party: Party, config: StoreConfig = STORE) {
    this.party = party;
    this.config = config;
  }

  get character(): Character {
    return this.party.members[this.buyer];
  }

  /** Rows in the current list: stock in buy mode, the buyer's pack in sell mode. */
  get listLength(): number {
    return this.mode === 'sell' ? this.character.inventory.length : this.config.stock.length;
  }

  /** Warning for the highlighted stock item, shown before the player tries to buy it. */
  get hint(): string {
    if (this.mode !== 'buy') return '';
    const entry = this.config.stock[this.cursor];
    if (!entry) return '';
    if (entry.item.kind !== 'food' && !canUse(this.character, entry.item)) {
      return `${getClass(this.character.classId).name.toUpperCase()}S CANNOT USE THIS`;
    }
    if (this.party.gold < buyPrice(entry)) return 'NOT ENOUGH GOLD';
    return '';
  }

  onKey(p: KeyPress): void {
    this.message = '';
    if (this.mode === 'leave') {
      if (p.key === 'enter' || (p.key === 'char' && p.char === 'Y')) this.mode = 'left';
      else if (p.key === 'back' || (p.key === 'char' && p.char === 'N')) this.mode = 'buy';
      return;
    }
    if (this.mode === 'left') return;

    const count = this.listLength;
    switch (p.key) {
      case 'up':
        if (count) this.cursor = (this.cursor + count - 1) % count;
        return;
      case 'down':
        if (count) this.cursor = (this.cursor + 1) % count;
        return;
      case 'left':
        return this.switchBuyer(-1);
      case 'right':
        return this.switchBuyer(1);
      case 'back':
        this.mode = 'leave';
        return;
      case 'enter':
        return this.mode === 'buy' ? this.doBuy() : this.doSell();
      case 'char':
        if (p.char === 'S') this.toggleMode();
        else if (p.char === 'E' && this.mode === 'sell') this.doEquip();
        return;
      default:
        return;
    }
  }

  private switchBuyer(delta: number): void {
    const n = this.party.members.length;
    this.buyer = (this.buyer + delta + n) % n;
    if (this.mode === 'sell') this.cursor = 0;
  }

  private toggleMode(): void {
    this.mode = this.mode === 'buy' ? 'sell' : 'buy';
    this.cursor = 0;
    if (this.mode === 'sell' && this.character.inventory.length === 0) this.message = 'NOTHING TO SELL';
  }

  private doBuy(): void {
    const entry = this.config.stock[this.cursor];
    const c = this.character;
    const result = buy(this.party, c, entry);
    const name = entry.item.name.toUpperCase();
    this.message = {
      bought: entry.item.kind === 'food' ? `RATIONS PACKED. FOOD ${this.party.food}` : `BOUGHT ${name}`,
      no_gold: 'NOT ENOUGH GOLD',
      cant_use: `${c.name} CANNOT USE THAT`,
      full: `${c.name} CANNOT CARRY MORE (${MAX_ITEMS})`,
    }[result];
  }

  private doSell(): void {
    const c = this.character;
    const inst = c.inventory[this.cursor];
    if (!inst) return;
    const value = sellPrice(inst, this.config.sellRate);
    const name = getItem(inst.itemId).name.toUpperCase();
    const result = sell(this.party, c, inst.instanceId, this.config.sellRate);
    this.message = result === 'sold' ? `SOLD ${name} FOR ${value}` : result === 'unsellable' ? 'THE STORE WILL NOT BUY THAT' : '';
    this.cursor = Math.min(this.cursor, Math.max(0, c.inventory.length - 1));
  }

  private doEquip(): void {
    const c = this.character;
    const inst = c.inventory[this.cursor];
    if (!inst) return;
    const result = toggleEquip(c, inst.instanceId);
    this.message = EQUIP_MESSAGES[result](c.name, getItem(inst.itemId).name.toUpperCase());
  }
}
