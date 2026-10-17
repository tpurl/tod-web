/**
 * Model of the TMS9919 / SN76489 sound chip as wired in the TI-99/4A
 * (DESIGN.md section 5): three square-wave tone voices and one noise voice,
 * each with 16 attenuation steps of 2 dB (step 15 is off).
 *
 *   tone frequency = 111860.8 / N  (N is a 10-bit divider, 1..1023)
 *   noise rates    = 6991, 3496, 1748 Hz, or "follow tone voice 3"
 *   noise          = 15-bit shift register; white taps bits 0 and 1,
 *                    periodic feeds bit 0 back
 *
 * render() writes mono samples in -1..1, so sounds can be rendered ahead
 * of time into audio buffers (and checked in unit tests).
 */
export const CHIP_CLOCK = 111860.8; // 3579545 Hz / 32
export const NOISE_RATES = [CHIP_CLOCK / 16, CHIP_CLOCK / 32, CHIP_CLOCK / 64] as const;
export const SILENT = 15;
const LFSR_RESET = 0x4000;

/** Linear amplitude for an attenuation step (0 = loudest, 15 = off). */
export function attToAmp(att: number): number {
  return att >= SILENT ? 0 : 10 ** ((-2 * att) / 20);
}

/** Nearest divider for a frequency, as the chip would have to round it. */
export function dividerFor(freq: number): number {
  return Math.max(1, Math.min(1023, Math.round(CHIP_CLOCK / freq)));
}

export function freqForDivider(n: number): number {
  return CHIP_CLOCK / n;
}

/** Lowest pitch a tone voice can play (divider 1023), about 109 Hz. */
export const LOWEST_FREQ = CHIP_CLOCK / 1023;

export class Sn76489 {
  readonly dividers = [1023, 1023, 1023];
  /** Attenuation for tone voices 0..2 and noise (index 3). */
  readonly att = [SILENT, SILENT, SILENT, SILENT];
  noiseWhite = true;
  /** 0..2 fixed rates, 3 follows tone voice 3's frequency. */
  noiseRate = 0;

  private readonly phase = [0, 0, 0];
  private lfsr = LFSR_RESET;
  private noisePhase = 0;

  setTone(voice: number, divider: number): void {
    this.dividers[voice] = Math.max(1, Math.min(1023, Math.round(divider)));
  }

  setAtt(voice: number, att: number): void {
    this.att[voice] = Math.max(0, Math.min(SILENT, Math.round(att)));
  }

  /** Writing the noise control register also resets the shift register, as on the chip. */
  setNoise(white: boolean, rate: number): void {
    this.noiseWhite = white;
    this.noiseRate = rate;
    this.lfsr = LFSR_RESET;
  }

  render(out: Float32Array, offset: number, count: number, sampleRate: number, gain = 0.25): void {
    const amps = this.att.map(attToAmp);
    const freqs = this.dividers.map(freqForDivider);
    const noiseFreq = this.noiseRate === 3 ? freqs[2] : NOISE_RATES[this.noiseRate];
    const nyquist = sampleRate / 2;
    for (let i = 0; i < count; i++) {
      let s = 0;
      for (let v = 0; v < 3; v++) {
        if (amps[v] === 0 || freqs[v] >= nyquist) continue;
        this.phase[v] = (this.phase[v] + freqs[v] / sampleRate) % 1;
        s += this.phase[v] < 0.5 ? amps[v] : -amps[v];
      }
      if (amps[3] > 0) {
        this.noisePhase += noiseFreq / sampleRate;
        while (this.noisePhase >= 1) {
          this.noisePhase -= 1;
          const bit = this.noiseWhite ? (this.lfsr ^ (this.lfsr >> 1)) & 1 : this.lfsr & 1;
          this.lfsr = (this.lfsr >> 1) | (bit << 14);
        }
        s += this.lfsr & 1 ? amps[3] : -amps[3];
      }
      out[offset + i] = s * gain;
    }
  }
}
