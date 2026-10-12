import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng.ts';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import {
  NAME_MAX,
  applyMods,
  checkName,
  createCharacter,
  normalizeName,
  rollStats,
  startingHp,
  startingSpellPoints,
  statBonus,
} from '../src/game/party/character.ts';
import { createParty } from '../src/game/party/party.ts';
import { PartyBuilder } from '../src/game/party/partyBuilder.ts';
import {
  BLURB_MAX,
  CLASSES,
  RACES,
  classesForPartySize,
  racesForClass,
  validateClasses,
  validateRaces,
} from '../src/game/party/rules.ts';

const base = { strength: 10, dexterity: 10, intelligence: 10, constitution: 10 };

describe('rules data', () => {
  it('loads all four classes and races with short blurbs', () => {
    expect(CLASSES.map((c) => c.id)).toEqual(['fighter', 'wizard', 'rogue', 'hero']);
    expect(RACES.map((r) => r.id)).toEqual(['human', 'dwarf', 'elf', 'halfling']);
    for (const x of [...CLASSES, ...RACES]) expect(x.blurb.length <= BLURB_MAX).toBe(true);
  });

  it('solo parties get the Hero only; groups never do', () => {
    expect(classesForPartySize(1).map((c) => c.id)).toEqual(['hero']);
    expect(classesForPartySize(3).map((c) => c.id)).toEqual(['fighter', 'wizard', 'rogue']);
  });

  it('race lists respect class limits', () => {
    expect(racesForClass('wizard').map((r) => r.id)).toEqual(['human', 'elf']);
    expect(racesForClass('rogue').some((r) => r.id === 'halfling')).toBe(true);
  });

  it('rejects malformed data', () => {
    expect(() => validateClasses({ classes: [{ id: 'bard', hpDie: '1d6' }] })).toThrow();
    expect(() => validateClasses({ classes: [{ id: 'fighter', hpDie: 'd6' }] })).toThrow();
    expect(() => validateRaces({ races: [{ id: 'orc', mods: { luck: 1 }, allowedClasses: [] }] })).toThrow();
    expect(() => validateRaces({ races: [{ id: 'orc', mods: {}, allowedClasses: ['bard'] }] })).toThrow();
  });
});

describe('character rules', () => {
  it('rolls four stats in 3..18', () => {
    const r = createRng(3);
    for (let i = 0; i < 200; i++) {
      for (const v of Object.values(rollStats(r))) expect(v >= 3 && v <= 18).toBe(true);
    }
  });

  it('applies race mods with a floor of 1', () => {
    expect(applyMods({ ...base, strength: 2 }, { strength: -2, constitution: 2 })).toEqual({
      ...base,
      strength: 1,
      constitution: 12,
    });
  });

  it('stat bonus curve', () => {
    expect([3, 8, 9, 10, 11, 12, 18].map(statBonus)).toEqual([-4, -1, -1, 0, 0, 1, 4]);
  });

  it('hit points use the max die plus CON bonus, at least 1', () => {
    expect(startingHp('fighter', base)).toBe(10);
    expect(startingHp('fighter', { ...base, constitution: 16 })).toBe(13);
    expect(startingHp('wizard', { ...base, constitution: 3 })).toBe(1);
  });

  it('only casters get spell points', () => {
    expect(startingSpellPoints('fighter', base)).toBeUndefined();
    expect(startingSpellPoints('wizard', { ...base, intelligence: 15 })).toBe(5);
  });

  it('validates names', () => {
    expect(normalizeName('  grog   the  ')).toBe('GROG THE');
    expect(checkName('', [])).toBe('empty');
    expect(checkName('   ', [])).toBe('empty');
    expect(checkName('A'.repeat(NAME_MAX + 1), [])).toBe('too_long');
    expect(checkName('GR@G', [])).toBe('bad_chars');
    expect(checkName('grog', ['GROG'])).toBe('taken');
    expect(checkName("O'MALLEY", [])).toBeNull();
  });

  it('builds a schema-shaped character', () => {
    const c = createCharacter({ id: 'pc1', name: 'ada', classId: 'wizard', raceId: 'elf', baseStats: base });
    expect(c.name).toBe('ADA');
    expect(c.stats).toEqual({ strength: 10, dexterity: 12, intelligence: 11, constitution: 9 });
    expect(c.hp).toEqual({ current: 3, max: 3 });
    expect(c.spellPoints).toEqual({ current: 3, max: 3 });
    expect(c.level).toBe(1);
    expect(c.equipped).toEqual({ weapon: null, armor: null, shield: null, ring: null });
  });

  it('party size is enforced', () => {
    expect(() => createParty([], { racesEnabled: false })).toThrow();
  });
});

const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });

