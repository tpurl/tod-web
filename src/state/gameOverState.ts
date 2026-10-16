import type { KeyPress } from '../engine/input/keyboard.ts';
import { CONTENT_TOP, drawFrame } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { TitleState } from './titleState.ts';

/** Shown when every party member has died. */
export class GameOverState implements GameState {
  private readonly ctx: AppContext;
  private readonly cause: string;

  constructor(ctx: AppContext, cause = '') {
    this.ctx = ctx;
    this.cause = cause;
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    s.hideAllSprites();
    s.overlay = null;
    this.ctx.actions.setActions([]);
    drawFrame(s, 'THE END', ['ENTER:BACK TO TITLE']);
    if (this.cause) s.printCentered(CONTENT_TOP + 3, this.cause.slice(0, 32));
    const p = this.ctx.party;
    const n = p?.members.length ?? 0;
    printHi(s, 4, CONTENT_TOP + 6, n === 1 ? 'YOUR HERO HAS FALLEN.' : 'YOUR PARTY HAS PERISHED.');
    if (p) s.print(4, CONTENT_TOP + 8, `FELL ON FLOOR ${p.depth}   GOLD ${p.gold}`);
    this.ctx.party = null;
    this.ctx.dungeon = null;
  }

  onKey(press: KeyPress): void {
    if (press.key === 'enter' || press.key === 'back') this.ctx.machine.change(new TitleState(this.ctx));
  }

  update(): void {}
}
