import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { RecordingSound } from '../src/engine/audio/audio.ts';
import { SOUNDS } from '../src/engine/audio/sounds.ts';
import { RecordingActions } from '../src/engine/input/actionBar.ts';
import { MemorySaveStore } from '../src/engine/storage/saveStore.ts';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { createDungeon, getView } from '../src/game/dungeon/dungeon.ts';
import { addItem } from '../src/game/items/inventory.ts';
import { cannotUse, partyHasUsable, usableItems, useItem } from '../src/game/items/useItem.ts';
import { getItem } from '../src/game/items/items.ts';
import { createCharacter } from '../src/game/party/character.ts';
import { createParty, type Party } from '../src/game/party/party.ts';
import type { ClassId } from '../src/game/party/rules.ts';
import { hurt } from '../src/game/rooms/contents.ts';
import { DungeonState } from '../src/state/dungeonState.ts';
import { PartyReadyState } from '../src/state/partyReadyState.ts';
import { StateMachine, type AppContext } from '../src/state/stateMachine.ts';
import { StoreState } from '../src/state/storeState.ts';
import { UseItemState } from '../src/state/useItemState.ts';

const stats = { strength: 12, dexterity: 12, intelligence: 12, constitution: 12 };
const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });
function party(...classes: ClassId[]): Party {
  return createParty(
    classes.map((c, i) => createCharacter({ id: `p${i}`, name: `P${i}`, classId: c, raceId: null, baseStats: stats })),
    { racesEnabled: false },
  );
}
function app(p: Party): AppContext {
  return {
    machine: new StateMachine(),
    screen: new TileScreen(),
    rng: createRng(1),
    party: p,
    dungeon: null,
    actions: new RecordingActions(),
    scenario: null,
    sound: new RecordingSound(),
    saves: new MemorySaveStore(),
  };
}

describe('using items', () => {
  it('a potion heals the chosen player, even a disabled one, and is used up', () => {
    const p = party('fighter', 'wizard');
    const [f, w] = p.members;
    addItem(p, f, 'healing_potion', 2);
    hurt(w, 999);
    const inst = usableItems(f)[0];
    const r = useItem(f, inst, { target: w, rng: createRng(1) });
    expect(r.used).toBe(true);
    expect(w.hp.current).toBeGreaterThan(0);
    expect(w.status).not.toContain('disabled');
    expect(inst.quantity).toBe(1);
  });

  it("won't waste a potion on someone unhurt", () => {
    const p = party('fighter');
    addItem(p, p.members[0], 'healing_potion');
    const r = useItem(p.members[0], usableItems(p.members[0])[0], { target: p.members[0], rng: createRng(1) });
    expect(r).toEqual({ used: false, message: 'P0 IS NOT HURT' });
    expect(usableItems(p.members[0])).toHaveLength(1);
  });

  it('disabled players cannot use items; only wizards and heroes read scrolls (manual p.20, p.29)', () => {
    const p = party('fighter', 'wizard');
    const [f, w] = p.members;
    expect(cannotUse(f, getItem('map_scroll'))).toBe('SCROLLS: WIZARDS AND HEROES ONLY');
    expect(cannotUse(w, getItem('map_scroll'))).toBe('');
    hurt(w, 999);
    expect(cannotUse(w, getItem('healing_potion'))).toBe('P1 IS DISABLED');
  });

  it('a map scroll reveals the whole floor', () => {
    const p = party('wizard');
    addItem(p, p.members[0], 'map_scroll');
    const v = getView(createDungeon(3), 1);
    const r = useItem(p.members[0], usableItems(p.members[0])[0], { view: v, rng: createRng(1) });
    expect(r.used).toBe(true);
    expect(v.explored.every((b) => b === 1)).toBe(true);
    expect(usableItems(p.members[0])).toHaveLength(0);
  });

  it('only consumables count as usable', () => {
    const p = party('fighter');
    addItem(p, p.members[0], 'sword');
    expect(partyHasUsable(p)).toBe(false);
    addItem(p, p.members[0], 'healing_potion');
    expect(partyHasUsable(p)).toBe(true);
  });
});

describe('the USE screen', () => {
  it('U in the dungeon picks a potion and a target, then returns in place', () => {
    const p = party('fighter', 'wizard');
    addItem(p, p.members[0], 'healing_potion');
    p.members[1].hp.current = 1;
    const ctx = app(p);
    ctx.machine.change(new DungeonState(ctx));
    expect((ctx.actions as RecordingActions).current.map((a) => a.label)).toContain('USE');
    const pos = { ...p.position };
    ctx.machine.onKey(K('char', 'U'));
    const st = ctx.machine.state as UseItemState;
    expect(st).toBeInstanceOf(UseItemState);
    ctx.machine.onKey(K('enter')); // the potion
    expect(st.step).toBe('target');
    expect(st.target).toBe(1); // starts on the most hurt
    ctx.machine.onKey(K('enter'));
    expect(p.members[1].hp.current).toBeGreaterThan(1);
    expect(st.message.startsWith('P1 IS HEALED')).toBe(true);
    expect((ctx.sound as RecordingSound).played).toContain('fountain');
    ctx.machine.onKey(K('back'));
    expect(ctx.machine.state).toBeInstanceOf(DungeonState);
    expect(p.position).toEqual(pos);
  });

  it('U at the entrance works too', () => {
    const p = party('fighter');
    addItem(p, p.members[0], 'healing_potion');
    const ctx = app(p);
    ctx.machine.change(new PartyReadyState(ctx));
    expect((ctx.actions as RecordingActions).current.map((a) => a.label)).toContain('USE');
    ctx.machine.onKey(K('char', 'U'));
    expect(ctx.machine.state).toBeInstanceOf(UseItemState);
    ctx.machine.onKey(K('back'));
    expect(ctx.machine.state).toBeInstanceOf(PartyReadyState);
  });
});

describe('arrival sounds', () => {
  it('the store plays its jingle; going down and coming back up play the stairs', () => {
    const p = party('fighter');
    const ctx = app(p);
    const sound = ctx.sound as RecordingSound;
    ctx.machine.change(new StoreState(ctx));
    expect(sound.played).toEqual(['store_enter']);
    expect(SOUNDS.store_enter.length).toBeGreaterThan(1);
    ctx.machine.change(new DungeonState(ctx));
    expect(sound.played.at(-1)).toBe('stairs');
    sound.played = [];
    ctx.machine.onKey(K('char', 'P'));
    ctx.machine.onKey(K('back')); // resuming after a menu is silent
    expect(sound.played).toEqual([]);
    ctx.machine.onKey(K('enter')); // on the up stairs: asks
    ctx.machine.onKey(K('enter')); // leave
    expect(sound.played).toEqual(['stairs']);
    expect(ctx.machine.state).toBeInstanceOf(PartyReadyState);
  });
});
