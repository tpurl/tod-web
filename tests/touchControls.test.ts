import { describe, expect, it } from 'vitest';
import {
  HoldRepeater,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  SOFT_SENTINEL,
  parseKeyAttr,
  shouldShowTouch,
  softInputDiff,
  type Scheduler,
} from '../src/engine/input/touchControls.ts';

function fakeScheduler() {
  let next = 1;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  const s: Scheduler & { runNext(): number; size(): number } = {
    set: (fn, ms) => {
      pending.set(next, { fn, ms });
      return next++;
    },
    clear: (id) => {
      pending.delete(id);
    },
    runNext: () => {
      const [id, t] = pending.entries().next().value as [number, { fn: () => void; ms: number }];
      pending.delete(id);
      t.fn();
      return t.ms;
    },
    size: () => pending.size,
  };
  return s;
}

describe('parseKeyAttr', () => {
  it('parses game keys and char keys', () => {
    expect(parseKeyAttr('up')).toEqual({ key: 'up', repeat: false });
    expect(parseKeyAttr('enter')).toEqual({ key: 'enter', repeat: false });
    expect(parseKeyAttr('char:m')).toEqual({ key: 'char', char: 'M', repeat: false });
  });

  it('rejects unknown values', () => {
    expect(parseKeyAttr('jump')).toBeNull();
    expect(parseKeyAttr('char:')).toBeNull();
    expect(parseKeyAttr('char:ab')).toBeNull();
  });
});

describe('softInputDiff', () => {
  it('reads typed characters after the sentinel, uppercased', () => {
    expect(softInputDiff(SOFT_SENTINEL + 'ab')).toEqual([
      { key: 'char', char: 'A', repeat: false },
      { key: 'char', char: 'B', repeat: false },
    ]);
  });

  it('treats a deleted sentinel as Backspace', () => {
    expect(softInputDiff('')).toEqual([{ key: 'back', repeat: false }]);
  });

  it('handles text inserted before the sentinel', () => {
    expect(softInputDiff('x' + SOFT_SENTINEL)).toEqual([{ key: 'char', char: 'X', repeat: false }]);
  });

  it('drops characters the game cannot use', () => {
    expect(softInputDiff(SOFT_SENTINEL + '\u00e9')).toEqual([]);
  });

  it('returns nothing when unchanged', () => {
    expect(softInputDiff(SOFT_SENTINEL)).toEqual([]);
  });
});

describe('shouldShowTouch', () => {
  it('shows on touch devices and hides on desktop', () => {
    expect(shouldShowTouch({ coarsePointer: true, maxTouchPoints: 5, search: '' })).toBe(true);
    expect(shouldShowTouch({ coarsePointer: false, maxTouchPoints: 0, search: '' })).toBe(false);
  });

  it('honours ?touch=1 and ?touch=0', () => {
    expect(shouldShowTouch({ coarsePointer: false, maxTouchPoints: 0, search: '?touch=1' })).toBe(true);
    expect(shouldShowTouch({ coarsePointer: true, maxTouchPoints: 5, search: '?touch=0' })).toBe(false);
  });
});

describe('HoldRepeater', () => {
  it('fires immediately, then after the delay, then at the interval', () => {
    const sched = fakeScheduler();
    const fired: boolean[] = [];
    const r = new HoldRepeater((repeat) => fired.push(repeat), sched);
    r.start();
    expect(fired).toEqual([false]);
    expect(sched.runNext()).toBe(REPEAT_DELAY_MS);
    expect(fired).toEqual([false, true]);
    expect(sched.runNext()).toBe(REPEAT_INTERVAL_MS);
    expect(fired).toEqual([false, true, true]);
  });

  it('stops cleanly', () => {
    const sched = fakeScheduler();
    const r = new HoldRepeater(() => {}, sched);
    r.start();
    expect(r.active).toBe(true);
    r.stop();
    expect(r.active).toBe(false);
    expect(sched.size()).toBe(0);
  });
});
