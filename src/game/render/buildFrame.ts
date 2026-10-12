// Turns the world into a flat list of numbers the Skia canvas can draw on the UI thread.
// Plain numbers cross threads cheaply and keep this file free of Skia, so it runs in tests.

import { FLOOR_SCREEN_Y } from '../constants';
import { SPRITES, dogSprite, type SpriteName } from '../sprites';
import { BOSS_LEAD } from '../sim/world';
import type { World } from '../sim/types';

/**
 * One draw op is STRIDE numbers:
 * [image, srcX, srcY, srcW, srcH, centreX, centreY, destW, destH, rotation, alpha, color]
 * image >= 0 is an index into the canvas's image list; srcW/H in pixels.
 * image = RECT draws a filled rectangle of `color` (0xRRGGBB) instead.
 * A negative destW mirrors the sprite left to right.
 */
export const STRIDE = 12;
export const RECT = -1;

/** frames[name] = [page, x, y, w, h] in atlas pixels. */
export interface AtlasData {
  pages: string[];
  frames: Record<string, [number, number, number, number, number]>;
}

export interface FrameSetup {
  atlas: AtlasData;
  /** Index of the room picture in the canvas image list, and its pixel size. */
  background: { image: number; w: number; h: number } | null;
  /** Screen points per world unit. */
  k: number;
  screenW: number;
  screenH: number;
  reduceMotion?: boolean;
}

export class OpList {
  data: number[] = [];
  push(
    image: number,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    cx: number,
    cy: number,
    dw: number,
    dh: number,
    rot: number,
    alpha: number,
    color: number,
  ) {
    this.data.push(image, sx, sy, sw, sh, cx, cy, dw, dh, rot, alpha, color);
  }
  get count() {
    return this.data.length / STRIDE;
  }
}

