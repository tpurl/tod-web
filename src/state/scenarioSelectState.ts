import type { KeyPress } from '../engine/input/keyboard.ts';
import { SCENARIOS } from '../game/scenario/scenarios.ts';
import { CONTENT_TOP, drawFrame, menuItem, wrap } from '../ui/layout.ts';
import { loadUiTiles } from '../ui/tiles.ts';
import { PartyCreationState } from './partyCreationState.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { TitleState } from './titleState.ts';

/** Choose the adventure before making a party. */
export class ScenarioSelectState implements GameState {
  private readonly ctx: AppContext;
  cursor = 0;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    const current = ctx.scenario ? SCENARIOS.indexOf(ctx.scenario) : -1;
    if (current >= 0) this.cursor = current;
  }

  enter(): void {
    loadUiTiles(this.ctx.screen);
    this.ctx.screen.hideAllSprites();
    this.ctx.actions.setActions([]);
    this.draw();
  }

  onKey(press: KeyPress): void {
    const n = SCENARIOS.length;
    if (press.key === 'up') this.cursor = (this.cursor + n - 1) % n;
    else if (press.key === 'down') this.cursor = (this.cursor + 1) % n;
    else if (press.key === 'enter') {
      this.ctx.scenario = SCENARIOS[this.cursor];
      this.ctx.party = null;
      this.ctx.dungeon = null;
      this.ctx.machine.change(new PartyCreationState(this.ctx));
      return;
    } else if (press.key === 'back') {
      this.ctx.machine.change(new TitleState(this.ctx));
      return;
    } else return;
    this.draw();
  }

  update(): void {}

  private draw(): void {
    const s = this.ctx.screen;
    drawFrame(s, 'CHOOSE AN ADVENTURE', ['UP/DOWN:CHOOSE   ENTER:OK', 'BACK:TITLE']);
    SCENARIOS.forEach((sc, i) => {
      const row = CONTENT_TOP + i * 3;
      menuItem(s, row, sc.title, i === this.cursor);
      s.print(4, row + 1, sc.blurb.slice(0, 28));
    });
    const sel = SCENARIOS[this.cursor];
    const top = CONTENT_TOP + SCENARIOS.length * 3 + 1;
    s.print(2, top, `${sel.floors} FLOORS   GOLD ${sel.start.gold}   FOOD ${sel.start.food}`);
    wrap(sel.intro, 28).slice(0, 4).forEach((l, i) => s.print(2, top + 2 + i, l));
  }
}
