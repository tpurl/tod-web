import type { KeyPress } from '../engine/input/keyboard.ts';
import { equippedItem } from '../game/items/inventory.ts';
import { CONTENT_TOP, drawFrame } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import { DungeonState } from './dungeonState.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { StoreState } from './storeState.ts';
import { PartyStatusState } from './partyStatusState.ts';
import { TitleState } from './titleState.ts';

/** The dungeon entrance: go down, go back to the store, or quit to the title. */
export class PartyReadyState implements GameState {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    s.hideAllSprites();
    this.ctx.actions.setActions([
      { label: 'PARTY', key: 'char:P' },
      { label: 'QUIT TO TITLE', key: 'char:Q' },
    ]);
    drawFrame(s, 'THE DUNGEON ENTRANCE', ['ENTER:GO DOWN   BACK:STORE', 'Q:QUIT TO TITLE']);
    const party = this.ctx.party;
    if (!party) return;
    const who = party.members.length === 1 ? 'YOUR HERO STANDS READY.' : `YOUR PARTY OF ${party.members.length} STANDS READY.`;
    s.print(1, CONTENT_TOP, who);
    party.members.forEach((m, i) => {
      const row = CONTENT_TOP + 2 + i * 2;
      printHi(s, 1, row, m.name);
      s.print(12, row, `HP ${m.hp.current}/${m.hp.max}`);
      s.print(23, row, m.hp.current <= 0 ? 'DEAD' : `LEVEL ${m.level}`);
      const w = equippedItem(m, 'weapon');
      const a = equippedItem(m, 'armor');
      s.print(3, row + 1, `${w ? w.name.toUpperCase() : 'BARE HANDS'}, ${a ? a.name.toUpperCase() : 'NO ARMOR'}`);
    });
    s.print(1, CONTENT_TOP + 11, `GOLD ${party.gold}    FOOD ${party.food}`);
  }

  onKey(press: KeyPress): void {
    if (press.key === 'enter') this.ctx.machine.change(new DungeonState(this.ctx));
    else if (press.key === 'back') this.ctx.machine.change(new StoreState(this.ctx));
    else if (press.key === 'char' && press.char === 'Q') this.ctx.machine.change(new TitleState(this.ctx));
    else if (press.key === 'char' && press.char === 'P') this.ctx.machine.change(new PartyStatusState(this.ctx, () => new PartyReadyState(this.ctx)));
  }

  update(): void {}
}
