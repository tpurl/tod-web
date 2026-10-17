import type { KeyPress } from '../engine/input/keyboard.ts';
import { armorDefense, canUse, equippedItem, isEquipped } from '../game/items/inventory.ts';
import { getItem, statLabel } from '../game/items/items.ts';
import { getClass } from '../game/party/rules.ts';
import { StoreModel, buyPrice, sellPrice } from '../game/store/store.ts';
import { MESSAGE_ROW, drawFrame, menuItem, rjust } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import { PartyReadyState } from './partyReadyState.ts';
import type { AppContext, GameState } from './stateMachine.ts';

/** Rows 5..17 hold the item list; longer lists scroll. */
const LIST_TOP = 5;
export const LIST_ROWS = 13;

/** First visible index so the cursor stays on screen. */
export function windowStart(cursor: number, length: number, rows: number): number {
  if (length <= rows) return 0;
  return Math.max(0, Math.min(cursor - Math.floor(rows / 2), length - rows));
}

/** The general store screen. All rules live in StoreModel. */
export class StoreState implements GameState {
  readonly model: StoreModel;
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    if (!ctx.party) throw new Error('StoreState needs a party');
    this.model = new StoreModel(ctx.party);
  }

  enter(): void {
    loadUiTiles(this.ctx.screen);
    this.ctx.screen.hideAllSprites();
    this.draw();
  }

  onKey(press: KeyPress): void {
    const gold = this.model.party.gold;
    this.model.onKey(press);
    if (this.model.party.gold !== gold) this.ctx.sound.play(this.model.party.gold < gold ? 'buy' : 'treasure');
    if (this.model.mode === 'left') {
      this.ctx.machine.change(new PartyReadyState(this.ctx));
      return;
    }
    this.draw();
  }

  update(): void {}

  private draw(): void {
    const m = this.model;
    const s = this.ctx.screen;
    const multi = m.party.members.length > 1;
    const buyerHint = multi ? '  LT/RT:BUYER' : '';

    const hints =
      m.mode === 'leave'
        ? ['ENTER:LEAVE STORE', 'BACK:KEEP SHOPPING']
        : m.mode === 'sell'
          ? ['ENTER:SELL  E:EQUIP  S:BUY', `BACK:LEAVE${buyerHint}`]
          : ['ENTER:BUY   S:SELL/EQUIP', `BACK:LEAVE${buyerHint}`];
    this.ctx.actions.setActions(
      m.mode === 'buy'
        ? [{ label: 'SELL / EQUIP', key: 'char:S' }]
        : m.mode === 'sell'
          ? [
              { label: 'EQUIP', key: 'char:E' },
              { label: 'BUY', key: 'char:S' },
            ]
          : [],
    );
    const message = m.mode === 'leave' ? 'LEAVE FOR THE DUNGEON?' : m.message || m.hint;
    drawFrame(s, 'GENERAL STORE', hints, '');
    if (message) {
      // Warnings and results share the message row; results are highlighted.
      const col = Math.max(0, Math.floor((32 - message.length) / 2));
      if (m.message || m.mode === 'leave') printHi(s, col, MESSAGE_ROW, message);
      else s.print(col, MESSAGE_ROW, message);
    }

    // Buyer line.
    const c = m.character;
    if (multi) {
      printHi(s, 0, 2, '<');
      printHi(s, 31, 2, '>');
    }
    printHi(s, 2, 2, c.name);
    s.print(13, 2, getClass(c.classId).name.toUpperCase());
    s.print(23, 2, `${m.buyer + 1} OF ${m.party.members.length}`);

    s.print(0, 3, `GOLD ${m.party.gold}`);
    s.print(11, 3, `FOOD ${m.party.food}`);
    printHi(s, 24, 3, m.mode === 'sell' ? 'SELLING' : ' BUYING');

    s.print(4, 4, m.mode === 'sell' ? 'PACK  *=IN USE' : 'ITEM');
    s.print(19, 4, m.mode === 'sell' ? 'QTY' : 'STAT');
    s.print(27, 4, m.mode === 'sell' ? 'PAYS' : 'COST');

    if (m.mode === 'sell') this.drawPack();
    else this.drawStock();

    // Equipment summary.
    const weapon = equippedItem(c, 'weapon');
    const armor = equippedItem(c, 'armor');
    const shield = equippedItem(c, 'shield');
    s.print(0, 18, `WPN ${weapon ? weapon.name.toUpperCase() : '-'}`);
    s.print(19, 18, `SHD ${shield ? 'YES' : '-'}`);
    s.print(0, 19, `ARM ${armor ? armor.name.toUpperCase() : '-'}`);
    s.print(19, 19, `DEF ${armorDefense(c)}`);
  }

  private drawStock(): void {
    const m = this.model;
    const s = this.ctx.screen;
    const stock = m.config.stock;
    const start = windowStart(m.cursor, stock.length, LIST_ROWS);
    stock.slice(start, start + LIST_ROWS).forEach((e, i) => {
      const idx = start + i;
      const row = LIST_TOP + i;
      const sel = idx === m.cursor;
      menuItem(s, row, e.item.name.toUpperCase(), sel);
      const stat = e.bundle > 1 ? `X${e.bundle}` : statLabel(e.item);
      // Gear this buyer's class can't use shows "--" for cost; the message row explains when selected.
      const usable = e.item.kind === 'food' || canUse(m.character, e.item);
      const price = usable ? rjust(buyPrice(e), 4) : '  --';
      if (sel) {
        printHi(s, 19, row, stat);
        s.print(27, row, price);
      } else {
        s.print(19, row, stat);
        s.print(27, row, price);
      }
    });
  }

  private drawPack(): void {
    const m = this.model;
    const s = this.ctx.screen;
    const c = m.character;
    if (c.inventory.length === 0) {
      s.print(4, LIST_TOP, 'NOTHING CARRIED');
      return;
    }
    const start = windowStart(m.cursor, c.inventory.length, LIST_ROWS);
    c.inventory.slice(start, start + LIST_ROWS).forEach((inst, i) => {
      const idx = start + i;
      const row = LIST_TOP + i;
      const item = getItem(inst.itemId);
      menuItem(s, row, item.name.toUpperCase(), idx === m.cursor);
      if (isEquipped(c, inst.instanceId)) s.print(18, row, '*');
      s.print(19, row, item.stackable ? `X${inst.quantity ?? 1}` : statLabel(item));
      s.print(27, row, rjust(sellPrice(inst, m.config.sellRate), 4));
    });
  }
}
