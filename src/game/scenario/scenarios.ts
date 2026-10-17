import scenarioData from '../../../data/scenarios.json';
import { getItem } from '../items/items.ts';
import { getMonster } from '../monsters/monsters.ts';
import type { Party } from '../party/party.ts';

/**
 * Scenarios: how deep the dungeon goes, what the party starts with, and
 * what counts as winning. Loaded from data/scenarios.json.
 */
export type GoalType = 'collect_gold' | 'retrieve_and_rescue';

export interface ScenarioGoal {
  type: GoalType;
  goldTarget?: number;
  captiveName?: string;
  itemId?: string;
  targetFloor?: number;
  /** Monster that guards the quest room. */
  guardian?: string;
}

export interface ScenarioDef {
  id: string;
  title: string;
  blurb: string;
  intro: string;
  floors: number;
  start: { gold: number; food: number };
  goal: ScenarioGoal;
}

/** What the dungeon generator needs to place the quest. */
export interface QuestSpec {
  floor: number;
  captiveName: string;
  itemId: string;
  guardian: string;
}

export function validateScenarios(raw: unknown): ScenarioDef[] {
  const list = (raw as { scenarios?: unknown }).scenarios;
  if (!Array.isArray(list) || list.length === 0) throw new Error('scenarios.json: no scenarios');
  return list.map((s: Record<string, unknown>) => {
    const id = String(s.id);
    const floors = Number((s.floors as { count?: unknown })?.count);
    if (!Number.isInteger(floors) || floors < 1) throw new Error(`scenarios.json: bad floor count on ${id}`);
    const start = s.start as { gold: number; food: number };
    const goal = s.goal as ScenarioGoal;
    if (goal.type === 'collect_gold') {
      if (!(Number(goal.goldTarget) > 0)) throw new Error(`scenarios.json: ${id} needs goldTarget`);
    } else if (goal.type === 'retrieve_and_rescue') {
      if (!goal.captiveName || !goal.itemId || !goal.targetFloor) throw new Error(`scenarios.json: ${id} quest is incomplete`);
      if (goal.targetFloor > floors) throw new Error(`scenarios.json: ${id} quest floor is below the dungeon`);
      getItem(goal.itemId);
      if (goal.guardian) getMonster(goal.guardian);
    } else throw new Error(`scenarios.json: bad goal type on ${id}`);
    return {
      id,
      title: String(s.title),
      blurb: String(s.blurb ?? ''),
      intro: String(s.intro ?? ''),
      floors,
      start: { gold: Number(start?.gold ?? 300), food: Number(start?.food ?? 20) },
      goal,
    };
  });
}

export const SCENARIOS: readonly ScenarioDef[] = validateScenarios(scenarioData);

export function getScenario(id: string): ScenarioDef {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scenario ${id}`);
  return s;
}

export function questSpec(s: ScenarioDef): QuestSpec | null {
  const g = s.goal;
  if (g.type !== 'retrieve_and_rescue') return null;
  return { floor: g.targetFloor as number, captiveName: g.captiveName as string, itemId: g.itemId as string, guardian: g.guardian ?? 'wraith' };
}

/** Party flags the quest sets. */
export const FLAG_CAPTIVE = 'captiveFreed';
export const FLAG_ITEM = 'questItemTaken';

/** True when the party has done everything the scenario asks (checked on leaving the dungeon). */
export function goalMet(s: ScenarioDef, party: Party): boolean {
  if (s.goal.type === 'collect_gold') return party.gold >= (s.goal.goldTarget ?? 0);
  return party.questFlags[FLAG_CAPTIVE] === true && party.questFlags[FLAG_ITEM] === true;
}

/** One- or two-line progress summary for the entrance screen. */
export function goalProgress(s: ScenarioDef, party: Party): string[] {
  if (s.goal.type === 'collect_gold') {
    return [`GOAL: ${s.goal.goldTarget} GOLD TO THE SURFACE`, `YOU CARRY ${party.gold} GOLD`];
  }
  const king = party.questFlags[FLAG_CAPTIVE] ? 'FREED' : 'NOT FOUND';
  const item = party.questFlags[FLAG_ITEM] ? 'FOUND' : 'NOT FOUND';
  return [`${s.goal.captiveName}: ${king}`, `${getItem(s.goal.itemId as string).name.toUpperCase()}: ${item}`];
}
