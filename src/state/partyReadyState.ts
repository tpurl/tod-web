import type { KeyPress } from '../engine/input/keyboard.ts';
import { equippedItem } from '../game/items/inventory.ts';
import { CONTENT_TOP, drawFrame } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { StoreState } from './storeState.ts';
import { TitleState } from './titleState.ts';

/** Hand-off point after the store. Milestone 4 replaces this with the first dungeon floor. */
export class PartyReadyState implements GameState {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    drawFrame(s, 'READY TO DESCEND', ['ENTER:BACK TO TITLE', 'BACK:RETURN TO STORE']);
    const party = this.ctx.party;
    if (!party) return;
    const who = party.members.length === 1 ? 'YOUR HERO STANDS READY.' : `YOUR PARTY OF ${party.members.length} STANDS READY.`;
    s.print(1, CONTENT_TOP, who);
    party.members.forEach((m, i) => {
      const row = CONTENT_TOP + 2 + i * 2;
      printHi(s, 1, row, m.name);
      s.print(12, row, `HP ${m.hp.max}`);
      const w = equippedItem(m, 'weapon');
      const a = equippedItem(m, 'armor');
      s.print(3, row + 1, `${w ? w.name.toUpperCase() : 'BARE HANDS'}, ${a ? a.name.toUpperCase() : 'NO ARMOR'}`);
    });
    s.print(1, CONTENT_TOP + 11, `GOLD ${party.gold}    FOOD ${party.food}`);
    s.print(1, CONTENT_TOP + 13, 'THE DUNGEON OPENS IN THE');
    s.print(1, CONTENT_TOP + 14, 'NEXT BUILD.');
  }

  onKey(press: KeyPress): void {
    if (press.key === 'enter') this.ctx.machine.change(new TitleState(this.ctx));
    else if (press.key === 'back') this.ctx.machine.change(new StoreState(this.ctx));
  }

  update(): void {}
}
