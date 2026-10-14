// Which puppet frames to show for the hero, and how the body moves through a bound. Pure maths,
// no Skia, so it runs in tests. The leg strip is one WALK stride of the Dog Better mascot (48 frames),
// so the run scrubs a float index through it rather than playing it: neighbouring frames stack cleanly,
// frames far apart do not, so the index is never allowed to jump.

import { PUP_LEG_FRAMES, PUP_TAIL_FRAMES } from '../sprites';

/** The hero state the pose reads: the live hero, or a snapshot of it one step earlier. */
export interface PoseInput {
  onGround: boolean;
  airTime: number;
  sinceLand: number;
  vy: number;
  /** Vertical speed just before the last landing (negative). */
  landVy: number;
  restBlend: number;
  boost: number;
  landImpact: number;
  /** Tail wag phase, 0..1. */
  wag: number;
}

/**
 * One bound, phase 0 = the front paws touch down.
 * While planted the legs sweep at a constant rate (the floor moves at one speed); in the air they
 * gather fast after push-off and reach slowly to full spread at the top of the bound.
 */
export const GALLOP = {
  /** Share of the bound with the paws down. */
  contact: 0.36,
  /** Strip frame as the front paws touch, at push-off (legs straight under the body), and at full spread. */
  legTouch: 25.5,
  legPush: 16,
  legReach: 36,
  /** Where in the bound the legs are fully spread. */
  reachAt: 0.7,
  /** Height of the bound, the body's pitch (nose up is negative), stretch at push-off, squash after touch. */
  lift: 3.5,
  pitch: 0.055,
  stretch: 0.03,
  squash: 0.04,
} as const;

/** Air poses: legs flung out on the way up (the gallop apex), reaching down on the way in. */
export const AIR_UP = 36;
export const AIR_DOWN = 27;
/** Seconds to scrub from the stride to the air pose after take-off, and back after landing. */
export const TUCK_IN = 0.1;
export const TUCK_OUT = 0.06;

