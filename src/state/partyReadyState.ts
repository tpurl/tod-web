import type { KeyPress } from '../engine/input/keyboard.ts';
import { getClass } from '../game/party/rules.ts';
import { CONTENT_TOP, drawFrame } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { TitleState } from './titleState.ts';

/** Hand-off point after party creation. Milestone 3 replaces this with the general store. */
export class PartyReadyState implements GameState {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    drawFrame(s, 'READY', ['ENTER:BACK TO TITLE']);
    const party = this.ctx.party;
    if (!party) return;
    const who = party.members.length === 1 ? 'YOUR HERO IS READY.' : `YOUR PARTY OF ${party.members.length} IS READY.`;
    s.print(2, CONTENT_TOP, who);
    party.members.forEach((m, i) => {
      printHi(s, 4, CONTENT_TOP + 2 + i, m.name);
      s.print(15, CONTENT_TOP + 2 + i, getClass(m.classId).name.toUpperCase());
    });
    s.print(2, CONTENT_TOP + 8, `GOLD ${party.gold}    FOOD ${party.food}`);
    s.print(2, CONTENT_TOP + 11, 'THE GENERAL STORE OPENS');
    s.print(2, CONTENT_TOP + 12, 'IN THE NEXT BUILD.');
  }

  onKey(press: KeyPress): void {
    if (press.key === 'enter' || press.key === 'back') this.ctx.machine.change(new TitleState(this.ctx));
  }

  update(): void {}
}
