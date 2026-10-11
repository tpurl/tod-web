/**
 * Keyboard input. Physical keys are translated into game keys and queued;
 * the main loop drains the queue once per frame so states see input in order.
 */
export type GameKey = 'up' | 'down' | 'left' | 'right' | 'enter' | 'back' | 'char';

export interface KeyPress {
  key: GameKey;
  /** Uppercased printable character when key === 'char'. */
  char?: string;
  repeat: boolean;
}

const CODE_MAP: Readonly<Record<string, GameKey>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Escape: 'back',
  Backspace: 'back',
};

const REPEATABLE: ReadonlySet<GameKey> = new Set(['up', 'down', 'left', 'right', 'back']);

/** Maximum queued presses; older presses are dropped so held keys can't build lag. */
export const MAX_QUEUE = 16;

/**
 * Pure translation from a KeyboardEvent's code/key/repeat to a KeyPress.
 * Returns null for keys the game ignores (and for auto-repeats of
 * non-repeatable keys), so the browser keeps handling them.
 */
export function translateKey(code: string, key: string, repeat: boolean): KeyPress | null {
  const mapped = CODE_MAP[code];
  if (mapped) {
    if (repeat && !REPEATABLE.has(mapped)) return null;
    return { key: mapped, repeat };
  }
  if (key.length === 1) {
    const c = key.charCodeAt(0);
    if (c >= 32 && c <= 126) {
      if (repeat) return null;
      return { key: 'char', char: key.toUpperCase(), repeat };
    }
  }
  return null;
}

export class Keyboard {
  private queue: KeyPress[] = [];
  private firstInputCallbacks: (() => void)[] = [];
  private sawInput = false;

  constructor(target: Pick<Window, 'addEventListener'> = window) {
    target.addEventListener('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
  }

  /** Runs once, on the first game key press (used to unlock audio in Chrome). */
  onFirstInput(cb: () => void): void {
    if (this.sawInput) cb();
    else this.firstInputCallbacks.push(cb);
  }

  drain(): KeyPress[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const press = translateKey(e.code, e.key, e.repeat);
    if (!press) {
      // Still stop the page from scrolling on held arrows/space.
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      return;
    }
    e.preventDefault();
    if (!this.sawInput) {
      this.sawInput = true;
      for (const cb of this.firstInputCallbacks) cb();
      this.firstInputCallbacks = [];
    }
    this.queue.push(press);
    if (this.queue.length > MAX_QUEUE) this.queue.shift();
  }
}
