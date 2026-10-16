import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { createRng } from '../src/engine/rng.ts';
import { createDungeon, getView, search, type FloorView } from '../src/game/dungeon/dungeon.ts';
import { DungeonModel } from '../src/game/dungeon/dungeonModel.ts';
import { STEP, roomAt, samePoint, type Dir } from '../src/game/dungeon/floor.ts';
import { ITEMS } from '../src/game/items/items.ts';
import { MONSTERS, getMonster, groupName, monstersForDepth, validateMonsters } from '../src/game/monsters/monsters.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { createParty, type Party } from '../src/game/party/party.ts';
import type { ClassId } from '../src/game/party/rules.ts';
import {
  MAX_GROUP,
  aliveMonsters,
  drinkFountain,
  hurt,
  isWiped,
  stepOnTrap,
  takeTreasure,
  treasureItem,
  trapSpotChance,
} from '../src/game/rooms/contents.ts';
import { MONSTER_ART } from '../src/ui/monsterSprites.ts';

const stats = { strength: 10, dexterity: 10, intelligence: 10, constitution: 10 };
function party(...classes: ClassId[]): Party {
  return createParty(
    classes.map((c, i) => createCharacter({ id: `p${i}`, name: `P${i}`, classId: c, raceId: null, baseStats: stats })),
    { racesEnabled: false, gold: 0 },
  );
}
const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });

/** Steps toward a target with the map-view controls, for tests. */
function placeBeside(m: DungeonModel, target: { x: number; y: number }): Dir | null {
  const f = m.view.floor;
  for (const d of ['n', 'e', 's', 'w'] as Dir[]) {
    const from = { x: target.x - STEP[d].dx, y: target.y - STEP[d].dy };
    if (roomAt(f, from.x, from.y) && !aliveMonsters(m.view.contents[roomAt(f, from.x, from.y)!.id]).some((x) => samePoint(x, from))) {
      m.party.position = from;
      return d;
    }
  }
  return null;
}

describe('monster data', () => {
  it('loads with art for every sprite', () => {
    expect(MONSTERS.length).toBeGreaterThan(5);
    for (const m of MONSTERS) expect(MONSTER_ART[m.sprite.pattern as keyof typeof MONSTER_ART]).toHaveLength(16);
  });

  it('every floor has something to fight', () => {
    for (let d = 1; d <= 5; d++) expect(monstersForDepth(d).length).toBeGreaterThan(0);
  });

  it('names groups with the right article', () => {
    expect(groupName(getMonster('goblin'), 1)).toBe('A GOBLIN');
    expect(groupName(getMonster('orc'), 1)).toBe('AN ORC');
    expect(groupName(getMonster('goblin'), 3)).toBe('3 GOBLINS');
  });

  it('rejects bad monster data', () => {
    expect(() => validateMonsters({ monsters: [{ id: 'x', name: 'X', sprite: { pattern: 'nope', color: 1 } }] }, ['rat'])).toThrow();
  });
});

