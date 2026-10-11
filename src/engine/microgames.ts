import { CoachId, WORLDS, WorldId } from './cast';

export type Gesture = 'drag' | 'tap' | 'hold' | 'swipe' | 'flick' | 'hands-off';

export type MicrogameId =
  | 'catch'
  | 'dodge'
  | 'shh'
  | 'sniff'
  | 'shake'
  | 'fetch'
  | 'dontBark'
  | 'wipe'
  | 'hatOn'
  | 'coachSays'
  | 'squirrel';

export interface Microgame {
  id: MicrogameId;
  /** The command shown on the card. */
  command: string;
  /** One short line under the command, in Bricolage. */
  hint: string;
  gesture: Gesture;
  world: WorldId;
  coach: CoachId;
  /** True when the player wins by surviving to the end (Dodge!, Don't bark!). */
  winsOnTimeout: boolean;
  boss: boolean;
  /** Play time at speed 1. The guide sets 3,000 ms for every microgame. */
  basePlayMs: number;
}

const BASE_PLAY_MS = 3000;
// The guide gives no boss length. The prototype's Squirrel! runs 9 s, so that stays until Alex says otherwise.
const BOSS_PLAY_MS = 9000;

function game(
  id: MicrogameId,
  command: string,
  hint: string,
  gesture: Gesture,
  world: WorldId,
  extra: Partial<Pick<Microgame, 'coach' | 'winsOnTimeout' | 'boss' | 'basePlayMs'>> = {},
): Microgame {
  return {
    id,
    command,
    hint,
    gesture,
    world,
    coach: extra.coach ?? WORLDS[world].coach,
    winsOnTimeout: extra.winsOnTimeout ?? false,
    boss: extra.boss ?? false,
    basePlayMs: extra.basePlayMs ?? BASE_PLAY_MS,
  };
}

/** Worlds per the guide's world table; gestures and hints from the playable prototype. */
export const MICROGAMES: Readonly<Record<MicrogameId, Microgame>> = {
  catch: game('catch', 'Catch!', 'Drag', 'drag', 'park'),
  dodge: game('dodge', 'Dodge!', 'Tap to jump', 'tap', 'bath', { winsOnTimeout: true }),
  shh: game('shh', 'Shh!', 'Hold to tiptoe', 'hold', 'living'),
  sniff: game('sniff', 'Sniff!', 'Follow the treat', 'tap', 'kitchen'),
  shake: game('shake', 'Shake!', 'Swipe fast', 'swipe', 'backyard'),
  fetch: game('fetch', 'Fetch!', 'Flick up', 'flick', 'backyard'),
  dontBark: game('dontBark', "Don't bark!", 'Hands off', 'hands-off', 'living', { winsOnTimeout: true }),
  wipe: game('wipe', 'Wipe!', 'Scrub the mud', 'swipe', 'kitchen'),
  hatOn: game('hatOn', 'Hat on!', 'Tap to drop', 'tap', 'disco', { coach: 'leo' }),
  coachSays: game('coachSays', 'Coach says', 'Tap only on SIT', 'tap', 'living'),
  squirrel: game('squirrel', 'Squirrel!', 'Tap it 5 times', 'tap', 'park', {
    coach: 'leo',
    boss: true,
    basePlayMs: BOSS_PLAY_MS,
  }),
};

/** Every non-boss microgame, in the order the deck is built from. */
export const ROTATION: readonly MicrogameId[] = (Object.keys(MICROGAMES) as MicrogameId[]).filter(
  (id) => !MICROGAMES[id].boss,
);

export const BOSS_ID: MicrogameId = 'squirrel';

/**
 * Commands that break the guide's command rule today. "Coach says" is the prototype's name and
 * has no "!". Kept as-is until Alex picks a name.
 */
export const COMMAND_RULE_EXCEPTIONS: readonly MicrogameId[] = ['coachSays'];

/** The guide's command rule: one or two words, 11 characters max, ends in "!". */
export function isValidCommand(command: string): boolean {
  const words = command.trim().split(/\s+/);
  return command.length <= 11 && command.endsWith('!') && words.length >= 1 && words.length <= 2;
}
