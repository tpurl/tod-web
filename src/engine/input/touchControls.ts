import { REPEATABLE, translateKey, type KeyPress } from './keyboard.ts';

/**
 * On-screen controls for phones and tablets. The markup lives in index.html
 * (buttons with data-key attributes); this module wires them to the same
 * KeyPress queue the physical keyboard uses, so states never know the
 * difference.
 *
 *   - D-pad and Back auto-repeat while held, like held arrow keys.
 *   - Tapping the game screen sends Enter.
 *   - The ABC button opens the phone's own keyboard for letters and names.
 */
export const REPEAT_DELAY_MS = 300;
export const REPEAT_INTERVAL_MS = 90;

/** Sentinel kept in the hidden text field so Backspace always has something to delete. */
export const SOFT_SENTINEL = '\u00a0';

export interface Scheduler {
  set(fn: () => void, ms: number): number;
  clear(id: number): void;
}

const browserScheduler: Scheduler = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
};

/** Fires once immediately, then repeatedly while held, like keyboard auto-repeat. */
export class HoldRepeater {
  private timer: number | null = null;
  private readonly fire: (repeat: boolean) => void;
  private readonly scheduler: Scheduler;

  constructor(fire: (repeat: boolean) => void, scheduler: Scheduler = browserScheduler) {
    this.fire = fire;
    this.scheduler = scheduler;
  }

  get active(): boolean {
    return this.timer !== null;
  }

  start(): void {
    this.stop();
    this.fire(false);
    this.timer = this.scheduler.set(() => this.tick(), REPEAT_DELAY_MS);
  }

  stop(): void {
    if (this.timer !== null) this.scheduler.clear(this.timer);
    this.timer = null;
  }

  private tick(): void {
    this.fire(true);
    this.timer = this.scheduler.set(() => this.tick(), REPEAT_INTERVAL_MS);
  }
}

/** Parses a button's data-key: a game key name ("up", "enter", ...) or "char:X". */
export function parseKeyAttr(attr: string): KeyPress | null {
  if (attr.startsWith('char:') && attr.length === 6) {
    return translateKey('', attr[5], false);
  }
  switch (attr) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
    case 'enter':
    case 'back':
      return { key: attr, repeat: false };
    default:
      return null;
  }
}

/**
 * Turns a change in the hidden text field into key presses. The field holds
 * SOFT_SENTINEL between edits: a shorter value means Backspace, anything
 * after the sentinel is typed text. Works with Android keyboards, which
 * report most keys as "Unidentified" and only reveal them through input.
 */
export function softInputDiff(value: string, sentinel: string = SOFT_SENTINEL): KeyPress[] {
  if (value.length < sentinel.length) return [{ key: 'back', repeat: false }];
  const typed = value.startsWith(sentinel) ? value.slice(sentinel.length) : value.replaceAll(sentinel, '');
  const out: KeyPress[] = [];
  for (const ch of typed) {
    const p = translateKey('', ch, false);
    if (p) out.push(p);
  }
  return out;
}

/** Show touch controls on coarse-pointer or touch devices, or when forced with ?touch=1. */
export function shouldShowTouch(opts: { coarsePointer: boolean; maxTouchPoints: number; search: string }): boolean {
  const forced = new URLSearchParams(opts.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return opts.coarsePointer || opts.maxTouchPoints > 0;
}

export class TouchControls {
  private readonly doc: Document;
  private readonly sink: (press: KeyPress) => void;
  private readonly soft: HTMLInputElement | null;

  constructor(doc: Document, sink: (press: KeyPress) => void) {
    this.doc = doc;
    this.sink = sink;
    this.soft = doc.getElementById('soft-input') as HTMLInputElement | null;
    this.wireButtons();
    this.wireStage();
    this.wireSoftKeyboard();
  }

  show(): void {
    this.doc.body.classList.add('touch');
  }

  private wireButtons(): void {
    for (const el of this.doc.querySelectorAll<HTMLElement>('[data-key]')) {
      const press = parseKeyAttr(el.dataset.key ?? '');
      if (!press) continue;
      const repeats = REPEATABLE.has(press.key);
      const repeater = new HoldRepeater((repeat) => this.sink({ ...press, repeat }));

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        if (repeats) repeater.start();
        else this.sink(press);
      });
      const release = () => {
        repeater.stop();
        el.classList.remove('down');
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  private wireStage(): void {
    const stage = this.doc.getElementById('stage');
    stage?.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      this.soft?.blur();
      this.sink({ key: 'enter', repeat: false });
    });
  }

  private wireSoftKeyboard(): void {
    const soft = this.soft;
    const toggle = this.doc.getElementById('soft-toggle');
    if (!soft || !toggle) return;

    const reset = () => {
      soft.value = SOFT_SENTINEL;
      soft.setSelectionRange(soft.value.length, soft.value.length);
    };
    reset();

    // Focus must happen inside a click for mobile browsers to open the keyboard.
    toggle.addEventListener('pointerdown', (e) => e.preventDefault());
    toggle.addEventListener('click', () => {
      if (this.doc.activeElement === soft) {
        soft.blur();
      } else {
        reset();
        soft.focus();
      }
    });
    soft.addEventListener('focus', () => toggle.classList.add('down'));
    soft.addEventListener('blur', () => toggle.classList.remove('down'));

    soft.addEventListener('input', () => {
      for (const p of softInputDiff(soft.value)) this.sink(p);
      reset();
    });

    // Keys that also fire as real keydown events must not reach the window
    // Keyboard, or they would arrive twice (once here, once via input).
    soft.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.sink({ key: 'enter', repeat: false });
      } else if (e.key === 'Backspace' || e.key.length === 1 || e.key === 'Unidentified') {
        e.stopPropagation();
      }
    });
  }
}
