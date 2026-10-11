/**
 * Helpers for authoring patterns as readable strings: '#' (or any char other
 * than '.' and ' ') is a lit pixel.
 */

function rowToByte(row: string, offset: number): number {
  let b = 0;
  for (let i = 0; i < 8; i++) {
    const ch = row[offset + i] ?? '.';
    if (ch !== '.' && ch !== ' ') b |= 0x80 >> i;
  }
  return b;
}

/** 8 rows of 8 characters -> 8 pattern bytes. */
export function pattern8(rows: readonly string[]): number[] {
  if (rows.length !== 8 || rows.some((r) => r.length !== 8)) {
    throw new Error('pattern8 needs 8 rows of 8 characters');
  }
  return rows.map((r) => rowToByte(r, 0));
}

/** 16 rows of 16 characters -> 32 bytes in TMS9918A order (TL, BL, TR, BR). */
export function sprite16(rows: readonly string[]): number[] {
  if (rows.length !== 16 || rows.some((r) => r.length !== 16)) {
    throw new Error('sprite16 needs 16 rows of 16 characters');
  }
  const out: number[] = [];
  for (const [colOff, rowOff] of [
    [0, 0],
    [0, 8],
    [8, 0],
    [8, 8],
  ] as const) {
    for (let y = 0; y < 8; y++) out.push(rowToByte(rows[rowOff + y], colOff));
  }
  return out;
}
