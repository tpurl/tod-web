import type { Side, Slice } from '../../game/dungeon/corridorView.ts';
import { COLOR } from './palette.ts';

/**
 * Draws corridor slices as a stepped first-person view: the classic frame-
 * within-frame perspective, with flat-shaded walls, doors, and side
 * openings, outlined in black. Output is a pixel buffer of palette indices
 * for TileScreen.overlay.
 *
 * Frame d is the outline of the near edge of the square d squares ahead.
 * The frame sizes are a first pass; they get traced against the original
 * in the fidelity pass. [CALIBRATE]
 */
export const VIEW_W = 256;
export const VIEW_H = 160;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const HALF_W = [128, 84, 52, 32, 19, 11];
const HALF_H = [80, 52, 32, 20, 12, 7];

export const VIEW_COLORS = {
  ceiling: COLOR.black,
  floor: COLOR.darkBlue,
  sideWall: COLOR.gray,
  frontWall: COLOR.white,
  door: COLOR.darkYellow,
  edge: COLOR.black,
} as const;

interface Frame {
  l: number;
  r: number;
  t: number;
  b: number;
}

export function frame(d: number): Frame {
  return { l: CX - HALF_W[d], r: CX + HALF_W[d] - 1, t: CY - HALF_H[d], b: CY + HALF_H[d] - 1 };
}

type Pt = readonly [number, number];

export class Canvas8 {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
  }

  get(x: number, y: number): number {
    return this.pixels[y * this.width + x];
  }

  rect(x0: number, y0: number, x1: number, y1: number, c: number): void {
    for (let y = Math.max(0, y0); y <= Math.min(this.height - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.width - 1, x1); x++) this.pixels[y * this.width + x] = c;
    }
  }

  /** Fills a convex polygon (scanline). */
  polygon(pts: readonly Pt[], c: number): void {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((sy < ay && sy < by) || (sy > ay && sy > by) || ay === by) continue;
        const x = ax + ((sy - ay) / (by - ay)) * (bx - ax);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      if (lo <= hi) this.rect(Math.round(lo), y, Math.round(hi) - 1, y, c);
    }
  }

  line(a: Pt, b: Pt, c: number): void {
    let [x0, y0] = [Math.round(a[0]), Math.round(a[1])];
    const [x1, y1] = [Math.round(b[0]), Math.round(b[1])];
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x0 >= 0 && y0 >= 0 && x0 < this.width && y0 < this.height) this.pixels[y0 * this.width + x0] = c;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  outline(pts: readonly Pt[], c: number): void {
    pts.forEach((p, i) => this.line(p, pts[(i + 1) % pts.length], c));
  }
}

/**
 * A door panel inside a wall quad: `fx` trims each side (fraction of the
 * width), and the panel rises from the floor line to `height` (fraction of
 * the wall's height at that point).
 */
function inset(pts: readonly Pt[], fx: number, height: number): Pt[] {
  // pts: near-top, far-top, far-bottom, near-bottom (or a rect in that order)
  const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const [nt, ft, fb, nb] = pts;
  const a = lerp(nt, ft, fx);
  const b = lerp(nt, ft, 1 - fx);
  const c = lerp(nb, fb, 1 - fx);
  const d = lerp(nb, fb, fx);
  return [lerp(d, a, height), lerp(c, b, height), c, d];
}

function drawPanel(cv: Canvas8, pts: readonly Pt[], fill: number, door: boolean): void {
  cv.polygon(pts, fill);
  cv.outline(pts, VIEW_COLORS.edge);
  if (door) {
    const p = inset(pts, 0.25, 0.8);
    cv.polygon(p, VIEW_COLORS.door);
    cv.outline(p, VIEW_COLORS.edge);
  }
}

function drawSide(cv: Canvas8, side: Side, near: Frame, far: Frame, isLeft: boolean): void {
  if (side === 'space') return;
  const nx = isLeft ? near.l : near.r;
  const fx = isLeft ? far.l : far.r;
  if (side === 'open') {
    // The far wall of the side passage faces us.
    const quad: Pt[] = [
      [nx, far.t],
      [fx, far.t],
      [fx, far.b],
      [nx, far.b],
    ];
    drawPanel(cv, quad, VIEW_COLORS.frontWall, false);
    return;
  }
  const quad: Pt[] = [
    [nx, near.t],
    [fx, far.t],
    [fx, far.b],
    [nx, near.b],
  ];
  drawPanel(cv, quad, VIEW_COLORS.sideWall, side === 'door');
}

/** Renders slices into a VIEW_W x VIEW_H buffer. */
export function renderCorridor(slices: readonly Slice[], cv = new Canvas8(VIEW_W, VIEW_H)): Canvas8 {
  cv.rect(0, 0, VIEW_W - 1, CY - 1, VIEW_COLORS.ceiling);
  cv.rect(0, CY, VIEW_W - 1, VIEW_H - 1, VIEW_COLORS.floor);
  // Far to near, so nearer walls paint over farther ones.
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i];
    const near = frame(s.depth);
    const far = frame(s.depth + 1);
    if (s.ahead !== 'open') {
      const quad: Pt[] = [
        [far.l, far.t],
        [far.r, far.t],
        [far.r, far.b],
        [far.l, far.b],
      ];
      drawPanel(cv, quad, VIEW_COLORS.frontWall, s.ahead === 'door');
    } else if (s.depth === slices.length - 1) {
      // The view fades out past the last slice.
      cv.rect(far.l, far.t, far.r, far.b, VIEW_COLORS.ceiling);
    }
    drawSide(cv, s.left, near, far, true);
    drawSide(cv, s.right, near, far, false);
  }
  return cv;
}
