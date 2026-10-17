import type { KeyPress } from '../engine/input/keyboard.ts';
import type { LevelGain } from '../game/party/leveling.ts';
import { STAT_ABBR } from '../game/party/rules.ts';
import { CONTENT_TOP, drawFrame } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import type { AppContext, GameState } from './stateMachine.ts';

/** Announces level gains after a fight, then hands control to `next`. */
export class LevelUpState implements GameState {
  private readonly ctx: AppContext;
  private readonly gains: readonly LevelGain[];
  private readonly next: () => GameState;

  constructor(ctx: AppContext, gains: readonly LevelGain[], next: () => GameState) {
    this.ctx = ctx;
    this.gains = gains;
    this.next = next;
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    s.hideAllSprites();
    s.overlay = null;
    this.ctx.actions.setActions([{ label: 'CONTINUE', key: 'enter' }]);
    drawFrame(s, 'LEVEL UP!', ['ENTER:CONTINUE']);
    this.gains.slice(0, 8).forEach((g, i) => {
      const row = CONTENT_TOP + i * 2;
      printHi(s, 1, row, g.name);
      s.print(12, row, `REACHES LEVEL ${g.level}`);
      const parts = [`HP +${g.hp}`];
      if (g.sp) parts.push(`SP +${g.sp}`);
      if (g.stat) parts.push(`${STAT_ABBR[g.stat]} +1`);
      s.print(3, row + 1, parts.join('   '));
    });
  }

  onKey(press: KeyPress): void {
    if (press.key === 'enter' || press.key === 'back') this.ctx.machine.change(this.next());
  }

  update(): void {}
}
