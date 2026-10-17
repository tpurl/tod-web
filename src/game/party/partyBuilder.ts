import type { KeyPress } from '../../engine/input/keyboard.ts';
import type { Rng } from '../../engine/rng.ts';
import {
  NAME_MAX,
  checkName,
  createCharacter,
  normalizeName,
  rollStats,
  type Character,
  type NameProblem,
} from './character.ts';
import { DEFAULT_START, MAX_PARTY, MIN_PARTY, createParty, type Party } from './party.ts';
import { classesForPartySize, racesForClass, type CharacterClass, type ClassId, type Race, type Stats } from './rules.ts';

/**
 * Party creation as a pure state machine: key presses in, state out.
 * PartyCreationState only draws what this model holds, so the whole flow
 * is unit-testable without a screen.
 *
 *   size -> (per member) name -> class -> race -> roll -> ... -> review -> done
 *
 * Solo parties skip the class step (always Hero); classic rules skip race.
 * Back always steps to the previous screen, all the way out to the title.
 */
export type Step = 'size' | 'name' | 'class' | 'race' | 'roll' | 'review' | 'done' | 'cancelled';

interface Draft {
  name: string;
  classId: ClassId | null;
  raceId: string | null;
  baseStats: Stats | null;
  rerolls: number;
}

const emptyDraft = (): Draft => ({ name: '', classId: null, raceId: null, baseStats: null, rerolls: 0 });

export const NAME_MESSAGES: Readonly<Record<Exclude<NameProblem, null>, string>> = {
  empty: 'TYPE A NAME FIRST',
  too_long: `NAMES ARE ${NAME_MAX} LETTERS MAX`,
  bad_chars: 'LETTERS AND NUMBERS ONLY',
  taken: 'THAT NAME IS TAKEN',
};

export class PartyBuilder {
  step: Step = 'size';
  size = MIN_PARTY;
  racesEnabled: boolean;
  /** Highlighted row in the current list (size, class, or race). */
  cursor = 0;
  members: Character[] = [];
  draft: Draft = emptyDraft();
  /** One-line feedback for the player, cleared on the next key. */
  message = '';
  party: Party | null = null;

  /** Starting purse and rations for the new party. */
  readonly start: { gold: number; food: number };
  private readonly rng: Rng;

  constructor(rng: Rng, opts: { racesEnabled?: boolean; start?: { gold: number; food: number } } = {}) {
    this.rng = rng;
    this.racesEnabled = opts.racesEnabled ?? true;
    this.start = opts.start ?? { ...DEFAULT_START };
  }

  /** 1-based number of the character being made. */
  get memberNumber(): number {
    return this.members.length + 1;
  }

  get classChoices(): CharacterClass[] {
    return classesForPartySize(this.size);
  }

  get raceChoices(): Race[] {
    return this.draft.classId ? racesForClass(this.draft.classId) : [];
  }

  /** The draft as a finished character, for the roll screen. */
  get preview(): Character | null {
    const d = this.draft;
    if (!d.classId || !d.baseStats) return null;
    return createCharacter({
      id: `pc${this.memberNumber}`,
      name: d.name,
      classId: d.classId,
      raceId: this.racesEnabled ? d.raceId : null,
      baseStats: d.baseStats,
    });
  }

  onKey(p: KeyPress): void {
    this.message = '';
    switch (this.step) {
      case 'size':
        return this.onSize(p);
      case 'name':
        return this.onName(p);
      case 'class':
        return this.onList(p, this.classChoices.length, () => this.chooseClass());
      case 'race':
        return this.onList(p, this.raceChoices.length, () => this.chooseRace());
      case 'roll':
        return this.onRoll(p);
      case 'review':
        return this.onReview(p);
      default:
        return;
    }
  }

  // ---- steps -------------------------------------------------------------

  private onSize(p: KeyPress): void {
    if (p.key === 'up' || p.key === 'left') this.size = Math.max(MIN_PARTY, this.size - 1);
    else if (p.key === 'down' || p.key === 'right') this.size = Math.min(MAX_PARTY, this.size + 1);
    else if (p.key === 'char' && p.char && p.char >= '1' && p.char <= String(MAX_PARTY)) this.size = Number(p.char);
    else if (p.key === 'char' && p.char === 'R') this.racesEnabled = !this.racesEnabled;
    else if (p.key === 'enter') this.startMember();
    else if (p.key === 'back') this.step = 'cancelled';
  }

