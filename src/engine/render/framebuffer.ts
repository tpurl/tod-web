import { PALETTE, type Rgb } from './palette.ts';

/** Converts resolved palette indices to RGBA bytes (alpha always 255). */
export function indicesToRgba(
  indices: Uint8Array,
  out: Uint8ClampedArray | Uint8Array,
  palette: readonly Rgb[] = PALETTE,
): void {
  if (out.length !== indices.length * 4) throw new RangeError('RGBA buffer must be 4x index buffer');
  for (let i = 0, o = 0; i < indices.length; i++, o += 4) {
    const c = palette[indices[i]];
    out[o] = c[0];
    out[o + 1] = c[1];
    out[o + 2] = c[2];
    out[o + 3] = 255;
  }
}
