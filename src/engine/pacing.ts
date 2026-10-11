// Speed, difficulty and round timing. Values come from the style guide's timing table
// unless a comment says otherwise.

export const MAX_SPEED = 2;
/** Solo speeds up every 4th round. */
export const SOLO_ROUNDS_PER_STEP = 4;
/**
 * The guide says "10% every 4th round"; the prototype used 0.13x a step. Settled on the guide,
 * read as +0.1x a step (not compounding), so 2x arrives at round 41.
 */
export const SOLO_SPEED_STEP = 0.1;
/** Party speeds up once per full trip round the table. From the prototype; the guide is silent. */
export const PARTY_SPEED_STEP = 0.15;

export const TIMING = {
  handoffHoldMs: 700,
  commandCardMs: 800,
  verdictLoseMs: 700,
  verdictWinMs: 900,
  /** Playtime never drops below this, whatever the speed. */
  minPlayMs: 1500,
} as const;

/** Rounds are 1-based. Rounds 1 to 4 run at 1x, 5 to 8 at 1.1x, and so on, capped at 2x. */
export function soloSpeed(round: number): number {
  assertRound(round);
  const steps = Math.floor((round - 1) / SOLO_ROUNDS_PER_STEP);
  return roundTo(Math.min(MAX_SPEED, 1 + SOLO_SPEED_STEP * steps), 2);
}

/** True on the first round of a new speed step, when the FASTER! beat plays. */
export function isSoloSpeedUp(round: number): boolean {
  return round > 1 && soloSpeed(round) > soloSpeed(round - 1);
}

/** Rotation counts completed trips round the table, starting at 0. */
export function partySpeed(rotation: number): number {
  if (!Number.isInteger(rotation) || rotation < 0) throw new RangeError(`bad rotation ${rotation}`);
  return roundTo(Math.min(MAX_SPEED, 1 + PARTY_SPEED_STEP * rotation), 2);
}

/** 0 to 1. Games use it to add obstacles; speed handles time. From the prototype. */
export function soloDifficulty(round: number): number {
  assertRound(round);
  return Math.min(1, (round - 1) / 16);
}

export function partyDifficulty(rotation: number): number {
  return Math.min(1, Math.max(0, rotation) / 5);
}

/** Play time for a microgame at a speed: 3,000 ms at 1x down to 1,500 ms at 2x. */
export function playMs(basePlayMs: number, speed: number): number {
  if (speed <= 0) throw new RangeError('speed must be positive');
  const floor = Math.min(basePlayMs, TIMING.minPlayMs);
  return Math.max(floor, Math.round(basePlayMs / speed));
}

function assertRound(round: number) {
  if (!Number.isInteger(round) || round < 1) throw new RangeError(`bad round ${round}`);
}

function roundTo(n: number, places: number) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
