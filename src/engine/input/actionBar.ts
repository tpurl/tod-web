import { parseKeyAttr } from './touchControls.ts';
import type { KeyPress } from './keyboard.ts';

/**
 * Clickable buttons for the current screen's extra commands (REROLL,
 * SEARCH, ...), shown under the game on every device. Each button sends
 * the same KeyPress its keyboard shortcut would, so states handle mouse,
 * touch, and keys identically. States declare their buttons; the bar only
 * rebuilds when the list actually changes.
 */
export interface Action {
  label: string;
  /** A data-key value: a game key name or "char:X". */
  key: string;
}

export interface ActionSink {
  setActions(actions: readonly Action[]): void;
}

/** For tests and headless use. */
export const NO_ACTIONS: ActionSink = { setActions() {} };

/** Records the latest actions, for tests. */
export class RecordingActions implements ActionSink {
  current: Action[] = [];
  setActions(actions: readonly Action[]): void {
    this.current = [...actions];
  }
}

/** The key shown next to a label for keyboard users ("char:R" -> "R"). */
export function shortcutLabel(key: string): string {
  if (key.startsWith('char:')) return key.slice(5);
  return key === 'enter' ? 'ENTER' : key === 'back' ? 'ESC' : key.toUpperCase();
}

export class ActionBar implements ActionSink {
  private readonly el: HTMLElement;
  private readonly sink: (press: KeyPress) => void;
  private signature = '';

  constructor(el: HTMLElement, sink: (press: KeyPress) => void) {
    this.el = el;
    this.sink = sink;
  }

  setActions(actions: readonly Action[]): void {
    const sig = actions.map((a) => `${a.label}|${a.key}`).join(',');
    if (sig === this.signature) return;
    this.signature = sig;
    this.el.replaceChildren();
    for (const a of actions) {
      const press = parseKeyAttr(a.key);
      if (!press) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = a.label;
      const kbd = document.createElement('kbd');
      kbd.textContent = shortcutLabel(a.key);
      btn.append(' ', kbd);
      btn.addEventListener('pointerdown', (e) => {
        // Keep keyboard focus on the game.
        e.preventDefault();
        btn.classList.add('down');
        this.sink(press);
      });
      const up = () => btn.classList.remove('down');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      this.el.append(btn);
    }
  }
}
