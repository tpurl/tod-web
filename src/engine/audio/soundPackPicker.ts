import type { WebAudioSound } from './audio.ts';
import { IndexedDbPackStore, matchPackFiles, type PackStore, type SoundPackService } from './soundPack.ts';
import type { SoundId } from './sounds.ts';

/**
 * Browser side of the sound pack: a hidden file picker, reading the chosen
 * files, keeping them in IndexedDB, and handing them to the audio output.
 * Saved recordings are loaded again on the next visit.
 */
export function createSoundPackService(sound: WebAudioSound, store: PackStore = new IndexedDbPackStore()): SoundPackService {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.wav,audio/*';
  input.style.display = 'none';
  document.body.appendChild(input);

  store
    .load()
    .then((saved) => sound.setOverrides(saved))
    .catch(() => {
      // No IndexedDB (private browsing): the built-in sounds are used.
    });

  return {
    get count() {
      return sound.overrideCount;
    },
    pick() {
      return new Promise<string>((resolve) => {
        input.value = '';
        input.oncancel = () => resolve('');
        input.onchange = async () => {
          const files = [...(input.files ?? [])];
          if (files.length === 0) return resolve('');
          const { matched } = matchPackFiles(files.map((f) => f.name));
          if (matched.size === 0) return resolve('NO MATCHING SOUND FILES');
          const recordings = new Map<SoundId, ArrayBuffer>();
          for (const [id, name] of matched) {
            const file = files.find((f) => f.name === name);
            if (file) recordings.set(id, await file.arrayBuffer());
          }
          sound.setOverrides(recordings);
          try {
            await store.save(recordings);
            resolve(`${recordings.size} ORIGINAL SOUNDS IN USE`);
          } catch {
            resolve(`${recordings.size} IN USE (NOT SAVED)`);
          }
        };
        input.click();
      });
    },
    async clear() {
      sound.setOverrides(new Map());
      await store.clear().catch(() => undefined);
    },
  };
}
