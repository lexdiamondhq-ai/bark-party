// The JS thread's half of frame timing: how many simulation steps each game-loop tick runs.
//
// The loop runs in requestAnimationFrame. In RN 0.86 that is a zero-delay timer fired by a 60 Hz display
// link and stamped with performance.now() when the JS thread gets to it, so each stamp is a vsync plus a
// delay of anything from a fraction of a millisecond to many (sounds, React renders and native events all
// queue on the same thread). Elapsed time is therefore counted in whole display frames, two per step, on a
// grid that follows the stamps' average timing: a stamp a few milliseconds late still counts as the frame it
// belongs to, one late enough to round up counts a frame extra that the next stamp gives back, and a display
// that runs a hair off 60 Hz moves the grid with it instead of piling up an error.
// (The first version added the raw float gaps and snapped one within 4 ms to a step; one late stamp could leave
// the sum just under a step, and from then on small delays made a 2-step tick and a 0-step tick.)
// frameTiming.test.ts plays both against phone-like timing.

import { STEP } from '../constants';

/** One 120 Hz display frame, ms: the grid that frame lengths are counted on. */
export const GRID_MS = 1000 / 120;
/** Display frames per simulation step. */
export const PER_STEP = Math.round((STEP * 1000) / GRID_MS);
/** How far the grid moves toward each stamp: far enough to follow a slow drift, too little for one late stamp to matter. */
const FOLLOW = 1 / 16;

export interface StepClock {
  /** The grid time the last stamp was counted to, ms. */
  at: number;
  started: boolean;
  /** Display frames counted but not stepped yet (0 or 1 between ticks: half a step). */
  owed: number;
}

export function newStepClock(): StepClock {
  return { at: 0, started: false, owed: 0 };
}

/** Whole display frames since the last stamp. Call it on every tick, running or not, so the grid keeps its phase. */
export function countFrames(c: StepClock, now: number): number {
  if (!c.started) {
    c.started = true;
    c.at = now;
    return 0;
  }
  const n = Math.max(0, Math.round((now - c.at) / GRID_MS));
  c.at += n * GRID_MS;
  c.at += (now - c.at) * FOLLOW;
  return n;
}

/**
 * Steps to run for `frames` newly counted frames, at most `max`. After a stall longer than that the world
 * waits instead of racing ahead: the rest is dropped, keeping only the half step that sets where between two
 * steps the next tick falls.
 */
export function takeSteps(c: StepClock, frames: number, max: number): number {
  c.owed += frames;
  const steps = Math.min(max, Math.floor(c.owed / PER_STEP));
  c.owed -= steps * PER_STEP;
  if (c.owed >= PER_STEP) c.owed %= PER_STEP;
  return steps;
}

/** Paused, game over or the count-in: nothing is owed, and the grid keeps counting (countFrames). */
export function holdSteps(c: StepClock) {
  c.owed = 0;
}
