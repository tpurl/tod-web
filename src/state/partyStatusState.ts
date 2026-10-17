import type { KeyPress } from '../engine/input/keyboard.ts';
import { armorDefense, equippedItem, isEquipped } from '../game/items/inventory.ts';
import { getItem } from '../game/items/items.ts';
import { statBonus } from '../game/party/character.ts';
import { xpToNext } from '../game/party/leveling.ts';
import { STAT_ABBR, STAT_KEYS, getClass, getRace } from '../game/party/rules.ts';
import { drawFrame, rjust, signed } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import type { AppContext, GameState } from './stateMachine.ts';

/** One character sheet per page; Left/Right flips between party members. */
export class PartyStatusState implements GameState {
  private readonly ctx: AppContext;
  private readonly back: () => GameState;
  index = 0;

  constructor(ctx: AppContext, back: () => GameState) {
    this.ctx = ctx;
    this.back = back;
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    s.hideAllSprites();
    s.overlay = null;
    this.ctx.actions.setActions([]);
    this.draw();
  }

  onKey(press: KeyPress): void {
    const n = this.ctx.party?.members.length ?? 1;
    if (press.key === 'back' || press.key === 'enter' || (press.key === 'char' && press.char === 'P')) {
      this.ctx.machine.change(this.back());
      return;
    }
    if (press.key === 'left') this.index = (this.index + n - 1) % n;
    else if (press.key === 'right') this.index = (this.index + 1) % n;
    else return;
    this.draw();
  }

  update(): void {}

  private draw(): void {
    const s = this.ctx.screen;
    const p = this.ctx.party;
    const n = p?.members.length ?? 0;
    drawFrame(s, 'PARTY', [n > 1 ? 'LEFT/RIGHT:NEXT MEMBER' : '', 'BACK:RETURN']);
    if (!p) return;
    const c = p.members[this.index];
    if (n > 1) {
      printHi(s, 0, 2, '<');
      printHi(s, 31, 2, '>');
    }
    printHi(s, 2, 2, c.name);
    const race = c.raceId ? `${getRace(c.raceId).name.toUpperCase()} ` : '';
    s.print(13, 2, `${race}${getClass(c.classId).name.toUpperCase()}`.slice(0, 17));

    const next = xpToNext(c);
    s.print(2, 4, `LEVEL ${c.level}`);
    s.print(12, 4, `XP ${c.xp}`);
    s.print(2, 5, next === null ? 'MAXIMUM LEVEL' : `NEXT LEVEL IN ${next} XP`);
    const sp = c.spellPoints ? `SP ${c.spellPoints.current}/${c.spellPoints.max}` : '';
    s.print(2, 6, `HP ${c.hp.current}/${c.hp.max}`);
    s.print(16, 6, sp);
    const status = c.hp.current <= 0 ? 'DISABLED' : c.status.includes('poisoned') ? 'POISONED' : '';
    if (status) printHi(s, 2, 7, status);

    STAT_KEYS.forEach((k, i) => {
      s.print(2 + (i % 2) * 14, 9 + Math.floor(i / 2), `${STAT_ABBR[k]} ${rjust(c.stats[k], 2)} ${signed(statBonus(c.stats[k]))}`);
    });

    const w = equippedItem(c, 'weapon');
    const a = equippedItem(c, 'armor');
    const sh = equippedItem(c, 'shield');
    s.print(2, 12, `WPN ${w ? w.name.toUpperCase() : '-'}`);
    s.print(2, 13, `ARM ${a ? a.name.toUpperCase() : '-'}`);
    s.print(2, 14, `SHD ${sh ? sh.name.toUpperCase() : '-'}`);
    s.print(22, 14, `DEF ${armorDefense(c)}`);

    s.print(2, 16, 'PACK:');
    const items = c.inventory.map((i) => {
      const def = getItem(i.itemId);
      const qty = def.stackable ? ` X${i.quantity ?? 1}` : '';
      return `${isEquipped(c, i.instanceId) ? '*' : ''}${def.name.toUpperCase()}${qty}`;
    });
    if (items.length === 0) s.print(8, 16, 'NOTHING');
    items.slice(0, 8).forEach((t, i) => s.print(2 + (i % 2) * 15, 17 + Math.floor(i / 2), t.slice(0, 14)));
  }
}
