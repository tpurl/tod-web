import type { KeyPress } from '../engine/input/keyboard.ts';
import { COLOR } from '../engine/render/palette.ts';
import { COLS } from '../engine/render/tileScreen.ts';
import { createDungeon, isExplored } from '../game/dungeon/dungeon.ts';
import { DungeonModel } from '../game/dungeon/dungeonModel.ts';
import { CELL, cellAt, doorIndexAt, samePoint } from '../game/dungeon/floor.ts';
import { PARTY_SPRITE, MAP_TILE, loadMapTiles, loadPartySprites } from '../ui/dungeonTiles.ts';
import { MESSAGE_ROW, HINT_ROWS } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import { PartyReadyState } from './partyReadyState.ts';
import type { AppContext, GameState } from './stateMachine.ts';

/** The map occupies rows 1..20, columns 1..30: one floor square per tile. */
export const MAP_LEFT = 1;
export const MAP_TOP = 1;

/** Top-down map view of the current floor. Rules live in DungeonModel. */
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
    const status = `GOLD ${p.gold} FOOD ${p.food}`;
    s.print(COLS - status.length, 0, status);

    this.drawMap();

    const sprite = s.sprites[0];
    Object.assign(sprite, {
      x: (MAP_LEFT + p.position.x) * 8,
      y: (MAP_TOP + p.position.y) * 8,
      pattern: PARTY_SPRITE[p.facing],
      color: COLOR.cyan,
      visible: true,
    });

    const msg = m.mode === 'confirmExit' ? 'LEAVE THE DUNGEON?' : m.message;
    if (msg) printHi(s, Math.max(0, Math.floor((COLS - msg.length) / 2)), MESSAGE_ROW + 1, msg);
    const hints =
      m.mode === 'confirmExit'
        ? ['ENTER:LEAVE', 'BACK:STAY']
        : ['ARROWS:MOVE   S:SEARCH', 'ENTER:USE STAIRS'];
    HINT_ROWS.forEach((row, i) => s.print(0, row, hints[i]));
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
