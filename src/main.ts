import { Keyboard } from './engine/input/keyboard.ts';
import { Display } from './engine/render/display.ts';
import { TileScreen } from './engine/render/tileScreen.ts';
import { StateMachine, type AppContext } from './state/stateMachine.ts';
import { TitleState } from './state/titleState.ts';

/** Longest frame step passed to states, so a backgrounded tab doesn't jump. */
const MAX_DT_MS = 100;

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#screen canvas missing');

const screen = new TileScreen();
const display = new Display(canvas);
const keyboard = new Keyboard(window);
const machine = new StateMachine();
const ctx: AppContext = { machine, screen };

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
