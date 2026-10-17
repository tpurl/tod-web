import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { createRng } from '../src/engine/rng.ts';
import {
  SEARCH_BASE,
  createDungeon,
  getView,
  hiddenDoorsNear,
  isExplored,
  revealAround,
  search,
  searchChance,
  step,
} from '../src/game/dungeon/dungeon.ts';
import { DungeonModel } from '../src/game/dungeon/dungeonModel.ts';
import { CELL, DIRS, STEP, cellAt, isPassable, reachable, roomAt, samePoint, toRows, type Floor } from '../src/game/dungeon/floor.ts';
import { DEFAULT_GEN, generateFloor, validateFloor } from '../src/game/dungeon/generator.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { createParty, type Party } from '../src/game/party/party.ts';
import type { ClassId } from '../src/game/party/rules.ts';
import { rotateCW } from '../src/ui/dungeonTiles.ts';

const stats = { strength: 10, dexterity: 10, intelligence: 10, constitution: 10 };
function party(classId: ClassId = 'fighter', raceId: string | null = null): Party {
  return createParty([createCharacter({ id: 'p1', name: 'A', classId, raceId, baseStats: stats })], { racesEnabled: raceId !== null });
}
const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });

describe('floor generator', () => {
  it('10,000 seeded floors all pass validation', () => {
    let failures = 0;
    for (let seed = 0; seed < 10000; seed++) {
      const f = generateFloor(seed, 1 + (seed % 5), { hasDown: seed % 5 !== 4 });
      if (validateFloor(f).length) failures++;
    }
    expect(failures).toBe(0);
  }, 120000);

  it('is deterministic per seed', () => {
    const a = generateFloor(1234, 2);
    const b = generateFloor(1234, 2);
    expect(toRows(a)).toEqual(toRows(b));
    expect(a.doors).toEqual(b.doors);
    expect(toRows(generateFloor(1235, 2))).not.toEqual(toRows(a));
  });

  it('fills the 30x20 map with a solid border', () => {
    const f = generateFloor(7, 1);
    expect([f.width, f.height]).toEqual([DEFAULT_GEN.width, DEFAULT_GEN.height]);
    const rows = toRows(f);
    expect(rows[0]).toBe('#'.repeat(30));
    expect(rows[19]).toBe('#'.repeat(30));
    expect(rows.every((r) => r[0] === '#' && r[29] === '#')).toBe(true);
  });

  it('deepest floor has no stairs down', () => {
    expect(generateFloor(9, 5, { hasDown: false }).stairsDown).toBeNull();
  });

  it('every door sits between its room and a corridor', () => {
    for (let seed = 0; seed < 200; seed++) {
      const f = generateFloor(seed, 1);
      for (const d of f.doors) {
        expect(cellAt(f, d.x + STEP[d.side].dx, d.y + STEP[d.side].dy)).toBe(CELL.room);
        expect(roomAt(f, d.x + STEP[d.side].dx, d.y + STEP[d.side].dy)?.id).toBe(d.roomId);
      }
    }
  });

  it('secret doors exist across seeds but never block the stairs', () => {
    let secrets = 0;
    for (let seed = 0; seed < 300; seed++) {
      const f = generateFloor(seed, 1);
      secrets += f.doors.filter((d) => d.kind === 'secret').length;
      const r = reachable(f, f.stairsUp);
      expect(r[f.stairsDown!.y * f.width + f.stairsDown!.x]).toBe(1);
    }
    expect(secrets).toBeGreaterThan(50);
  });

  it('validation catches a broken floor', () => {
    const f: Floor = generateFloor(3, 1);
    f.stairsUp = { x: 0, y: 0 };
    expect(validateFloor(f)).toContain('up stairs not in a room');
  });
});

