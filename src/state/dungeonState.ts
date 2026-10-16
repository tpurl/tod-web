import type { KeyPress } from '../engine/input/keyboard.ts';
import { VIEW_H, VIEW_W, renderCorridor } from '../engine/render/corridorRenderer.ts';
import { COLOR } from '../engine/render/palette.ts';
import { renderRoom, roomCellCenter } from '../engine/render/roomRenderer.ts';
import { COLS } from '../engine/render/tileScreen.ts';
import { createDungeon, isExplored } from '../game/dungeon/dungeon.ts';
import { corridorSlices } from '../game/dungeon/corridorView.ts';
import { DungeonModel } from '../game/dungeon/dungeonModel.ts';
import { CELL, cellAt, doorIndexAt, roomAt, samePoint } from '../game/dungeon/floor.ts';
import { PARTY_SPRITE, MAP_TILE, loadMapTiles, loadPartySprites } from '../ui/dungeonTiles.ts';
import { MESSAGE_ROW, HINT_ROWS } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import { PartyReadyState } from './partyReadyState.ts';
import type { AppContext, GameState } from './stateMachine.ts';

/** The map occupies rows 1..20, columns 1..30: one floor square per tile. */
export const MAP_LEFT = 1;
export const MAP_TOP = 1;
/** The 3D view fills rows 1..20 (pixels y 8..167). */
export const VIEW_TOP = 8;

const FACING_NAME = { n: 'NORTH', e: 'EAST', s: 'SOUTH', w: 'WEST' } as const;

/** The dungeon screen: first-person corridor view or top-down map. Rules live in DungeonModel. */
export class DungeonState implements GameState {
  readonly model: DungeonModel;
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    if (!ctx.party) throw new Error('DungeonState needs a party');
    if (!ctx.dungeon) ctx.dungeon = createDungeon(ctx.rng.int(0, 0x7fffffff));
    this.model = new DungeonModel(ctx.dungeon, ctx.party, ctx.rng);
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    loadMapTiles(s);
    loadPartySprites(s);
    s.hideAllSprites();
    s.spriteSize = 8;
    s.spriteMagnify = false;
    this.draw();
  }

  exit(): void {
    this.ctx.screen.hideAllSprites();
    this.ctx.screen.spriteSize = 16;
    this.ctx.screen.spriteMagnify = false;
    this.ctx.screen.overlay = null;
  }

  onKey(press: KeyPress): void {
    this.model.onKey(press);
    if (this.model.mode === 'exited') {
      this.ctx.machine.change(new PartyReadyState(this.ctx));
      return;
    }
    this.draw();
  }

  update(): void {}

  private draw(): void {
    const s = this.ctx.screen;
    const m = this.model;
    const p = m.party;
    s.clear();

    printHi(s, 0, 0, `FLOOR ${p.depth}`);
    const status = m.view3d ? `FACING ${FACING_NAME[p.facing]}` : `GOLD ${p.gold} FOOD ${p.food}`;
    s.print(COLS - status.length, 0, status);

    const room = roomAt(m.view.floor, p.position.x, p.position.y);
    if (m.view3d && room) {
      // Inside a room the view switches to a close-up of the room from above.
      const cv = renderRoom(m.view, room);
      s.overlay = { x: 0, y: VIEW_TOP, width: VIEW_W, height: VIEW_H, pixels: cv.pixels };
      const { px, py } = roomCellCenter(room, p.position.x, p.position.y);
      s.spriteMagnify = true;
      Object.assign(s.sprites[0], {
        x: Math.round(px) - 8,
        y: VIEW_TOP + Math.round(py) - 8,
        pattern: PARTY_SPRITE[p.facing],
        color: COLOR.cyan,
        visible: true,
      });
    } else if (m.view3d) {
      s.sprites[0].visible = false;
      const slices = corridorSlices(m.view, p.position, p.facing);
      const cv = renderCorridor(slices);
      s.overlay = { x: 0, y: VIEW_TOP, width: VIEW_W, height: VIEW_H, pixels: cv.pixels };
    } else {
      s.overlay = null;
      s.spriteMagnify = false;
      this.drawMap();
      Object.assign(s.sprites[0], {
        x: (MAP_LEFT + p.position.x) * 8,
        y: (MAP_TOP + p.position.y) * 8,
        pattern: PARTY_SPRITE[p.facing],
        color: COLOR.cyan,
        visible: true,
      });
    }

    const msg = m.mode === 'confirmExit' ? 'LEAVE THE DUNGEON?' : m.message;
    if (msg) printHi(s, Math.max(0, Math.floor((COLS - msg.length) / 2)), MESSAGE_ROW + 1, msg);
    const hints =
      m.mode === 'confirmExit'
        ? ['ENTER:LEAVE', 'BACK:STAY']
        : m.view3d
          ? ['UP:FORWARD  DOWN:BACK  S:SEARCH', 'LEFT/RIGHT:TURN  ENTER:STAIRS']
          : ['ARROWS:MOVE   S:SEARCH', 'ENTER:USE STAIRS  V:3D VIEW'];
    HINT_ROWS.forEach((row, i) => s.print(0, row, hints[i]));
    this.ctx.actions.setActions(
      m.mode === 'confirmExit'
        ? []
        : [
            { label: m.view3d ? 'MAP' : '3D VIEW', key: 'char:V' },
            { label: 'SEARCH', key: 'char:S' },
          ],
    );
  }

  private drawMap(): void {
    const s = this.ctx.screen;
    const v = this.model.view;
    const f = v.floor;
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        if (!isExplored(v, x, y)) continue;
        s.put(MAP_LEFT + x, MAP_TOP + y, this.tileFor(x, y));
      }
    }
  }

  private tileFor(x: number, y: number): number {
    const v = this.model.view;
    const f = v.floor;
    if (samePoint({ x, y }, f.stairsUp)) return MAP_TILE.stairsUp;
    if (samePoint({ x, y }, f.stairsDown)) return MAP_TILE.stairsDown;
    switch (cellAt(f, x, y)) {
      case CELL.corridor:
        return MAP_TILE.corridor;
      case CELL.room:
        return MAP_TILE.room;
      case CELL.door: {
        const i = doorIndexAt(f, x, y);
        return f.doors[i].kind === 'secret' && !v.found.has(i) ? MAP_TILE.wall : MAP_TILE.door;
      }
      default:
        return MAP_TILE.wall;
    }
  }
}
