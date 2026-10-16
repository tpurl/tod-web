import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import {
  MAX_ITEMS,
  addItem,
  armorDefense,
  canUse,
  equippedItem,
  toggleEquip,
} from '../src/game/items/inventory.ts';
import { ITEMS, getItem, statLabel, validateItems } from '../src/game/items/items.ts';
import { createCharacter, type Character } from '../src/game/party/character.ts';
import { createParty, type Party } from '../src/game/party/party.ts';
import type { ClassId } from '../src/game/party/rules.ts';
import { STORE, StoreModel, buy, buyPrice, sell, sellPrice, validateStore } from '../src/game/store/store.ts';

const stats = { strength: 12, dexterity: 12, intelligence: 12, constitution: 12 };

function member(id: string, classId: ClassId): Character {
  return createCharacter({ id, name: id.toUpperCase(), classId, raceId: null, baseStats: stats });
}

function party(...classes: ClassId[]): Party {
  return createParty(
    classes.map((c, i) => member(`p${i + 1}`, c)),
    { racesEnabled: false, gold: 500, food: 20 },
  );
}

const entry = (id: string) => STORE.stock.find((e) => e.item.id === id)!;
const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });

describe('item data', () => {
  it('loads and validates', () => {
    expect(ITEMS.length).toBeGreaterThan(10);
    expect(() => validateItems({ items: [{ id: 'x', name: 'X', kind: 'weapon', price: 1 }] })).toThrow();
    expect(() => validateItems({ items: [{ id: 'x', name: 'A VERY LONG ITEM NAME', kind: 'ring', price: 1 }] })).toThrow();
    expect(() =>
      validateItems({ items: [{ id: 'x', name: 'X', kind: 'ring', price: 1 }, { id: 'x', name: 'X', kind: 'ring', price: 1 }] }),
    ).toThrow();
  });

  it('stat labels', () => {
    expect(statLabel(getItem('sword'))).toBe('D8');
    expect(statLabel(getItem('short_bow'))).toBe('D6 RNG');
    expect(statLabel(getItem('chain_mail'))).toBe('DEF 4');
    expect(statLabel(getItem('healing_potion'))).toBe('');
  });

  it('store stock references real items', () => {
    expect(STORE.stock.length).toBeGreaterThan(5);
    expect(() => validateStore({ sellRate: 2, stock: [{ item: 'sword' }] })).toThrow();
    expect(() => validateStore({ stock: [{ item: 'nope' }] })).toThrow();
  });
});

describe('equipment rules', () => {
  it('class limits', () => {
    const wiz = member('w', 'wizard');
    const rog = member('r', 'rogue');
    expect(canUse(wiz, getItem('dagger'))).toBe(true);
    expect(canUse(wiz, getItem('sword'))).toBe(false);
    expect(canUse(wiz, getItem('leather_armor'))).toBe(false);
    expect(canUse(rog, getItem('leather_armor'))).toBe(true);
    expect(canUse(rog, getItem('chain_mail'))).toBe(false);
    expect(canUse(rog, getItem('shield'))).toBe(false);
    expect(canUse(member('f', 'fighter'), getItem('great_axe'))).toBe(true);
  });

  it('two-handed weapons and shields exclude each other', () => {
    const p = party('fighter');
    const f = p.members[0];
    const shield = addItem(p, f, 'shield').instance!;
    const axe = addItem(p, f, 'great_axe').instance!;
    expect(toggleEquip(f, shield.instanceId)).toBe('equipped');
    expect(toggleEquip(f, axe.instanceId)).toBe('equipped');
    expect(f.equipped.shield).toBeNull();
    expect(toggleEquip(f, shield.instanceId)).toBe('two_handed');
    expect(toggleEquip(f, axe.instanceId)).toBe('unequipped');
    expect(toggleEquip(f, shield.instanceId)).toBe('equipped');
  });

  it('defense adds armor and shield', () => {
    const p = party('fighter');
    const f = p.members[0];
    toggleEquip(f, addItem(p, f, 'chain_mail').instance!.instanceId);
    toggleEquip(f, addItem(p, f, 'shield').instance!.instanceId);
    expect(armorDefense(f)).toBe(5);
  });

  it('stacks merge and the pack has a limit', () => {
    const p = party('rogue');
    const r = p.members[0];
    addItem(p, r, 'arrows', 20);
    addItem(p, r, 'arrows', 20);
    expect(r.inventory).toHaveLength(1);
    expect(r.inventory[0].quantity).toBe(40);
    for (let i = 1; i < MAX_ITEMS; i++) expect(addItem(p, r, 'dagger').result).toBe('ok');
    expect(addItem(p, r, 'dagger').result).toBe('full');
    expect(addItem(p, r, 'arrows', 5).result).toBe('ok');
  });
});

