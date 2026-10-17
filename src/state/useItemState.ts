import type { KeyPress } from '../engine/input/keyboard.ts';
import type { FloorView } from '../game/dungeon/dungeon.ts';
import { getItem } from '../game/items/items.ts';
import { cannotUse, targetFor, usableItems, useItem } from '../game/items/useItem.ts';
import type { Character } from '../game/party/character.ts';
import { getClass } from '../game/party/rules.ts';
import { CONTENT_TOP, drawFrame, menuItem } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import type { AppContext, GameState } from './stateMachine.ts';

/**
 * The U command outside combat: pick who uses an item (Left/Right) and which
 * item (Up/Down); healing items then ask who to heal. Back returns.
 */
export class UseItemState implements GameState {
  user = 0;
  cursor = 0;
  step: 'item' | 'target' = 'item';
  target = 0;
  message = '';
  private readonly ctx: AppContext;
  private readonly back: () => GameState;
  private readonly view?: FloorView;

  constructor(ctx: AppContext, opts: { back: () => GameState; view?: FloorView }) {
    this.ctx = ctx;
    this.back = opts.back;
    this.view = opts.view;
    const members = ctx.party?.members ?? [];
    const first = members.findIndex((m) => m.hp.current > 0 && usableItems(m).length > 0);
    if (first >= 0) this.user = first;
  }

  enter(): void {
    loadUiTiles(this.ctx.screen);
    this.ctx.screen.hideAllSprites();
    this.ctx.screen.overlay = null;
    this.draw();
  }

  update(): void {}

  onKey(press: KeyPress): void {
    const party = this.ctx.party;
    if (!party) return;
    const members = party.members;
    const items = usableItems(members[this.user]);
    this.message = '';

    if (this.step === 'target') {
      if (press.key === 'up') this.target = (this.target + members.length - 1) % members.length;
      else if (press.key === 'down') this.target = (this.target + 1) % members.length;
      else if (press.key === 'back') this.step = 'item';
      else if (press.key === 'enter') this.apply(members[this.target]);
      return this.draw();
    }

    if (press.key === 'back') {
      this.ctx.machine.change(this.back());
      return;
    }
    if (press.key === 'left' || press.key === 'right') {
      const d = press.key === 'left' ? -1 : 1;
      this.user = (this.user + members.length + d) % members.length;
      this.cursor = 0;
    } else if (items.length && press.key === 'up') this.cursor = (this.cursor + items.length - 1) % items.length;
    else if (items.length && press.key === 'down') this.cursor = (this.cursor + 1) % items.length;
    else if (press.key === 'enter' && items[this.cursor]) {
      const item = getItem(items[this.cursor].itemId);
      const why = cannotUse(members[this.user], item);
      if (why) this.message = why;
      else if (targetFor(item) === 'player') {
        // Start on whoever is most hurt.
        this.target = members.reduce((best, m, i) => (m.hp.current / m.hp.max < members[best].hp.current / members[best].hp.max ? i : best), 0);
        this.step = 'target';
      } else this.apply();
    }
    this.draw();
  }

  private apply(target?: Character): void {
    const party = this.ctx.party!;
    const user = party.members[this.user];
    const inst = usableItems(user)[this.cursor];
    if (!inst) return;
    const r = useItem(user, inst, { target, view: this.view, rng: this.ctx.rng });
    this.message = r.message;
    if (r.used) {
      this.ctx.sound.play(getItem(inst.itemId).effect?.type === 'heal' ? 'fountain' : 'secret_found');
      this.step = 'item';
      this.cursor = Math.min(this.cursor, Math.max(0, usableItems(user).length - 1));
    }
  }

  private draw(): void {
    const s = this.ctx.screen;
    const party = this.ctx.party;
    const targeting = this.step === 'target';
    const multi = (party?.members.length ?? 0) > 1;
    drawFrame(
      s,
      'USE AN ITEM',
      targeting
        ? ['UP/DOWN:WHO   ENTER:HEAL', 'BACK:CANCEL']
        : ['UP/DOWN:ITEM  ENTER:USE', multi ? 'LEFT/RIGHT:WHO  BACK:RETURN' : 'BACK:RETURN'],
      this.message,
    );
    this.ctx.actions.setActions(
      targeting
        ? [
            { label: 'HEAL', key: 'enter' },
            { label: 'CANCEL', key: 'back' },
          ]
        : [
            { label: 'USE', key: 'enter' },
            { label: 'BACK', key: 'back' },
          ],
    );
    if (!party) return;
    const c = party.members[this.user];
    if (multi) {
      printHi(s, 0, 2, '<');
      printHi(s, 31, 2, '>');
    }
    printHi(s, 2, 2, c.name);
    s.print(13, 2, getClass(c.classId).name.toUpperCase());
    s.print(21, 2, c.hp.current <= 0 ? 'DISABLED' : `HP ${c.hp.current}/${c.hp.max}`);

    if (targeting) {
      const item = getItem(usableItems(c)[this.cursor].itemId);
      s.print(2, CONTENT_TOP + 1, `${item.name.toUpperCase()}: HEAL WHO?`);
      party.members.forEach((m, i) => {
        const hp = m.hp.current <= 0 ? 'DISABLED' : `HP ${m.hp.current}/${m.hp.max}`;
        menuItem(s, CONTENT_TOP + 3 + i * 2, `${m.name.padEnd(11)}${hp}`, i === this.target);
      });
      return;
    }

    const items = usableItems(c);
    if (items.length === 0) {
      s.print(2, CONTENT_TOP + 2, 'NOTHING TO USE');
      return;
    }
    items.forEach((inst, i) => {
      const item = getItem(inst.itemId);
      const qty = item.stackable ? ` X${inst.quantity ?? 1}` : '';
      menuItem(s, CONTENT_TOP + 2 + i, `${item.name.toUpperCase()}${qty}`, i === this.cursor);
    });
  }
}