const COCOA = 0x1a0f0b;
const PIT = 0x2b1a12;
const FLOOR_FILL = 0x7a4a2c;

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export function buildFrame(world: World, setup: FrameSetup, out = new OpList()): OpList {
  const { atlas, k, screenW, screenH } = setup;
  const shake = setup.reduceMotion ? 0 : world.shake;
  const camX = world.camX + Math.sin(world.t * 83) * shake * 7;
  const camY = Math.cos(world.t * 71) * shake * 5;
  const t = world.t;

  const sx = (x: number) => (x - camX) * k;
  const sy = (y: number) => (FLOOR_SCREEN_Y - y + camY) * k;
  const viewL = camX - 120;
  const viewR = camX + screenW / k + 120;
  const visible = (x: number, w = 0) => x + w / 2 > viewL && x - w / 2 < viewR;

  /** Draws a sprite with its bottom centre at world (x, y). */
  const sprite = (
    name: SpriteName,
    x: number,
    y: number,
    opts: { flip?: boolean; rot?: number; alpha?: number; scale?: number; sxScale?: number; syScale?: number } = {},
  ) => {
    const f = atlas.frames[name];
    if (!f) return;
    const size = SPRITES[name];
    const s = opts.scale ?? 1;
    const w = size.w * s * (opts.sxScale ?? 1);
    const h = size.h * s * (opts.syScale ?? 1);
    out.push(f[0], f[1], f[2], f[3], f[4], sx(x), sy(y + h / 2), (opts.flip ? -w : w) * k, h * k, opts.rot ?? 0, opts.alpha ?? 1, 0);
  };
  const rect = (x: number, y: number, w: number, h: number, color: number, alpha = 1, rot = 0) => {
    out.push(RECT, 0, 0, 0, 0, sx(x), sy(y), w * k, h * k, rot, alpha, color);
  };

  // Background room, slow parallax, tiled.
  if (setup.background) {
    const bg = setup.background;
    const dh = screenH * 1.04;
    const dw = (bg.w / bg.h) * dh;
    const scroll = camX * k * 0.25;
    const first = Math.floor(scroll / dw);
    for (let n = first; (n - first) * dw - (scroll - first * dw) < screenW; n++) {
      const x = n * dw - scroll;
      // Every other copy is mirrored so the edges always meet cleanly.
      const mirror = n % 2 !== 0;
      out.push(bg.image, 0, 0, bg.w, bg.h, x + dw / 2, dh / 2 - screenH * 0.02 + camY * k * 0.3, mirror ? -dw : dw, dh, 0, 1, 0);
    }
    // Push the room back so the furniture you can jump on reads in front of it.
    out.push(RECT, 0, 0, 0, 0, screenW / 2, screenH / 2, screenW + 40, screenH + 40, 0, 0.22, 0x140a1f);
  }

  // Decorations stand behind the action.
  for (const d of world.level.decor) {
    if (visible(d.x, 260)) sprite(d.sprite, d.x + SPRITES[d.sprite].w / 2, d.y ?? 0);
  }

  // Floor: a dark pit everywhere, wood floor over each segment.
  out.push(RECT, 0, 0, 0, 0, screenW / 2, (sy(0) + screenH) / 2 + 2 * k, screenW + 40, screenH - sy(0) + 20 * k, 0, 1, PIT);
  const tile = SPRITES.floor_living.w;
  for (const [a, b] of world.floor) {
    const x0 = Math.max(a, viewL);
    const x1 = Math.min(b, viewR);
    if (x1 <= x0) continue;
    rect((x0 + x1) / 2, -SPRITES.floor_living.h / 2 - 30, x1 - x0, 60, FLOOR_FILL);
    const first = Math.floor((x0 - a) / tile) * tile + a;
    for (let x = first; x < x1; x += tile) {
      const w = Math.min(tile, b - x);
      const f = atlas.frames.floor_living;
      if (!f) continue;
      const share = w / tile;
      out.push(f[0], f[1], f[2], f[3] * share, f[4], sx(x + w / 2), sy(-SPRITES.floor_living.h / 2), w * k, SPRITES.floor_living.h * k, 0, 1, 0);
    }
    // Ink edge on pit lips.
    rect(a + 2, -20, 4, 40, COCOA, 0.8);
    rect(b - 2, -20, 4, 40, COCOA, 0.8);
  }

  // Furniture.
  for (const p of world.platforms) {
    if (visible(p.x + p.w / 2, p.w)) sprite(p.sprite, p.x + p.w / 2, p.y);
  }

  // Balloon posts.
  for (const c of world.checkpoints) {
    if (visible(c.x)) sprite(c.reached ? 'balloon_post_up' : 'balloon_post_down', c.x, 0, { rot: c.reached ? Math.sin(t * 3 + c.x) * 0.05 : 0 });
  }

  // Finish arch for levels without a boss.
  if (!world.level.boss && visible(world.level.finishX, 220)) sprite('party_arch', world.level.finishX, 0);

  // Crates with dogs inside.
  for (const c of world.cages) {
    if (!visible(c.x + 42, 100)) continue;
    if (!c.open) {
      const wiggle = Math.sin(t * 9 + c.x) * 0.04;
      sprite(dogSprite(c.dog), c.x + 42, c.y + 6, { rot: wiggle, scale: 0.95 });
      sprite('cage_closed', c.x + 42, c.y);
    } else {
      sprite('cage_open', c.x + 42, c.y);
    }
  }

  // Bones and presents bob in place; taken ones float up and fade.
  for (const p of world.pickups) {
    if (!visible(p.x)) continue;
    if (p.taken) {
      if (p.takenT > 0.4) continue;
      const u = p.takenT / 0.4;
      sprite(p.sprite, p.x, p.y + u * 50, { alpha: 1 - u, scale: 1 + u * 0.6 });
      continue;
    }
    const bob = Math.sin(t * 4 + p.x * 0.05) * 3;
    sprite(p.sprite, p.x, p.y + bob, { rot: p.kind === 'present' ? 0 : Math.sin(t * 3 + p.x) * 0.15 });
  }

  // Squirrels, the cat, the vacuum and toy blocks.
  for (const e of world.enemies) {
    if (!visible(e.x, 80)) continue;
    const flip = e.facing < 0;
    if (e.type === 'runner' || e.type === 'thrower') {
      if (e.state === 'stunned') {
        sprite('squirrel_stunned', e.x, e.y, { rot: e.t * 9, flip });
      } else if (e.type === 'runner') {
        sprite(`squirrel_run_${Math.floor(t * 14) % 4}` as SpriteName, e.x, e.y, { flip });
      } else if (e.throwing > 0) {
        sprite(e.throwing > 0.15 ? 'squirrel_throw_0' : 'squirrel_throw_1', e.x, e.y, { flip });
      } else {
        sprite(`squirrel_idle_${Math.floor(t * 3 + e.id) % 2}` as SpriteName, e.x, e.y, { flip });
      }
    } else if (e.type === 'cat') {
      if (e.state === 'fled') sprite('cat_awake_0', e.x, e.y, { rot: -e.t * 4 });
      else if (!e.awake) {
        const breathe = 1 + Math.sin(t * 2.4) * 0.03;
        sprite('cat_sleep', e.x, e.y, { flip, syScale: breathe, sxScale: 1 / Math.sqrt(breathe) });
      } else sprite(`cat_awake_${Math.floor(e.t * 6) % 2}` as SpriteName, e.x, e.y, { flip });
    } else if (e.type === 'vacuum') {
      sprite(`vacuum_${Math.floor(t * 12) % 2}` as SpriteName, e.x, e.y, { flip: e.facing < 0 });
    } else {
      sprite('toy_blocks', e.x, e.y, { rot: e.state === 'stunned' ? e.t * 6 : 0 });
    }
  }

  // Acorns.
  for (const a of world.acorns) {
    if (!visible(a.x)) continue;
    sprite(a.golden ? 'acorn_golden' : 'acorn', a.x, a.y - 9, { rot: a.spin, scale: a.golden ? 1.4 : 1 });
  }

  // Rescued friends hop along behind the dog.
  world.followers.forEach((dog, i) => {
    const idx = Math.min(world.trail.length - 1, 14 + i * 13);
    if (idx < 0) return;
    const p = world.trail[idx];
    const hop = Math.abs(Math.sin(t * 11 + i * 1.7));
    const y = p.y + hop * 10;
    const squash = 1 - (1 - hop) * 0.08;
    sprite(dogSprite(dog), p.x - 30 - i * 6, y, { scale: 0.92, syScale: squash, sxScale: 1 / Math.sqrt(squash) });
  });

  drawHero(world, sprite);

  // The boss.
  const b = world.boss;
  if (b && b.phase !== 'waiting' && b.phase !== 'gone' && visible(b.x, 140)) {
    let name: SpriteName = `boss_idle_${Math.floor(t * 4) % 2}` as SpriteName;
    if (b.phase === 'defeated') name = 'boss_defeated';
    else if (b.phase === 'hurt' || b.hurtT > 0) name = 'boss_hurt';
    else if (b.throwing > 0) name = b.throwing > 0.18 ? 'boss_throw_0' : 'boss_throw_1';
    const blink = b.hurtT > 0 && Math.floor(b.hurtT * 20) % 2 === 0 ? 0.5 : 1;
    sprite(name, b.x, b.y, { flip: true, alpha: blink });
    // The stolen cake rides on the boss until it is beaten, then drops for the party.
    if (b.phase === 'defeated') sprite('cake', b.x - 90, 0, { scale: Math.min(1, 0.4 + b.t) });
    else sprite('cake', b.x + 30, b.y + 104, { scale: 0.6, rot: Math.sin(t * 5) * 0.1 });
  }
  if (b && b.phase === 'gone') sprite('cake', world.hero.x + BOSS_LEAD - 130, 0);

  // Particles: dust, sparkles, hearts, confetti and the bark burst.
  for (const p of world.particles) {
    if (!visible(p.x)) continue;
    const fade = Math.min(1, p.life / (p.maxLife * 0.35));
    if (p.color) {
      rect(p.x, p.y, 7, 4.5, hexToInt(p.color), fade, p.rot);
    } else {
      sprite(p.sprite, p.x, p.y, { rot: p.rot, alpha: fade, scale: p.scale });
    }
  }

  return out;
}

