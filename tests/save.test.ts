import { describe, expect, it } from 'vitest';
import { RecordingSound } from '../src/engine/audio/audio.ts';
import { RecordingActions } from '../src/engine/input/actionBar.ts';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { MemorySaveStore } from '../src/engine/storage/saveStore.ts';
import { createDungeon, getView } from '../src/game/dungeon/dungeon.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { createParty } from '../src/game/party/party.ts';
import { SAVE_VERSION, SaveError, layoutHash, makeSave, restoreSave, shortDate, type SaveData } from '../src/game/save/saveGame.ts';
import { getScenario, questSpec } from '../src/game/scenario/scenarios.ts';
import { DungeonState } from '../src/state/dungeonState.ts';
import { PartyReadyState } from '../src/state/partyReadyState.ts';
import { SaveLoadState } from '../src/state/saveLoadState.ts';
import { StateMachine, type AppContext } from '../src/state/stateMachine.ts';
import { TitleState } from '../src/state/titleState.ts';

const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });
const stats = { strength: 12, dexterity: 12, intelligence: 12, constitution: 12 };

/** A game in progress: two floors visited, a fight won, treasure taken, a secret door found. */
function game() {
  const party = createParty(
    [createCharacter({ id: 'a', name: 'GROG', classId: 'fighter', raceId: 'dwarf', baseStats: stats }),
     createCharacter({ id: 'b', name: 'ADA', classId: 'wizard', raceId: null, baseStats: stats })],
    { racesEnabled: true, gold: 123, food: 17 },
  );
  const scenario = getScenario('lost_king');
  const dungeon = createDungeon(42, scenario.floors, questSpec(scenario));
  const v1 = getView(dungeon, 1);
  const v2 = getView(dungeon, 2);
  v1.explored.fill(1, 0, 50);
  const secret = v1.floor.doors.findIndex((d) => d.kind === 'secret');
  if (secret >= 0) v1.found.add(secret);
  const fought = v2.contents.find((c) => c.monsters.length)!;
  fought.monsters.forEach((m) => (m.hp = 0));
  const chest = v1.contents.find((c) => c.treasure);
  if (chest?.treasure) chest.treasure.taken = true;
  dungeon.view3d = false;
  party.depth = 2;
  party.position = { ...v2.floor.stairsUp };
  party.members[0].xp = 77;
  party.questFlags.captiveFreed = true;
  const rng = createRng(999);
  rng.next();
  return { party, dungeon, scenario, rng, secret, fought };
}

describe('save format', () => {
  it('round-trips the whole game through JSON', () => {
    const g = game();
    const data = JSON.parse(JSON.stringify(makeSave({ ...g, place: 'dungeon' })));
    const r = restoreSave(data);
    expect(r.party).toEqual(g.party);
    expect(r.scenario?.id).toBe('lost_king');
    expect(r.place).toBe('dungeon');
    expect(r.dungeon!.view3d).toBe(false);
    expect(r.dungeon!.quest).toEqual(g.dungeon.quest);
    for (const depth of [1, 2]) {
      const a = getView(g.dungeon, depth);
      const b = getView(r.dungeon!, depth);
      expect([...b.explored]).toEqual([...a.explored]);
      expect([...b.found]).toEqual([...a.found]);
      expect(JSON.stringify(b.contents)).toEqual(JSON.stringify(a.contents));
    }
    // The random sequence carries on where it left off.
    expect(r.rng.next()).toBe(g.rng.next());
  });

  it('floors not visited are not stored, and regenerate fresh', () => {
    const g = game();
    const data = makeSave({ ...g, place: 'dungeon' });
    expect(data.dungeon!.floors.map((f) => f.depth)).toEqual([1, 2]);
    const r = restoreSave(data);
    expect(layoutHash(getView(r.dungeon!, 4).floor)).toBe(layoutHash(getView(createDungeon(42, 5), 4).floor));
  });

  it('a save made at the entrance before entering has no dungeon', () => {
    const g = game();
    const r = restoreSave(makeSave({ ...g, dungeon: null, place: 'entrance' }));
    expect(r.dungeon).toBeNull();
    expect(r.place).toBe('entrance');
  });

  it('refuses other versions, changed floor layouts, and damaged saves', () => {
    const g = game();
    const good = () => JSON.parse(JSON.stringify(makeSave({ ...g, place: 'dungeon' }))) as SaveData;
    const old = good();
    old.version = SAVE_VERSION + 1;
    expect(() => restoreSave(old)).toThrow(SaveError);
    const moved = good();
    moved.dungeon!.floors[0].layout ^= 1;
    expect(() => restoreSave(moved)).toThrow('ANOTHER VERSION');
    const empty = good();
    empty.party.members = [];
    expect(() => restoreSave(empty)).toThrow('DAMAGED');
    expect(() => restoreSave(null)).toThrow(SaveError);
    expect(() => restoreSave('junk')).toThrow(SaveError);
  });

  it('formats save dates', () => {
    expect(shortDate(new Date(2026, 9, 17, 9, 3).toISOString())).toBe('10/17 09:03');
    expect(shortDate('nope')).toBe('');
  });
});

