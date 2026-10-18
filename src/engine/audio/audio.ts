import { SOUNDS, renderSound, type SoundId } from './sounds.ts';

/**
 * What game states use to make noise. Effects overlap; starting a tune
 * replaces the one playing. Tests and headless runs use NO_SOUND.
 */
export interface SoundSink {
  play(id: SoundId): void;
  music(id: SoundId | null): void;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
}

export const NO_SOUND: SoundSink = {
  play() {},
  music() {},
  muted: true,
  setMuted() {},
};

/** Records what was played, for tests. */
export class RecordingSound implements SoundSink {
  played: SoundId[] = [];
  playing: SoundId | null = null;
  muted = false;
  play(id: SoundId): void {
    this.played.push(id);
  }
  music(id: SoundId | null): void {
    this.playing = id;
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
  }
}

const MUTE_KEY = 'tod-web:muted';
const MASTER_GAIN = 0.6;

/**
 * Web Audio output. Chrome only allows audio after a user gesture, so the
 * context is created by unlock() on the first key or tap; anything asked
 * for before then is remembered (the current tune) or dropped (effects).
 * Sounds are rendered once through the chip model and cached as buffers,
 * unless the player has supplied a recording to use instead (soundPack.ts).
 */
export class WebAudioSound implements SoundSink {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly cache = new Map<SoundId, AudioBuffer>();
  private musicSource: AudioBufferSourceNode | null = null;
  private wantedMusic: SoundId | null = null;
  /** Player-supplied recordings, raw until the audio context can decode them. */
  private overrides = new Map<SoundId, ArrayBuffer>();
  muted: boolean;

  constructor() {
    let saved = false;
    try {
      saved = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Storage can be unavailable (privacy modes); default to sound on.
    }
    this.muted = saved;
  }

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
      this.master.connect(this.ctx.destination);
    }
    void this.ctx.resume();
    void this.decodeOverrides();
    if (this.wantedMusic && !this.musicSource) this.startMusic(this.wantedMusic);
  }

  /** Number of built-in sounds replaced by player-supplied recordings. */
  get overrideCount(): number {
    return this.overrides.size;
  }

  /**
   * Replaces built-in sounds with recordings (see soundPack.ts). Sounds not
   * in the map go back to the built-in chip versions.
   */
  setOverrides(recordings: Map<SoundId, ArrayBuffer>): void {
    this.overrides = new Map(recordings);
    this.cache.clear();
    void this.decodeOverrides();
  }

  private async decodeOverrides(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [id, raw] of this.overrides) {
      try {
        // decodeAudioData detaches its input, so give it a copy.
        const buf = await ctx.decodeAudioData(raw.slice(0));
        if (this.overrides.get(id) === raw) this.cache.set(id, buf);
      } catch {
        // Not a playable file: keep the built-in sound.
      }
    }
  }

  play(id: SoundId): void {
    if (!this.ctx || this.muted) return;
    const src = this.source(id);
    src.start();
  }

  music(id: SoundId | null): void {
    this.wantedMusic = id;
    this.musicSource?.stop();
    this.musicSource = null;
    if (id && this.ctx) this.startMusic(id);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Not saved; the setting still applies for this session.
    }
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_GAIN;
  }

  private startMusic(id: SoundId): void {
    const src = this.source(id);
    src.onended = () => {
      if (this.musicSource === src) this.musicSource = null;
    };
    this.musicSource = src;
    src.start();
  }

  private renderBuiltIn(id: SoundId): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const samples = renderSound(SOUNDS[id], ctx.sampleRate);
    const buf = ctx.createBuffer(1, Math.max(1, samples.length), ctx.sampleRate);
    buf.getChannelData(0).set(samples);
    return buf;
  }

  private source(id: SoundId): AudioBufferSourceNode {
    const ctx = this.ctx as AudioContext;
    let buf = this.cache.get(id);
    if (!buf && this.overrides.has(id)) {
      // Still decoding: use the built-in sound this once, without caching it.
      buf = this.renderBuiltIn(id);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master as GainNode);
      return src;
    }
    if (!buf) {
      const samples = renderSound(SOUNDS[id], ctx.sampleRate);
      buf = ctx.createBuffer(1, Math.max(1, samples.length), ctx.sampleRate);
      buf.getChannelData(0).set(samples);
      this.cache.set(id, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master as GainNode);
    return src;
  }
}
