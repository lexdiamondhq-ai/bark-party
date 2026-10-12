// The freed pups ride in a red wagon the hero tows on a rope. Pure maths over the hero's trail, no Skia.

import { BOARD_TIME } from '../constants';
import { dogSprite, type SpriteName } from '../sprites';
import type { World } from '../sim/types';

export interface FollowerSprite {
  sprite: SpriteName;
  x: number;
  y: number;
  px: number;
  py: number;
  rot?: number;
  scale?: number;
  sxScale?: number;
  syScale?: number;
  alpha?: number;
}

/** A straight line in world units (the rope). */
export interface Rope {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FollowerDraws {
  /** Drawn in order: pups in the wagon, the wagon, then pups still jumping in. */
  sprites: FollowerSprite[];
  ropes: Rope[];
}

/** How far behind the hero (in trail steps) the wagon rides. */
const WAGON_LAG = 20;
const WAGON_BACK = 54;
const PUP_SCALE = 0.74;
/** Seat offsets along the wagon floor, back to front, and the floor height the pups sit at. */
const SEAT_X = [-20, 6, 32];
const SEAT_Y = 20;
/** The tow ring on the wagon sprite, from its bottom centre. */
const RING = { x: 44, y: 30 };

/** Keeps volume while squashing: width = 1 / sqrt(height). */
const wide = (sy: number) => 1 / Math.sqrt(sy);

function smooth(u: number) {
  const x = u < 0 ? 0 : u > 1 ? 1 : u;
  return x * x * (3 - 2 * x);
}

export function followerDraws(world: World, t: number): FollowerDraws {
  const out: FollowerDraws = { sprites: [], ropes: [] };
  // Before the first step the trail is empty: the wagon starts right behind the dog.
  const trail = world.trail.length ? world.trail : [{ x: world.hero.x, y: world.hero.y }];
  const at = (i: number) => trail[Math.max(0, Math.min(trail.length - 1, i))];

  // The wagon follows the trail, tips with the ground and bounces a little on its wheels.
  const p = at(WAGON_LAG);
  const q = at(WAGON_LAG + 1);
  const ahead = at(WAGON_LAG - 8);
  const behind = at(WAGON_LAG + 8);
  const slope = Math.atan2(ahead.y - behind.y, Math.max(1, ahead.x - behind.x));
  const rot = Math.max(-0.3, Math.min(0.3, -slope * 0.45));
  const bounce = p.y < 2 ? Math.abs(Math.sin(t * 19)) * 1.6 : 0;
  const wx = p.x - WAGON_BACK;
  const wy = p.y + bounce;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const seat = (i: number) => {
    const sx = SEAT_X[Math.min(i, SEAT_X.length - 1)];
    return { x: wx + sx * cos + SEAT_Y * sin, y: wy - sx * sin + SEAT_Y * cos };
  };

  // Pups sit on the wagon floor, drawn first so the bed hides their legs: they are in it, not on it.
  world.followers.forEach((dog, i) => {
    const jiggle = 1 + Math.sin(t * 12 + i * 1.9) * 0.03;
    const s = seat(i);
    out.sprites.push({
      sprite: dogSprite(dog),
      x: s.x,
      y: s.y,
      px: s.x - (p.x - q.x),
      py: s.y - (p.y - q.y),
      rot,
      scale: PUP_SCALE,
      syScale: jiggle,
      sxScale: wide(jiggle),
    });
  });
  out.sprites.push({ sprite: 'wagon', x: wx, y: wy, px: q.x - WAGON_BACK, py: q.y + bounce, rot });

  // A just-freed pup arcs from its crate into the next free seat.
  world.boarding.forEach((b, n) => {
    const u = smooth(b.t / BOARD_TIME);
    const s = seat(world.followers.length + n);
    const x = b.x + (s.x - b.x) * u;
    const y = b.y + (s.y - b.y) * u + Math.sin(Math.PI * u) * 90;
    const stretch = 1 + Math.sin(Math.PI * u) * 0.12;
    out.sprites.push({ sprite: dogSprite(b.dog), x, y, px: x, py: y, rot: -0.3 + 0.6 * u, scale: 0.95 - 0.21 * u, syScale: stretch, sxScale: wide(stretch) });
  });

  // Rope from the tow ring (front, right) to the hero's chest.
  const hero = world.hero;
  out.ropes.push({ x0: wx + RING.x * cos + RING.y * sin, y0: wy - RING.x * sin + RING.y * cos, x1: hero.x - 12, y1: hero.y + 30 });
  return out;
}
