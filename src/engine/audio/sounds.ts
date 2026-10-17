import { SILENT, Sn76489, dividerFor } from './sn76489.ts';

/**
 * Sound effects and tunes as "sound lists", the way TI-99/4A programs fed
 * the sound chip: a series of frames, each setting some registers and then
 * holding for a number of 1/60 s ticks. Everything here is newly composed.
 *
 * Effects are written frame by frame with the small helpers below; tunes
 * use a compact note notation ("C5:8 E5:8 R:4", durations in ticks).
 */
export const TICK_HZ = 60;

export interface VoiceSet {
  /** Frequency in Hz (rounded to a chip divider), or undefined to leave it. */
  freq?: number;
  att?: number;
}

export interface Frame {
  ticks: number;
  tone?: [VoiceSet?, VoiceSet?, VoiceSet?];
  noise?: { white?: boolean; rate?: number; att?: number };
}

export type Sound = readonly Frame[];

// ---- notes --------------------------------------------------------------

const SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" -> 440, "C#5" / "Db5" supported. */
export function noteFreq(note: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!m) throw new Error(`bad note ${note}`);
  const semis = SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

export interface NoteEvent {
  start: number;
  ticks: number;
  freq: number | null;
}

/** Parses "C5:8 E5:8 R:4" into timed note events. */
export function parseNotes(text: string): NoteEvent[] {
  const out: NoteEvent[] = [];
  let t = 0;
  for (const token of text.trim().split(/\s+/)) {
    const [name, len] = token.split(':');
    const ticks = Number(len);
    if (!Number.isInteger(ticks) || ticks <= 0) throw new Error(`bad length in ${token}`);
    out.push({ start: t, ticks, freq: name === 'R' ? null : noteFreq(name) });
    t += ticks;
  }
  return out;
}

/**
 * Combines up to three note tracks into a sound list. Each note sounds at
 * `att` and goes quiet for its last tick, so repeated notes stay distinct.
 */
export function tune(tracks: readonly string[], att: readonly number[] = [2, 5, 7]): Sound {
  const parsed = tracks.map(parseNotes);
  const cuts = new Set<number>([0]);
  for (const track of parsed) {
    for (const n of track) {
      cuts.add(n.start);
      cuts.add(n.start + n.ticks - 1);
      cuts.add(n.start + n.ticks);
    }
  }
  const end = Math.max(...parsed.map((tr) => tr.reduce((s, n) => Math.max(s, n.start + n.ticks), 0)));
  const times = [...cuts].filter((t) => t <= end).sort((a, b) => a - b);
  const frames: Frame[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const t = times[i];
    const tone: [VoiceSet?, VoiceSet?, VoiceSet?] = [undefined, undefined, undefined];
    parsed.forEach((track, v) => {
      const n = track.find((x) => t >= x.start && t < x.start + x.ticks);
      const releasing = n && t >= n.start + n.ticks - 1 && n.ticks > 1;
      tone[v] = n && n.freq !== null && !releasing ? { freq: n.freq, att: att[v] ?? 4 } : { att: SILENT };
    });
    frames.push({ ticks: times[i + 1] - t, tone });
  }
  frames.push({ ticks: 1, tone: [{ att: SILENT }, { att: SILENT }, { att: SILENT }] });
  return frames;
}

// ---- effect helpers -------------------------------------------------------

/** A pitch slide on voice 0, one frame per tick, with an optional fade. */
function slide(from: number, to: number, ticks: number, attFrom = 2, attTo = attFrom): Frame[] {
  return Array.from({ length: ticks }, (_, i) => {
    const t = ticks === 1 ? 1 : i / (ticks - 1);
    return { ticks: 1, tone: [{ freq: from * (to / from) ** t, att: Math.round(attFrom + (attTo - attFrom) * t) }] };
  });
}

/** A noise burst that fades out. */
function burst(ticks: number, rate: number, white = true, attFrom = 0, attTo = 14): Frame[] {
  return Array.from({ length: ticks }, (_, i) => ({
    ticks: 1,
    noise: { ...(i === 0 ? { white, rate } : {}), att: Math.round(attFrom + ((attTo - attFrom) * i) / Math.max(1, ticks - 1)) },
  }));
}

const off: Frame = { ticks: 1, tone: [{ att: SILENT }, { att: SILENT }, { att: SILENT }], noise: { att: SILENT } };

// ---- library ----------------------------------------------------------------

