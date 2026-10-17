import type { KeyPress } from '../engine/input/keyboard.ts';
import { CONTENT_TOP, drawFrame } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { TitleState } from './titleState.ts';

/** Shown when the party leaves the dungeon with the scenario's goal met. */
export class VictoryState implements GameState {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    s.hideAllSprites();
    s.overlay = null;
    this.ctx.actions.setActions([{ label: 'TITLE', key: 'enter' }]);
    this.ctx.sound.music('music_victory');
    drawFrame(s, 'VICTORY!', ['ENTER:BACK TO TITLE']);
    const sc = this.ctx.scenario;
    const p = this.ctx.party;
    const line = sc?.goal.type === 'retrieve_and_rescue' ? `${sc.goal.captiveName} IS SAVED!` : 'YOUR FORTUNE IS MADE!';
    printHi(s, Math.max(0, Math.floor((32 - line.length) / 2)), CONTENT_TOP + 1, line);
    if (sc) s.printCentered(CONTENT_TOP + 3, sc.title);
    if (p) {
      s.print(2, CONTENT_TOP + 6, 'HEROES OF THE REALM:');
      p.members.forEach((m, i) => {
        s.print(4, CONTENT_TOP + 8 + i, `${m.name.padEnd(11)}LEVEL ${m.level}${m.hp.current <= 0 ? '  (FALLEN)' : ''}`);
      });
      s.print(2, CONTENT_TOP + 13, `GOLD ${p.gold}   STEPS ${p.stepsTaken}`);
    }
    this.ctx.party = null;
    this.ctx.dungeon = null;
  }

  onKey(press: KeyPress): void {
    if (press.key === 'enter' || press.key === 'back') this.ctx.machine.change(new TitleState(this.ctx));
  }

  update(): void {}
}
