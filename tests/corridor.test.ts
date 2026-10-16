import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { RecordingActions, shortcutLabel } from '../src/engine/input/actionBar.ts';
import { VIEW_COLORS, VIEW_H, VIEW_W, frame, renderCorridor } from '../src/engine/render/corridorRenderer.ts';
import { ROOM_COLORS, renderRoom, roomCellCenter, roomLayout } from '../src/engine/render/roomRenderer.ts';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { LEFT_OF, RIGHT_OF, corridorSlices, sideAt, type Slice } from '../src/game/dungeon/corridorView.ts';
import { createDungeon, getView, type FloorView } from '../src/game/dungeon/dungeon.ts';
import { DungeonModel } from '../src/game/dungeon/dungeonModel.ts';
import { CELL, STEP, cellAt, isPassable, type Floor } from '../src/game/dungeon/floor.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { createParty } from '../src/game/party/party.ts';

/** A hand-made floor from rows: '#' wall, '.' corridor, 'r' room, 'D' door, 'S' secret door. */
function floorFrom(rows: string[]): FloorView {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  const doors: Floor['doors'] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = ch === '.' ? CELL.corridor : ch === 'r' ? CELL.room : ch === 'D' || ch === 'S' ? CELL.door : CELL.wall;
      cells[y * width + x] = c;
      if (c === CELL.door) doors.push({ x, y, side: 'n', kind: ch === 'S' ? 'secret' : 'normal', roomId: 0 });
    }),
  );
  const floor: Floor = { depth: 1, seed: 0, width, height, cells, rooms: [], doors, stairsUp: { x: 1, y: 1 }, stairsDown: null };
  return { floor, explored: new Uint8Array(width * height), found: new Set(), contents: [] };
}

describe('corridor slices', () => {
  // Looking north from (2,5): corridor runs up to a wall at y=0,
  // with a side passage west at y=3 and a door east at y=2.
  const v = floorFrom([
    '#####',
    '##.##',
    '##.D#',
    '...##',
    '##.##',
    '##.##',
    '#####',
  ]);

  it('reports sides and what ends the view', () => {
    const s = corridorSlices(v, { x: 2, y: 5 }, 'n');
    expect(s.map((x) => x.depth)).toEqual([0, 1, 2, 3, 4]);
    expect(s[2]).toEqual({ depth: 2, left: 'open', right: 'wall', ahead: 'open' });
    expect(s[3].right).toBe('door');
    expect(s[4].ahead).toBe('open'); // depth limit
  });

  it('stops at a wall straight ahead', () => {
    const s = corridorSlices(v, { x: 2, y: 2 }, 'n');
    expect(s).toHaveLength(2);
    expect(s[1].ahead).toBe('wall');
  });

  it('undiscovered secret doors look like wall until found', () => {
    const w = floorFrom(['###', '#S#', '#.#', '###']);
    expect(sideAt(w, 1, 1)).toBe('wall');
    w.found.add(0);
    expect(sideAt(w, 1, 1)).toBe('door');
  });

  it('open room floor beside a room square is empty space, not a side passage', () => {
    const w = floorFrom(['#####', '#rrr#', '#rrr#', '#rrr#', '##.##', '#####']);
    const s = corridorSlices(w, { x: 2, y: 4 }, 'n');
    expect(s[0].left).toBe('wall'); // in the corridor
    expect(s[1]).toEqual({ depth: 1, left: 'space', right: 'space', ahead: 'open' });
    expect(s[3].ahead).toBe('wall');
  });

  it('left and right turn correctly', () => {
    expect(LEFT_OF.n).toBe('w');
    expect(RIGHT_OF.n).toBe('e');
    expect(LEFT_OF[RIGHT_OF.s]).toBe('s');
  });
});

describe('corridor renderer', () => {
  const at = (c: { get(x: number, y: number): number }, x: number, y: number) => c.get(x, y);

  it('frames shrink toward the center', () => {
    for (let d = 0; d < 5; d++) {
      const a = frame(d);
      const b = frame(d + 1);
      expect(b.l > a.l && b.r < a.r && b.t > a.t && b.b < a.b).toBe(true);
    }
  });

  it('draws ceiling, floor, side walls, and a front wall', () => {
    const slices: Slice[] = [
      { depth: 0, left: 'wall', right: 'wall', ahead: 'open' },
      { depth: 1, left: 'wall', right: 'wall', ahead: 'wall' },
    ];
    const cv = renderCorridor(slices);
    expect(cv.width).toBe(VIEW_W);
    expect(cv.height).toBe(VIEW_H);
    const f2 = frame(2);
    expect(at(cv, VIEW_W / 2, VIEW_H / 2)).toBe(VIEW_COLORS.frontWall);
    expect(at(cv, 10, VIEW_H / 2)).toBe(VIEW_COLORS.sideWall);
    expect(at(cv, VIEW_W - 10, VIEW_H / 2)).toBe(VIEW_COLORS.sideWall);
    expect(at(cv, f2.l + 2, f2.t + 2)).toBe(VIEW_COLORS.frontWall);
  });

  it('a side opening shows the passage wall instead of a slanted wall', () => {
    const cv = renderCorridor([{ depth: 0, left: 'open', right: 'wall', ahead: 'wall' }]);
    expect(at(cv, 4, 4)).toBe(VIEW_COLORS.ceiling); // above the opening
    expect(at(cv, 20, VIEW_H / 2)).toBe(VIEW_COLORS.frontWall);
  });

  it('a door ahead draws a door panel in the front wall', () => {
    const cv = renderCorridor([{ depth: 0, left: 'wall', right: 'wall', ahead: 'door' }]);
    const f1 = frame(1);
    expect(at(cv, VIEW_W / 2, f1.b - 4)).toBe(VIEW_COLORS.door);
  });

  it('shows through the overlay layer', () => {
    const s = new TileScreen();
    const pixels = new Uint8Array(4).fill(0);
    pixels[3] = 9;
    s.overlay = { x: 10, y: 10, width: 2, height: 2, pixels };
    const out = new Uint8Array(256 * 192);
    s.render(out);
    expect(out[11 * 256 + 11]).toBe(9);
    expect(out[10 * 256 + 10]).not.toBe(9); // 0 is transparent
  });
});

