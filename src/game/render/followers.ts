// How the freed pups travel behind the hero. Pure maths over the hero's trail, no Skia.
// Three styles exist while Alex picks one; the unpicked ones come out afterwards.

import { SPRITES, dogSprite, type SpriteName } from '../sprites';
import type { World } from '../sim/types';

export type FollowerStyle = 'hop' | 'wagon' | 'balloon';

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

/** A straight line in world units (the wagon's rope). */
export interface Rope {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FollowerDraws {
  /** Drawn behind the hero, in order. */
  sprites: FollowerSprite[];
  ropes: Rope[];
}

const BALLOONS: SpriteName[] = ['balloon_pink', 'balloon_blue', 'balloon_gold'];

/** Keeps volume while squashing: width = 1 / sqrt(height). */
const wide = (sy: number) => 1 / Math.sqrt(sy);

export function followerDraws(world: World, t: number, style: FollowerStyle): FollowerDraws {
  const out: FollowerDraws = { sprites: [], ropes: [] };
  const trail = world.trail;
  if (trail.length === 0 || world.followers.length === 0) return out;
  const at = (i: number) => trail[Math.max(0, Math.min(trail.length - 1, i))];

  if (style === 'hop') {
    // A real bound: crouch, spring, stretch at the top, land in a squash, with a dust puff.
    const T = 0.44;
    world.followers.forEach((dog, i) => {
      const idx = 14 + i * 13;
      const p = at(idx);
      const q = at(idx + 1);
      const u = ((t / T + i * 0.37) % 1 + 1) % 1;
      let lift = 0;
      let sy = 1;
      let rot = 0;
      let dust = 0;
      if (u < 0.18) {
        sy = 1 - 0.14 * Math.sin((Math.PI * u) / 0.18);
      } else if (u < 0.72) {
        const v = (u - 0.18) / 0.54;
        lift = 24 * Math.sin(Math.PI * v);
        sy = 1 + 0.09 * Math.sin(Math.PI * v) * (1 - v * 0.5);
        rot = -0.14 + 0.26 * v;
      } else {
        const w = (u - 0.72) / 0.28;
        sy = 1 - 0.2 * Math.sin(Math.PI * w) * Math.exp(-1.6 * w);
        dust = Math.max(0, 1 - w / 0.4);
      }
      const x = p.x - 30 - i * 6;
      const y = p.y + lift;
      if (dust > 0) {
        out.sprites.push({ sprite: dust < 0.5 ? 'dust_1' : 'dust_0', x: x - 8, y: p.y, px: q.x - 38 - i * 6, py: q.y, alpha: dust * 0.9, scale: 0.9 });
      }
      out.sprites.push({ sprite: dogSprite(dog), x, y, px: q.x - 30 - i * 6, py: q.y + lift, rot, scale: 0.92, syScale: sy, sxScale: wide(sy) });
    });
    return out;
  }

  if (style === 'wagon') {
    // The pups ride in a wagon towed on a rope; it tips with the ground and bounces on the wheels.
    const idx = 20;
    const p = at(idx);
    const q = at(idx + 1);
    const ahead = at(idx - 8);
    const behind = at(idx + 8);
    const slope = Math.atan2(ahead.y - behind.y, Math.max(1, ahead.x - behind.x));
    const rot = Math.max(-0.3, Math.min(0.3, -slope * 0.45));
    const bounce = p.y < 2 ? Math.abs(Math.sin(t * 19)) * 1.6 : 0;
    const wx = p.x - 54;
    const wy = p.y + bounce;
    const hero = world.hero;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    // Pups sit on the wagon floor, drawn first so the bed hides their legs: they are in it, not on it.
    world.followers.forEach((dog, i) => {
      const jiggle = 1 + Math.sin(t * 12 + i * 1.9) * 0.03;
      const sx = -20 + i * 26;
      const sy = 20;
      const x = wx + sx * cos + sy * sin;
      const y = wy - sx * sin + sy * cos;
      out.sprites.push({
        sprite: dogSprite(dog),
        x,
        y,
        px: x - (p.x - q.x),
        py: y - (p.y - q.y),
        rot,
        scale: 0.74,
        syScale: jiggle,
        sxScale: wide(jiggle),
      });
    });
    out.sprites.push({ sprite: 'wagon', x: wx, y: wy, px: q.x - 54, py: q.y + bounce, rot });
    // Rope from the tow ring (front, right) to the hero's chest.
    const rx = 44;
    const ry = 30;
    out.ropes.push({ x0: wx + rx * cos + ry * sin, y0: wy - rx * sin + ry * cos, x1: hero.x - 12, y1: hero.y + 30 });
    return out;
  }

  // Balloon: each pup floats from a party balloon, swinging like a pendulum behind the hero.
  world.followers.forEach((dog, i) => {
    const idx = 8 + i * 6;
    const p = at(idx);
    const q = at(idx + 1);
    const size = SPRITES[dogSprite(dog)];
    const swing = 0.14 * Math.sin(t * 2.4 + i * 1.3) - world.hero.vy * 0.00012;
    const bob = 6 * Math.sin(t * 1.9 + i * 0.9);
    const topX = p.x - 40 - i * 32;
    const topY = p.y + 118 + i * 6 + bob;
    const ptopX = q.x - 40 - i * 32;
    const ptopY = q.y + 118 + i * 6 + bob;
    // Everything hangs from the balloon's top: turn the balloon and the pup about that point.
    const hang = (dy: number) => ({ dx: Math.sin(swing) * dy, dy: -Math.cos(swing) * dy });
    const b = hang(SPRITES.balloon_pink.h);
    const d = hang(SPRITES.balloon_pink.h + size.h * 0.84);
    out.sprites.push({ sprite: BALLOONS[i % BALLOONS.length], x: topX + b.dx, y: topY + b.dy, px: ptopX + b.dx, py: ptopY + b.dy, rot: swing });
    out.sprites.push({ sprite: dogSprite(dog), x: topX + d.dx, y: topY + d.dy, px: ptopX + d.dx, py: ptopY + d.dy, rot: swing, scale: 0.84 });
  });
  return out;
}
