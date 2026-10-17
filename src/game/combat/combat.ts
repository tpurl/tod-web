import type { SoundId } from '../../engine/audio/sounds.ts';
import type { KeyPress } from '../../engine/input/keyboard.ts';
import type { Rng } from '../../engine/rng.ts';
import { roll } from '../dice.ts';
import { CELL, DIRS, STEP, cellAt, inRoom, type Floor, type Point, type Room } from '../dungeon/floor.ts';
import { armorDefense, equippedItem } from '../items/inventory.ts';
import { getItem } from '../items/items.ts';
import { getMonster, groupName, type MonsterDef } from '../monsters/monsters.ts';
import { statBonus, type Character } from '../party/character.ts';
import { drainXp } from '../party/leveling.ts';
import type { Party } from '../party/party.ts';
import { heal, hurt, type MonsterInstance, type RoomContents } from '../rooms/contents.ts';
import { SPELLS, type SpellDef } from './spells.ts';
import { attackBonusAt, getDifficulty, type Difficulty } from '../scenario/difficulty.ts';

/**
 * Room combat (DESIGN.md section 9), as a key-driven model like the others.
 *
 *   parley -> rounds of turns in initiative order -> victory / defeat / fled
 *
 * On a character's turn (manual p.27): one step, then one attack; attacking
 * first uses the whole turn. Moving into a monster attacks it. Experience
 * goes to the player who lands the killing blow (p.28). F fires a ranged
 * weapon, C opens the spell list, U drinks a healing potion, R tries to flee,
 * Enter ends the turn. Monster turns run one at a time through advance(),
 * which the combat screen calls on a timer so the player can follow them.
 * Monster attack and damage rise with the difficulty level and the floor.
 *
 * All formulas are placeholders until calibrated. [CALIBRATE]
 */
export const MOVES_PER_TURN = 1;
export const FLEE_CHANCE = 55;
/** Chance a poisonous hit poisons, and HP lost per turn while poisoned. [CALIBRATE] */
export const POISON_CHANCE = 30;
export const POISON_DAMAGE = 1;
/** Fraction of XP a draining hit takes (never below the current level). [CALIBRATE] */
export const DRAIN_FRACTION = 0.1;

export type Phase = 'parley' | 'demand' | 'pcTurn' | 'spell' | 'monsterTurn' | 'victory' | 'defeat' | 'fled' | 'peace';

export interface PcUnit {
  kind: 'pc';
  id: string;
  c: Character;
  x: number;
  y: number;
}

export interface MonsterUnit {
  kind: 'monster';
  id: string;
  m: MonsterInstance;
  def: MonsterDef;
}

export type Unit = PcUnit | MonsterUnit;

export function hitChance(attack: number, defense: number): number {
  return Math.max(5, Math.min(95, 50 + 5 * (attack - defense)));
}