type SpriteFn = (
  name: SpriteName,
  x: number,
  y: number,
  opts?: { flip?: boolean; rot?: number; alpha?: number; scale?: number; sxScale?: number; syScale?: number },
) => void;

function drawHero(world: World, sprite: SpriteFn) {
  const h = world.hero;
  if (world.phase === 'respawn' && world.phaseT < 0.9) return;
  const t = world.t;
  const flicker = h.invuln > 0 && Math.floor(h.invuln * 14) % 2 === 0 ? 0.35 : 1;

  // Squash on landing, stretch on take-off. Volume stays put: width = 1 / sqrt(height).
  let syScale = 1;
  if (h.onGround && h.sinceLand < 0.14) syScale = 1 - 0.22 * (1 - h.sinceLand / 0.14);
  else if (!h.onGround && h.vy > 200) syScale = 1.08;
  const sxScale = 1 / Math.sqrt(syScale);

  let name: SpriteName = 'pup_walk';
  let rot = 0;
  let lift = 0;
  switch (h.pose) {
    case 'run': {
      // A bouncy gallop: two bounces per stride with a little rock.
      const phase = h.stride * Math.PI * 2;
      lift = Math.abs(Math.sin(phase)) * 5;
      rot = Math.sin(phase) * 0.06;
      break;
    }
    case 'jump':
      rot = -0.18;
      break;
    case 'fall':
      rot = 0.14;
      break;
    case 'slide':
      name = 'pup_down';
      lift = Math.sin(t * 40) * 0.6;
      break;
    case 'bark':
      name = 'pup_bark';
      rot = -0.05;
      break;
    case 'hurt':
      rot = Math.sin(t * 30) * 0.2;
      break;
    case 'cheer':
    case 'idle':
      name = 'pup_sit';
      lift = Math.abs(Math.sin(t * 6)) * 14;
      break;
  }
  sprite(name, h.x, h.y + lift, { rot, alpha: flicker, sxScale, syScale });
}
