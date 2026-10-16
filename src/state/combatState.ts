import type { Action } from '../engine/input/actionBar.ts';
import type { KeyPress } from '../engine/input/keyboard.ts';
import { VIEW_H, VIEW_W } from '../engine/render/corridorRenderer.ts';
import { COLOR } from '../engine/render/palette.ts';
import { renderRoom, roomCellCenter } from '../engine/render/roomRenderer.ts';
import { COLS } from '../engine/render/tileScreen.ts';
import { CombatModel } from '../game/combat/combat.ts';
import { getView } from '../game/dungeon/dungeon.ts';
import type { CombatStart } from '../game/dungeon/dungeonModel.ts';
import { loadMapTiles, loadPartySprites } from '../ui/dungeonTiles.ts';
import { ADVENTURER_SPRITE, loadMonsterSprites, monsterSpriteCode } from '../ui/monsterSprites.ts';
import { loadUiTiles, printHi } from '../ui/tiles.ts';
import { DungeonState, VIEW_TOP } from './dungeonState.ts';
import { GameOverState } from './gameOverState.ts';
import type { AppContext, GameState } from './stateMachine.ts';

/** Time between monster actions, so the player can follow them. */
export const MONSTER_STEP_MS = 500;
const BLINK_MS = 300;
export const PC_COLORS = [COLOR.cyan, COLOR.lightYellow, COLOR.lightGreen, COLOR.lightRed] as const;

/** Splits a message into lines of at most 32 characters at spaces. */
export function wrap(text: string, width = COLS): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** The combat screen: the room from above with every combatant. Rules live in CombatModel. */
export class CombatState implements GameState {
  readonly model: CombatModel;
  private readonly ctx: AppContext;
  private readonly start: CombatStart;
  private timer = 0;
  private blinkOn = true;
  private blinkTimer = 0;

  constructor(ctx: AppContext, start: CombatStart) {
    this.ctx = ctx;
    this.start = start;
    const party = ctx.party;
    const dungeon = ctx.dungeon;
    if (!party || !dungeon) throw new Error('CombatState needs a party and a dungeon');
    const v = getView(dungeon, party.depth);
    this.model = new CombatModel({
      party,
      contents: v.contents[start.roomId],
      room: v.floor.rooms[start.roomId],
      floor: v.floor,
      entry: start.entry,
      rng: ctx.rng,
    });
  }

  enter(): void {
    const s = this.ctx.screen;
    loadUiTiles(s);
    loadMapTiles(s);
    loadPartySprites(s);
    loadMonsterSprites(s);
    s.spriteSize = 16;
    s.spriteMagnify = false;
    this.draw();
  }

  exit(): void {
    const s = this.ctx.screen;
    s.hideAllSprites();
    s.overlay = null;
  }

  onKey(press: KeyPress): void {
    const m = this.model;
    if (m.over) {
      if (press.key === 'enter' || press.key === 'back') this.finish();
      return;
    }
    m.onKey(press);
    this.timer = 0;
    this.draw();
  }

  update(dtMs: number): void {
    const m = this.model;
    let dirty = false;
    if (m.phase === 'monsterTurn') {
      this.timer += dtMs;
      if (this.timer >= MONSTER_STEP_MS) {
        this.timer = 0;
        m.advance();
        dirty = true;
      }
    }
    this.blinkTimer += dtMs;
    if (this.blinkTimer >= BLINK_MS) {
      this.blinkTimer = 0;
      this.blinkOn = !this.blinkOn;
      dirty = true;
    }
    if (dirty) this.draw();
  }

  /** Leaves combat: back to exploring, out of the room, or to the end screen. */
  private finish(): void {
    const m = this.model;
    const p = m.party;
    const last = m.log[m.log.length - 1] ?? '';
    if (m.phase === 'defeat') {
      this.ctx.machine.change(new GameOverState(this.ctx, last));
      return;
    }
    if (m.phase === 'fled') {
      p.position = { ...this.start.retreat };
      p.facing = this.start.retreatFacing;
    } else {
      const lead = m.livingPcs[0];
      if (lead) p.position = { x: lead.x, y: lead.y };
    }
    this.ctx.machine.change(new DungeonState(this.ctx, { resume: true, message: last }));
  }