const dist = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export class CombatModel {
  phase: Phase = 'parley';
  round = 0;
  /** Latest events, newest last; the screen shows the last one or two. */
  log: string[] = [];
  movesLeft = 0;
  /** Total XP earned in this fight (each kill's XP went to whoever landed it). */
  xpWon = 0;
  goldWon = 0;
  /** Gold the monsters want, during a 'demand' phase. */
  demand = 0;
  /** Sounds since the screen last played them. */
  sounds: SoundId[] = [];

  readonly party: Party;
  readonly contents: RoomContents;
  readonly room: Room;
  readonly floor: Floor;
  readonly pcs: PcUnit[];
  private order: Unit[] = [];
  private turn = -1;
  private readonly rng: Rng;
  private readonly difficulty: Difficulty;

  constructor(opts: {
    party: Party;
    contents: RoomContents;
    room: Room;
    floor: Floor;
    entry: Point;
    rng: Rng;
    difficulty?: Difficulty;
  }) {
    this.difficulty = opts.difficulty ?? getDifficulty(null);
    this.party = opts.party;
    this.contents = opts.contents;
    this.room = opts.room;
    this.floor = opts.floor;
    this.rng = opts.rng;
    this.pcs = this.placeParty(opts.entry);
    const groups = this.monsterGroups();
    this.say(groups.length ? `${groups.join(', ')}!` : 'THE ROOM IS QUIET');
  }

  // ---- queries -------------------------------------------------------------

  get monsters(): MonsterUnit[] {
    return this.contents.monsters
      .filter((m) => m.hp > 0)
      .map((m, i) => ({ kind: 'monster' as const, id: `m${i}`, m, def: getMonster(m.monsterId) }));
  }

  get livingPcs(): PcUnit[] {
    return this.pcs.filter((u) => u.c.hp.current > 0);
  }

  get active(): Unit | null {
    return this.order[this.turn] ?? null;
  }

  get activePc(): PcUnit | null {
    const a = this.active;
    return a && a.kind === 'pc' && (this.phase === 'pcTurn' || this.phase === 'spell') ? a : null;
  }

  get over(): boolean {
    return this.phase === 'victory' || this.phase === 'defeat' || this.phase === 'fled' || this.phase === 'peace';
  }

  /** Spells the active character can afford right now. */
  get castable(): SpellDef[] {
    const pc = this.activePc;
    if (!pc?.c.spellPoints) return [];
    return SPELLS.filter((s) => s.cost <= (pc.c.spellPoints?.current ?? 0));
  }

  canFire(pc: PcUnit): boolean {
    const w = equippedItem(pc.c, 'weapon')?.weapon;
    if (!w?.ranged) return false;
    return !w.ammoItemId || pc.c.inventory.some((i) => i.itemId === w.ammoItemId && (i.quantity ?? 1) > 0);
  }

  hasPotion(pc: PcUnit): boolean {
    return pc.c.inventory.some((i) => i.itemId === 'healing_potion');
  }

  occupied(x: number, y: number): boolean {
    return this.livingPcs.some((u) => u.x === x && u.y === y) || this.monsters.some((u) => u.m.x === x && u.m.y === y);
  }

  // ---- input -----------------------------------------------------------------

  onKey(p: KeyPress): void {
    if (this.phase === 'parley') return this.onParley(p);
    if (this.phase === 'demand') return this.onDemand(p);
    if (this.phase === 'spell') return this.onSpell(p);
    if (this.phase !== 'pcTurn') return;
    const pc = this.activePc;
    if (!pc) return;
    const dir = ({ up: 'n', right: 'e', down: 's', left: 'w' } as const)[p.key as 'up' | 'right' | 'down' | 'left'];
    if (dir) return this.pcStep(pc, STEP[dir].dx, STEP[dir].dy);
    if (p.key === 'enter') return this.endTurn();
    if (p.key !== 'char') return;
    if (p.char === 'F') return this.pcFire(pc);
    if (p.char === 'C') {
      if (!pc.c.spellPoints) return this.say(`${pc.c.name} CANNOT CAST SPELLS`);
      if (this.castable.length === 0) return this.say('NOT ENOUGH SPELL POINTS');
      this.phase = 'spell';
      return this.say('CHOOSE A SPELL');
    }
    if (p.char === 'U') return this.pcPotion(pc);
    if (p.char === 'R') return this.tryFlee();
  }

  private onParley(p: KeyPress): void {
    if (p.key === 'enter') return this.startCombat();
    if (p.key === 'char' && p.char === 'T') return this.talk();
    if (p.key === 'char' && p.char === 'R') return this.tryFlee();
  }

  private onDemand(p: KeyPress): void {
    if (p.key === 'char' && p.char === 'Y') {
      this.party.gold -= this.demand;
      this.contents.peaceful = true;
      this.phase = 'peace';
      return this.say(`YOU PAY ${this.demand} GOLD. THEY LET YOU BE`);
    }
    if ((p.key === 'char' && p.char === 'N') || p.key === 'back') {
      this.say('THEY ATTACK!');
      return this.startCombat();
    }
  }

  private onSpell(p: KeyPress): void {
    if (p.key === 'back') {
      this.phase = 'pcTurn';
      return this.say('');
    }
    if (p.key !== 'char') return;
    const spell = this.castable.find((s) => s.key === p.char);
    if (spell) this.cast(this.activePc as PcUnit, spell);
  }

  // ---- parley ----------------------------------------------------------------

  private monsterGroups(): string[] {
    const counts = new Map<string, number>();
    for (const u of this.monsters) counts.set(u.def.id, (counts.get(u.def.id) ?? 0) + 1);
    return [...counts].map(([id, n]) => groupName(getMonster(id), n));
  }

  private talk(): void {
    const leader = this.monsters[0];
    const options = leader?.def.talk ?? [];
    if (options.length === 0) {
      this.say('THEY WILL NOT TALK. THEY ATTACK!');
      return this.startCombat();
    }
    const total = options.reduce((s, o) => s + o.weight, 0);
    let r = this.rng.int(1, total);
    const pick = options.find((o) => (r -= o.weight) <= 0) ?? options[0];
    switch (pick.outcome) {
      case 'pass':
        this.contents.peaceful = true;
        this.phase = 'peace';
        return this.say('THEY LET YOU PASS');
      case 'give_hint':
        this.contents.peaceful = true;
        this.phase = 'peace';
        return this.say(pick.message ?? 'THEY SHARE A RUMOR');
      case 'demand_gold': {
        const amount = Math.max(1, roll(pick.gold ?? '1d10', this.rng));
        if (this.party.gold < amount) {
          this.say(`THEY WANT ${amount} GOLD YOU LACK!`);
          return this.startCombat();
        }
        this.demand = amount;
        this.phase = 'demand';
        return this.say(`THEY DEMAND ${amount} GOLD. PAY? Y/N`);
      }
      default:
        this.say('THEY ATTACK!');
        return this.startCombat();
    }
  }

  // ---- rounds ----------------------------------------------------------------

  private startCombat(): void {
    this.newRound();
  }

  private newRound(): void {
    this.round++;
    const units: { u: Unit; init: number }[] = [
      ...this.livingPcs.map((u) => ({ u: u as Unit, init: u.c.stats.dexterity + this.rng.int(1, 6) })),
      ...this.monsters.map((u) => ({ u: u as Unit, init: 10 + u.def.attack + this.rng.int(1, 6) })),
    ];
    units.sort((a, b) => b.init - a.init);
    this.order = units.map((x) => x.u);
    this.turn = -1;
    this.nextTurn();
  }

  private nextTurn(): void {
    if (this.checkEnd()) return;
    for (;;) {
      this.turn++;
      if (this.turn >= this.order.length) return this.newRound();
      const u = this.order[this.turn];
      const alive = u.kind === 'pc' ? u.c.hp.current > 0 : u.m.hp > 0;
      if (!alive) continue;
      if (u.kind === 'pc') {
        if (u.c.status.includes('poisoned')) {
          hurt(u.c, POISON_DAMAGE);
          this.say(u.c.hp.current === 0 ? `${u.c.name} IS DISABLED BY POISON!` : `${u.c.name} SUFFERS FROM POISON`);
          if (u.c.hp.current === 0) {
            if (this.checkEnd()) return;
            continue;
          }
        }
        this.phase = 'pcTurn';
        this.movesLeft = MOVES_PER_TURN;
      } else {
        this.phase = 'monsterTurn';
      }
      return;
    }
  }

  private endTurn(): void {
    this.nextTurn();
  }

  private checkEnd(): boolean {
    if (this.livingPcs.length === 0) {
      this.phase = 'defeat';
      this.say('YOUR PARTY HAS FALLEN');
      return true;
    }
    if (this.monsters.length === 0) {
      this.win();
      return true;
    }
    return false;
  }

  private win(): void {
    let xp = 0;
    let gold = 0;
    for (const m of this.contents.monsters) {
      const def = getMonster(m.monsterId);
      xp += def.xp;
      if (def.gold) gold += Math.max(0, roll(def.gold, this.rng));
    }
    this.xpWon = xp;
    this.goldWon = gold;
    this.party.gold += gold;
    this.phase = 'victory';
    this.say(`VICTORY! ${gold} GOLD FOUND`);
  }

  // ---- party actions ---------------------------------------------------------

  private pcStep(pc: PcUnit, dx: number, dy: number): void {
    const x = pc.x + dx;
    const y = pc.y + dy;
    const target = this.monsters.find((u) => u.m.x === x && u.m.y === y);
    if (target) {
      this.melee(pc, target);
      return this.endTurn();
    }
    if (this.movesLeft <= 0) return this.say('NO MOVES LEFT. ENTER ENDS TURN');
    if (!inRoom(this.room, x, y) || cellAt(this.floor, x, y) !== CELL.room || this.occupied(x, y)) return;
    pc.x = x;
    pc.y = y;
    this.movesLeft--;
  }

  private meleeSkill(c: Character): number {
    return c.level + statBonus(c.stats.strength) + (equippedItem(c, 'weapon')?.weapon?.hitBonus ?? 0);
  }

  private pcDefense(c: Character): number {
    return armorDefense(c) + statBonus(c.stats.dexterity);
  }

  private melee(pc: PcUnit, target: MonsterUnit): void {
    const w = equippedItem(pc.c, 'weapon')?.weapon;
    const damage = w && !w.ranged ? w.damage : '1d2';
    this.attackMonster(pc, target, this.meleeSkill(pc.c), damage, statBonus(pc.c.stats.strength), 'HITS');
  }

  private attackMonster(pc: PcUnit, t: MonsterUnit, skill: number, damage: string, bonus: number, verb: string): void {
    const name = t.def.name.toUpperCase();
    if (this.rng.int(1, 100) > hitChance(skill, t.def.defense)) {
      this.sounds.push('miss');
      return this.say(`${pc.c.name} MISSES THE ${name}`);
    }
    const dmg = Math.max(1, roll(damage, this.rng) + bonus);
    t.m.hp = Math.max(0, t.m.hp - dmg);
    this.sounds.push(t.m.hp === 0 ? 'monster_die' : 'hit');
    if (t.m.hp === 0) pc.c.xp += t.def.xp;
    this.say(t.m.hp === 0 ? `${pc.c.name} SLAYS THE ${name}! +${t.def.xp} XP` : `${pc.c.name} ${verb} ${name} FOR ${dmg}`);
  }

  private nearestMonster(from: Point, range: number): MonsterUnit | undefined {
    return this.monsters
      .filter((u) => dist(from, u.m) <= range)
      .sort((a, b) => dist(from, a.m) - dist(from, b.m))[0];
  }

  private pcFire(pc: PcUnit): void {
    const w = equippedItem(pc.c, 'weapon')?.weapon;
    if (!w?.ranged) return this.say(`${pc.c.name} HAS NO BOW`);
    if (!this.canFire(pc)) return this.say('OUT OF ARROWS');
    const target = this.nearestMonster(pc, w.range);
    if (!target) return this.say('NOTHING IN RANGE');
    if (w.ammoItemId) {
      const ammo = pc.c.inventory.find((i) => i.itemId === w.ammoItemId)!;
      ammo.quantity = (ammo.quantity ?? 1) - 1;
      if (ammo.quantity <= 0) pc.c.inventory.splice(pc.c.inventory.indexOf(ammo), 1);
    }
    const skill = pc.c.level + statBonus(pc.c.stats.dexterity) + w.hitBonus;
    this.sounds.push('shoot');
    this.attackMonster(pc, target, skill, w.damage, 0, 'SHOOTS');
    this.endTurn();
  }

  private pcPotion(pc: PcUnit): void {
    const inst = pc.c.inventory.find((i) => i.itemId === 'healing_potion');
    if (!inst) return this.say('NO HEALING POTION');
    const amount = getItem('healing_potion').effect?.amount ?? '2d6';
    const n = heal(pc.c, roll(amount, this.rng));
    inst.quantity = (inst.quantity ?? 1) - 1;
    if (inst.quantity <= 0) pc.c.inventory.splice(pc.c.inventory.indexOf(inst), 1);
    this.sounds.push('fountain');
    this.say(`${pc.c.name} DRINKS A POTION (+${n})`);
    this.endTurn();
  }

  private cast(pc: PcUnit, spell: SpellDef): void {
    const sp = pc.c.spellPoints;
    if (!sp || sp.current < spell.cost) return;
    this.sounds.push('cast');
    if (spell.target === 'ally') {
      // Includes disabled players, who are off the field but still with the party.
      const hurtMost = [...this.party.members].sort((a, b) => a.hp.current / a.hp.max - b.hp.current / b.hp.max)[0];
      sp.current -= spell.cost;
      const n = heal(hurtMost, roll(spell.amount, this.rng));
      this.say(`${pc.c.name} HEALS ${hurtMost.name} (+${n})`);
    } else {
      const targets = spell.target === 'all_enemies' ? this.monsters : [this.nearestMonster(pc, spell.range)].filter(Boolean);
      if (targets.length === 0) {
        this.phase = 'pcTurn';
        return this.say('NO TARGET IN RANGE');
      }
      sp.current -= spell.cost;
      let slain = 0;
      for (const t of targets as MonsterUnit[]) {
        t.m.hp = Math.max(0, t.m.hp - Math.max(1, roll(spell.amount, this.rng)));
        if (t.m.hp === 0) {
          slain++;
          pc.c.xp += t.def.xp;
        }
      }
      if (slain) this.sounds.push('monster_die');
      this.say(`${spell.name.toUpperCase()}!${slain ? ` ${slain} SLAIN` : ''}`);
    }
    this.phase = 'pcTurn';
    this.endTurn();
  }

  private tryFlee(): void {
    if (this.rng.int(1, 100) <= FLEE_CHANCE) {
      this.phase = 'fled';
      return this.say('YOU ESCAPE THE ROOM!');
    }
    this.say('YOU CANNOT GET AWAY!');
    if (this.round === 0) return this.startCombat();
    this.endTurn();
  }

  // ---- monsters --------------------------------------------------------------

  /**
   * Runs the current monster's turn. Returns false when it isn't a monster's
   * turn (so the screen knows to wait for the player).
   */
  advance(): boolean {
    if (this.phase !== 'monsterTurn') return false;
    const u = this.active as MonsterUnit;
    this.monsterAct(u);
    this.nextTurn();
    return true;
  }

  private monsterAct(u: MonsterUnit): void {
    const targets = this.livingPcs;
    if (targets.length === 0) return;
    const adjacent = targets.filter((t) => dist(t, u.m) === 1);
    if (adjacent.length) return this.monsterHit(u, adjacent[this.rng.int(0, adjacent.length - 1)], u.def.damage, 'HITS');

    const nearest = targets.sort((a, b) => dist(a, u.m) - dist(b, u.m))[0];
    const shooter = u.def.ranged ?? (u.def.behavior === 'caster' ? { damage: '2d4', range: 6 } : null);
    if (shooter && dist(nearest, u.m) <= shooter.range) {
      return this.monsterHit(u, nearest, shooter.damage, u.def.behavior === 'caster' ? 'BLASTS' : 'SHOOTS');
    }
    // Walk toward the nearest character, then strike if it got close enough.
    for (let s = 0; s < u.def.move; s++) {
      const step = this.stepToward(u.m, nearest);
      if (!step) break;
      u.m.x = step.x;
      u.m.y = step.y;
      if (dist(nearest, u.m) === 1) return this.monsterHit(u, nearest, u.def.damage, 'HITS');
    }
    this.say(`THE ${u.def.name.toUpperCase()} ADVANCES`);
  }

  private monsterHit(u: MonsterUnit, t: PcUnit, damage: string, verb: string): void {
    const name = u.def.name.toUpperCase();
    if (verb === 'SHOOTS') this.sounds.push('shoot');
    else if (verb === 'BLASTS') this.sounds.push('cast');
    if (this.rng.int(1, 100) > hitChance(u.def.attack + attackBonusAt(this.difficulty, this.floor.depth), this.pcDefense(t.c))) {
      this.sounds.push('miss');
      return this.say(`THE ${name} MISSES ${t.c.name}`);
    }
    const n = hurt(t.c, Math.max(1, roll(damage, this.rng) + this.difficulty.damageBonus));
    if (t.c.hp.current === 0) {
      this.sounds.push('hero_die');
      return this.say(`${t.c.name} IS DISABLED!`);
    }
    this.sounds.push('hit');
    let extra = '';
    if (u.def.specials.includes('poison') && !t.c.status.includes('poisoned') && this.rng.int(1, 100) <= POISON_CHANCE) {
      t.c.status.push('poisoned');
      extra = ' POISONED!';
    }
    if (u.def.specials.includes('drain_xp') && drainXp(t.c, DRAIN_FRACTION) > 0) extra += ' DRAINED!';
    this.say(`${name} ${verb} ${t.c.name} FOR ${n}.${extra}`);
  }

  /** One square closer to the target through free room squares (8 directions). */
  private stepToward(from: Point, to: Point): Point | null {
    let best: Point | null = null;
    let bestD = dist(from, to);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const p = { x: from.x + dx, y: from.y + dy };
        if ((dx === 0 && dy === 0) || !inRoom(this.room, p.x, p.y) || this.occupied(p.x, p.y)) continue;
        const d = dist(p, to);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best;
  }

  // ---- setup -----------------------------------------------------------------

  /** Puts conscious characters on the entry square and the nearest free squares around it. */
  private placeParty(entry: Point): PcUnit[] {
    const taken = new Set(this.contents.monsters.filter((m) => m.hp > 0).map((m) => `${m.x},${m.y}`));
    const queue: Point[] = [entry];
    const seen = new Set([`${entry.x},${entry.y}`]);
    const spots: Point[] = [];
    while (queue.length && spots.length < this.party.members.length) {
      const p = queue.shift() as Point;
      if (inRoom(this.room, p.x, p.y) && !taken.has(`${p.x},${p.y}`)) spots.push(p);
      for (const d of DIRS) {
        const n = { x: p.x + STEP[d].dx, y: p.y + STEP[d].dy };
        const k = `${n.x},${n.y}`;
        if (!seen.has(k) && inRoom(this.room, n.x, n.y)) {
          seen.add(k);
          queue.push(n);
        }
      }
    }
    return this.party.members
      .filter((c) => c.hp.current > 0)
      .map((c, i) => ({ kind: 'pc' as const, id: c.id, c, x: spots[i]?.x ?? entry.x, y: spots[i]?.y ?? entry.y }));
  }

  private say(msg: string): void {
    if (!msg) return;
    this.log.push(msg);
    if (this.log.length > 20) this.log.shift();
  }
}
