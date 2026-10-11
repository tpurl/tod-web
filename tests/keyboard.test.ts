import { describe, expect, it } from 'vitest';
import { Keyboard, MAX_QUEUE, translateKey } from '../src/engine/input/keyboard.ts';

describe('translateKey', () => {
  it('maps arrows, enter, and escape', () => {
    expect(translateKey('ArrowUp', 'ArrowUp', false)).toEqual({ key: 'up', repeat: false });
    expect(translateKey('Enter', 'Enter', false)).toEqual({ key: 'enter', repeat: false });
    expect(translateKey('Escape', 'Escape', false)).toEqual({ key: 'back', repeat: false });
  });

  it('uppercases printable characters', () => {
    expect(translateKey('KeyM', 'm', false)).toEqual({ key: 'char', char: 'M', repeat: false });
    expect(translateKey('Space', ' ', false)).toEqual({ key: 'char', char: ' ', repeat: false });
  });

  it('allows repeat for movement only', () => {
    expect(translateKey('ArrowLeft', 'ArrowLeft', true)).toEqual({ key: 'left', repeat: true });
    expect(translateKey('Enter', 'Enter', true)).toBeNull();
    expect(translateKey('KeyM', 'm', true)).toBeNull();
  });

  it('ignores keys the game does not use', () => {
    expect(translateKey('F5', 'F5', false)).toBeNull();
    expect(translateKey('Tab', 'Tab', false)).toBeNull();
  });
});

type Listener = (e: unknown) => void;

function fakeTarget() {
  let listener: Listener = () => {};
  return {
    addEventListener: (_: string, l: Listener) => {
      listener = l;
    },
    fire: (code: string, key: string, extra: Record<string, unknown> = {}) => {
      let prevented = false;
      listener({ code, key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => (prevented = true), ...extra });
      return prevented;
    },
  };
}

describe('Keyboard', () => {
  it('queues presses in order and drains', () => {
    const t = fakeTarget();
    const kb = new Keyboard(t as never);
    t.fire('ArrowUp', 'ArrowUp');
    t.fire('KeyA', 'a');
    expect(kb.drain().map((p) => p.key)).toEqual(['up', 'char']);
    expect(kb.drain()).toEqual([]);
  });

  it('caps the queue', () => {
    const t = fakeTarget();
    const kb = new Keyboard(t as never);
    for (let i = 0; i < MAX_QUEUE + 5; i++) t.fire('ArrowUp', 'ArrowUp');
    expect(kb.drain()).toHaveLength(MAX_QUEUE);
  });

  it('fires first-input callbacks once', () => {
    const t = fakeTarget();
    const kb = new Keyboard(t as never);
    let n = 0;
    kb.onFirstInput(() => n++);
    t.fire('Enter', 'Enter');
    t.fire('Enter', 'Enter');
    expect(n).toBe(1);
    kb.onFirstInput(() => n++);
    expect(n).toBe(2);
  });

  it('leaves browser shortcuts alone', () => {
    const t = fakeTarget();
    const kb = new Keyboard(t as never);
    expect(t.fire('KeyR', 'r', { ctrlKey: true })).toBe(false);
    expect(kb.drain()).toEqual([]);
  });
});
