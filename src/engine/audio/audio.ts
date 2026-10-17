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
 * Sounds are rendered once through the chip model and cached as buffers.
 */
export class WebAudioSound implements SoundSink {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly cache = new Map<SoundId, AudioBuffer>();
  private musicSource: AudioBufferSourceNode | null = null;
  private wantedMusic: SoundId | null = null;
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
    if (this.wantedMusic && !this.musicSource) this.startMusic(this.wantedMusic);
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

  private source(id: SoundId): AudioBufferSourceNode {
    const ctx = this.ctx as AudioContext;
    let buf = this.cache.get(id);
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
