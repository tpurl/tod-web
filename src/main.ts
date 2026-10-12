import { Keyboard } from './engine/input/keyboard.ts';
import { TouchControls, shouldShowTouch } from './engine/input/touchControls.ts';
import { Display } from './engine/render/display.ts';
import { createRng, timeSeed } from './engine/rng.ts';
import { TileScreen } from './engine/render/tileScreen.ts';
import { StateMachine, type AppContext } from './state/stateMachine.ts';
import { TitleState } from './state/titleState.ts';

/** Longest frame step passed to states, so a backgrounded tab doesn't jump. */
const MAX_DT_MS = 100;

const canvas = document.getElementById('screen');
const stage = document.getElementById('stage');
if (!(canvas instanceof HTMLCanvasElement) || !stage) throw new Error('#stage or #screen missing');

const screen = new TileScreen();
const display = new Display(canvas, stage);
const keyboard = new Keyboard(window);
const touch = new TouchControls(document, (press) => keyboard.press(press));

if (
  shouldShowTouch({
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    maxTouchPoints: navigator.maxTouchPoints,
    search: location.search,
  })
) {
  touch.show();
}
// A device that reports neither still gets controls on its first touch.
window.addEventListener('touchstart', () => touch.show(), { once: true, passive: true });

const machine = new StateMachine();
const ctx: AppContext = { machine, screen, rng: createRng(timeSeed()), party: null };

machine.change(new TitleState(ctx));
canvas.focus();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(now - last, MAX_DT_MS);
  last = now;
  for (const press of keyboard.drain()) machine.onKey(press);
  machine.update(dt);
  display.present(screen);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