describe('exploration', () => {
  it('standing in a room reveals the room and its walls', () => {
    const d = createDungeon(5);
    const v = getView(d, 1);
    const r = v.floor.rooms[0];
    revealAround(v, { x: r.x, y: r.y });
    expect(isExplored(v, r.x + r.w - 1, r.y + r.h - 1)).toBe(true);
    expect(isExplored(v, r.x - 1, r.y - 1)).toBe(true);
  });

  it('cannot walk through walls; steps are counted', () => {
    const d = createDungeon(5);
    const v = getView(d, 1);
    const p = party();
    p.position = { ...v.floor.stairsUp };
    let moved = 0;
    for (const dir of DIRS) {
      const before = { ...p.position };
      const nx = before.x + STEP[dir].dx;
      const ny = before.y + STEP[dir].dy;
      const result = step(v, p, dir);
      expect(result).toBe(isPassable(v.floor, nx, ny, v.found) ? 'moved' : 'blocked');
      if (result === 'moved') {
        moved++;
        p.position = before;
      }
      expect(p.facing).toBe(dir);
    }
    expect(p.stepsTaken).toBe(moved);
  });

  it('search chance is the same for every class; elves get their race bonus', () => {
    // The manual gives no class a searching edge (rogues avoid traps instead).
    expect(searchChance(party('fighter'))).toBe(SEARCH_BASE);
    expect(searchChance(party('rogue'))).toBe(SEARCH_BASE);
    expect(searchChance(party('rogue', 'elf'))).toBe(SEARCH_BASE + 15);
  });

  it('searching next to a secret door eventually finds it and opens the way', () => {
    let tested = false;
    for (let seed = 0; seed < 200 && !tested; seed++) {
      const d = createDungeon(seed);
      const v = getView(d, 1);
      const idx = v.floor.doors.findIndex((x) => x.kind === 'secret');
      if (idx < 0) continue;
      const door = v.floor.doors[idx];
      const p = party('rogue');
      p.position = { x: door.x + STEP[door.side].dx, y: door.y + STEP[door.side].dy };
      expect(hiddenDoorsNear(v, p.position)).toContain(idx);
      expect(isPassable(v.floor, door.x, door.y, v.found)).toBe(false);
      const rng = createRng(1);
      for (let i = 0; i < 50 && !v.found.has(idx); i++) search(v, p, rng);
      expect(v.found.has(idx)).toBe(true);
      expect(isPassable(v.floor, door.x, door.y, v.found)).toBe(true);
      tested = true;
    }
    expect(tested).toBe(true);
  });
});

describe('DungeonModel', () => {
  it('enters on floor 1 at the up stairs and asks before leaving', () => {
    const p = party();
    const m = new DungeonModel(createDungeon(11), p, createRng(1));
    expect(p.depth).toBe(1);
    expect(m.onStairsUp).toBe(true);
    m.onKey(K('enter'));
    expect(m.mode).toBe('confirmExit');
    m.onKey(K('back'));
    expect(m.mode).toBe('explore');
    m.onKey(K('enter'));
    m.onKey(K('enter'));
    expect(m.mode).toBe('exited');
  });

  it('stairs move between floors and back to the same spot', () => {
    const p = party();
    const d = createDungeon(11);
    const m = new DungeonModel(d, p, createRng(1));
    const down = getView(d, 1).floor.stairsDown!;
    p.position = { ...down };
    m.onKey(K('enter'));
    expect(p.depth).toBe(2);
    expect(p.position).toEqual(getView(d, 2).floor.stairsUp);
    m.onKey(K('enter'));
    expect(p.depth).toBe(1);
    expect(p.position).toEqual(down);
  });

  it('Enter away from stairs says so; S searches', () => {
    const p = party();
    const d = createDungeon(11);
    const m = new DungeonModel(d, p, createRng(1));
    const f = getView(d, 1).floor;
    const spot = f.rooms
      .flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + 1, y: r.y }])
      .find((pt) => !samePoint(pt, f.stairsUp) && !samePoint(pt, f.stairsDown))!;
    p.position = spot;
    m.onKey(K('enter'));
    expect(m.message).toBe('NO STAIRS HERE');
    m.onKey(K('char', 'S'));
    expect(m.message.startsWith('YOU FIND')).toBe(true);
  });
});

describe('map tiles', () => {
  it('rotates sprite art clockwise', () => {
    const rows = ['#.......', ...Array(7).fill('........')];
    expect(rotateCW(rows)[0]).toBe('.......#');
    expect(rotateCW(rotateCW(rotateCW(rotateCW(rows))))).toEqual(rows);
  });
});