describe('room view', () => {
  it('fits every room size into the view', () => {
    for (let w = 3; w <= 7; w++) {
      for (let h = 3; h <= 5; h++) {
        const L = roomLayout({ id: 0, x: 2, y: 2, w, h });
        expect(L.ox >= 0 && L.oy >= 0).toBe(true);
        expect(L.ox + (w + 2) * L.cell <= VIEW_W && L.oy + (h + 2) * L.cell <= VIEW_H).toBe(true);
      }
    }
  });

  it('draws walls, doors, and floor where the room has them', () => {
    const d = createDungeon(8);
    const v = getView(d, 1);
    const door = v.floor.doors.find((x) => x.kind === 'normal')!;
    const room = v.floor.rooms[door.roomId];
    const cv = renderRoom(v, room);
    const L = roomLayout(room);
    const centre = (x: number, y: number) => ({
      px: L.ox + (x - room.x + 1) * L.cell + Math.floor(L.cell / 2),
      py: L.oy + (y - room.y + 1) * L.cell + Math.floor(L.cell / 2),
    });
    const dc = centre(door.x, door.y);
    expect(cv.get(dc.px, dc.py)).toBe(ROOM_COLORS.door);
    const corner = centre(room.x - 1, room.y - 1);
    expect([ROOM_COLORS.wall, ROOM_COLORS.mortar]).toContain(cv.get(corner.px + 2, corner.py + 2));
    const c = roomCellCenter(room, room.x, room.y);
    expect(c.px > L.ox && c.py > L.oy).toBe(true);
  });
});

describe('3D movement', () => {
  const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });
  const stats = { strength: 10, dexterity: 10, intelligence: 10, constitution: 10 };

  function setup() {
    const party = createParty([createCharacter({ id: 'p1', name: 'A', classId: 'hero', raceId: null, baseStats: stats })], {
      racesEnabled: false,
    });
    const d = createDungeon(21);
    const m = new DungeonModel(d, party, createRng(1));
    return { party, m, v: getView(d, 1) };
  }

  it('starts in the 3D view; V toggles the map', () => {
    const { m } = setup();
    expect(m.view3d).toBe(true);
    m.onKey(K('char', 'V'));
    expect(m.view3d).toBe(false);
  });

  it('left and right turn in place', () => {
    const { party, m } = setup();
    const pos = { ...party.position };
    const f = party.facing;
    m.onKey(K('right'));
    expect(party.facing).toBe(RIGHT_OF[f]);
    m.onKey(K('left'));
    m.onKey(K('left'));
    expect(party.facing).toBe(LEFT_OF[f]);
    expect(party.position).toEqual(pos);
  });

  it('up walks forward and down steps back without turning', () => {
    const { party, m, v } = setup();
    // Face an open square.
    for (let i = 0; i < 4; i++) {
      const s = STEP[party.facing];
      if (isPassable(v.floor, party.position.x + s.dx, party.position.y + s.dy)) break;
      m.onKey(K('right'));
    }
    const start = { ...party.position };
    const facing = party.facing;
    m.onKey(K('up'));
    expect(party.position).toEqual({ x: start.x + STEP[facing].dx, y: start.y + STEP[facing].dy });
    m.onKey(K('down'));
    expect(party.position).toEqual(start);
    expect(party.facing).toBe(facing);
  });

  it('walking into a wall says so', () => {
    const { party, m, v } = setup();
    const r = v.floor.rooms[0];
    party.position = { x: r.x, y: r.y };
    for (let i = 0; i < 4; i++) {
      const s = STEP[party.facing];
      if (cellAt(v.floor, party.position.x + s.dx, party.position.y + s.dy) === CELL.wall) break;
      m.onKey(K('right'));
    }
    m.onKey(K('up'));
    expect(m.message).toBe('A WALL BLOCKS THE WAY');
  });
});

describe('action buttons', () => {
  it('shows the keyboard shortcut for each button', () => {
    expect(shortcutLabel('char:R')).toBe('R');
    expect(shortcutLabel('enter')).toBe('ENTER');
    expect(shortcutLabel('back')).toBe('ESC');
  });

  it('records the latest set', () => {
    const r = new RecordingActions();
    r.setActions([{ label: 'REROLL', key: 'char:R' }]);
    expect(r.current).toEqual([{ label: 'REROLL', key: 'char:R' }]);
  });
});
