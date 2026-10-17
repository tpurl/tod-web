import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { RecordingSound } from '../src/engine/audio/audio.ts';
import { RecordingActions } from '../src/engine/input/actionBar.ts';
import { MemorySaveStore } from '../src/engine/storage/saveStore.ts';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { createDungeon, getView } from '../src/game/dungeon/dungeon.ts';
import { DungeonModel } from '../src/game/dungeon/dungeonModel.ts';
import { STEP, reachable, roomAt, samePoint, type Dir } from '../src/game/dungeon/floor.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { HEAL_PER_MEAL, LOW_FOOD, STEPS_PER_FOOD, eatIfDue, stepsPerFood } from '../src/game/party/food.ts';
import { createParty, type Party } from '../src/game/party/party.ts';
import { aliveMonsters } from '../src/game/rooms/contents.ts';
import {
  FLAG_CAPTIVE,
  FLAG_ITEM,
  SCENARIOS,
  getScenario,
  goalMet,
  goalProgress,
  questSpec,
  validateScenarios,
} from '../src/game/scenario/scenarios.ts';
import { DungeonState } from '../src/state/dungeonState.ts';
import { StateMachine, type AppContext } from '../src/state/stateMachine.ts';
import { VictoryState } from '../src/state/victoryState.ts';

const stats = { strength: 12, dexterity: 12, intelligence: 12, constitution: 12 };
const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });
function party(raceIds: (string | null)[] = [null]): Party {
  return createParty(
    raceIds.map((r, i) => createCharacter({ id: `p${i}`, name: `P${i}`, classId: r === 'halfling' ? 'rogue' : 'fighter', raceId: r, baseStats: stats })),
    { racesEnabled: raceIds.some((r) => r !== null), gold: 0, food: 10 },
  );
}

describe('scenarios', () => {
  it('loads both adventures', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['gold_hunt', 'lost_king']);
    expect(getScenario('lost_king').floors).toBe(5);
    expect(questSpec(getScenario('gold_hunt'))).toBeNull();
    expect(questSpec(getScenario('lost_king'))).toEqual({ floor: 5, captiveName: 'KING ALDRIC', itemId: 'orb', guardian: 'wraith' });
  });

  it('rejects broken scenarios', () => {
    const base = { id: 'x', title: 'X', floors: { count: 2 }, start: { gold: 1, food: 1 } };
    expect(() => validateScenarios({ scenarios: [{ ...base, goal: { type: 'collect_gold' } }] })).toThrow();
    expect(() =>
      validateScenarios({ scenarios: [{ ...base, goal: { type: 'retrieve_and_rescue', captiveName: 'K', itemId: 'orb', targetFloor: 3 } }] }),
    ).toThrow();
  });

  it('gold goal counts gold carried; the quest needs both flags', () => {
    const p = party();
    const gold = getScenario('gold_hunt');
    expect(goalMet(gold, p)).toBe(false);
    p.gold = 500;
    expect(goalMet(gold, p)).toBe(true);
    const king = getScenario('lost_king');
    p.questFlags[FLAG_CAPTIVE] = true;
    expect(goalMet(king, p)).toBe(false);
    p.questFlags[FLAG_ITEM] = true;
    expect(goalMet(king, p)).toBe(true);
    expect(goalProgress(king, p)).toEqual(['KING ALDRIC: FREED', 'DAYLIGHT ORB: FOUND']);
  });
});

describe('quest placement', () => {
  it('puts the captive and orb, guarded, in one room on the target floor only', () => {
    let openRooms = 0;
    for (let seed = 0; seed < 40; seed++) {
      const d = createDungeon(seed, 5, questSpec(getScenario('lost_king')));
      for (let depth = 1; depth <= 5; depth++) {
        const quests = getView(d, depth).contents.filter((c) => c.quest);
        expect(quests.length).toBe(depth === 5 ? 1 : 0);
      }
      const v = getView(d, 5);
      const c = v.contents.find((x) => x.quest)!;
      expect(aliveMonsters(c).every((m) => m.monsterId === 'wraith')).toBe(true);
      expect(aliveMonsters(c).length).toBeGreaterThan(0);
      expect(roomAt(v.floor, c.quest!.captive.x, c.quest!.captive.y)?.id).toBe(c.roomId);
      expect(samePoint(c.quest!.captive, c.quest!.item)).toBe(false);
      expect(roomAt(v.floor, v.floor.stairsUp.x, v.floor.stairsUp.y)?.id).not.toBe(c.roomId);
      // Usually reachable without hunting for secret doors.
      if (reachable(v.floor, v.floor.stairsUp)[c.quest!.captive.y * v.floor.width + c.quest!.captive.x]) openRooms++;
    }
    expect(openRooms).toBeGreaterThan(35);
  });
});

