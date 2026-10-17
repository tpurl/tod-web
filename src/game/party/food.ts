import { getRace } from './rules.ts';
import type { Party } from './party.ts';
import { hurt, living } from '../rooms/contents.ts';

/**
 * Food (DESIGN.md section 8.1): the party eats one ration every so many
 * steps; halflings stretch it. With no food left, everyone loses HP on
 * each meal they miss. [CALIBRATE]
 */
export const STEPS_PER_FOOD = 10;
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
 * happens (a meal leaves food low, or the party starves), else ''.
 */
export function eatIfDue(party: Party): string {
  if (party.stepsTaken === 0 || party.stepsTaken % stepsPerFood(party) !== 0) return '';
  if (party.food > 0) {
    party.food--;
    if (party.food === 0) return 'YOUR LAST RATIONS ARE GONE!';
    return party.food <= LOW_FOOD ? `FOOD IS RUNNING LOW (${party.food})` : '';
  }
  for (const m of living(party)) hurt(m, 1);
  return 'YOU ARE STARVING!';
}
