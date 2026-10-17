import { getRace } from './rules.ts';
import type { Party } from './party.ts';
import { heal, living } from '../rooms/contents.ts';

/**
 * Food and healing over time (manual p.19, "Timers"): every so many steps
 * the party eats, and while rations last, wounded and disabled players heal
 * a little. Halflings stretch the rations (this remake's race extension).
 * Running out of rations stops the healing; the manual describes no other
 * penalty. [CALIBRATE: steps, ration use, and HP healed per meal]
 */
export const STEPS_PER_FOOD = 10;
export const HEAL_PER_MEAL = 1;
export const LOW_FOOD = 5;
const HALFLING_SAVING = 0.1;
const MAX_SAVING = 0.25;

export function stepsPerFood(party: Party): number {
  const halflings = living(party).filter((m) => m.raceId && getRace(m.raceId).perks.includes('eats_less')).length;
  const saving = Math.min(MAX_SAVING, halflings * HALFLING_SAVING);
  return Math.round(STEPS_PER_FOOD / (1 - saving));
}

/**
 * Called after every step. Returns a message when something worth telling
 * happens (a meal leaves food low, or there is nothing left to eat), else ''.
 */
export function eatIfDue(party: Party): string {
  if (party.stepsTaken === 0 || party.stepsTaken % stepsPerFood(party) !== 0) return '';
  if (party.food <= 0) {
    return party.members.some((m) => m.hp.current < m.hp.max) ? 'NO RATIONS: WOUNDS WILL NOT HEAL' : '';
  }
  party.food--;
  for (const m of party.members) if (m.hp.current < m.hp.max) heal(m, HEAL_PER_MEAL);
  if (party.food === 0) return 'YOUR LAST RATIONS ARE GONE!';
  return party.food <= LOW_FOOD ? `FOOD IS RUNNING LOW (${party.food})` : '';
}
