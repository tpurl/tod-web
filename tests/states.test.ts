import { describe, expect, it } from 'vitest';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { DungeonState } from '../src/state/dungeonState.ts';
import { PartyCreationState } from '../src/state/partyCreationState.ts';
import { PartyReadyState } from '../src/state/partyReadyState.ts';
import { StateMachine, type AppContext } from '../src/state/stateMachine.ts';
import { StoreState, windowStart } from '../src/state/storeState.ts';
import { TestState } from '../src/state/testState.ts';
import { BLINK_MS, TitleState } from '../src/state/titleState.ts';

function app(): AppContext {
  return { machine: new StateMachine(), screen: new TileScreen(), rng: createRng(7), party: null, dungeon: null };
}

function rowText(s: TileScreen, row: number): string {
  let t = '';
  for (let c = 0; c < 32; c++) t += String.fromCharCode(s.get(c, row));
  return t;
}

describe('states', () => {
  it('title blinks its prompt; Enter starts party creation, T opens the test screen', () => {
    const ctx = app();
    ctx.machine.change(new TitleState(ctx));
    expect(rowText(ctx.screen, 16)).toContain('PRESS ENTER');
    ctx.machine.update(BLINK_MS);
    expect(rowText(ctx.screen, 16)).not.toContain('PRESS ENTER');
    ctx.machine.onKey({ key: 'enter', repeat: false });
    expect(ctx.machine.state).toBeInstanceOf(PartyCreationState);
    ctx.machine.change(new TitleState(ctx));
    ctx.machine.onKey({ key: 'char', char: 'T', repeat: false });
    expect(ctx.machine.state).toBeInstanceOf(TestState);
  });

  it('party creation runs through the store and into the dungeon', () => {
    const ctx = app();
    ctx.machine.change(new PartyCreationState(ctx));
    const k = (key: 'enter' | 'back' | 'up' | 'down') => ctx.machine.onKey({ key, repeat: false });
    const type = (t: string) => [...t].forEach((c) => ctx.machine.onKey({ key: 'char', char: c, repeat: false }));
    k('enter'); // party of 1
    type('ZED');
    k('enter'); // name
    k('enter'); // race
    k('enter'); // keep roll
    k('enter'); // review -> done
    expect(ctx.machine.state).toBeInstanceOf(StoreState);
    expect(ctx.party?.members[0].name).toBe('ZED');
    expect(ctx.party?.members[0].classId).toBe('hero');
    k('enter'); // buy the first stock item
    expect(ctx.party?.members[0].inventory.length).toBe(1);
    k('back');
    k('enter'); // leave the store
    expect(ctx.machine.state).toBeInstanceOf(PartyReadyState);
    k('back'); // back into the store
    expect(ctx.machine.state).toBeInstanceOf(StoreState);
    k('back');
    k('enter'); // leave again
    k('enter'); // go down
    expect(ctx.machine.state).toBeInstanceOf(DungeonState);
    expect(ctx.party?.depth).toBe(1);
    k('enter'); // standing on the up stairs: asks to leave
    k('enter');
    expect(ctx.machine.state).toBeInstanceOf(PartyReadyState);
    expect(ctx.screen.sprites.every((sp) => !sp.visible)).toBe(true);
  });

  it('store list scrolling keeps the cursor visible', () => {
    expect(windowStart(0, 5, 13)).toBe(0);
    expect(windowStart(0, 20, 13)).toBe(0);
    expect(windowStart(10, 20, 13)).toBe(4);
    expect(windowStart(19, 20, 13)).toBe(7);
  });

  it('Back from party size returns to the title', () => {
    const ctx = app();
    ctx.machine.change(new PartyCreationState(ctx));
    ctx.machine.onKey({ key: 'back', repeat: false });
    expect(ctx.machine.state).toBeInstanceOf(TitleState);
  });

  it('test screen moves the hero, toggles options, and returns on Esc', () => {
    const ctx = app();
    ctx.machine.change(new TestState(ctx));
    const hero = ctx.screen.sprites[0];
    const x0 = hero.x;
    ctx.machine.onKey({ key: 'right', repeat: false });
    expect(hero.x).toBe(x0 + 2);
    ctx.machine.onKey({ key: 'char', char: 'M', repeat: false });
    expect(ctx.screen.spriteMagnify).toBe(true);
    ctx.machine.onKey({ key: 'char', char: 'L', repeat: false });
    expect(ctx.screen.limitSpritesPerLine).toBe(true);
    ctx.machine.onKey({ key: 'char', char: 'B', repeat: false });
    expect(ctx.screen.backdrop).toBe(2);
    ctx.machine.onKey({ key: 'back', repeat: false });
    expect(ctx.machine.state).toBeInstanceOf(TitleState);
    expect(ctx.screen.sprites.every((s) => !s.visible)).toBe(true);
    expect(ctx.screen.spriteMagnify).toBe(false);
  });
});