export const SOUNDS = {
  step: [...burst(2, 2, true, 11, 14), off],
  bump: [{ ticks: 4, tone: [{ freq: 110, att: 3 }], noise: { white: false, rate: 2, att: 6 } }, off],
  door_open: [...slide(220, 440, 8, 5, 8), off],
  secret_found: [...tune(['C5:3 E5:3 G5:3 C6:8'], [3]), off],
  stairs: [...tune(['G5:4 E5:4 C5:4 G4:8'], [4]), off],
  hit: [...burst(6, 0, true, 1, 12), off],
  miss: [...burst(3, 2, true, 8, 13), ...slide(700, 500, 3, 9, 12), off],
  shoot: [...slide(1400, 600, 6, 3, 9), off],
  cast: [...slide(400, 1600, 10, 6, 2), ...slide(1600, 1500, 4, 2, 10), off],
  monster_die: [...slide(660, 120, 16, 2, 8), ...burst(6, 1, true, 6, 14), off],
  hero_die: [...tune(['E4:10 D4:10 C4:10 A3:24'], [2]), off],
  treasure: [...tune(['E6:3 B6:10'], [2]), off],
  fountain: [...tune(['C6:2 G6:2 E6:2 A6:2 F6:2 C7:4'], [6]), off],
  trap: [...burst(12, 0, true, 0, 14), off],
  level_up: [...tune(['C5:6 E5:6 G5:6 C6:18', 'R:6 C4:6 E4:6 G4:18'], [2, 6]), off],
  buy: [...tune(['A5:3 E6:6'], [4]), off],
  store_enter: [...tune(['C5:4 E5:4 G5:4 E5:4 C6:12', 'R:8 C4:4 G4:4 C5:12'], [3, 7]), off],
  // Tunes: original melodies in the spirit of early-80s title music.
  music_title: tune(
    [
      'A4:12 C5:12 E5:12 A5:24 G5:12 E5:12 D5:12 E5:36 R:12 ' + 'A4:12 C5:12 E5:12 G5:24 F5:12 E5:12 D5:12 A4:36',
      'A3:48 C4:48 D4:48 E4:48 A3:48 C4:48 D4:48 A3:36',
      'R:24 E4:24 R:24 G4:24 R:24 A4:24 R:24 B4:24 R:24 E4:24 R:24 G4:24 R:24 F4:24 R:24 E4:12',
    ],
    [2, 6, 8],
  ),
  music_victory: tune(
    ['G4:8 C5:8 E5:8 G5:16 E5:8 G5:32', 'E4:8 G4:8 C5:8 E5:16 C5:8 E5:32', 'C4:24 C4:24 C4:32'],
    [2, 5, 7],
  ),
  music_gameover: tune(['E5:16 D5:16 C5:16 B4:16 A4:48', 'A3:32 E3:32 A3:48'], [3, 7]),
} as const satisfies Record<string, Sound>;

export type SoundId = keyof typeof SOUNDS;
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];
export const MUSIC_IDS: readonly SoundId[] = ['music_title', 'music_victory', 'music_gameover'];

/** Length of a sound in seconds. */
export function duration(sound: Sound): number {
  return sound.reduce((s, f) => s + f.ticks, 0) / TICK_HZ;
}

/** Plays a sound list through a fresh chip and returns the samples. */
export function renderSound(sound: Sound, sampleRate: number): Float32Array {
  const chip = new Sn76489();
  const out = new Float32Array(Math.ceil(duration(sound) * sampleRate));
  let pos = 0;
  let carry = 0;
  for (const f of sound) {
    f.tone?.forEach((v, i) => {
      if (!v) return;
      if (v.freq !== undefined) chip.setTone(i, dividerFor(v.freq));
      if (v.att !== undefined) chip.setAtt(i, v.att);
    });
    if (f.noise) {
      if (f.noise.white !== undefined || f.noise.rate !== undefined) {
        chip.setNoise(f.noise.white ?? chip.noiseWhite, f.noise.rate ?? chip.noiseRate);
      }
      if (f.noise.att !== undefined) chip.setAtt(3, f.noise.att);
    }
    const exact = (f.ticks * sampleRate) / TICK_HZ + carry;
    const n = Math.min(out.length - pos, Math.floor(exact));
    carry = exact - Math.floor(exact);
    chip.render(out, pos, n, sampleRate);
    pos += n;
  }
  return out;
}
