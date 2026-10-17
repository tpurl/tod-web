/**
 * Where save games live. Three slots of JSON in the browser's localStorage
 * (a save is a few kilobytes, well within its limits, and synchronous
 * access keeps the screens simple). Tests use MemorySaveStore.
 */
export const SAVE_SLOTS = 3;

export interface SaveStore {
  /** Parsed contents of a slot, or null if empty or unreadable. */
  read(slot: number): unknown;
  /** Returns false if the browser refused (storage full or disabled). */
  write(slot: number, data: unknown): boolean;
  remove(slot: number): void;
}

const key = (slot: number) => `tod-web:save:${slot}`;

export class LocalSaveStore implements SaveStore {
  read(slot: number): unknown {
    try {
      const text = localStorage.getItem(key(slot));
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  write(slot: number, data: unknown): boolean {
    try {
      localStorage.setItem(key(slot), JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  remove(slot: number): void {
    try {
      localStorage.removeItem(key(slot));
    } catch {
      // Nothing to do; the slot stays as it was.
    }
  }
}

export class MemorySaveStore implements SaveStore {
  readonly slots = new Map<number, string>();
  failWrites = false;

  read(slot: number): unknown {
    const t = this.slots.get(slot);
    return t ? JSON.parse(t) : null;
  }

  write(slot: number, data: unknown): boolean {
    if (this.failWrites) return false;
    this.slots.set(slot, JSON.stringify(data));
    return true;
  }

  remove(slot: number): void {
    this.slots.delete(slot);
  }
}
