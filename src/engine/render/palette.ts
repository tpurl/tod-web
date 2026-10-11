/**
 * TMS9918A palette. Index 0 is "transparent": at render time it resolves to
 * the screen's backdrop color, so its RGB entry is never displayed directly.
 */
export type Rgb = readonly [number, number, number];

export const COLOR = {
  transparent: 0,
  black: 1,
  mediumGreen: 2,
  lightGreen: 3,
  darkBlue: 4,
  lightBlue: 5,
  darkRed: 6,
  cyan: 7,
  mediumRed: 8,
  lightRed: 9,
  darkYellow: 10,
  lightYellow: 11,
  darkGreen: 12,
  magenta: 13,
  gray: 14,
  white: 15,
} as const;

export const PALETTE: readonly Rgb[] = [
  [0x00, 0x00, 0x00], // 0 transparent (placeholder)
  [0x00, 0x00, 0x00], // 1 black
  [0x21, 0xc8, 0x42], // 2 medium green
  [0x5e, 0xdc, 0x78], // 3 light green
  [0x54, 0x55, 0xed], // 4 dark blue
  [0x7d, 0x76, 0xfc], // 5 light blue
  [0xd4, 0x52, 0x4d], // 6 dark red
  [0x42, 0xeb, 0xf5], // 7 cyan
  [0xfc, 0x55, 0x54], // 8 medium red
  [0xff, 0x79, 0x78], // 9 light red
  [0xd4, 0xc1, 0x54], // 10 dark yellow
  [0xe6, 0xce, 0x80], // 11 light yellow
  [0x21, 0xb0, 0x3b], // 12 dark green
  [0xc9, 0x5b, 0xba], // 13 magenta
  [0xcc, 0xcc, 0xcc], // 14 gray
  [0xff, 0xff, 0xff], // 15 white
];

export function isColor(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 15;
}
