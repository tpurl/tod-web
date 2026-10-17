import type { KeyPress } from '../../engine/input/keyboard.ts';
import { createRng, type Rng } from '../../engine/rng.ts';
import { CombatModel } from '../combat/combat.ts';
import { createDungeon, getView } from '../dungeon/dungeon.ts';
import { STEP } from '../dungeon/floor.ts';
import { addItem, toggleEquip } from '../items/inventory.ts';
import { createCharacter, rollStats } from '../party/character.ts';
import { levelUp } from '../party/leveling.ts';
import { createParty, type Party } from '../party/party.ts';
import type { ClassId } from '../party/rules.ts';
import { getDifficulty, type Difficulty } from '../scenario/difficulty.ts';
import { populateFloor } from '../rooms/contents.ts';

/**
 * Balance simulator: a fresh, store-equipped party of four fights every
 * monster room on a floor, across many generated dungeons, playing a simple
 * sensible policy (walk at the nearest monster and hit it; wizards cast Bolt
 * while they can). Used to tune data/difficulties.json and, in a test, to
 * keep each difficulty level inside its intended band.
 */
export interface FloorStats {
  depth: number;
  fights: number;
  /** Fraction of fights the party won. */
  winRate: number;
  /** Party HP left after the fight, as a fraction of max (losses count as 0). */
  hpLeft: number;
  rounds: number;
}

const K = (key: KeyPress['key'], char?: string): KeyPress => (char ? { key, char, repeat: false } : { key, repeat: false });

const LINEUP: readonly [ClassId, string[]][] = [
  ['fighter', ['sword', 'chain_mail', 'shield']],
  ['fighter', ['sword', 'leather_armor', 'shield']],
  ['rogue', ['sword', 'leather_armor']],
  ['wizard', ['dagger', 'robe']],
];

/** Four adventurers at a given level with typical store gear. */
export function simParty(rng: Rng, level: number): Party {
  const p = createParty(
    LINEUP.map(([cls], i) => createCharacter({ id: `s${i}`, name: `S${i}`, classId: cls, raceId: null, baseStats: rollStats(rng) })),
    { racesEnabled: false },
  );
  p.members.forEach((m, i) => {
    for (const item of LINEUP[i][1]) toggleEquip(m, addItem(p, m, item).instance!.instanceId);
    for (let l = 1; l < level; l++) levelUp(m, rng);
  });
  return p;
}

/** Plays a fight to the end with the simulator's policy. */
export function autoFight(m: CombatModel, maxSteps = 4000): void {
  m.onKey(K('enter'));
  for (let i = 0; i < maxSteps && !m.over; i++) {
    if (m.phase === 'monsterTurn') {
      m.advance();
      continue;
    }
    const pc = m.activePc;
    if (!pc) {
      m.onKey(K('enter'));
      continue;
    }
    const turn = m.active;
    if (pc.c.spellPoints && pc.c.spellPoints.current >= 2) {
      m.onKey(K('char', 'C'));
      if (m.phase === 'spell') m.onKey(K('char', '1'));
      if (m.phase === 'spell') m.onKey(K('back'));
      if (m.active !== turn) continue;
    }
    const d = (a: { x: number; y: number }) => Math.max(Math.abs(a.x - pc.x), Math.abs(a.y - pc.y));
    const target = [...m.monsters].sort((a, b) => d(a.m) - d(b.m))[0];
    if (!target) break;
    const dx = Math.sign(target.m.x - pc.x);
    const dy = Math.sign(target.m.y - pc.y);
    const keys: KeyPress['key'][] = [];
    if (dx) keys.push(dx > 0 ? 'right' : 'left');
    if (dy) keys.push(dy > 0 ? 'down' : 'up');
    // Try to step (or strike) along each axis, twice over: step, then strike.
    for (let pass = 0; pass < 2; pass++) for (const k of keys) if (m.active === turn && m.phase === 'pcTurn') m.onKey(K(k));
    if (m.active === turn && m.phase === 'pcTurn') m.onKey(K('enter'));
  }
}

export function simulateFloor(depth: number, difficulty: Difficulty, dungeons: number, seed = 1): FloorStats {
  const rng = createRng(seed * 7919 + depth);
  let fights = 0;
  let wins = 0;
  let hp = 0;
  let rounds = 0;
  for (let n = 0; n < dungeons; n++) {
    const d = createDungeon(n * 7 + seed, Math.max(5, depth), null, difficulty.id);
    const v = getView(d, depth);
    // Rooms come from these exact settings, so trial values can be tested before they go in the data file.
    const contents = populateFloor(v.floor, createRng(n * 31 + depth), null, difficulty);
    for (const c of contents) {
      if (!c.monsters.length) continue;
      const door = v.floor.doors.find((x) => x.roomId === c.roomId);
      if (!door) continue;
      const party = simParty(rng, depth);
      const model = new CombatModel({
        party,
        contents: JSON.parse(JSON.stringify(c)),
        room: v.floor.rooms[c.roomId],
        floor: v.floor,
        entry: { x: door.x + STEP[door.side].dx, y: door.y + STEP[door.side].dy },
        rng,
        difficulty,
      });
      autoFight(model);
      fights++;
      rounds += model.round;
      if (model.phase === 'victory') {
        wins++;
        hp += party.members.reduce((s, m) => s + m.hp.current, 0) / party.members.reduce((s, m) => s + m.hp.max, 0);
      }
    }
  }
  return { depth, fights, winRate: wins / fights, hpLeft: hp / fights, rounds: rounds / fights };
}

export function simulate(difficultyId: Difficulty['id'], dungeons = 60, floors = 5): FloorStats[] {
  const diff = getDifficulty(difficultyId);
  return Array.from({ length: floors }, (_, i) => simulateFloor(i + 1, diff, dungeons));
}
