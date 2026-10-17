import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { RecordingSound } from '../src/engine/audio/audio.ts';
import { RecordingActions } from '../src/engine/input/actionBar.ts';
import { MemorySaveStore } from '../src/engine/storage/saveStore.ts';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { createDungeon } from '../src/game/dungeon/dungeon.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { MAX_LEVEL, applyLevelUps, drainXp, levelUp, xpForLevel, xpToNext } from '../src/game/party/leveling.ts';
import { createParty } from '../src/game/party/party.ts';
import type { ClassId } from '../src/game/party/rules.ts';
import { heal, hurt } from '../src/game/rooms/contents.ts';
import { DungeonState } from '../src/state/dungeonState.ts';
import { LevelUpState } from '../src/state/levelUpState.ts';
import { PartyStatusState } from '../src/state/partyStatusState.ts';
import { StateMachine, type AppContext, type GameState } from '../src/state/stateMachine.ts';

const stats = { strength: 12, dexterity: 12, intelligence: 14, constitution: 14 };
const pc = (classId: ClassId, name = 'A') => createCharacter({ id: name, name, classId, raceId: null, baseStats: stats });
const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });

describe('experience curve', () => {
  it('doubles each level', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 200, 400, 800]);
  });

  it('reports XP to the next level', () => {
    const c = pc('fighter');
    c.xp = 30;
    expect(xpToNext(c)).toBe(70);
    c.level = MAX_LEVEL;
    expect(xpToNext(c)).toBeNull();
  });
});

describe('leveling up', () => {
  it('adds hit points, spell points for casters, and a stat on even levels', () => {
    const w = pc('wizard');
    const hp = w.hp.max;
    const sp = w.spellPoints!.max;
    const int = w.stats.intelligence;
    const g = levelUp(w, createRng(1));
    expect(w.level).toBe(2);
    expect(w.hp.max).toBe(hp + g.hp);
    expect(g.hp).toBeGreaterThan(0);
    expect(w.spellPoints!.max).toBe(sp + g.sp);
    expect(g.sp).toBeGreaterThan(0);
    expect(g.stat).toBe('intelligence');
    expect(w.stats.intelligence).toBe(int + 1);
  });

  it('fighters gain no spell points', () => {
    const f = pc('fighter');
    expect(levelUp(f, createRng(2)).sp).toBe(0);
    expect(f.spellPoints).toBeUndefined();
  });

  it('applies every level earned, skipping the dead', () => {
    const a = pc('fighter', 'A');
    const b = pc('rogue', 'B');
    a.xp = 450; // enough for level 4
    b.xp = 450;
    hurt(b, 999);
    const gains = applyLevelUps([a, b], createRng(3));
    expect(gains.map((g) => [g.name, g.level])).toEqual([
      ['A', 2],
      ['A', 3],
      ['A', 4],
    ]);
    expect(b.level).toBe(1);
  });

  it('XP drain never drops below the current level', () => {
    const c = pc('fighter');
    c.level = 2;
    c.xp = 110;
    expect(drainXp(c, 0.5)).toBe(10);
    expect(c.xp).toBe(100);
    expect(drainXp(c, 0.5)).toBe(0);
  });

  it('healing cures poison', () => {
    const c = pc('fighter');
    c.status.push('poisoned');
    c.hp.current -= 3;
    heal(c, 1);
    expect(c.status).not.toContain('poisoned');
  });
});

describe('screens', () => {
  function app(): AppContext {
    const party = createParty([pc('fighter', 'GROG'), pc('wizard', 'ADA')], { racesEnabled: false });
    return {
      machine: new StateMachine(),
      screen: new TileScreen(),
      rng: createRng(1),
      party,
      dungeon: createDungeon(4),
      actions: new RecordingActions(),
      scenario: null,
      sound: new RecordingSound(),
      saves: new MemorySaveStore(),
    };
  }

  it('the party sheet pages through members and returns', () => {
    const ctx = app();
    let returned = false;
    const st: PartyStatusState = new PartyStatusState(ctx, (): GameState => {
      returned = true;
      return new LevelUpState(ctx, [], (): GameState => st);
    });
    ctx.machine.change(st);
    st.onKey(K('right'));
    expect(st.index).toBe(1);
    st.onKey(K('right'));
    expect(st.index).toBe(0);
    st.onKey(K('back'));
    expect(returned).toBe(true);
  });

  it('P in the dungeon opens the party sheet and Back resumes in place', () => {
    const ctx = app();
    ctx.machine.change(new DungeonState(ctx));
    const pos = { ...ctx.party!.position };
    ctx.machine.onKey(K('char', 'P'));
    expect(ctx.machine.state).toBeInstanceOf(PartyStatusState);
    ctx.machine.onKey(K('back'));
    expect(ctx.machine.state).toBeInstanceOf(DungeonState);
    expect(ctx.party!.position).toEqual(pos);
  });

  it('the level-up screen plays its jingle and continues to the next state', () => {
    const ctx = app();
    const gains = applyLevelUps((ctx.party!.members[0].xp = 100, ctx.party!.members), ctx.rng);
    const next: PartyStatusState = new PartyStatusState(ctx, (): GameState => next);
    ctx.machine.change(new LevelUpState(ctx, gains, () => next));
    expect((ctx.sound as RecordingSound).played).toEqual(['level_up']);
    ctx.machine.onKey(K('enter'));
    expect(ctx.machine.state).toBe(next);
  });
});