  private onName(p: KeyPress): void {
    const d = this.draft;
    if (p.key === 'char' && p.char) {
      if (d.name.length >= NAME_MAX) {
        this.message = NAME_MESSAGES.too_long;
        return;
      }
      if (d.name.length === 0 && p.char === ' ') return;
      d.name += p.char;
    } else if (p.key === 'back') {
      if (d.name.length > 0) d.name = d.name.slice(0, -1);
      else this.previousMember();
    } else if (p.key === 'enter') {
      const problem = checkName(d.name, this.members.map((m) => m.name));
      if (problem) {
        this.message = NAME_MESSAGES[problem];
        return;
      }
      d.name = normalizeName(d.name);
      if (this.size === 1) {
        d.classId = this.classChoices[0].id;
        this.afterClass();
      } else {
        this.cursor = Math.max(0, this.classChoices.findIndex((c) => c.id === d.classId));
        this.step = 'class';
      }
    }
  }

  private onList(p: KeyPress, count: number, choose: () => void): void {
    if (p.key === 'up') this.cursor = (this.cursor + count - 1) % count;
    else if (p.key === 'down') this.cursor = (this.cursor + 1) % count;
    else if (p.key === 'enter') choose();
    else if (p.key === 'back') this.stepBackFrom(this.step);
  }

  private chooseClass(): void {
    const chosen = this.classChoices[this.cursor].id;
    if (chosen !== this.draft.classId) this.draft.raceId = null;
    this.draft.classId = chosen;
    this.afterClass();
  }

  private afterClass(): void {
    if (this.racesEnabled) {
      const races = this.raceChoices;
      this.cursor = Math.max(0, races.findIndex((r) => r.id === this.draft.raceId));
      this.step = 'race';
    } else {
      this.draft.raceId = null;
      this.enterRoll();
    }
  }

  private chooseRace(): void {
    this.draft.raceId = this.raceChoices[this.cursor].id;
    this.enterRoll();
  }

  private enterRoll(): void {
    if (!this.draft.baseStats) this.draft.baseStats = rollStats(this.rng);
    this.step = 'roll';
  }

  private onRoll(p: KeyPress): void {
    if (p.key === 'char' && p.char === 'R') {
      this.draft.baseStats = rollStats(this.rng);
      this.draft.rerolls++;
    } else if (p.key === 'enter') {
      const c = this.preview;
      if (!c) return;
      this.members.push(c);
      if (this.members.length < this.size) this.startMember();
      else this.step = 'review';
    } else if (p.key === 'back') {
      this.stepBackFrom('roll');
    }
  }

  private onReview(p: KeyPress): void {
    if (p.key === 'enter') {
      this.party = createParty(this.members, { racesEnabled: this.racesEnabled, ...this.start });
      this.step = 'done';
    } else if (p.key === 'back') {
      this.previousMember();
    }
  }

  // ---- navigation helpers ------------------------------------------------

  private startMember(): void {
    this.draft = emptyDraft();
    this.cursor = 0;
    this.step = 'name';
  }

  /** Reopens the last finished character at its roll screen, or returns to party size. */
  private previousMember(): void {
    const last = this.members.pop();
    if (!last) {
      this.step = 'size';
      return;
    }
    this.draft = {
      name: last.name,
      classId: last.classId,
      raceId: last.raceId,
      baseStats: { ...last.baseStats },
      rerolls: 0,
    };
    this.step = 'roll';
  }

  private stepBackFrom(step: Step): void {
    const solo = this.size === 1;
    if (step === 'roll') {
      if (this.racesEnabled) this.goTo('race');
      else if (!solo) this.goTo('class');
      else this.step = 'name';
    } else if (step === 'race') {
      if (!solo) this.goTo('class');
      else this.step = 'name';
    } else if (step === 'class') {
      this.step = 'name';
    }
  }

  private goTo(step: 'class' | 'race'): void {
    this.step = step;
    this.cursor =
      step === 'class'
        ? Math.max(0, this.classChoices.findIndex((c) => c.id === this.draft.classId))
        : Math.max(0, this.raceChoices.findIndex((r) => r.id === this.draft.raceId));
  }
}
