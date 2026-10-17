import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { createRng } from '../src/engine/rng.ts';
import { CombatModel, MOVES_PER_TURN, hitChance } from '../src/game/combat/combat.ts';
import { SPELLS, getSpell, validateSpells } from '../src/game/combat/spells.ts';
import { createDungeon, getView } from '../src/game/dungeon/dungeon.ts';
import { DungeonModel } from '../src/game/dungeon/dungeonModel.ts';
import { STEP, roomAt, type Dir } from '../src/game/dungeon/floor.ts';
import { addItem, toggleEquip } from '../src/game/items/inventory.ts';
import { getMonster } from '../src/game/monsters/monsters.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { createParty, type Party } from '../src/game/party/party.ts';
import type { ClassId } from '../src/game/party/rules.ts';
import type { RoomContents } from '../src/game/rooms/contents.ts';
import { wrap } from '../src/state/combatState.ts';

const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });
const strong = { strength: 16, dexterity: 14, intelligence: 14, constitution: 16 };

function party(...classes: ClassId[]): Party {
  return createParty(
    classes.map((c, i) => createCharacter({ id: `p${i}`, name: `P${i}`, classId: c, raceId: null, baseStats: strong })),
    { racesEnabled: false, gold: 100 },
  );
}

/** A big room on a real floor, emptied, with the given monsters in the far corner. */
function arena(monsterIds: string[], p: Party, seed = 1) {
  const v = getView(createDungeon(3), 1);
  const room = [...v.floor.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const contents: RoomContents = {
    roomId: room.id,
    peaceful: false,
    treasure: null,
    fountain: null,
    trap: null,
    monsters: monsterIds.map((id, i) => {
      const hp = 4;
      return { monsterId: id, hp, maxHp: hp, x: room.x + room.w - 1 - (i % 2), y: room.y + room.h - 1 - Math.floor(i / 2) };
    }),
  };
  v.contents[room.id] = contents;
  const model = new CombatModel({ party: p, contents, room, floor: v.floor, entry: { x: room.x, y: room.y }, rng: createRng(seed) });
  return { model, contents, room };
}

/** Plays the party's turns by walking at the nearest monster and attacking. */
function autoplay(m: CombatModel, maxSteps = 2000): void {
  for (let i = 0; i < maxSteps && !m.over; i++) {
    if (m.phase === 'monsterTurn') {
      m.advance();
      continue;
    }
    const pc = m.activePc;
    if (!pc) {
      m.onKey(K('enter'));
      continue;
    }
    const target = m.monsters.sort((a, b) => Math.abs(a.m.x - pc.x) + Math.abs(a.m.y - pc.y) - (Math.abs(b.m.x - pc.x) + Math.abs(b.m.y - pc.y)))[0];
    const dx = Math.sign(target.m.x - pc.x);
    const dy = Math.sign(target.m.y - pc.y);
    const before = { x: pc.x, y: pc.y, turn: m.active };
    if (dx !== 0) m.onKey(K(dx > 0 ? 'right' : 'left'));
    else if (dy !== 0) m.onKey(K(dy > 0 ? 'down' : 'up'));
    if (m.active === before.turn && pc.x === before.x && pc.y === before.y) {
      if (dy !== 0 && dx !== 0) m.onKey(K(dy > 0 ? 'down' : 'up'));
      if (m.active === before.turn && pc.x === before.x && pc.y === before.y) m.onKey(K('enter'));
    }
  }
}

describe('combat rules', () => {
  it('hit chance is clamped to 5..95', () => {
    expect(hitChance(0, 0)).toBe(50);
    expect(hitChance(20, 0)).toBe(95);
    expect(hitChance(0, 20)).toBe(5);
  });

  it('spells load and validate', () => {
    expect(SPELLS.map((s) => s.id)).toEqual(['bolt', 'heal', 'blast']);
    expect(() => validateSpells({ spells: [{ id: 'x', key: '1', target: 'self', effect: 'damage', amount: '1d6' }] })).toThrow();
  });

  it('wraps long messages onto two lines', () => {
    expect(wrap('ABCDEFGHIJ SLAYS THE CAVE SPIDER AT LAST')).toEqual(['ABCDEFGHIJ SLAYS THE CAVE SPIDER', 'AT LAST']);
  });
});

describe('CombatModel', () => {
  it('places the party on free squares from the entry', () => {
    const { model, room } = arena(['goblin'], party('fighter', 'wizard', 'rogue'));
    const spots = model.pcs.map((u) => `${u.x},${u.y}`);
    expect(new Set(spots).size).toBe(3);
    expect(model.pcs.every((u) => roomAt(model.floor, u.x, u.y)?.id === room.id)).toBe(true);
    expect(model.phase).toBe('parley');
    expect(model.log.at(-1)).toBe('A GOBLIN!');
  });

  it('fighting a weak group ends in victory with XP and gold', () => {
    const p = party('fighter', 'fighter');
    const { model, contents } = arena(['giant_rat', 'giant_rat'], p);
    model.onKey(K('enter'));
    expect(model.round).toBe(1);
    autoplay(model);
    expect(model.phase).toBe('victory');
    expect(contents.monsters.every((x) => x.hp === 0)).toBe(true);
    const xp = getMonster('giant_rat').xp * 2;
    const living = p.members.filter((c) => c.hp.current > 0).length;
    expect(p.members.filter((c) => c.hp.current > 0).every((c) => c.xp === Math.floor(xp / living))).toBe(true);
  });

  it('a lone weak hero against wraiths loses', () => {
    const p = createParty(
      [createCharacter({ id: 'h', name: 'H', classId: 'hero', raceId: null, baseStats: { strength: 3, dexterity: 3, intelligence: 3, constitution: 3 } })],
      { racesEnabled: false },
    );
    const { model, contents } = arena(['wraith', 'wraith'], p);
    contents.monsters.forEach((m) => (m.hp = m.maxHp = 200));
    model.onKey(K('enter'));
    autoplay(model);
    expect(model.phase).toBe('defeat');
    expect(p.members[0].status).toContain('dead');
  });

  it('a turn allows limited moves; Enter ends it', () => {
    const { model } = arena(['orc'], party('fighter'));
    model.onKey(K('enter'));
    while (model.phase === 'monsterTurn') model.advance();
    const pc = model.activePc!;
    expect(model.movesLeft).toBe(MOVES_PER_TURN);
    model.onKey(K('right'));
    expect(model.movesLeft).toBe(MOVES_PER_TURN - 1);
    model.onKey(K('enter'));
    expect(model.activePc === pc && model.movesLeft === MOVES_PER_TURN - 1).toBe(false);
  });

  it('talking to monsters with no talk table starts the fight', () => {
    const { model } = arena(['giant_rat'], party('fighter'));
    model.onKey(K('char', 'T'));
    expect(model.round).toBe(1);
  });

  it('talking can end peacefully or in a paid truce', () => {
    let peaceful = 0;
    let paid = 0;
    for (let seed = 0; seed < 40; seed++) {
      const p = party('fighter');
      const { model, contents } = arena(['goblin'], p, seed);
      model.onKey(K('char', 'T'));
      if (model.phase === 'demand') {
        const gold = p.gold;
        model.onKey(K('char', 'Y'));
        expect(p.gold).toBe(gold - model.demand);
        expect(model.phase).toBe('peace');
        expect(contents.peaceful).toBe(true);
        paid++;
      } else if (model.phase === 'peace') peaceful++;
    }
    expect(paid).toBeGreaterThan(0);
    expect(peaceful).toBe(0); // goblins only demand gold or attack
  });

  it('fleeing works some of the time', () => {
    let fled = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { model } = arena(['orc'], party('fighter'), seed);
      model.onKey(K('char', 'R'));
      if (model.phase === 'fled') fled++;
    }
    expect(fled > 5 && fled < 35).toBe(true);
  });

  it('wizards cast spells and spend spell points', () => {
    const p = party('fighter', 'wizard');
    const { model } = arena(['orc', 'orc'], p);
    model.onKey(K('enter'));
    for (let i = 0; i < 20 && !(model.activePc?.c.classId === 'wizard'); i++) {
      if (model.phase === 'monsterTurn') model.advance();
      else model.onKey(K('enter'));
    }
    const wiz = model.activePc!;
    expect(wiz.c.classId).toBe('wizard');
    const sp = wiz.c.spellPoints!.current;
    model.onKey(K('char', 'C'));
    expect(model.phase).toBe('spell');
    model.onKey(K('char', getSpell('bolt').key));
    expect(wiz.c.spellPoints!.current).toBe(sp - getSpell('bolt').cost);
  });

  it('fighters cannot cast; bows use arrows; potions heal', () => {
    const p = party('fighter');
    const f = p.members[0];
    toggleEquip(f, addItem(p, f, 'short_bow').instance!.instanceId);
    addItem(p, f, 'arrows', 2);
    addItem(p, f, 'healing_potion');
    f.hp.current = 1;
    const { model } = arena(['orc'], p);
    model.onKey(K('enter'));
    while (model.phase === 'monsterTurn') model.advance();
    if (!model.activePc) return;
    model.onKey(K('char', 'C'));
    expect(model.log.at(-1)).toBe('P0 CANNOT CAST SPELLS');
    model.onKey(K('char', 'U'));
    expect(f.hp.current).toBeGreaterThan(1);
    expect(f.inventory.some((i) => i.itemId === 'healing_potion')).toBe(false);
    for (let i = 0; i < 10 && !model.activePc && !model.over; i++) model.advance();
    if (!model.activePc) return;
    model.onKey(K('char', 'F'));
    expect(f.inventory.find((i) => i.itemId === 'arrows')?.quantity).toBe(1);
  });
});

describe('dungeon hand-off', () => {
  it('walking into a guarded room starts combat with a retreat square', () => {
    for (let seed = 0; seed < 200; seed++) {
      const d = createDungeon(seed);
      const v = getView(d, 1);
      const c = v.contents.find((x) => x.monsters.length > 0);
      if (!c) continue;
      const door = v.floor.doors.find((x) => x.roomId === c.roomId && x.kind === 'normal');
      if (!door) continue;
      const inside = { x: door.x + STEP[door.side].dx, y: door.y + STEP[door.side].dy };
      if (c.monsters.some((m) => m.x === inside.x && m.y === inside.y)) continue;
      const p = party('fighter');
      const m = new DungeonModel(d, p, createRng(1));
      m.view3d = false;
      p.position = { x: door.x, y: door.y };
      const key = ({ n: 'up', e: 'right', s: 'down', w: 'left' } as Record<Dir, KeyPress['key']>)[door.side];
      m.onKey(K(key));
      expect(m.mode).toBe('combat');
      expect(m.combat?.roomId).toBe(c.roomId);
      expect(m.combat?.retreat).toEqual({ x: door.x, y: door.y });
      return;
    }
    throw new Error('no guarded room found');
  });
});
