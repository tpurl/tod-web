import { describe, expect, it } from 'vitest';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { PartyCreationState } from '../src/state/partyCreationState.ts';
import { PartyReadyState } from '../src/state/partyReadyState.ts';
import { StateMachine, type AppContext } from '../src/state/stateMachine.ts';
import { TestState } from '../src/state/testState.ts';
import { BLINK_MS, TitleState } from '../src/state/titleState.ts';

function app(): AppContext {
  return { machine: new StateMachine(), screen: new TileScreen(), rng: createRng(7), party: null };
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

  it('party creation runs end to end and hands the party to the ready screen', () => {
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
    expect(ctx.machine.state).toBeInstanceOf(PartyReadyState);
    expect(ctx.party?.members[0].name).toBe('ZED');
    expect(ctx.party?.members[0].classId).toBe('hero');
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
