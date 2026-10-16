import type { KeyPress } from '../engine/input/keyboard.ts';
import { COLOR } from '../engine/render/palette.ts';
import { COLS, ROWS } from '../engine/render/tileScreen.ts';
import { bigTextWidth, drawBigText } from '../ui/bigText.ts';
import { CODE, loadUiTiles } from '../ui/tiles.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { PartyCreationState } from './partyCreationState.ts';
import { TestState } from './testState.ts';

export const BLINK_MS = 500;
const PROMPT = 'PRESS ENTER';
const PROMPT_ROW = 16;

export class TitleState implements GameState {
  private blinkTimer = 0;
  private promptVisible = true;

  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    s.backdrop = COLOR.black;
    s.spriteMagnify = false;
    s.limitSpritesPerLine = false;
    s.hideAllSprites();
    s.clear();

    for (let c = 0; c < COLS; c++) {
      s.put(c, 0, CODE.brick);
      s.put(c, ROWS - 1, CODE.brick);
    }
    for (let r = 0; r < ROWS; r++) {
      s.put(0, r, CODE.brick);
      s.put(COLS - 1, r, CODE.brick);
    }

    const title = 'TOD';
    drawBigText(s, Math.floor((COLS - bigTextWidth(title)) / 2), 3, title, CODE.solid);
    s.printCentered(12, 'A DUNGEON ADVENTURE');
    s.printCentered(18, 'T:DISPLAY TEST');
    s.printCentered(20, 'WORKING TITLE  M8 BUILD');

    this.ctx.actions.setActions([{ label: 'DISPLAY TEST', key: 'char:T' }]);
    this.blinkTimer = 0;
    this.promptVisible = true;
    this.drawPrompt();
  }

  onKey(press: KeyPress): void {
    if (press.key === 'enter') this.ctx.machine.change(new PartyCreationState(this.ctx));
    else if (press.key === 'char' && press.char === 'T') this.ctx.machine.change(new TestState(this.ctx));
  }

  update(dtMs: number): void {
    this.blinkTimer += dtMs;
    while (this.blinkTimer >= BLINK_MS) {
      this.blinkTimer -= BLINK_MS;
      this.promptVisible = !this.promptVisible;
      this.drawPrompt();
    }
  }

  private drawPrompt(): void {
    const text = this.promptVisible ? PROMPT : ' '.repeat(PROMPT.length);
    this.ctx.screen.printCentered(PROMPT_ROW, text);
  }
}
