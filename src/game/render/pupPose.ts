// Which puppet frames to show for the hero, and how much of each, so the legs and tail move
// continuously instead of cutting from frame to frame. Pure maths, no Skia, so it runs in tests.
// The frame logic follows the Dog Better pup (src/engine/pupPuppet.ts there), which this art comes from.

import { PUP_LEG_FRAMES, PUP_TAIL_FRAMES } from '../sprites';
import type { Hero } from '../sim/types';

/** Stride frames with the legs gathered under the body: shown rising, then falling. */
export const TUCK_UP = 12;
export const TUCK_DOWN = 36;
/** Seconds to fade from the stride to the tuck when leaving the ground, and back when landing. */
export const TUCK_BLEND = 0.08;
/** Tail wags per second while running, as in Dog Better. */
export const WAG_HZ = 2.4;

export interface PupPose {
  /** Stride frames: `legA` shows fully, `legB` on top at `legT`. */
  legA: number;
  legB: number;
  legT: number;
  /** 0..1 share of the tuck over the stride; `fallT` splits the tuck between its rising and falling frame. */
  tuckT: number;
  fallT: number;
  /** 0..1 share of the resting legs (stopped against something). */
  restT: number;
  tailA: number;
  tailB: number;
  tailT: number;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smooth(u: number): number {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
}

/** The two stride frames around `phase` (0..1 repeating) and how far between them. Wraps, so the loop never hitches. */
export function legFrames(phase: number): { a: number; b: number; t: number } {
  const pos = (phase - Math.floor(phase)) * PUP_LEG_FRAMES;
  const a = Math.floor(pos) % PUP_LEG_FRAMES;
  return { a, b: (a + 1) % PUP_LEG_FRAMES, t: pos - Math.floor(pos) };
}

/** The two tail frames at time `t` seconds and how far between them. */
export function tailFrames(t: number): { a: number; b: number; t: number } {
  const wags = t * WAG_HZ;
  const pos = (wags - Math.floor(wags)) * PUP_TAIL_FRAMES;
  const a = Math.floor(pos) % PUP_TAIL_FRAMES;
  return { a, b: (a + 1) % PUP_TAIL_FRAMES, t: pos - Math.floor(pos) };
}

/**
 * How much of the stride gives way to the tuck: fades in over the first moments in the air and fades
 * out over the first moments after landing. Reads the timers the hero already keeps.
 */
export function tuckShare(h: Pick<Hero, 'onGround' | 'airTime' | 'sinceLand'>): number {
  return h.onGround ? 1 - clamp01(h.sinceLand / TUCK_BLEND) : clamp01(h.airTime / TUCK_BLEND);
}

/**
 * Rising tuck at 0, falling tuck at 1. The two frames differ, so the change is spread over only the
 * ~50 ms around the top of the jump: long enough not to pop, short enough that the blend never reads as two dogs.
 */
export function fallShare(vy: number): number {
  return smooth((60 - vy) / 120);
}

export function puppetPose(h: Hero, stride: number, t: number): PupPose {
  const legs = legFrames(stride);
  const tail = tailFrames(t);
  return {
    legA: legs.a,
    legB: legs.b,
    legT: legs.t,
    tuckT: tuckShare(h),
    fallT: fallShare(h.vy),
    restT: h.restBlend,
    tailA: tail.a,
    tailB: tail.b,
    tailT: tail.t,
  };
}
