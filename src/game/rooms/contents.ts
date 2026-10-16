import type { Rng } from '../../engine/rng.ts';
import { roll } from '../dice.ts';
import type { Floor, Point, Room } from '../dungeon/floor.ts';
import { samePoint } from '../dungeon/floor.ts';
import { addItem } from '../items/inventory.ts';
import { ITEMS, getItem, type ItemDef } from '../items/items.ts';
import { monstersForDepth } from '../monsters/monsters.ts';
import type { Character } from '../party/character.ts';
import type { Party } from '../party/party.ts';
import { STAT_KEYS, getClass, getRace } from '../party/rules.ts';

/**
 * What is in each room (DESIGN.md section 7.3), generated from the floor's
 * seed, and the rules for treasure, fountains, and traps. Monsters are
 * placed here; fighting them is in game/combat.
 *
 * Every probability and amount is a placeholder until calibrated against
 * the original. [CALIBRATE]
 */
export const CHANCE = { monsters: 0.45, treasure: 0.45, guardedTreasure: 0.7, fountain: 0.15, trap: 0.18 } as const;
export const MAX_GROUP = 6;

export interface MonsterInstance {
  monsterId: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
}

export interface Treasure {
  x: number;
  y: number;
  gold: number;
  itemIds: string[];
  taken: boolean;
}

export interface Fountain {
  x: number;
  y: number;
  used: boolean;
}

export type TrapKind = 'dart' | 'pit' | 'gas';

export interface Trap {
  x: number;
  y: number;
  kind: TrapKind;
  found: boolean;
  sprung: boolean;
}

export interface RoomContents {
  roomId: number;
  /** Set when the party talked its way past: the monsters stay but won't fight. */
  peaceful: boolean;
  monsters: MonsterInstance[];
  treasure: Treasure | null;
  fountain: Fountain | null;
  trap: Trap | null;
}

// ---- generation -------------------------------------------------------------

function freeCells(room: Room, floor: Floor): Point[] {
  const out: Point[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const p = { x, y };
      if (!samePoint(p, floor.stairsUp) && !samePoint(p, floor.stairsDown)) out.push(p);
    }
  }
  return out;
}

function take(rng: Rng, cells: Point[]): Point | null {
  if (cells.length === 0) return null;
  return cells.splice(rng.int(0, cells.length - 1), 1)[0];
}

/** Weighted pick of a treasure item allowed at this depth, or null. */
export function treasureItem(rng: Rng, depth: number, items: readonly ItemDef[] = ITEMS): ItemDef | null {
  const pool = items.filter(
    (i) => i.rarity > 0 && (!i.depth || (depth >= i.depth.min && depth <= i.depth.max)),
  );
  const total = pool.reduce((s, i) => s + i.rarity, 0);
  if (total === 0) return null;
  let r = rng.int(1, total);
  for (const i of pool) {
    r -= i.rarity;
    if (r <= 0) return i;
  }
  return null;
}

export function populateFloor(floor: Floor, rng: Rng): RoomContents[] {
  const upRoom = floor.rooms.find(
    (r) => floor.stairsUp.x >= r.x && floor.stairsUp.x < r.x + r.w && floor.stairsUp.y >= r.y && floor.stairsUp.y < r.y + r.h,
  );
  const candidates = monstersForDepth(floor.depth);
  return floor.rooms.map((room) => {
    const c: RoomContents = { roomId: room.id, peaceful: false, monsters: [], treasure: null, fountain: null, trap: null };
    // The room you arrive in is always safe.
    if (room === upRoom) return c;
    const cells = freeCells(room, floor);

    const hasMonsters = candidates.length > 0 && rng.next() < CHANCE.monsters;
    if (hasMonsters) {
      const def = candidates[rng.int(0, candidates.length - 1)];
      const count = Math.max(1, Math.min(MAX_GROUP, roll(def.groupSize, rng), cells.length - 1));
      for (let i = 0; i < count; i++) {
        const p = take(rng, cells);
        if (!p) break;
        const hp = Math.max(1, roll(def.hp, rng));
        c.monsters.push({ monsterId: def.id, hp, maxHp: hp, x: p.x, y: p.y });
      }
    }
    if (rng.next() < (hasMonsters ? CHANCE.guardedTreasure : CHANCE.treasure)) {
      const p = take(rng, cells);
      if (p) {
        const gold = roll(`${floor.depth}d20`, rng) + (hasMonsters ? roll(`${floor.depth}d10`, rng) : 0);
        const item = rng.next() < 0.35 + 0.05 * floor.depth ? treasureItem(rng, floor.depth) : null;
        c.treasure = { ...p, gold, itemIds: item ? [item.id] : [], taken: false };
      }
    }
    if (rng.next() < CHANCE.fountain) {
      const p = take(rng, cells);
      if (p) c.fountain = { ...p, used: false };
    }
    if (rng.next() < CHANCE.trap) {
      const p = take(rng, cells);
      const kinds: TrapKind[] = ['dart', 'pit', 'gas'];
      if (p) c.trap = { ...p, kind: kinds[rng.int(0, 2)], found: false, sprung: false };
    }
    return c;
  });
}

export function aliveMonsters(c: RoomContents): MonsterInstance[] {
  return c.monsters.filter((m) => m.hp > 0);
}