  private actions(): Action[] {
    const m = this.model;
    if (m.over) return [{ label: 'CONTINUE', key: 'enter' }];
    switch (m.phase) {
      case 'parley':
        return [
          { label: 'FIGHT', key: 'enter' },
          { label: 'TALK', key: 'char:T' },
          { label: 'FLEE', key: 'char:R' },
        ];
      case 'demand':
        return [
          { label: 'PAY', key: 'char:Y' },
          { label: 'REFUSE', key: 'char:N' },
        ];
      case 'spell':
        return [...m.castable.map((sp) => ({ label: `${sp.name.toUpperCase()} ${sp.cost}SP`, key: `char:${sp.key}` })), { label: 'CANCEL', key: 'back' }];
      case 'pcTurn': {
        const pc = m.activePc;
        if (!pc) return [];
        const out: Action[] = [{ label: 'END TURN', key: 'enter' }];
        if (m.canFire(pc)) out.push({ label: 'FIRE', key: 'char:F' });
        if (pc.c.spellPoints) out.push({ label: 'CAST', key: 'char:C' });
        if (m.hasPotion(pc)) out.push({ label: 'POTION', key: 'char:U' });
        out.push({ label: 'FLEE', key: 'char:R' });
        return out;
      }
      default:
        return [];
    }
  }

  private draw(): void {
    const s = this.ctx.screen;
    const m = this.model;
    s.clear();
    s.hideAllSprites();
    this.ctx.actions.setActions(this.actions());

    // Header.
    printHi(s, 0, 0, m.round > 0 ? `ROUND ${m.round}` : 'ENCOUNTER');
    const a = m.active;
    const who = m.over ? '' : a?.kind === 'pc' && m.activePc ? `${a.c.name}'S TURN` : a?.kind === 'monster' && m.phase === 'monsterTurn' ? 'ENEMY TURN' : '';
    s.print(COLS - who.length, 0, who);

    // Room and combatants.
    const room = m.room;
    s.overlay = { x: 0, y: VIEW_TOP, width: VIEW_W, height: VIEW_H, pixels: renderRoom(getView(this.ctx.dungeon!, m.party.depth), room).pixels };
    let i = 0;
    const place = (x: number, y: number, pattern: number, color: number) => {
      const { px, py } = roomCellCenter(room, x, y);
      Object.assign(s.sprites[i++], { x: Math.round(px) - 8, y: VIEW_TOP + Math.round(py) - 8, pattern, color, visible: true });
    };
    m.pcs.forEach((u, idx) => {
      if (u.c.hp.current <= 0) return;
      if (m.activePc === u && !this.blinkOn) return;
      place(u.x, u.y, ADVENTURER_SPRITE, PC_COLORS[idx % PC_COLORS.length]);
    });
    for (const u of m.monsters) {
      if (m.phase === 'monsterTurn' && m.active === u && !this.blinkOn) continue;
      place(u.m.x, u.m.y, monsterSpriteCode(u.def.sprite.pattern), u.def.sprite.color);
    }

    // Messages: the latest event, wrapped over two rows.
    const lines = wrap(m.log[m.log.length - 1] ?? '').slice(0, 2);
    lines.forEach((l, r) => printHi(s, 0, 21 + r, l));

    // Status line: the active character, or the party.
    const pc = m.activePc;
    if (m.over) s.print(0, 23, 'ENTER TO CONTINUE');
    else if (pc) {
      const sp = pc.c.spellPoints ? ` SP ${pc.c.spellPoints.current}` : '';
      s.print(0, 23, `HP ${pc.c.hp.current}/${pc.c.hp.max}${sp}  MOVES ${m.movesLeft}`);
    } else if (m.phase === 'parley') s.print(0, 23, 'FIGHT, TALK, OR FLEE?');
    else {
      const hp = m.livingPcs.map((u) => `${u.c.name.slice(0, 4)} ${u.c.hp.current}`).join(' ');
      s.print(0, 23, hp.slice(0, COLS));
    }
  }
}
