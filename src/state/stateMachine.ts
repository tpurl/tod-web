import type { KeyPress } from '../engine/input/keyboard.ts';
import type { TileScreen } from '../engine/render/tileScreen.ts';
import type { Rng } from '../engine/rng.ts';
import type { Party } from '../game/party/party.ts';

/**
 * A screen of the game. TileScreen is retained-mode: states write tiles when
 * something changes (enter, onKey, update) rather than redrawing every frame.
 */
export interface GameState {
  enter?(): void;
  exit?(): void;
  onKey(press: KeyPress): void;
  update(dtMs: number): void;
}

export class StateMachine {
  private current: GameState | null = null;

  get state(): GameState | null {
    return this.current;
  }

  change(next: GameState): void {
    this.current?.exit?.();
    this.current = next;
    next.enter?.();
  }

  onKey(press: KeyPress): void {
    this.current?.onKey(press);
  }

  update(dtMs: number): void {
    this.current?.update(dtMs);
  }
}

/** Shared services handed to every state. */
export interface AppContext {
  machine: StateMachine;
  screen: TileScreen;
  rng: Rng;
  /** The current adventuring party, once created. */
  party: Party | null;
}
