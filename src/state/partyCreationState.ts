import type { KeyPress } from '../engine/input/keyboard.ts';
import type { TileScreen } from '../engine/render/tileScreen.ts';
import { NAME_MAX, statBonus } from '../game/party/character.ts';
import { DEFAULT_START, MAX_PARTY } from '../game/party/party.ts';
import { PartyBuilder } from '../game/party/partyBuilder.ts';
import { STAT_ABBR, STAT_KEYS, getClass, getRace } from '../game/party/rules.ts';
import { CONTENT_TOP, drawFrame, menuItem, rjust, signed } from '../ui/layout.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import { StoreState } from './storeState.ts';
import type { AppContext, GameState } from './stateMachine.ts';
import { TitleState } from './titleState.ts';

export const CURSOR_BLINK_MS = 400;
const OK_HINT = 'UP/DOWN:CHOOSE   ENTER:OK';

/** Draws whatever step the PartyBuilder is on. All rules live in the builder. */
export class PartyCreationState implements GameState {
  readonly builder: PartyBuilder;
  private readonly ctx: AppContext;
  private blinkTimer = 0;
  private cursorOn = true;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.builder = new PartyBuilder(ctx.rng);
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    s.hideAllSprites();
    this.draw();
  }

  onKey(press: KeyPress): void {
    this.builder.onKey(press);
    if (this.builder.step === 'cancelled') {
      this.ctx.machine.change(new TitleState(this.ctx));
      return;
    }
    if (this.builder.step === 'done' && this.builder.party) {
      this.ctx.party = this.builder.party;
      this.ctx.dungeon = null;
      this.ctx.machine.change(new StoreState(this.ctx));
      return;
    }
    this.cursorOn = true;
    this.blinkTimer = 0;
    this.draw();
  }

  update(dtMs: number): void {
    if (this.builder.step !== 'name') return;
    this.blinkTimer += dtMs;
    if (this.blinkTimer >= CURSOR_BLINK_MS) {
      this.blinkTimer %= CURSOR_BLINK_MS;
      this.cursorOn = !this.cursorOn;
      this.drawNameField(this.ctx.screen);
    }
  }

  // ---- drawing -----------------------------------------------------------

  private draw(): void {
    const step = this.builder.step;
    this.ctx.actions.setActions(
      step === 'roll'
        ? [{ label: 'REROLL', key: 'char:R' }]
        : step === 'size'
          ? [{ label: 'RACES ON/OFF', key: 'char:R' }]
          : [],
    );
    switch (this.builder.step) {
      case 'size':
        return this.drawSize();
      case 'name':
        return this.drawName();
      case 'class':
        return this.drawClass();
      case 'race':
        return this.drawRace();
      case 'roll':
        return this.drawRoll();
      case 'review':
        return this.drawReview();
      default:
        return;
    }
  }

  private heading(): string {
    return `CHARACTER ${this.builder.memberNumber} OF ${this.builder.size}`;
  }

  private drawSize(): void {
    const b = this.builder;
    const s = this.ctx.screen;
    drawFrame(s, 'CREATE YOUR PARTY', [OK_HINT, 'R:RACES ON/OFF   BACK:TITLE'], b.message);
    s.print(2, CONTENT_TOP, 'HOW MANY ADVENTURERS?');
    for (let n = 1; n <= MAX_PARTY; n++) {
      menuItem(s, CONTENT_TOP + 1 + n, n === 1 ? '1  A LONE HERO' : `${n}  ADVENTURERS`, n === b.size);
    }
    const row = CONTENT_TOP + 8;
    s.print(2, row, 'RACES:');
    printHi(s, 9, row, b.racesEnabled ? 'ON' : 'OFF');
    s.print(2, row + 2, b.racesEnabled ? 'HUMAN, DWARF, ELF, HALFLING' : 'EVERYONE IS HUMAN, AS IN');
    s.print(2, row + 3, b.racesEnabled ? 'EACH WITH STAT BONUSES' : 'THE ORIGINAL 1982 GAME');
  }

  private drawName(): void {
    const b = this.builder;
    const s = this.ctx.screen;
    drawFrame(s, this.heading(), ['TYPE A NAME      ENTER:OK', 'BACK:DELETE  PHONE:ABC KEY'], b.message);
    s.print(2, CONTENT_TOP, b.size === 1 ? 'WHAT IS YOUR NAME, HERO?' : 'NAME THIS ADVENTURER:');
    this.drawNameField(s);
    s.print(2, CONTENT_TOP + 6, `UP TO ${NAME_MAX} LETTERS`);
    if (b.members.length > 0) {
      s.print(2, CONTENT_TOP + 9, 'PARTY SO FAR:');
      b.members.forEach((m, i) => {
        s.print(4, CONTENT_TOP + 10 + i, `${m.name.padEnd(NAME_MAX + 1)}${getClass(m.classId).name.toUpperCase()}`);
      });
    }
  }

  private drawNameField(s: TileScreen): void {
    const row = CONTENT_TOP + 3;
    const name = this.builder.draft.name;
    s.print(4, row, ' '.repeat(NAME_MAX + 1));
    const end = printHi(s, 4, row, name);
    if (name.length < NAME_MAX && this.cursorOn) s.print(end, row, '_');
  }

  private drawClass(): void {
    const b = this.builder;
    const s = this.ctx.screen;
    drawFrame(s, this.heading(), [OK_HINT, 'BACK:CHANGE NAME'], b.message);
    printHi(s, 2, CONTENT_TOP, b.draft.name);
    s.print(3 + b.draft.name.length, CONTENT_TOP, 'CHOOSE A CLASS');
    b.classChoices.forEach((c, i) => {
      const row = CONTENT_TOP + 2 + i * 3;
      menuItem(s, row, `${c.name.toUpperCase().padEnd(9)}HP ${c.hpDie.replace(/^1/, '')}`, i === b.cursor);
      s.print(4, row + 1, c.blurb);
    });
  }

  private drawRace(): void {
    const b = this.builder;
    const s = this.ctx.screen;
    const back = b.size === 1 ? 'BACK:CHANGE NAME' : 'BACK:CHANGE CLASS';
    drawFrame(s, this.heading(), [OK_HINT, back], b.message);
    printHi(s, 2, CONTENT_TOP, b.draft.name);
    s.print(3 + b.draft.name.length, CONTENT_TOP, 'CHOOSE A RACE');
    b.raceChoices.forEach((r, i) => {
      const row = CONTENT_TOP + 2 + i * 3;
      const mods = STAT_KEYS.filter((k) => r.mods[k])
        .map((k) => `${STAT_ABBR[k]}${signed(r.mods[k] ?? 0)}`)
        .join(' ');
      menuItem(s, row, `${r.name.toUpperCase().padEnd(9)}${mods}`, i === b.cursor);
      s.print(4, row + 1, r.blurb);
    });
  }

  private drawRoll(): void {
    const b = this.builder;
    const s = this.ctx.screen;
    const c = b.preview;
    if (!c) return;
    const races = b.racesEnabled && c.raceId !== null;
    const back = b.racesEnabled ? 'BACK:CHANGE RACE' : b.size === 1 ? 'BACK:CHANGE NAME' : 'BACK:CHANGE CLASS';
    drawFrame(s, this.heading(), ['R:REROLL      ENTER:KEEP', back], b.message);

    printHi(s, 2, CONTENT_TOP, c.name);
    const race = races ? `${getRace(c.raceId as string).name.toUpperCase()} ` : '';
    s.print(2, CONTENT_TOP + 1, `${race}${getClass(c.classId).name.toUpperCase()}`);

    const top = CONTENT_TOP + 3;
    s.print(9, top, 'ROLL');
    if (races) {
      s.print(15, top, 'RACE');
      s.print(21, top, 'TOTAL');
    }
    STAT_KEYS.forEach((k, i) => {
      const row = top + 1 + i;
      s.print(2, row, STAT_ABBR[k]);
      s.print(10, row, rjust(c.baseStats[k], 2));
      if (races) {
        const mod = c.stats[k] - c.baseStats[k];
        s.print(16, row, rjust(signed(mod), 2));
        s.print(22, row, rjust(c.stats[k], 2));
      }
      const bonus = signed(statBonus(c.stats[k]));
      if (bonus) s.print(races ? 26 : 14, row, `(${bonus})`);
    });

    s.print(2, top + 6, 'HIT POINTS');
    s.print(16, top + 6, rjust(c.hp.max, 3));
    s.print(2, top + 7, 'SPELL POINTS');
    s.print(16, top + 7, c.spellPoints ? rjust(c.spellPoints.max, 3) : '  -');
    s.print(2, top + 9, `REROLLS: ${b.draft.rerolls}`);
  }

  private drawReview(): void {
    const b = this.builder;
    const s = this.ctx.screen;
    drawFrame(s, 'YOUR PARTY', ['ENTER:BEGIN ADVENTURE', 'BACK:REDO LAST CHARACTER'], b.message);
    printHi(s, 0, CONTENT_TOP, 'NAME');
    printHi(s, 11, CONTENT_TOP, 'CLASS');
    if (b.racesEnabled) printHi(s, 19, CONTENT_TOP, 'RACE');
    printHi(s, 29, CONTENT_TOP, 'HP');
    b.members.forEach((m, i) => {
      const row = CONTENT_TOP + 2 + i * 3;
      s.print(0, row, m.name);
      s.print(11, row, getClass(m.classId).name.toUpperCase());
      if (m.raceId) s.print(19, row, getRace(m.raceId).name.toUpperCase());
      s.print(29, row, rjust(m.hp.max, 3));
      s.print(2, row + 1, STAT_KEYS.map((k) => `${STAT_ABBR[k]} ${m.stats[k]}`).join('  '));
    });
    const row = CONTENT_TOP + 2 + MAX_PARTY * 3;
    s.print(0, row, `GOLD ${DEFAULT_START.gold}    FOOD ${DEFAULT_START.food}`);
  }
}