describe('food', () => {
  it('eats one ration every few steps and warns when low', () => {
    const p = party();
    p.food = LOW_FOOD + 1;
    p.stepsTaken = STEPS_PER_FOOD;
    expect(eatIfDue(p)).toBe(`FOOD IS RUNNING LOW (${LOW_FOOD})`);
    p.stepsTaken++;
    expect(eatIfDue(p)).toBe('');
    expect(p.food).toBe(LOW_FOOD);
  });

  it('halflings stretch rations', () => {
    expect(stepsPerFood(party())).toBe(STEPS_PER_FOOD);
    expect(stepsPerFood(party(['halfling']))).toBeGreaterThan(STEPS_PER_FOOD);
    expect(stepsPerFood(party(['halfling', 'halfling', 'halfling', 'halfling']))).toBe(Math.round(STEPS_PER_FOOD / 0.75));
  });

  it('meals heal wounded and disabled players while rations last (manual p.19)', () => {
    const p = party([null, null]);
    p.food = 3;
    p.members[0].hp.current -= 2;
    p.members[1].hp.current = 0;
    p.members[1].status.push('disabled');
    p.stepsTaken = STEPS_PER_FOOD;
    eatIfDue(p);
    expect(p.food).toBe(2);
    expect(p.members[0].hp.current).toBe(p.members[0].hp.max - 2 + HEAL_PER_MEAL);
    expect(p.members[1].hp.current).toBe(HEAL_PER_MEAL);
    expect(p.members[1].status).not.toContain('disabled');
  });

  it('without rations, wounds do not heal', () => {
    const p = party();
    p.food = 0;
    p.members[0].hp.current -= 2;
    p.stepsTaken = STEPS_PER_FOOD;
    const hp = p.members[0].hp.current;
    expect(eatIfDue(p)).toBe('NO RATIONS: WOUNDS WILL NOT HEAL');
    expect(p.members[0].hp.current).toBe(hp);
  });
});

describe('winning', () => {
  function app(): AppContext {
    return {
      machine: new StateMachine(),
      screen: new TileScreen(),
      rng: createRng(1),
      party: party(),
      dungeon: null,
      actions: new RecordingActions(),
      scenario: getScenario('gold_hunt'),
      sound: new RecordingSound(),
      saves: new MemorySaveStore(),
    };
  }

  it('leaving with the goal met wins; without it just leaves', () => {
    const p = party();
    const m = new DungeonModel(createDungeon(2, 3), p, createRng(1), { scenario: getScenario('gold_hunt') });
    m.onKey(K('enter'));
    expect(m.exitPrompt).toBe('LEAVE? THE QUEST IS NOT DONE');
    m.onKey(K('enter'));
    expect(m.mode).toBe('exited');

    const p2 = party();
    p2.gold = 600;
    const m2 = new DungeonModel(createDungeon(2, 3), p2, createRng(1), { scenario: getScenario('gold_hunt') });
    m2.onKey(K('enter'));
    expect(m2.exitPrompt).toBe('RETURN IN TRIUMPH?');
    m2.onKey(K('enter'));
    expect(m2.mode).toBe('won');
  });

  it('the dungeon screen uses the scenario depth and hands a win to the victory screen', () => {
    const ctx = app();
    ctx.party!.gold = 999;
    ctx.machine.change(new DungeonState(ctx));
    expect(ctx.dungeon?.floorCount).toBe(3);
    ctx.machine.onKey(K('enter'));
    ctx.machine.onKey(K('enter'));
    expect(ctx.machine.state).toBeInstanceOf(VictoryState);
    expect(ctx.party).toBeNull();
    expect((ctx.sound as RecordingSound).playing).toBe('music_victory');
  });

  it('freeing the captive and taking the orb set the quest flags', () => {
    const d = createDungeon(9, 5, questSpec(getScenario('lost_king')));
    const p = party();
    const m = new DungeonModel(d, p, createRng(1), { scenario: getScenario('lost_king') });
    p.depth = 5;
    const c = getView(d, 5).contents.find((x) => x.quest)!;
    c.monsters.forEach((x) => (x.hp = 0));
    m.view3d = false;
    for (const target of [c.quest!.captive, c.quest!.item]) {
      const dir = (['n', 'e', 's', 'w'] as Dir[]).find((dd) => {
        const from = { x: target.x - STEP[dd].dx, y: target.y - STEP[dd].dy };
        return roomAt(m.view.floor, from.x, from.y)?.id === c.roomId;
      })!;
      p.position = { x: target.x - STEP[dir].dx, y: target.y - STEP[dir].dy };
      m.onKey(K(({ n: 'up', e: 'right', s: 'down', w: 'left' } as const)[dir]));
    }
    expect(p.questFlags[FLAG_CAPTIVE]).toBe(true);
    expect(p.questFlags[FLAG_ITEM]).toBe(true);
    expect(p.members[0].inventory.some((i) => i.itemId === 'orb')).toBe(true);
  });
});
