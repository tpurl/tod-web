import type { Action } from '../engine/input/actionBar.ts';
import type { KeyPress } from '../engine/input/keyboard.ts';
import { SAVE_SLOTS } from '../engine/storage/saveStore.ts';
import {
  SaveError,
  makeSave,
  restoreSave,
  shortDate,
  summarize,
  type SaveData,
  type SavePlace,
  type SaveSummary,
} from '../game/save/saveGame.ts';
import { CONTENT_TOP, drawFrame, menuItem } from '../ui/layout.ts';
import { loadUiTiles } from '../ui/tiles.ts';
import { DungeonState } from './dungeonState.ts';
import { PartyReadyState } from './partyReadyState.ts';
import type { AppContext, GameState } from './stateMachine.ts';

export type SaveMode = 'save' | 'load';

/**
 * The save and load screens: three slots, each showing the adventure,
 * party leader, where they are, and when it was saved. Saving over a slot
 * or deleting one asks first.
 */
export class SaveLoadState implements GameState {
  cursor = 0;
  message = '';
  confirm: 'overwrite' | 'delete' | null = null;
  private readonly ctx: AppContext;
  private readonly mode: SaveMode;
  private readonly place: SavePlace;
  private readonly back: () => GameState;

  constructor(ctx: AppContext, mode: SaveMode, opts: { back: () => GameState; place?: SavePlace }) {
    this.ctx = ctx;
    this.mode = mode;
    this.place = opts.place ?? 'entrance';
    this.back = opts.back;
    if (mode === 'load') {
      const first = this.summaries().findIndex(Boolean);
      if (first >= 0) this.cursor = first;
    }
  }

  enter(): void {
    loadUiTiles(this.ctx.screen);
    this.ctx.screen.hideAllSprites();
    this.ctx.screen.overlay = null;
    this.draw();
  }

  update(): void {}

  /** Slot summaries; null for an empty or unreadable slot. */
  summaries(): (SaveSummary | null)[] {
    return Array.from({ length: SAVE_SLOTS }, (_, i) => {
      const raw = this.ctx.saves.read(i + 1) as SaveData | null;
      try {
        return raw && raw.party ? summarize(i + 1, raw) : null;
      } catch {
        return null;
      }
    });
  }

  onKey(press: KeyPress): void {
    this.message = '';
    const slot = this.cursor + 1;
    const filled = this.summaries()[this.cursor] !== null;

    if (this.confirm) {
      if (press.key === 'enter' || (press.key === 'char' && press.char === 'Y')) {
        if (this.confirm === 'overwrite') this.save(slot);
        else {
          this.ctx.saves.remove(slot);
          this.message = `SLOT ${slot} DELETED`;
        }
        this.confirm = null;
      } else if (press.key === 'back' || (press.key === 'char' && press.char === 'N')) {
        this.confirm = null;
      }
      return this.draw();
    }

    if (press.key === 'up') this.cursor = (this.cursor + SAVE_SLOTS - 1) % SAVE_SLOTS;
    else if (press.key === 'down') this.cursor = (this.cursor + 1) % SAVE_SLOTS;
    else if (press.key === 'back') {
      this.ctx.machine.change(this.back());
      return;
    } else if (press.key === 'enter') {
      if (this.mode === 'save') {
        if (filled) this.confirm = 'overwrite';
        else this.save(slot);
      } else if (!filled) this.message = 'THAT SLOT IS EMPTY';
      else if (this.load(slot)) return;
    } else if (press.key === 'char' && press.char === 'D' && this.mode === 'load' && filled) {
      this.confirm = 'delete';
    }
    this.draw();
  }

  private save(slot: number): void {
    const { party, dungeon, scenario, rng, difficulty } = this.ctx;
    if (!party) return;
    const data = makeSave({ party, dungeon, scenario, rng, difficulty, place: this.place });
    this.message = this.ctx.saves.write(slot, data) ? `SAVED TO SLOT ${slot}` : 'COULD NOT SAVE: STORAGE FULL';
  }

  /** Restores a slot and moves on; returns false (with a message) if it can't. */
  private load(slot: number): boolean {
    try {
      const r = restoreSave(this.ctx.saves.read(slot));
      this.ctx.party = r.party;
      this.ctx.dungeon = r.dungeon;
      this.ctx.scenario = r.scenario;
      this.ctx.difficulty = r.difficulty;
      this.ctx.rng = r.rng;
      this.ctx.machine.change(
        r.place === 'dungeon' && r.dungeon
          ? new DungeonState(this.ctx, { resume: true, message: 'GAME LOADED' })
          : new PartyReadyState(this.ctx),
      );
      return true;
    } catch (e) {
      this.message = e instanceof SaveError ? e.message : 'SAVE COULD NOT BE READ';
      return false;
    }
  }

  private draw(): void {
    const s = this.ctx.screen;
    const verb = this.mode === 'save' ? 'SAVE' : 'LOAD';
    const prompt =
      this.confirm === 'overwrite'
        ? `SAVE OVER SLOT ${this.cursor + 1}?`
        : this.confirm === 'delete'
          ? `DELETE SLOT ${this.cursor + 1}?`
          : this.message;
    const hints = this.confirm
      ? ['ENTER:YES', 'BACK:NO']
      : [`UP/DOWN:SLOT  ENTER:${verb}`, this.mode === 'load' ? 'D:DELETE  BACK:RETURN' : 'BACK:RETURN'];
    drawFrame(s, `${verb} GAME`, hints, prompt);

    this.summaries().forEach((sum, i) => {
      const row = CONTENT_TOP + i * 5;
      menuItem(s, row, `SLOT ${i + 1}`, i === this.cursor);
      if (!sum) {
        s.print(13, row, 'EMPTY');
        return;
      }
      s.print(13, row, sum.title.slice(0, 19));
      const others = sum.members > 1 ? ` +${sum.members - 1}` : '';
      const where = sum.place === 'dungeon' ? `FLOOR ${sum.depth}` : 'ENTRANCE';
      s.print(4, row + 1, `${sum.leader}${others}`);
      s.print(19, row + 1, where);
      s.print(4, row + 2, shortDate(sum.savedAt));
    });

    const actions: Action[] = this.confirm
      ? [
          { label: 'YES', key: 'enter' },
          { label: 'NO', key: 'back' },
        ]
      : [{ label: verb, key: 'enter' }, ...(this.mode === 'load' ? [{ label: 'DELETE', key: 'char:D' }] : []), { label: 'BACK', key: 'back' }];
    this.ctx.actions.setActions(actions);
  }
}