function drive(b: PartyBuilder, ...presses: (KeyPress | string)[]): void {
  for (const p of presses) {
    if (typeof p === 'string') for (const ch of p) b.onKey(K('char', ch));
    else b.onKey(p);
  }
}

describe('PartyBuilder', () => {
  it('makes a party of three with classes and races', () => {
    const b = new PartyBuilder(createRng(5));
    drive(b, K('char', '3'), K('enter'));
    expect(b.step).toBe('name');
    drive(b, 'GROG', K('enter'));
    expect(b.step).toBe('class');
    drive(b, K('enter')); // fighter
    expect(b.step).toBe('race');
    drive(b, K('down'), K('enter')); // dwarf
    expect(b.step).toBe('roll');
    drive(b, K('enter'));
    drive(b, 'ADA', K('enter'), K('down'), K('enter'), K('down'), K('enter'), K('enter')); // wizard elf
    drive(b, 'PIP', K('enter'), K('down'), K('down'), K('enter'));
    expect(b.raceChoices.map((r) => r.id)).toEqual(['human', 'dwarf', 'elf', 'halfling']);
    drive(b, K('up'), K('enter'), K('enter')); // wraps to halfling
    expect(b.step).toBe('review');
    drive(b, K('enter'));
    expect(b.step).toBe('done');
    const m = b.party!.members;
    expect(m.map((x) => [x.name, x.classId, x.raceId])).toEqual([
      ['GROG', 'fighter', 'dwarf'],
      ['ADA', 'wizard', 'elf'],
      ['PIP', 'rogue', 'halfling'],
    ]);
    expect(m.map((x) => x.id)).toEqual(['pc1', 'pc2', 'pc3']);
  });

  it('solo play skips class and becomes Hero', () => {
    const b = new PartyBuilder(createRng(1));
    drive(b, K('enter'), 'ZED', K('enter'));
    expect(b.step).toBe('race');
    expect(b.draft.classId).toBe('hero');
  });

  it('classic rules skip race and store no race', () => {
    const b = new PartyBuilder(createRng(1));
    drive(b, K('char', 'R'), K('char', '2'), K('enter'), 'A', K('enter'), K('enter'));
    expect(b.step).toBe('roll');
    drive(b, K('enter'), 'B', K('enter'), K('enter'), K('enter'), K('enter'));
    expect(b.party!.racesEnabled).toBe(false);
    expect(b.party!.members.every((x) => x.raceId === null)).toBe(true);
  });

  it('reroll changes stats and counts', () => {
    const b = new PartyBuilder(createRng(11));
    drive(b, K('enter'), 'Q', K('enter'), K('enter'));
    const first = { ...b.draft.baseStats! };
    let changed = false;
    for (let i = 0; i < 5; i++) {
      drive(b, K('char', 'R'));
      if (JSON.stringify(b.draft.baseStats) !== JSON.stringify(first)) changed = true;
    }
    expect(changed).toBe(true);
    expect(b.draft.rerolls).toBe(5);
  });

  it('rejects bad names with a message and keeps the step', () => {
    const b = new PartyBuilder(createRng(1));
    drive(b, K('char', '2'), K('enter'), K('enter'));
    expect(b.step).toBe('name');
    expect(b.message).toBe('TYPE A NAME FIRST');
    drive(b, 'SAM', K('enter'), K('enter'), K('enter'), K('enter'), 'sam', K('enter'));
    expect(b.message).toBe('THAT NAME IS TAKEN');
    drive(b, 'ABCDEFGHIJK');
    expect(b.draft.name.length).toBe(NAME_MAX);
  });

  it('Back walks all the way out, reopening finished characters', () => {
    const b = new PartyBuilder(createRng(1));
    drive(b, K('char', '2'), K('enter'), 'AL', K('enter'), K('enter'), K('enter'), K('enter'));
    expect(b.members.length).toBe(1);
    drive(b, K('back')); // empty name -> reopen AL at roll
    expect(b.step).toBe('roll');
    expect(b.members.length).toBe(0);
    expect(b.draft.name).toBe('AL');
    drive(b, K('back'));
    expect(b.step).toBe('race');
    drive(b, K('back'));
    expect(b.step).toBe('class');
    drive(b, K('back'));
    expect(b.step).toBe('name');
    drive(b, K('back'), K('back')); // delete "AL"
    expect(b.draft.name).toBe('');
    drive(b, K('back'));
    expect(b.step).toBe('size');
    drive(b, K('back'));
    expect(b.step).toBe('cancelled');
  });

  it('keeps the rolled stats when changing race', () => {
    const b = new PartyBuilder(createRng(2));
    drive(b, K('enter'), 'X', K('enter'), K('enter'));
    const rolled = { ...b.draft.baseStats! };
    drive(b, K('back'), K('down'), K('enter'));
    expect(b.draft.raceId).toBe('dwarf');
    expect(b.draft.baseStats).toEqual(rolled);
  });
});
