import type { KeyPress } from '../engine/input/keyboard.ts';
import { sprite16 } from '../engine/render/bitmap.ts';
import { COLOR } from '../engine/render/palette.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/render/tileScreen.ts';
import { loadUiTiles } from '../ui/tiles.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { TitleState } from './titleState.ts';

/**
 * Display test screen for milestone 1 acceptance: full font, all 16 palette
 * entries, a movable sprite, magnification, and the 4-per-line sprite limit.
 */
const SWATCH_BASE = 128;
export const HERO_PATTERN = 0;
export const BLOB_PATTERN = 4;
export const STEP = 2;

// prettier-ignore
const HERO = sprite16([
  '......####......',
  '.....######.....',
  '.....#.##.#.....',
  '.....######.....',
  '......####......',
  '.......##.......',
  '...##########...',
  '..#..######..#..',
  '..#..######..#..',
  '..#..######..#..',
  '.....######.....',
  '.....##..##.....',
  '.....##..##.....',
  '.....##..##.....',
  '....###..###....',
  '................',
]);

// prettier-ignore
const BLOB = sprite16([
  '................',
  '.....######.....',
  '...##########...',
  '..############..',
  '..##..####..##..',
  '..##..####..##..',
  '..############..',
  '..############..',
  '..##.##..##.##..',
  '..############..',
  '..############..',
  '..#.##.##.##.#..',
  '..#..#..#..#..#.',
  '................',
  '................',
  '................',
]);

const BLOB_COLORS = [COLOR.lightGreen, COLOR.lightBlue, COLOR.magenta, COLOR.cyan, COLOR.lightRed];

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export class TestState implements GameState {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    s.clear();
    s.hideAllSprites();

    s.print(0, 0, 'DISPLAY TEST');
    s.print(22, 0, 'ESC:TITLE');

    for (let i = 0; i < 64; i++) s.put(i % 32, 2 + Math.floor(i / 32), 32 + i);

    s.print(0, 5, 'PALETTE  0 SHOWS BACKDROP');
    for (let k = 0; k < 16; k++) {
      const code = SWATCH_BASE + k * 8;
      s.definePattern(code, [0, 0, 0, 0, 0, 0, 0, 0]);
      s.setGroupColor(16 + k, COLOR.white, k);
      for (const r of [6, 7]) {
        s.put(k * 2, r, code);
        s.put(k * 2 + 1, r, code);
      }
      s.print(k * 2, 8, k.toString(16).toUpperCase());
    }

    s.print(0, 10, 'SPRITES  ARROWS MOVE');
    s.print(0, 19, 'M:MAGNIFY   L:LINE LIMIT');
    s.print(0, 20, 'B:BACKDROP COLOR');

    s.defineSprite16(HERO_PATTERN, HERO);
    s.defineSprite16(BLOB_PATTERN, BLOB);
    s.spriteSize = 16;

    const hero = s.sprites[0];
    Object.assign(hero, { x: 120, y: 96, pattern: HERO_PATTERN, color: COLOR.lightYellow, visible: true });
    BLOB_COLORS.forEach((color, i) => {
      Object.assign(s.sprites[i + 1], { x: 40 + i * 40, y: 128, pattern: BLOB_PATTERN, color, visible: true });
    });

    this.ctx.actions.setActions([
      { label: 'MAGNIFY', key: 'char:M' },
      { label: 'LINE LIMIT', key: 'char:L' },
      { label: 'BACKDROP', key: 'char:B' },
    ]);
    this.drawStatus();
  }

  exit(): void {
    this.ctx.screen.hideAllSprites();
  }

  onKey(press: KeyPress): void {
    const s = this.ctx.screen;
    const hero = s.sprites[0];
    switch (press.key) {
      case 'back':
        this.ctx.machine.change(new TitleState(this.ctx));
        return;
      case 'up':
        hero.y = Math.max(-15, hero.y - STEP);
        break;
      case 'down':
        hero.y = Math.min(SCREEN_HEIGHT - 1, hero.y + STEP);
        break;
      case 'left':
        hero.x = Math.max(-15, hero.x - STEP);
        break;
      case 'right':
        hero.x = Math.min(SCREEN_WIDTH - 1, hero.x + STEP);
        break;
      case 'char':
        if (press.char === 'M') s.spriteMagnify = !s.spriteMagnify;
        else if (press.char === 'L') s.limitSpritesPerLine = !s.limitSpritesPerLine;
        else if (press.char === 'B') s.backdrop = (s.backdrop % 15) + 1;
        else return;
        break;
      default:
        return;
    }
    this.drawStatus();
  }

  update(): void {}

  private drawStatus(): void {
    const s = this.ctx.screen;
    const hero = s.sprites[0];
    const line =
      `X${pad(Math.max(0, hero.x), 3)} Y${pad(Math.max(0, hero.y), 3)}` +
      ` MAG:${s.spriteMagnify ? 'ON ' : 'OFF'}` +
      ` LIM:${s.limitSpritesPerLine ? 'ON ' : 'OFF'}` +
      ` B:${s.backdrop.toString(16).toUpperCase()}`;
    s.print(0, 22, line.padEnd(32));
  }
}