describe('save and load screens', () => {
  function app(): AppContext {
    const g = game();
    return {
      machine: new StateMachine(),
      screen: new TileScreen(),
      rng: g.rng,
      party: g.party,
      dungeon: g.dungeon,
      actions: new RecordingActions(),
      scenario: g.scenario,
      sound: new RecordingSound(),
      saves: new MemorySaveStore(),
    };
  }

  it('saving to an empty slot writes it; saving over one asks first', () => {
    const ctx = app();
    const st = new SaveLoadState(ctx, 'save', { back: () => new PartyReadyState(ctx), place: 'dungeon' });
    ctx.machine.change(st);
    st.onKey(K('enter'));
    expect(st.message).toBe('SAVED TO SLOT 1');
    expect(ctx.saves.read(1)).not.toBeNull();
    ctx.party!.gold = 5;
    st.onKey(K('enter'));
    expect(st.confirm).toBe('overwrite');
    st.onKey(K('back'));
    expect((ctx.saves.read(1) as SaveData).party.gold).toBe(123);
    st.onKey(K('enter'));
    st.onKey(K('enter'));
    expect((ctx.saves.read(1) as SaveData).party.gold).toBe(5);
  });

  it('says so when storage refuses', () => {
    const ctx = app();
    (ctx.saves as MemorySaveStore).failWrites = true;
    const st = new SaveLoadState(ctx, 'save', { back: () => new PartyReadyState(ctx) });
    ctx.machine.change(st);
    st.onKey(K('enter'));
    expect(st.message).toBe('COULD NOT SAVE: STORAGE FULL');
  });

  it('loading puts the party back in the dungeon where it was saved', () => {
    const ctx = app();
    const pos = { ...ctx.party!.position };
    ctx.saves.write(2, makeSave({ party: ctx.party!, dungeon: ctx.dungeon, scenario: ctx.scenario, rng: ctx.rng, place: 'dungeon' }));
    ctx.party = null;
    ctx.dungeon = null;
    ctx.scenario = null;
    ctx.machine.change(new TitleState(ctx));
    ctx.machine.onKey(K('char', 'L'));
    const st = ctx.machine.state as SaveLoadState;
    expect(st).toBeInstanceOf(SaveLoadState);
    expect(st.cursor).toBe(1); // jumps to the first filled slot
    ctx.machine.onKey(K('enter'));
    expect(ctx.machine.state).toBeInstanceOf(DungeonState);
    expect(ctx.party!.position).toEqual(pos);
    expect(ctx.party!.depth).toBe(2);
    expect((ctx as AppContext).scenario?.id).toBe('lost_king');
    expect((ctx.machine.state as DungeonState).model.message).toBe('GAME LOADED');
  });

  it('loading an empty slot or a broken save explains why', () => {
    const ctx = app();
    const st = new SaveLoadState(ctx, 'load', { back: () => new TitleState(ctx) });
    ctx.machine.change(st);
    st.onKey(K('enter'));
    expect(st.message).toBe('THAT SLOT IS EMPTY');
    const bad = makeSave({ party: ctx.party!, dungeon: ctx.dungeon, scenario: ctx.scenario, rng: ctx.rng, place: 'dungeon' });
    bad.version = 99;
    ctx.saves.write(1, bad);
    st.onKey(K('enter'));
    expect(st.message).toBe('SAVE IS FROM ANOTHER VERSION');
  });

  it('deleting a save asks first', () => {
    const ctx = app();
    ctx.saves.write(1, makeSave({ party: ctx.party!, dungeon: null, scenario: ctx.scenario, rng: ctx.rng, place: 'entrance' }));
    const st = new SaveLoadState(ctx, 'load', { back: () => new TitleState(ctx) });
    ctx.machine.change(st);
    st.onKey(K('char', 'D'));
    expect(st.confirm).toBe('delete');
    st.onKey(K('enter'));
    expect(ctx.saves.read(1)).toBeNull();
    expect(st.message).toBe('SLOT 1 DELETED');
  });

  it('K in the dungeon opens the save screen and Back resumes in place', () => {
    const ctx = app();
    ctx.dungeon = null;
    ctx.machine.change(new DungeonState(ctx));
    const pos = { ...ctx.party!.position };
    ctx.machine.onKey(K('char', 'K'));
    expect(ctx.machine.state).toBeInstanceOf(SaveLoadState);
    ctx.machine.onKey(K('enter'));
    expect((ctx.saves.read(1) as SaveData).place).toBe('dungeon');
    ctx.machine.onKey(K('back'));
    expect(ctx.machine.state).toBeInstanceOf(DungeonState);
    expect(ctx.party!.position).toEqual(pos);
  });

  it('a save from the entrance loads back to the entrance', () => {
    const ctx = app();
    ctx.machine.change(new PartyReadyState(ctx));
    ctx.machine.onKey(K('char', 'K'));
    ctx.machine.onKey(K('enter'));
    ctx.machine.onKey(K('back'));
    expect(ctx.machine.state).toBeInstanceOf(PartyReadyState);
    ctx.party = null;
    ctx.machine.change(new SaveLoadState(ctx, 'load', { back: () => new TitleState(ctx) }));
    ctx.machine.onKey(K('enter'));
    expect(ctx.machine.state).toBeInstanceOf(PartyReadyState);
    expect(ctx.party!.members[0].name).toBe('GROG');
  });
});
