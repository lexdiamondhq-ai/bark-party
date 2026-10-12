// Game feel: what each hit, landing and bark does to the camera and the clock. Pure, no React.
// Tuned as a table so the whole game's "weight" can be adjusted in one place.

export type ShakeKind = 'land_hard' | 'stomp' | 'bark' | 'bark_hit' | 'hurt' | 'boss_hit' | 'rescue' | 'zoomies';

export interface Shake {
  /** Sideways and vertical amplitude, 0..1 (the renderer maps 1 to a few world units). */
  x: number;
  y: number;
  /** Amplitude lost per second. */
  decay: number;
}

/** Each kind of impact shakes the camera its own way: landings thump up and down, barks push sideways. */
export const SHAKES: Record<ShakeKind, Shake> = {
  land_hard: { x: 0.05, y: 0.35, decay: 3.5 },
  stomp: { x: 0.1, y: 0.3, decay: 3.5 },
  bark: { x: 0.25, y: 0.05, decay: 3 },
  bark_hit: { x: 0.35, y: 0.1, decay: 3 },
  hurt: { x: 0.6, y: 0.4, decay: 2.5 },
  boss_hit: { x: 0.8, y: 0.6, decay: 2.2 },
  rescue: { x: 0.15, y: 0.25, decay: 3 },
  zoomies: { x: 0.2, y: 0.04, decay: 2.5 },
};

/** Seconds the whole world freezes on a hit, so the hit lands. Two to seven frames at 60 Hz. */
export const HITSTOP: Partial<Record<ShakeKind, number>> = {
  stomp: 0.05,
  bark_hit: 0.06,
  hurt: 0.08,
  boss_hit: 0.12,
};

export interface ShakeState {
  x: number;
  y: number;
}

export function addShake(s: ShakeState, kind: ShakeKind, scale = 1) {
  const k = SHAKES[kind];
  s.x = Math.max(s.x, k.x * scale);
  s.y = Math.max(s.y, k.y * scale);
}

export function decayShake(s: ShakeState, kind: ShakeKind | null, dt: number) {
  const decay = kind ? SHAKES[kind].decay : 3;
  s.x = Math.max(0, s.x - dt * decay);
  s.y = Math.max(0, s.y - dt * decay);
}

/** How much a landing at vertical speed `vy` (negative = falling) counts, 0 (soft) to 1 (from the bookshelf). */
export function landImpact(vy: number): number {
  const v = -vy;
  return Math.max(0, Math.min(1, (v - 350) / 800));
}

/**
 * Where the camera wants its left edge, from the hero's position and speed: it leads the dog more
 * the faster it runs, and lifts a little when the dog is high up so the landing stays in view.
 */
export function cameraLead(vx: number, runSpeed: number): number {
  return Math.max(0, vx / runSpeed - 1) * 90;
}

export function cameraLift(heroY: number): number {
  return Math.max(0, heroY - 110) * 0.45;
}