describe('room contents', () => {
  const views: FloorView[] = [];
  for (let seed = 0; seed < 60; seed++) views.push(getView(createDungeon(seed), 1 + (seed % 5)));

  it('the arrival room is always empty', () => {
    for (const v of views) {
      const up = roomAt(v.floor, v.floor.stairsUp.x, v.floor.stairsUp.y)!;
      const c = v.contents[up.id];
      expect(c.monsters.length + (c.treasure ? 1 : 0) + (c.trap ? 1 : 0) + (c.fountain ? 1 : 0)).toBe(0);
    }
  });

  it('things sit on distinct room squares, never on stairs', () => {
    for (const v of views) {
      for (const c of v.contents) {
        const room = v.floor.rooms[c.roomId];
        const spots = [...c.monsters, c.treasure, c.fountain, c.trap].filter(Boolean) as { x: number; y: number }[];
        const keys = spots.map((p) => `${p.x},${p.y}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (const p of spots) {
          expect(roomAt(v.floor, p.x, p.y)?.id).toBe(room.id);
          expect(samePoint(p, v.floor.stairsUp) || samePoint(p, v.floor.stairsDown)).toBe(false);
        }
        expect(c.monsters.length <= MAX_GROUP).toBe(true);
      }
    }
  });

  it('monsters match the floor depth', () => {
    for (const v of views) {
      for (const c of v.contents) {
        for (const m of c.monsters) {
          const d = getMonster(m.monsterId).depth;
          expect(v.floor.depth >= d.min && v.floor.depth <= d.max).toBe(true);
        }
      }
    }
  });

  it('floors are well stocked across seeds', () => {
    const all = views.flatMap((v) => v.contents);
    expect(all.filter((c) => c.monsters.length).length).toBeGreaterThan(50);
    expect(all.filter((c) => c.treasure).length).toBeGreaterThan(50);
    expect(all.filter((c) => c.fountain).length).toBeGreaterThan(10);
    expect(all.filter((c) => c.trap).length).toBeGreaterThan(10);
  });

  it('is the same every time for a seed', () => {
    const a = getView(createDungeon(77), 2).contents;
    const b = getView(createDungeon(77), 2).contents;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('treasure items respect rarity and depth', () => {
    const rng = createRng(4);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(treasureItem(rng, 1)!.id);
    expect(seen.has('ring_of_seeing')).toBe(false); // floors 3+
    expect(seen.has('healing_potion')).toBe(true);
    expect([...seen].every((id) => ITEMS.find((x) => x.id === id)!.rarity > 0)).toBe(true);
  });
});

describe('treasure, traps, fountains', () => {
  it('treasure gives gold and items once', () => {
    const p = party('fighter');
    const t = { x: 0, y: 0, gold: 40, itemIds: ['healing_potion'], taken: false };
    const r = takeTreasure(p, t);
    expect(p.gold).toBe(40);
    expect(r.items[0].to).toBe('P0');
    expect(t.taken).toBe(true);
  });

  it('a found trap is stepped around; a sprung trap stays sprung', () => {
    const p = party('fighter');
    const found = { x: 0, y: 0, kind: 'dart' as const, found: true, sprung: false };
    expect(stepOnTrap(p, found, 1, createRng(1))).toBe('YOU STEP AROUND THE TRAP');
    const t = { x: 0, y: 0, kind: 'gas' as const, found: false, sprung: false };
    const hpBefore = p.members[0].hp.current;
    let msg = '';
    for (let s = 0; s < 20 && !t.sprung; s++) msg = stepOnTrap(p, t, 1, createRng(s));
    expect(t.sprung || t.found).toBe(true);
    if (t.sprung) {
      expect(msg).toBe('POISON GAS FILLS THE ROOM!');
      expect(p.members[0].hp.current).toBeLessThan(hpBefore);
    }
    expect(stepOnTrap(p, { ...t, sprung: true }, 1, createRng(1))).toBe('');
  });

  it('rogues and dwarves spot traps more often', () => {
    const f = party('fighter');
    const r = party('rogue');
    expect(trapSpotChance(r)).toBeGreaterThan(trapSpotChance(f));
    const dwarf = createParty([createCharacter({ id: 'd', name: 'D', classId: 'fighter', raceId: 'dwarf', baseStats: stats })], {
      racesEnabled: true,
    });
    expect(trapSpotChance(dwarf)).toBe(trapSpotChance(f) + 15);
  });

  it('fountains work once', () => {
    const p = party('wizard');
    const f = { x: 0, y: 0, used: false };
    const r = drinkFountain(p, f, createRng(3));
    expect(f.used).toBe(true);
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('death and wipe-out', () => {
    const p = party('fighter', 'wizard');
    hurt(p.members[0], 999);
    expect(p.members[0].status).toContain('dead');
    expect(isWiped(p)).toBe(false);
    hurt(p.members[1], 999);
    expect(isWiped(p)).toBe(true);
  });
});

describe('DungeonModel with room contents', () => {
  function findView(pred: (v: FloorView) => boolean) {
    for (let seed = 0; seed < 300; seed++) {
      const d = createDungeon(seed);
      if (pred(getView(d, 1))) return d;
    }
    throw new Error('no matching seed');
  }

  it('monsters block their squares', () => {
    const d = findView((v) => v.contents.some((c) => c.monsters.length > 0));
    const p = party('fighter');
    const m = new DungeonModel(d, p, createRng(1));
    m.onKey(K('char', 'V')); // map controls
    const mon = m.view.contents.find((c) => c.monsters.length)!.monsters[0];
    const dir = placeBeside(m, mon)!;
    const before = { ...p.position };
    m.onKey(K(({ n: 'up', e: 'right', s: 'down', w: 'left' } as const)[dir]));
    expect(p.position).toEqual(before);
    expect(m.message.endsWith('BLOCKS THE WAY')).toBe(true);
  });

  it('walking onto unguarded treasure picks it up', () => {
    const d = findView((v) => v.contents.some((c) => c.treasure && c.monsters.length === 0));
    const p = party('fighter');
    const m = new DungeonModel(d, p, createRng(1));
    m.onKey(K('char', 'V'));
    const c = m.view.contents.find((x) => x.treasure && x.monsters.length === 0)!;
    const dir = placeBeside(m, c.treasure!)!;
    m.onKey(K(({ n: 'up', e: 'right', s: 'down', w: 'left' } as const)[dir]));
    expect(c.treasure!.taken).toBe(true);
    expect(p.gold).toBe(c.treasure!.gold);
    expect(m.message.startsWith('FOUND')).toBe(true);
  });

  it('guarded treasure stays put', () => {
    const d = findView((v) => v.contents.some((c) => c.treasure && c.monsters.length > 0));
    const p = party('fighter');
    const m = new DungeonModel(d, p, createRng(1));
    m.onKey(K('char', 'V'));
    const c = m.view.contents.find((x) => x.treasure && x.monsters.length > 0)!;
    const dir = placeBeside(m, c.treasure!);
    if (!dir) return; // boxed in by its guards
    m.onKey(K(({ n: 'up', e: 'right', s: 'down', w: 'left' } as const)[dir]));
    expect(c.treasure!.taken).toBe(false);
    expect(m.message.includes('GUARD')).toBe(true);
  });

  it('D drinks only on a fountain', () => {
    const d = findView((v) => v.contents.some((c) => c.fountain));
    const p = party('fighter');
    const m = new DungeonModel(d, p, createRng(1));
    m.onKey(K('char', 'D'));
    expect(m.message).toBe('THERE IS NOTHING TO DRINK');
    const f = m.view.contents.find((x) => x.fountain)!.fountain!;
    p.position = { x: f.x, y: f.y };
    expect(m.atFountain).toBe(true);
    m.onKey(K('char', 'D'));
    expect(f.used).toBe(true);
    m.onKey(K('char', 'D'));
    expect(m.message).toBe('THE FOUNTAIN IS DRY');
  });

  it('search can find traps', () => {
    const d = findView((v) => v.contents.some((c) => c.trap));
    const v = getView(d, 1);
    const t = v.contents.find((x) => x.trap)!.trap!;
    const p = party('rogue');
    p.position = { x: t.x, y: t.y };
    const rng = createRng(2);
    for (let i = 0; i < 40 && !t.found; i++) search(v, p, rng);
    expect(t.found).toBe(true);
  });
});
