import type { Character } from './character.ts';

/** Party state, matching schemas/party.schema.json. */
export interface Party {
  members: Character[];
  gold: number;
  food: number;
  depth: number;
  position: { x: number; y: number };
  facing: 'n' | 'e' | 's' | 'w';
  stepsTaken: number;
  racesEnabled: boolean;
  /** Counter for unique item instance ids. */
  nextItemId: number;
  questFlags: Record<string, boolean | number | string>;
}

export const MIN_PARTY = 1;
export const MAX_PARTY = 4;

/** Starting purse and rations until scenarios supply their own. [CALIBRATE] */
export const DEFAULT_START = { gold: 300, food: 20 } as const;

export function createParty(
  members: Character[],
  opts: { racesEnabled: boolean; gold?: number; food?: number },
): Party {
  if (members.length < MIN_PARTY || members.length > MAX_PARTY) {
    throw new RangeError(`party needs ${MIN_PARTY}-${MAX_PARTY} members, got ${members.length}`);
  }
  return {
    members,
    gold: opts.gold ?? DEFAULT_START.gold,
    food: opts.food ?? DEFAULT_START.food,
    depth: 1,
    position: { x: 0, y: 0 },
    facing: 'n',
    stepsTaken: 0,
    racesEnabled: opts.racesEnabled,
    nextItemId: 1,
    questFlags: {},
  };
}
