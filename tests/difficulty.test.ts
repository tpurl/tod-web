import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { RecordingSound } from '../src/engine/audio/audio.ts';
import { RecordingActions } from '../src/engine/input/actionBar.ts';
import { MemorySaveStore } from '../src/engine/storage/saveStore.ts';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { createDungeon, getView } from '../src/game/dungeon/dungeon.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { createParty } from '../src/game/party/party.ts';
import { makeSave, restoreSave } from '../src/game/save/saveGame.ts';
import {
  DIFFICULTIES,
  attackBonusAt,
  getDifficulty,
  hpScaleAt,
  validateDifficulties,
} from '../src/game/scenario/difficulty.ts';
import { getScenario } from '../src/game/scenario/scenarios.ts';
import { simulate } from '../src/game/sim/balance.ts';
import { PartyCreationState } from '../src/state/partyCreationState.ts';
import { ScenarioSelectState } from '../src/state/scenarioSelectState.ts';
import { StateMachine, type AppContext } from '../src/state/stateMachine.ts';

const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });

describe('difficulty levels', () => {
  it('load in order and validate', () => {
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(['easiest', 'medium', 'hardest']);
    expect(getDifficulty(undefined).id).toBe('medium');
    const good = { difficulties: DIFFICULTIES.map((d) => ({ ...d })) };
    expect(() => validateDifficulties({ difficulties: good.difficulties.slice(0, 2) })).toThrow();
    const bad = JSON.parse(JSON.stringify(good));
    bad.difficulties[1].hpScale = 99;
    expect(() => validateDifficulties(bad)).toThrow();
  });

  it('each level is harder than the last, and monsters toughen with depth', () => {
    const [e, m, h] = DIFFICULTIES;
    expect(e.monsterChance <= m.monsterChance && m.monsterChance <= h.monsterChance).toBe(true);
    expect(e.goldScale > m.goldScale && m.goldScale > h.goldScale).toBe(true);
    for (const d of DIFFICULTIES) {
      expect(hpScaleAt(d, 5)).toBeGreaterThan(hpScaleAt(d, 1));
      expect(attackBonusAt(d, 5)).toBeGreaterThan(attackBonusAt(d, 1));
    }
  });

  it('harder dungeons hold more, tougher monsters', () => {
    const totals = DIFFICULTIES.map((d) => {
      let count = 0;
      let hp = 0;
      for (let seed = 0; seed < 30; seed++) {
        for (const c of getView(createDungeon(seed, 5, null, d.id), 3).contents) {
          count += c.monsters.length;
          hp += c.monsters.reduce((s, x) => s + x.maxHp, 0);
        }
      }
      return { count, hp };
    });
    expect(totals[0].count).toBeLessThan(totals[1].count);
    expect(totals[1].count).toBeLessThan(totals[2].count);
    expect(totals[0].hp).toBeLessThan(totals[1].hp);
    expect(totals[1].hp).toBeLessThan(totals[2].hp);
  });

  it('simulated fights stay in each level\'s band', () => {
    // Fresh, store-equipped party of four at the floor's level; see docs/CALIBRATION.md.
    const bands = { easiest: [0.88, 1], medium: [0.75, 0.93], hardest: [0.5, 0.78] } as const;
    for (const d of DIFFICULTIES) {
      const stats = simulate(d.id, 25);
      const win = stats.reduce((s, f) => s + f.winRate, 0) / stats.length;
      expect(win).toBeGreaterThan(bands[d.id][0]);
      expect(win).toBeLessThan(bands[d.id][1] + 0.001);
    }
  }, 60000);
});

describe('choosing a level', () => {
  function app(): AppContext {
    return {
      machine: new StateMachine(),
      screen: new TileScreen(),
      rng: createRng(1),
      party: null,
      dungeon: null,
      actions: new RecordingActions(),
      scenario: null,
      sound: new RecordingSound(),
      saves: new MemorySaveStore(),
    };
  }

  it('comes after the adventure; Back returns to it; the choice sets starting gold', () => {
    const ctx = app();
    const st = new ScenarioSelectState(ctx);
    ctx.machine.change(st);
    ctx.machine.onKey(K('down')); // The Lost King
    ctx.machine.onKey(K('enter'));
    expect(st.phase).toBe('difficulty');
    expect(st.level).toBe(1); // medium by default
    ctx.machine.onKey(K('back'));
    expect(st.phase).toBe('scenario');
    ctx.machine.onKey(K('enter'));
    ctx.machine.onKey(K('down')); // hardest
    ctx.machine.onKey(K('enter'));
    expect(ctx.machine.state).toBeInstanceOf(PartyCreationState);
    expect((ctx as AppContext).difficulty).toBe('hardest');
    const pc = ctx.machine.state as PartyCreationState;
    expect(pc.builder.start.gold).toBe(Math.round(getScenario('lost_king').start.gold * getDifficulty('hardest').goldScale));
  });

  it('is kept in saves; older saves load as medium', () => {
    const party = createParty([createCharacter({ id: 'a', name: 'A', classId: 'hero', raceId: null, baseStats: { strength: 10, dexterity: 10, intelligence: 10, constitution: 10 } })], {
      racesEnabled: false,
    });
    const dungeon = createDungeon(4, 5, null, 'hardest');
    getView(dungeon, 1);
    const save = makeSave({ party, dungeon, scenario: null, rng: createRng(1), place: 'dungeon' });
    const r = restoreSave(JSON.parse(JSON.stringify(save)));
    expect(r.difficulty).toBe('hardest');
    expect(r.dungeon!.difficulty).toBe('hardest');
    const old = JSON.parse(JSON.stringify(save));
    delete old.difficulty;
    expect(restoreSave(old).difficulty).toBe('medium');
    const entrance = makeSave({ party, dungeon: null, scenario: null, rng: createRng(1), place: 'entrance', difficulty: 'easiest' });
    expect(restoreSave(entrance).difficulty).toBe('easiest');
  });
});