describe('buying and selling', () => {
  it('buys, pays, and auto-equips into an empty slot', () => {
    const p = party('fighter');
    const f = p.members[0];
    expect(buy(p, f, entry('sword'))).toBe('bought');
    expect(p.gold).toBe(500 - 40);
    expect(equippedItem(f, 'weapon')?.id).toBe('sword');
    expect(buy(p, f, entry('dagger'))).toBe('bought');
    expect(equippedItem(f, 'weapon')?.id).toBe('sword');
  });

  it('refuses without enough gold or when the class cannot use it', () => {
    const p = party('wizard');
    expect(buy(p, p.members[0], entry('sword'))).toBe('cant_use');
    p.gold = 5;
    expect(buy(p, p.members[0], entry('dagger'))).toBe('no_gold');
    expect(p.gold).toBe(5);
  });

  it('food goes to the party, not the pack', () => {
    const p = party('wizard');
    const e = entry('rations');
    expect(buy(p, p.members[0], e)).toBe('bought');
    expect(p.food).toBe(20 + 10 * e.bundle);
    expect(p.gold).toBe(500 - buyPrice(e));
    expect(p.members[0].inventory).toHaveLength(0);
  });

  it('bundles price per unit', () => {
    const e = entry('arrows');
    expect(buyPrice(e)).toBe(e.item.price * e.bundle);
  });

  it('sells for half, unequipping first', () => {
    const p = party('fighter');
    const f = p.members[0];
    buy(p, f, entry('chain_mail'));
    const inst = f.inventory[0];
    expect(sellPrice(inst)).toBe(40);
    expect(sell(p, f, inst.instanceId)).toBe('sold');
    expect(p.gold).toBe(500 - 80 + 40);
    expect(f.equipped.armor).toBeNull();
    expect(f.inventory).toHaveLength(0);
  });
});

describe('StoreModel', () => {
  it('buys for the selected party member and switches buyers', () => {
    const p = party('fighter', 'wizard');
    const m = new StoreModel(p);
    const swordIdx = STORE.stock.findIndex((e) => e.item.id === 'sword');
    for (let i = 0; i < swordIdx; i++) m.onKey(K('down'));
    m.onKey(K('enter'));
    expect(m.message).toBe('BOUGHT SWORD');
    m.onKey(K('right'));
    expect(m.character.classId).toBe('wizard');
    expect(m.hint).toBe('WIZARDS CANNOT USE THIS');
    m.onKey(K('enter'));
    expect(m.message).toBe('P2 CANNOT USE THAT');
    m.onKey(K('left'));
    expect(m.buyer).toBe(0);
  });

  it('sell mode lists the pack, equips, and sells', () => {
    const p = party('fighter');
    const m = new StoreModel(p);
    buy(p, p.members[0], entry('dagger'));
    m.onKey(K('char', 'S'));
    expect(m.mode).toBe('sell');
    expect(m.listLength).toBe(1);
    m.onKey(K('char', 'E'));
    expect(m.message).toBe('PUT AWAY: DAGGER');
    m.onKey(K('char', 'E'));
    expect(m.message).toBe('READIED: DAGGER');
    m.onKey(K('enter'));
    expect(m.message).toBe('SOLD DAGGER FOR 5');
    expect(m.listLength).toBe(0);
  });

  it('Back asks before leaving', () => {
    const m = new StoreModel(party('fighter'));
    m.onKey(K('back'));
    expect(m.mode).toBe('leave');
    m.onKey(K('back'));
    expect(m.mode).toBe('buy');
    m.onKey(K('back'));
    m.onKey(K('enter'));
    expect(m.mode).toBe('left');
  });
});
