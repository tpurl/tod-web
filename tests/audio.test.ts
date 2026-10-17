import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { RecordingSound } from '../src/engine/audio/audio.ts';
import { CHIP_CLOCK, LOWEST_FREQ, SILENT, Sn76489, attToAmp, dividerFor, freqForDivider } from '../src/engine/audio/sn76489.ts';
import { SOUNDS, SOUND_IDS, TICK_HZ, duration, noteFreq, parseNotes, renderSound, tune } from '../src/engine/audio/sounds.ts';
import { RecordingActions } from '../src/engine/input/actionBar.ts';
import { MemorySaveStore } from '../src/engine/storage/saveStore.ts';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { createDungeon, getView } from '../src/game/dungeon/dungeon.ts';
import { DungeonModel } from '../src/game/dungeon/dungeonModel.ts';
import { CELL, STEP, cellAt, isPassable } from '../src/game/dungeon/floor.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { createParty } from '../src/game/party/party.ts';
import { StateMachine, type AppContext } from '../src/state/stateMachine.ts';
import { TitleState } from '../src/state/titleState.ts';

const SR = 44100;
const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });

function crossings(s: Float32Array): number {
  let n = 0;
  for (let i = 1; i < s.length; i++) if (s[i - 1] <= 0 && s[i] > 0) n++;
  return n;
}

describe('sound chip', () => {
  it('attenuates in 2 dB steps, 15 is silent', () => {
    expect(attToAmp(0)).toBe(1);
    expect(attToAmp(SILENT)).toBe(0);
    expect(attToAmp(3)).toBeCloseTo(10 ** (-6 / 20), 6);
  });

  it('maps frequencies to 10-bit dividers like the chip', () => {
    expect(dividerFor(440)).toBe(Math.round(CHIP_CLOCK / 440));
    expect(dividerFor(1)).toBe(1023);
    expect(dividerFor(1e9)).toBe(1);
    expect(freqForDivider(1023)).toBe(LOWEST_FREQ);
  });

  it('plays a square wave at the requested pitch', () => {
    const chip = new Sn76489();
    chip.setTone(0, dividerFor(440));
    chip.setAtt(0, 0);
    const out = new Float32Array(SR);
    chip.render(out, 0, SR, SR);
    expect(Math.abs(crossings(out) - freqForDivider(dividerFor(440)))).toBeLessThan(3);
  });

  it('is silent with every voice off', () => {
    const out = new Float32Array(1000);
    new Sn76489().render(out, 0, 1000, SR);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('periodic noise repeats every 15 shifts; white noise does not', () => {
    const run = (white: boolean) => {
      const chip = new Sn76489();
      chip.setNoise(white, 0);
      chip.setAtt(3, 0);
      const out = new Float32Array(4000);
      chip.render(out, 0, 4000, SR);
      return out;
    };
    const periodic = run(false);
    const white = run(true);
    expect(crossings(periodic)).toBeLessThan(crossings(white));
  });
});

describe('sound library', () => {
  it('parses notes', () => {
    expect(noteFreq('A4')).toBeCloseTo(440, 6);
    expect(noteFreq('A5')).toBeCloseTo(880, 6);
    expect(noteFreq('C#5')).toBeCloseTo(noteFreq('Db5'), 6);
    expect(parseNotes('C5:8 R:4 E5:2').map((n) => [n.start, n.ticks])).toEqual([
      [0, 8],
      [8, 4],
      [12, 2],
    ]);
    expect(() => parseNotes('H5:3')).toThrow();
  });

  it('tunes leave a gap at the end of each note', () => {
    const s = tune(['C5:4 C5:4']);
    expect(duration(s) * TICK_HZ).toBe(9);
    const atts = s.map((f) => f.tone?.[0]?.att);
    expect(atts).toContain(SILENT);
  });

  it('every sound renders to audible samples of the right length', () => {
    for (const id of SOUND_IDS) {
      const samples = renderSound(SOUNDS[id], SR);
      expect(Math.abs(samples.length - duration(SOUNDS[id]) * SR)).toBeLessThan(2);
      expect(samples.some((v) => v !== 0)).toBe(true);
      expect(samples.every((v) => v >= -1 && v <= 1)).toBe(true);
    }
  });

  it('nothing asks a tone voice for a pitch the chip cannot play', () => {
    for (const id of SOUND_IDS) {
      for (const f of SOUNDS[id]) {
        for (const v of f.tone ?? []) if (v?.freq !== undefined) expect(v.freq).toBeGreaterThan(LOWEST_FREQ);
      }
    }
  });

  it('effects are short; tunes are longer', () => {
    expect(duration(SOUNDS.step)).toBeLessThan(0.2);
    expect(duration(SOUNDS.music_title)).toBeGreaterThan(5);
  });
});

describe('game sound events', () => {
  const stats = { strength: 12, dexterity: 12, intelligence: 12, constitution: 12 };
  const party = () =>
    createParty([createCharacter({ id: 'a', name: 'A', classId: 'fighter', raceId: null, baseStats: stats })], { racesEnabled: false });

  it('walking steps, walls bump, stairs sound', () => {
    const d = createDungeon(5);
    const p = party();
    const m = new DungeonModel(d, p, createRng(1));
    m.view3d = false;
    const v = getView(d, 1);
    const dirs = ['up', 'right', 'down', 'left'] as const;
    const steps = { up: STEP.n, right: STEP.e, down: STEP.s, left: STEP.w };
    const open = dirs.find((k) => isPassable(v.floor, p.position.x + steps[k].dx, p.position.y + steps[k].dy));
    const wall = dirs.find((k) => cellAt(v.floor, p.position.x + steps[k].dx, p.position.y + steps[k].dy) === CELL.wall);
    if (wall) {
      m.onKey(K(wall));
      expect(m.sounds).toEqual(['bump']);
      m.sounds = [];
    }
    m.onKey(K(open!));
    expect(['step', 'door_open']).toContain(m.sounds[0]);
    m.sounds = [];
    p.position = { ...v.floor.stairsDown! };
    m.onKey(K('enter'));
    expect(m.sounds).toEqual(['stairs']);
  });

  it('the title plays its tune and S toggles sound', () => {
    const sound = new RecordingSound();
    const ctx: AppContext = {
      machine: new StateMachine(),
      screen: new TileScreen(),
      rng: createRng(1),
      party: null,
      dungeon: null,
      actions: new RecordingActions(),
      scenario: null,
      sound,
      saves: new MemorySaveStore(),
    };
    ctx.machine.change(new TitleState(ctx));
    expect(sound.playing).toBe('music_title');
    ctx.machine.onKey(K('char', 'S'));
    expect(sound.muted).toBe(true);
    expect((ctx.actions as RecordingActions).current.map((a) => a.label)).toContain('SOUND: OFF');
  });
});
