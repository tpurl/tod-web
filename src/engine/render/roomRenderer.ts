import type { FloorView } from '../../game/dungeon/dungeon.ts';
import type { RoomContents } from '../../game/rooms/contents.ts';
import { CELL, cellAt, doorIndexAt, samePoint, type Room } from '../../game/dungeon/floor.ts';
import { Canvas8, VIEW_H, VIEW_W } from './corridorRenderer.ts';
import { COLOR } from './palette.ts';

/**
 * Close-up, top-down view of the room the party is standing in (room and
 * its walls, scaled to fill the view), with its treasure, fountain, and
 * any trap the party knows about. Monsters are sprites drawn on top by the
 * dungeon screen; this is also where combat will take place.
 */
export const ROOM_COLORS = {
  background: COLOR.black,
  wall: COLOR.darkBlue,
  mortar: COLOR.black,
  floor: COLOR.black,
  floorDot: COLOR.darkBlue,
  door: COLOR.darkYellow,
  stairsUp: COLOR.white,
  stairsDown: COLOR.lightRed,
  chest: COLOR.darkYellow,
  chestBand: COLOR.darkRed,
  water: COLOR.lightBlue,
  basin: COLOR.gray,
  trap: COLOR.mediumRed,
} as const;

const MAX_CELL = 24;

export interface RoomLayout {
  cell: number;
  /** Pixel position of the room's top-left wall corner in the view. */
  ox: number;
  oy: number;
}

export function roomLayout(room: Room): RoomLayout {
  const cols = room.w + 2;
  const rows = room.h + 2;
  const cell = Math.min(MAX_CELL, Math.floor(VIEW_W / cols), Math.floor(VIEW_H / rows));
  return { cell, ox: Math.floor((VIEW_W - cols * cell) / 2), oy: Math.floor((VIEW_H - rows * cell) / 2) };
}

/** Pixel center of a floor square in the room view. */
export function roomCellCenter(room: Room, x: number, y: number): { px: number; py: number } {
  const L = roomLayout(room);
  return { px: L.ox + (x - room.x + 1) * L.cell + L.cell / 2, py: L.oy + (y - room.y + 1) * L.cell + L.cell / 2 };
}

function drawWall(cv: Canvas8, x: number, y: number, s: number): void {
  cv.rect(x, y, x + s - 1, y + s - 1, ROOM_COLORS.wall);
  const half = Math.floor(s / 2);
  cv.rect(x, y, x + s - 1, y, ROOM_COLORS.mortar);
  cv.rect(x, y + half, x + s - 1, y + half, ROOM_COLORS.mortar);
  cv.rect(x + half, y, x + half, y + half, ROOM_COLORS.mortar);
  cv.rect(x, y + half, x, y + s - 1, ROOM_COLORS.mortar);
}

function drawFloor(cv: Canvas8, x: number, y: number, s: number): void {
  cv.rect(x, y, x + s - 1, y + s - 1, ROOM_COLORS.floor);
  const m = Math.floor(s / 2);
  cv.rect(x + m - 1, y + m - 1, x + m, y + m, ROOM_COLORS.floorDot);
}

function drawDoor(cv: Canvas8, x: number, y: number, s: number): void {
  cv.rect(x, y, x + s - 1, y + s - 1, ROOM_COLORS.door);
  cv.rect(x, y, x + s - 1, y, ROOM_COLORS.mortar);
  cv.rect(x, y + s - 1, x + s - 1, y + s - 1, ROOM_COLORS.mortar);
  cv.rect(x, y, x, y + s - 1, ROOM_COLORS.mortar);
  cv.rect(x + s - 1, y, x + s - 1, y + s - 1, ROOM_COLORS.mortar);
}

function drawChest(cv: Canvas8, x: number, y: number, s: number): void {
  const m = Math.floor(s / 5);
  cv.rect(x + m, y + 2 * m, x + s - 1 - m, y + s - 1 - m, ROOM_COLORS.chest);
  cv.rect(x + m, y + 2 * m + Math.floor(m * 1.5), x + s - 1 - m, y + 2 * m + Math.floor(m * 1.5), ROOM_COLORS.chestBand);
  const c = x + Math.floor(s / 2);
  cv.rect(c - 1, y + 3 * m, c, y + 3 * m + 1, ROOM_COLORS.chestBand);
}

function drawFountain(cv: Canvas8, x: number, y: number, s: number, used: boolean): void {
  const m = Math.floor(s / 6);
  cv.rect(x + m, y + m, x + s - 1 - m, y + s - 1 - m, ROOM_COLORS.basin);
  if (!used) cv.rect(x + 2 * m, y + 2 * m, x + s - 1 - 2 * m, y + s - 1 - 2 * m, ROOM_COLORS.water);
}

function drawTrap(cv: Canvas8, x: number, y: number, s: number): void {
  const a = Math.floor(s / 4);
  const b = s - 1 - a;
  for (let i = 0; i <= b - a; i++) {
    cv.rect(x + a + i, y + a + i, x + a + i, y + a + i, ROOM_COLORS.trap);
    cv.rect(x + b - i, y + a + i, x + b - i, y + a + i, ROOM_COLORS.trap);
  }
}

function drawStairs(cv: Canvas8, x: number, y: number, s: number, color: number): void {
  drawFloor(cv, x, y, s);
  const step = Math.max(2, Math.floor(s / 4));
  for (let i = 0; i < 3; i++) {
    const top = y + 2 + i * step;
    cv.rect(x + 2 + i * step, top, x + s - 3, top + step - 2, color);
  }
}

export function renderRoom(v: FloorView, room: Room): Canvas8 {
  const cv = new Canvas8(VIEW_W, VIEW_H);
  cv.rect(0, 0, VIEW_W - 1, VIEW_H - 1, ROOM_COLORS.background);
  const L = roomLayout(room);
  const f = v.floor;
  for (let y = room.y - 1; y <= room.y + room.h; y++) {
    for (let x = room.x - 1; x <= room.x + room.w; x++) {
      const px = L.ox + (x - room.x + 1) * L.cell;
      const py = L.oy + (y - room.y + 1) * L.cell;
      const c = cellAt(f, x, y);
      if (samePoint({ x, y }, f.stairsUp)) drawStairs(cv, px, py, L.cell, ROOM_COLORS.stairsUp);
      else if (samePoint({ x, y }, f.stairsDown)) drawStairs(cv, px, py, L.cell, ROOM_COLORS.stairsDown);
      else if (c === CELL.room) drawFloor(cv, px, py, L.cell);
      else if (c === CELL.door) {
        const i = doorIndexAt(f, x, y);
        if (f.doors[i].kind === 'secret' && !v.found.has(i)) drawWall(cv, px, py, L.cell);
        else drawDoor(cv, px, py, L.cell);
      } else drawWall(cv, px, py, L.cell);
    }
  }
  const c: RoomContents | undefined = v.contents[room.id];
  const at = (p: { x: number; y: number }) => ({ px: L.ox + (p.x - room.x + 1) * L.cell, py: L.oy + (p.y - room.y + 1) * L.cell });
  if (c?.fountain) {
    const { px, py } = at(c.fountain);
    drawFountain(cv, px, py, L.cell, c.fountain.used);
  }
  if (c?.trap && (c.trap.found || c.trap.sprung)) {
    const { px, py } = at(c.trap);
    drawTrap(cv, px, py, L.cell);
  }
  if (c?.treasure && !c.treasure.taken) {
    const { px, py } = at(c.treasure);
    drawChest(cv, px, py, L.cell);
  }
  return cv;
}
