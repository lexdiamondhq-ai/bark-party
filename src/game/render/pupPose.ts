// Which puppet frames to show for the hero, and how much of each, so the legs and tail move
// continuously instead of cutting from frame to frame. Pure maths, no Skia, so it runs in tests.
// The frame logic follows the Dog Better pup (src/engine/pupPuppet.ts there), which this art comes from.

import { PUP_LEG_FRAMES, PUP_TAIL_FRAMES } from '../sprites';

/** The hero state the pose reads: the live hero, or a snapshot of it one step earlier. */
export interface PoseInput {
  onGround: boolean;
  airTime: number;
  sinceLand: number;
  vy: number;
  restBlend: number;
  boost: number;
  landImpact: number;
}

/** Stride frames with the legs gathered under the body: shown rising, then falling. */
export const TUCK_UP = 12;
export const TUCK_DOWN = 36;
/** Seconds to fade from the stride to the tuck when leaving the ground, and back when landing. */
export const TUCK_BLEND = 0.08;
/** Tail wags per second while running: faster than Dog Better's trot, it is a gallop. */
export const WAG_HZ = 2.8;

/**
 * The gallop sweeps the leg strip between gathered and extended instead of walking through
 * all 48 frames: a walk cycle played at running speed flutters, a bound reads.
 */
export const GALLOP = {
  /** Centre frame and how far the sweep goes either side of it. */
  legCentre: 24,
  legSweep: 8,
  /** Height of the bound, in world units, and the body's pitch (nose up is negative). Kept calm: a steady lope, not a pogo. */
  lift: 3.5,
  pitch: 0.055,
  /** Stretch in the air, squash on contact. */
  stretch: 0.03,
  squash: 0.04,
} as const;

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

export interface GallopBody {
  /** Feet height above the ground line, world units. */
  lift: number;
  /** Body pitch in radians, screen-clockwise positive. */
  rot: number;
  /** Vertical scale about the paws; width follows as 1 / sqrt. */
  sy: number;
  /** Where in the bound: 0 at contact, 0.5 fully extended in the air. */
  phase: number;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smooth(u: number): number {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
}

const frac = (v: number) => v - Math.floor(v);

/** The two stride frames around a float index and how far between them. Wraps, so the loop never hitches. */
export function framesAt(index: number, count: number): { a: number; b: number; t: number } {
  const pos = ((index % count) + count) % count;
  const a = Math.floor(pos);
  return { a, b: (a + 1) % count, t: pos - a };
}

/** The two stride frames around `phase` (0..1 repeating) for a plain walk. */
export function legFrames(phase: number): { a: number; b: number; t: number } {
  return framesAt(frac(phase) * PUP_LEG_FRAMES, PUP_LEG_FRAMES);
}

/** The gallop's leg strip index at stride phase `phase`: gathered at contact, extended mid-flight. */
export function gallopLegIndex(phase: number): number {
  return GALLOP.legCentre - GALLOP.legSweep * Math.cos(2 * Math.PI * (frac(phase) - 0.05));
}

/**
 * The body in one bound. Contact at phase 0: squashed, nose level. Push at 0.2: stretching, nose
 * up. Flight around 0.5: highest, nose coming down. Landing at 0.9: dropping into the squash.
 */
export function gallopBody(phase: number): GallopBody {
  const p = frac(phase);
  const w = 2 * Math.PI * p;
  // Paws down for the first and last quarter, in the air for the middle half.
  const air = Math.max(0, -Math.cos(w));
  const lift = GALLOP.lift * air * air;
  const rot = -GALLOP.pitch * Math.sin(w);
  const sy = 1 + GALLOP.stretch * air - GALLOP.squash * Math.max(0, Math.cos(w)) ** 3;
  return { lift, rot, sy, phase: p };
}

/** The two tail frames at time `t` seconds and how far between them. */
export function tailFrames(t: number): { a: number; b: number; t: number } {
  return framesAt(frac(t * WAG_HZ) * PUP_TAIL_FRAMES, PUP_TAIL_FRAMES);
}

/**
 * How much of the stride gives way to the tuck: fades in over the first moments in the air and fades
 * out over the first moments after landing. Reads the timers the hero already keeps.
 */
export function tuckShare(h: Pick<PoseInput, 'onGround' | 'airTime' | 'sinceLand'>): number {
  return h.onGround ? 1 - clamp01(h.sinceLand / TUCK_BLEND) : clamp01(h.airTime / TUCK_BLEND);
}

/**
 * Rising tuck at 0, falling tuck at 1. The two frames differ, so the change is spread over only the
 * ~50 ms around the top of the jump: long enough not to pop, short enough that the blend never reads as two dogs.
 */
export function fallShare(vy: number): number {
  return smooth((60 - vy) / 120);
}

export function puppetPose(h: PoseInput, stride: number, t: number): PupPose {
  const legs = framesAt(gallopLegIndex(stride), PUP_LEG_FRAMES);
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
