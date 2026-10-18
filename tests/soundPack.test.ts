import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../src/engine/input/keyboard.ts';
import { RecordingSound } from '../src/engine/audio/audio.ts';
import { MemoryPackStore, PACK_FILES, matchPackFiles, type SoundPackService } from '../src/engine/audio/soundPack.ts';
import { SOUNDS } from '../src/engine/audio/sounds.ts';
import { RecordingActions } from '../src/engine/input/actionBar.ts';
import { MemorySaveStore } from '../src/engine/storage/saveStore.ts';
import { TileScreen } from '../src/engine/render/tileScreen.ts';
import { createRng } from '../src/engine/rng.ts';
import { StateMachine, type AppContext } from '../src/state/stateMachine.ts';
import { TitleState } from '../src/state/titleState.ts';

const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('sound pack matching', () => {
  it('maps the tribute-site recordings to game sounds', () => {
    const names = [
      'death.wav', 'descending.wav', 'general-store.wav', 'giant-rat.wav', 'hand-kill.wav', 'hand-weapon.wav',
      'imp.wav', 'kobold-battle.wav', 'kobold.wav', 'miss.wav', 'ranged-weapon-hit-kobold.wav',
      'ranged-weapon-hit-victory.wav', 'ranged-weapon-miss.wav', 'ranged-weapon.wav', 'theme-full.wav', 'theme.wav',
    ];
    const { matched, unused } = matchPackFiles(names);
    expect(matched.get('music_title')).toBe('theme-full.wav'); // the full theme wins
    expect(matched.get('stairs')).toBe('descending.wav');
    expect(matched.get('store_enter')).toBe('general-store.wav');
    expect(matched.get('hit')).toBe('hand-weapon.wav');
    expect(matched.get('shoot')).toBe('ranged-weapon.wav');
    expect(matched.size).toBe(8);
    expect(unused).toContain('giant-rat.wav');
    expect(unused).toContain('theme.wav');
  });

  it('ignores folders and letter case', () => {
    const { matched } = matchPackFiles(['Downloads/ToD/MISS.WAV', 'C:\\tod\\Theme.wav']);
    expect(matched.get('miss')).toBe('Downloads/ToD/MISS.WAV');
    expect(matched.get('music_title')).toBe('C:\\tod\\Theme.wav');
  });

  it('every entry names a real sound', () => {
    for (const e of PACK_FILES) expect(e.sound in SOUNDS).toBe(true);
  });

  it('the memory store keeps and forgets recordings', async () => {
    const store = new MemoryPackStore();
    await store.save(new Map([['miss', new ArrayBuffer(4)]]));
    expect((await store.load()).size).toBe(1);
    await store.clear();
    expect((await store.load()).size).toBe(0);
  });
});

describe('title screen controls', () => {
  function app(pack?: SoundPackService): AppContext {
    return {
      machine: new StateMachine(),
      screen: new TileScreen(),
      rng: createRng(1),
      party: null,
      dungeon: null,
      actions: new RecordingActions(),
      scenario: null,
      sound: new RecordingSound(),
      saves: new MemorySaveStore(),
      soundPack: pack,
    };
  }
  const labels = (ctx: AppContext) => (ctx.actions as RecordingActions).current.map((a) => a.label);

  it('offers ORIGINAL SOUNDS, then shows how many are in use and a way back', async () => {
    let count = 0;
    const pack: SoundPackService = {
      get count() {
        return count;
      },
      pick: async () => {
        count = 8;
        return '8 ORIGINAL SOUNDS IN USE';
      },
      clear: async () => {
        count = 0;
      },
    };
    const ctx = app(pack);
    const title = new TitleState(ctx);
    ctx.machine.change(title);
    expect(labels(ctx)).toContain('ORIGINAL SOUNDS');
    ctx.machine.onKey(K('char', 'O'));
    await flush();
    expect(labels(ctx)).toContain('ORIGINAL SOUNDS: 8');
    expect(labels(ctx)).toContain('BUILT-IN SOUNDS');
    expect(title.packMessage).toBe('8 ORIGINAL SOUNDS IN USE');
    ctx.machine.onKey(K('char', 'X'));
    await flush();
    expect(labels(ctx)).toContain('ORIGINAL SOUNDS');
    expect(title.packMessage).toBe('BUILT-IN SOUNDS RESTORED');
  });

  it('without a sound pack service (tests, headless), the button is not offered', () => {
    const ctx = app();
    ctx.machine.change(new TitleState(ctx));
    expect(labels(ctx).some((l) => l.startsWith('ORIGINAL'))).toBe(false);
  });
});
