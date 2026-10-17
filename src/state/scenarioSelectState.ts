import type { KeyPress } from '../engine/input/keyboard.ts';
import { DIFFICULTIES, getDifficulty } from '../game/scenario/difficulty.ts';
import { SCENARIOS } from '../game/scenario/scenarios.ts';
import { CONTENT_TOP, drawFrame, menuItem, wrap } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import { PartyCreationState } from './partyCreationState.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { TitleState } from './titleState.ts';

/** Choose the adventure, then how hard it is (manual p.20), before making a party. */
export class ScenarioSelectState implements GameState {
  phase: 'scenario' | 'difficulty' = 'scenario';
  cursor = 0;
  level = 1;
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    const current = ctx.scenario ? SCENARIOS.indexOf(ctx.scenario) : -1;
    if (current >= 0) this.cursor = current;
    this.level = Math.max(0, DIFFICULTIES.indexOf(getDifficulty(ctx.difficulty)));
  }

  enter(): void {
    loadUiTiles(this.ctx.screen);
    this.ctx.screen.hideAllSprites();
    this.ctx.actions.setActions([]);
    this.draw();
  }

  onKey(press: KeyPress): void {
    const choosingLevel = this.phase === 'difficulty';
    const n = choosingLevel ? DIFFICULTIES.length : SCENARIOS.length;
    const move = (d: number) => {
      if (choosingLevel) this.level = (this.level + n + d) % n;
      else this.cursor = (this.cursor + n + d) % n;
    };
    if (press.key === 'up') move(-1);
    else if (press.key === 'down') move(1);
    else if (press.key === 'enter' && !choosingLevel) this.phase = 'difficulty';
    else if (press.key === 'enter') {
      this.ctx.scenario = SCENARIOS[this.cursor];
      this.ctx.difficulty = DIFFICULTIES[this.level].id;
      this.ctx.party = null;
      this.ctx.dungeon = null;
      this.ctx.machine.change(new PartyCreationState(this.ctx));
      return;
    } else if (press.key === 'back' && choosingLevel) this.phase = 'scenario';
    else if (press.key === 'back') {
      this.ctx.machine.change(new TitleState(this.ctx));
      return;
    } else return;
    this.draw();
  }

  update(): void {}

  private draw(): void {
    if (this.phase === 'difficulty') return this.drawLevels();
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

  private drawLevels(): void {
    const s = this.ctx.screen;
    const sc = SCENARIOS[this.cursor];
    drawFrame(s, 'LEVEL OF DIFFICULTY', ['UP/DOWN:CHOOSE   ENTER:OK', 'BACK:ADVENTURE']);
    printHi(s, 2, CONTENT_TOP, sc.title);
    DIFFICULTIES.forEach((d, i) => {
      const row = CONTENT_TOP + 2 + i * 3;
      menuItem(s, row, `${i + 1} ${d.name}`, i === this.level);
      s.print(4, row + 1, d.blurb.slice(0, 28));
    });
    const d = DIFFICULTIES[this.level];
    const top = CONTENT_TOP + 2 + DIFFICULTIES.length * 3 + 1;
    s.print(2, top, `STARTING GOLD ${Math.round(sc.start.gold * d.goldScale)}`);
  }
}