/** Groups living monsters by type, for messages. */
export function monsterGroups(c: RoomContents): { monsterId: string; count: number }[] {
  const groups: { monsterId: string; count: number }[] = [];
  for (const m of aliveMonsters(c)) {
    const g = groups.find((x) => x.monsterId === m.monsterId);
    if (g) g.count++;
    else groups.push({ monsterId: m.monsterId, count: 1 });
  }
  return groups;
}

// ---- party helpers ------------------------------------------------------------

export function living(party: Party): Character[] {
  return party.members.filter((m) => m.hp.current > 0);
}

export function isWiped(party: Party): boolean {
  return living(party).length === 0;
}

/** Applies damage; a character at 0 HP is dead. Returns damage actually taken. */
export function hurt(c: Character, amount: number): number {
  if (c.hp.current <= 0) return 0;
  const before = c.hp.current;
  c.hp.current = Math.max(0, c.hp.current - amount);
  if (c.hp.current === 0 && !c.status.includes('dead')) c.status.push('dead');
  return before - c.hp.current;
}

/** Restores HP (never past max) and cures poison. Does nothing for the dead. */
export function heal(c: Character, amount: number): number {
  if (c.hp.current <= 0) return 0;
  c.status = c.status.filter((s) => s !== 'poisoned');
  const before = c.hp.current;
  c.hp.current = Math.min(c.hp.max, c.hp.current + amount);
  return c.hp.current - before;
}

// ---- treasure -----------------------------------------------------------------

export interface LootResult {
  gold: number;
  items: { itemId: string; to: string | null }[];
}

/** Takes a treasure: gold to the party, each item to the first member with room. */
export function takeTreasure(party: Party, t: Treasure): LootResult {
  t.taken = true;
  party.gold += t.gold;
  const items = t.itemIds.map((itemId) => {
    for (const m of living(party)) {
      if (addItem(party, m, itemId).result === 'ok') return { itemId, to: m.name };
    }
    return { itemId, to: null };
  });
  return { gold: t.gold, items };
}

export function lootMessage(r: LootResult): string {
  const parts = [`${r.gold} GOLD`];
  for (const i of r.items) parts.push(getItem(i.itemId).name.toUpperCase());
  return `FOUND ${parts.join(', ')}`;
}

// ---- fountains ----------------------------------------------------------------

export type FountainEffect = 'heal' | 'refresh' | 'harm' | 'strength' | 'nothing';

/** Rolls and applies a fountain drink for the whole party. [CALIBRATE] */
export function drinkFountain(party: Party, f: Fountain, rng: Rng): { effect: FountainEffect; message: string } {
  f.used = true;
  const r = rng.int(1, 100);
  if (r <= 35) {
    let total = 0;
    for (const m of living(party)) total += heal(m, roll('1d8', rng));
    return { effect: 'heal', message: total > 0 ? 'THE WATER HEALS YOUR WOUNDS' : 'THE WATER IS COOL AND CLEAR' };
  }
  if (r <= 50) {
    for (const m of living(party)) if (m.spellPoints) m.spellPoints.current = m.spellPoints.max;
    return { effect: 'refresh', message: 'YOUR MINDS FEEL CLEAR' };
  }
  if (r <= 70) {
    for (const m of living(party)) hurt(m, roll('1d4', rng));
    return { effect: 'harm', message: 'THE WATER IS FOUL! IT BURNS' };
  }
  if (r <= 80) {
    const all = living(party);
    const lucky = all[rng.int(0, all.length - 1)];
    const stat = STAT_KEYS[rng.int(0, STAT_KEYS.length - 1)];
    lucky.stats[stat] += 1;
    return { effect: 'strength', message: `${lucky.name} FEELS STRONGER` };
  }
  return { effect: 'nothing', message: 'NOTHING HAPPENS' };
}

// ---- traps --------------------------------------------------------------------

/** Base chance to notice a trap before stepping on it, best in party. [CALIBRATE] */
export const TRAP_SPOT_BASE = 10;
const TRAP_SENSE_BONUS = 15;

export function trapSpotChance(party: Party): number {
  let best = 0;
  for (const m of living(party)) {
    let c = TRAP_SPOT_BASE + Math.floor(getClass(m.classId).searchBonus / 2);
    if (m.raceId && getRace(m.raceId).perks.includes('trap_sense')) c += TRAP_SENSE_BONUS;
    best = Math.max(best, c);
  }
  return best;
}

const TRAP_DAMAGE: Readonly<Record<TrapKind, string>> = { dart: '1d6', pit: '2d4', gas: '1d4' };

/**
 * Stepping onto a trap's square. A found trap is stepped around. Otherwise
 * the party may spot it in time; if not, it springs: darts and pits hit one
 * member, gas hits everyone.
 */
export function stepOnTrap(party: Party, t: Trap, depth: number, rng: Rng): string {
  if (t.sprung) return '';
  if (t.found) return 'YOU STEP AROUND THE TRAP';
  if (rng.int(1, 100) <= trapSpotChance(party)) {
    t.found = true;
    return 'YOU SPOT A TRAP JUST IN TIME!';
  }
  t.sprung = true;
  const dmg = () => roll(TRAP_DAMAGE[t.kind], rng) + Math.floor((depth - 1) / 2);
  if (t.kind === 'gas') {
    for (const m of living(party)) hurt(m, dmg());
    return 'POISON GAS FILLS THE ROOM!';
  }
  const all = living(party);
  const victim = all[rng.int(0, all.length - 1)];
  const n = hurt(victim, dmg());
  return t.kind === 'pit' ? `${victim.name} FALLS IN A PIT (-${n})` : `A DART HITS ${victim.name} (-${n})`;
}