export interface GallopBody {
  /** Feet height above the ground line, world units. */
  lift: number;
  /** Body pitch in radians, screen-clockwise positive. */
  rot: number;
  /** Vertical scale about the paws; width follows as 1 / sqrt. */
  sy: number;
  /** Where in the bound: 0 at contact. */
  phase: number;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smooth(u: number): number {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const frac = (v: number) => v - Math.floor(v);

/** Cubic Hermite from y0 (slope m0) to y1 (slope m1) over a span of dp, at s in 0..1. */
const hermite = (y0: number, m0: number, y1: number, m1: number, s: number, dp: number) =>
  (2 * s ** 3 - 3 * s ** 2 + 1) * y0 + (s ** 3 - 2 * s ** 2 + s) * dp * m0 + (-2 * s ** 3 + 3 * s ** 2) * y1 + (s ** 3 - s ** 2) * dp * m1;

/** The two strip frames around a float index and how far between them. Wraps, so the loop never hitches. */
export function framesAt(index: number, count: number): { a: number; b: number; t: number } {
  const pos = ((index % count) + count) % count;
  const a = Math.floor(pos);
  return { a, b: (a + 1) % count, t: pos - a };
}

/** The two stride frames around `phase` (0..1 repeating) for a plain walk. */
export function legFrames(phase: number): { a: number; b: number; t: number } {
  return framesAt(frac(phase) * PUP_LEG_FRAMES, PUP_LEG_FRAMES);
}

/** The gallop's leg strip index at stride phase `phase`. */
export function gallopLegIndex(phase: number): number {
  const p = frac(phase);
  const { contact: c, legTouch, legPush, legReach, reachAt } = GALLOP;
  const m = (legPush - legTouch) / c;
  if (p < c) return legTouch + m * p;
  if (p < reachAt) return hermite(legPush, m, legReach, 0, (p - c) / (reachAt - c), reachAt - c);
  return hermite(legReach, 0, legTouch, m, (p - reachAt) / (1 - reachAt), 1 - reachAt);
}

/** The body in one bound: squash right after touch, nose down at touch and up at push, stretch just after push-off. */
export function gallopBody(phase: number): GallopBody {
  const p = frac(phase);
  const c = GALLOP.contact;
  const u = p < c ? 0 : (p - c) / (1 - c);
  const lift = GALLOP.lift * Math.sin(Math.PI * u) ** 2;
  const rot = -GALLOP.pitch * Math.sin(2 * Math.PI * (p - c / 2));
  const squash = p < c ? GALLOP.squash * Math.sin(Math.PI * Math.sqrt(p / c)) ** 2 : 0;
  const q = (p - (c - 0.06)) / 0.3;
  const stretch = q > 0 && q < 1 ? GALLOP.stretch * Math.sin(Math.PI * q) ** 2 : 0;
  return { lift, rot, sy: 1 - squash + stretch, phase: p };
}

/** Rising pose at 0, reaching-down pose at 1, spread over about ten steps around the top of a jump. */
export function fallShare(vy: number): number {
  return smooth((200 - vy) / 400);
}

/** The air leg index for a vertical speed. */
export function airLeg(vy: number): number {
  return mix(AIR_UP, AIR_DOWN, fallShare(vy));
}

/** Nose follows the arc in the air; stretch on the rise and the fall, neutral at the apex. */
export function airRot(vy: number): number {
  return Math.max(-0.18, Math.min(0.14, -vy / 4300));
}
export function airSy(vy: number): number {
  return 1 + 0.07 * clamp01((Math.abs(vy) - 150) / 550);
}

/** Landing squash over time since contact: deep at once, then a short damped bounce with one overshoot. */
export function landSquash(t: number, landVy: number, landImpact: number, step: number): number {
  const A = 0.03 + 0.09 * clamp01((-landVy - 150) / 400) + 0.14 * landImpact;
  if (t < 0) return 0;
  if (t < step) return A * (0.7 + (0.3 * t) / step);
  const u = t - step;
  return A * Math.exp(-u / 0.06) * Math.cos((2 * Math.PI * u) / 0.24);
}

export interface HeroPoseOut {
  /** Leg strip index (float) and the two frames around it. */
  legIndex: number;
  legA: number;
  legB: number;
  legT: number;
  restT: number;
  tailA: number;
  tailB: number;
  tailT: number;
  lift: number;
  rot: number;
  sy: number;
}

/** The whole pose for a running or airborne hero at stride phase `stride`. */
export function heroPose(h: PoseInput, stride: number, step: number): HeroPoseOut {
  const g = gallopBody(stride);
  // Air share: scrubs in after take-off and out after landing.
  const a = h.onGround ? 1 - smooth(h.sinceLand / TUCK_OUT) : smooth(h.airTime / TUCK_IN);
  const air = h.onGround ? airLeg(h.landVy) : airLeg(h.vy);
  const legIndex = mix(gallopLegIndex(stride), air, a);
  const bodyA = h.onGround ? 1 - smooth(h.sinceLand / 0.1) : smooth(h.airTime / 0.08);
  const rot = mix(g.rot, h.onGround ? airRot(h.landVy) : airRot(h.vy), bodyA);
  const lift = g.lift * (1 - bodyA);
  const squash = h.onGround ? landSquash(h.sinceLand, h.landVy, h.landImpact, step) : 0;
  const sy = mix(g.sy, h.onGround ? 1 : airSy(h.vy), bodyA) * (1 - squash);
  const legs = framesAt(legIndex, PUP_LEG_FRAMES);
  const tail = framesAt(h.wag * PUP_TAIL_FRAMES, PUP_TAIL_FRAMES);
  return { legIndex, legA: legs.a, legB: legs.b, legT: legs.t, restT: h.restBlend, tailA: tail.a, tailB: tail.b, tailT: tail.t, lift, rot, sy };
}
