import type { SoundId } from './sounds.ts';

/**
 * Optional "sound pack": recordings the player supplies (for example the
 * original 1982 game's sounds) that replace built-in sounds. Nothing is
 * shipped with the game; the player picks files on their own device, and
 * they are kept in that browser only.
 *
 * Files are matched by name. The table follows the recordings on Ed Burns'
 * Tunnels of Doom tribute site; earlier entries for the same sound win.
 */
export const PACK_FILES: readonly { file: string; sound: SoundId; when: string }[] = [
  { file: 'theme-full.wav', sound: 'music_title', when: 'Title screen' },
  { file: 'theme.wav', sound: 'music_title', when: 'Title screen' },
  { file: 'descending.wav', sound: 'stairs', when: 'Going up or down stairs' },
  { file: 'general-store.wav', sound: 'store_enter', when: 'Entering the store' },
  { file: 'hand-weapon.wav', sound: 'hit', when: 'A melee hit' },
  { file: 'hand-kill.wav', sound: 'monster_die', when: 'A monster is killed' },
  { file: 'miss.wav', sound: 'miss', when: 'A miss' },
  { file: 'ranged-weapon.wav', sound: 'shoot', when: 'Firing a bow, sling, or crossbow' },
  { file: 'death.wav', sound: 'hero_die', when: 'A player is disabled' },
];

export interface PackMatch {
  /** Which supplied file each sound will use. */
  matched: Map<SoundId, string>;
  /** Supplied files the game has no use for. */
  unused: string[];
}

/** Matches supplied file names (any folder, any case) to sounds. */
export function matchPackFiles(names: readonly string[]): PackMatch {
  const base = (n: string) => n.split(/[\\/]/).pop()!.toLowerCase();
  const byName = new Map(names.map((n) => [base(n), n]));
  const matched = new Map<SoundId, string>();
  const used = new Set<string>();
  for (const entry of PACK_FILES) {
    const name = byName.get(entry.file);
    if (name && !matched.has(entry.sound)) {
      matched.set(entry.sound, name);
      used.add(name);
    }
  }
  return { matched, unused: names.filter((n) => !used.has(n)) };
}

/** Where the player's recordings are kept between visits. */
export interface PackStore {
  load(): Promise<Map<SoundId, ArrayBuffer>>;
  save(entries: Map<SoundId, ArrayBuffer>): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryPackStore implements PackStore {
  data = new Map<SoundId, ArrayBuffer>();
  async load(): Promise<Map<SoundId, ArrayBuffer>> {
    return new Map(this.data);
  }
  async save(entries: Map<SoundId, ArrayBuffer>): Promise<void> {
    this.data = new Map(entries);
  }
  async clear(): Promise<void> {
    this.data.clear();
  }
}

const DB = 'tod-web';
const STORE = 'soundPack';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB, since recordings are too big for localStorage. */
export class IndexedDbPackStore implements PackStore {
  async load(): Promise<Map<SoundId, ArrayBuffer>> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const out = new Map<SoundId, ArrayBuffer>();
      const req = db.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.set(cur.key as SoundId, cur.value as ArrayBuffer);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async save(entries: Map<SoundId, ArrayBuffer>): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      for (const [id, buf] of entries) store.put(buf, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    await this.save(new Map());
  }
}

/** What the title screen needs: open the file picker, forget the pack, and say what is loaded. */
export interface SoundPackService {
  /** Opens the file picker; resolves to a one-line result once files are loaded (or '' if cancelled). */
  pick(): Promise<string>;
  clear(): Promise<void>;
  /** How many built-in sounds are currently replaced. */
  readonly count: number;
}
