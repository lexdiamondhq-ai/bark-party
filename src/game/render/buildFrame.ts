// Turns the world into a flat list of numbers the Skia canvas can draw on the UI thread.
// Plain numbers cross threads cheaply and keep this file free of Skia, so it runs in tests.
//
// Every frame is built twice: as the world is now, and as it was one simulation step ago. The two
// lists line up op for op, so the canvas can draw any moment in between, which is what keeps a
// 120 Hz screen moving every frame while the simulation steps at 60.

import { FLOOR_SCREEN_Y, WARN, POWER, STEP } from '../constants';
import { SPRITES, dogSprite, type SpriteName } from '../sprites';
import { BOSS_LEAD, heroScale } from '../sim/world';
import type { World } from '../sim/types';
import { followerDraws } from './followers';
import { heroPose, type HeroPoseOut, type PoseInput } from './pupPose';

/**
 * One draw op is STRIDE numbers:
 * [image, srcX, srcY, srcW, srcH, centreX, centreY, destW, destH, rotation, alpha, color,
 *  prevCentreX, prevCentreY, prevDestW, prevDestH, prevRotation, prevAlpha]
 * image >= 0 is an index into the canvas's image list; srcW/H in pixels.
 * image = RECT draws a filled rectangle of `color` (0xRRGGBB) instead.
 * A negative destW mirrors the sprite left to right.
 * The prev* fields are the same op one simulation step earlier; the canvas blends toward the current values.
 */
export const STRIDE = 18;
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
  /** Development: filled in with the hero frames actually drawn, for the frame-rate probe. */
  probe?: PupProbe;
}

export interface PupProbe {
  legA: number;
  legB: number;
  legT: number;
  tuckT: number;
}

/** The numbers of one op that change between steps: x, y, w, h, rot (alpha is handled on its own). */
const MOVING = [5, 6, 7, 8, 9] as const;

/** Stable keys for draw ops, so an op can be paired with its previous self even when its frame changed. */
export const key = (category: number, index: number) => category * 1_000_000 + index;
export const K = {
  bg: 1,
  scrim: 2,
  decor: 3,
  pit: 4,
  floorFill: 5,
  floorTile: 6,
  lip: 7,
  platform: 8,
  checkpoint: 9,
  arch: 10,
  cage: 11,
  pickup: 12,
  enemy: 13,
  acorn: 14,
  ball: 15,
  rope: 16,
  follower: 17,
  hero: 18,
  boss: 19,
  cakeGone: 20,
  speedLine: 21,
  particle: 22,
  landMark: 23,
} as const;

export class OpList {
  data: number[] = [];
  /** keys[n] is the stable id of op n. */
  keys: number[] = [];
  /** The key the next push gets; set it before each draw call. */
  cur = 0;
  push(image: number, sx: number, sy: number, sw: number, sh: number, cx: number, cy: number, dw: number, dh: number, rot: number, alpha: number, color: number) {
    this.data.push(image, sx, sy, sw, sh, cx, cy, dw, dh, rot, alpha, color, cx, cy, dw, dh, rot, alpha);
    this.keys.push(this.cur);
  }
  get count() {
    return this.data.length / STRIDE;
  }
  reset() {
    this.data.length = 0;
    this.keys.length = 0;
    this.cur = 0;
  }
  /** The numbers as one typed array, for the handoff to the UI thread. */
  toArray(): Float64Array {
    return Float64Array.from(this.data);
  }
  /**
   * Copies the moving numbers of `prev` into this list's previous-step slots, pairing ops by key.
   * Both lists are in the same draw order, so this is a forward merge. An op with no match is new
   * this step and draws where it is. Alpha blends only when the sprite frame is the same, so a slot
   * whose frame advanced never flashes the new frame at the old alpha.
   */
  takePrevFrom(prev: OpList) {
    const a = this.data;
    const b = prev.data;
    const ka = this.keys;
    const kb = prev.keys;
    let j = 0;
    for (let i = 0, n = 0; i < a.length; i += STRIDE, n++) {
      let m = j;
      while (m < kb.length && kb[m] !== ka[n]) m++;
      if (m === kb.length) continue;
      j = m + 1;
      const q = m * STRIDE;
      if (a[i] !== b[q]) continue;
      // A sprite that flipped this step snaps instead of shrinking through zero.
      if (Math.sign(a[i + 7]) !== Math.sign(b[q + 7])) continue;
      for (let f = 0; f < MOVING.length; f++) a[i + 12 + f] = b[q + MOVING[f]];
      if (a[i + 1] === b[q + 1] && a[i + 2] === b[q + 2] && a[i + 3] === b[q + 3]) a[i + 17] = b[q + 10];
    }
  }
}

const COCOA = 0x1a0f0b;
const PIT = 0x2b1a12;
const FLOOR_FILL = 0x7a4a2c;

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

interface SpriteOpts {
  flip?: boolean;
  rot?: number;
  alpha?: number;
  scale?: number;
  sxScale?: number;
  syScale?: number;
}

/** One moment to draw: the world as it is (`ago` 0) or as it was one step earlier (`ago` 1). */
interface View {
  ago: 0 | 1;
  t: number;
  camX: number;
  camY: number;
  hero: PoseInput & { x: number; y: number; stride: number; invuln: number; big: number; bubble: number; turbo: number; pose: World['hero']['pose'] };
  /** Position of a moving thing at this moment. */
  pos: (x: number, px: number | undefined) => number;
  /** A timer that grew by one step: its value at this moment. */
  timer: (v: number) => number;
}

function viewNow(world: World): View {
  const h = world.hero;
  return {
    ago: 0,
    t: world.t,
    camX: world.camX,
    camY: world.camY,
    hero: { ...h, big: heroScale(h), bubble: h.powers.bubble, turbo: h.powers.turbo, pose: h.pose },
    pos: (x) => x,
    timer: (v) => v,
  };
}

function viewBefore(world: World): View {
  const p = world.prev;
  return {
    ago: 1,
    t: p.t,
    camX: p.camX,
    camY: p.camY,
    hero: {
      x: p.x,
      y: p.y,
      stride: p.stride,
      onGround: p.onGround,
      pose: p.pose,
      landVy: p.landVy,
      wag: p.wag,
      airTime: p.airTime,
      sinceLand: p.sinceLand,
      vy: p.vy,
      restBlend: p.restBlend,
      boost: p.boost,
      landImpact: p.landImpact,
      invuln: p.invuln,
      big: p.mega <= 0 ? 1 : 1 + (POWER.megaScale - 1) * Math.min(1, p.megaAge / POWER.megaRamp, p.mega / POWER.megaRamp),
      bubble: world.hero.powers.bubble,
      turbo: Math.max(0, world.hero.powers.turbo + STEP),
    },
    pos: (x, px) => px ?? x,
    timer: (v) => v - STEP,
  };
}

const scratch = new OpList();

export function buildFrame(world: World, setup: FrameSetup, out = new OpList()): OpList {
  out.reset();
  drawScene(world, setup, viewNow(world), out, setup.probe);
  // A frozen world (hit-stop, respawn) has no "one step ago": every op stays put.
  if (world.prev.t === world.t) return out;
  scratch.reset();
  drawScene(world, setup, viewBefore(world), scratch);
  out.takePrevFrom(scratch);
  return out;
}

function drawScene(world: World, setup: FrameSetup, v: View, out: OpList, probe?: PupProbe) {
  const { atlas, k, screenW, screenH } = setup;
  const t = v.t;
  const shakeOn = setup.reduceMotion ? 0 : 1;
  const shakeAmp = v.ago ? world.prev : world.shake;
  const shakeX = Math.sin(t * 83) * (v.ago ? world.prev.shakeX : shakeAmp.x) * shakeOn * 8;
  const shakeY = Math.cos(t * 71) * (v.ago ? world.prev.shakeY : shakeAmp.y) * shakeOn * 6;
  const camX = v.camX + shakeX;
  const camY = v.camY + shakeY;

  const sx = (x: number) => (x - camX) * k;
  const sy = (y: number) => (FLOOR_SCREEN_Y - y + camY) * k;
  const viewL = camX - 120;
  const viewR = camX + screenW / k + 120;
  const visible = (x: number, w = 0) => x + w / 2 > viewL && x - w / 2 < viewR;

  /** Draws a sprite with its bottom centre at world (x, y). */
  const sprite = (name: SpriteName, x: number, y: number, opts: SpriteOpts = {}) => {
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
  /** Draws a sprite centred at world (cx, cy) with an exact world size (puppet pieces). */
  const part = (name: SpriteName, cx: number, cy: number, w: number, h: number, rot: number, alpha: number) => {
    const f = atlas.frames[name];
    if (f) out.push(f[0], f[1], f[2], f[3], f[4], sx(cx), sy(cy), w * k, h * k, rot, alpha, 0);
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
      out.cur = key(K.bg, n + 1000);
      out.push(bg.image, 0, 0, bg.w, bg.h, x + dw / 2, dh / 2 - screenH * 0.02 + camY * k * 0.3, mirror ? -dw : dw, dh, 0, 1, 0);
    }
    // Push the room back so the furniture you can jump on reads in front of it.
    out.cur = key(K.scrim, 0);
    out.push(RECT, 0, 0, 0, 0, screenW / 2, screenH / 2, screenW + 40, screenH + 40, 0, 0.22, 0x140a1f);
  }

  // Decorations stand behind the action.
  world.level.decor.forEach((d, i) => {
    out.cur = key(K.decor, i);
    if (visible(d.x, 260)) sprite(d.sprite, d.x + SPRITES[d.sprite].w / 2, d.y ?? 0);
  });

  // Floor: a dark pit everywhere, the level's own tiles over each segment.
  out.cur = key(K.pit, 0);
  out.push(RECT, 0, 0, 0, 0, screenW / 2, (sy(0) + screenH) / 2 + 2 * k, screenW + 40, screenH - sy(0) + 20 * k, 0, 1, PIT);
  const floorSprite = world.level.floor;
  const floorSize = SPRITES[floorSprite];
  const tile = floorSize.w;
  world.floor.forEach(([a, b], seg) => {
    const x0 = Math.max(a, viewL);
    const x1 = Math.min(b, viewR);
    if (x1 <= x0) return;
    out.cur = key(K.floorFill, seg);
    rect((x0 + x1) / 2, -floorSize.h / 2 - 30, x1 - x0, 60, FLOOR_FILL);
    const first = Math.floor((x0 - a) / tile) * tile + a;
    for (let x = first; x < x1; x += tile) {
      const w = Math.min(tile, b - x);
      const f = atlas.frames[floorSprite];
      if (!f) continue;
      out.cur = key(K.floorTile, seg * 4096 + Math.round((x - a) / tile));
      out.push(f[0], f[1], f[2], f[3] * (w / tile), f[4], sx(x + w / 2), sy(-floorSize.h / 2), w * k, floorSize.h * k, 0, 1, 0);
    }
    // Ink edge on pit lips.
    out.cur = key(K.lip, seg * 2);
    rect(a + 2, -20, 4, 40, COCOA, 0.8);
    out.cur = key(K.lip, seg * 2 + 1);
    rect(b - 2, -20, 4, 40, COCOA, 0.8);
  });

  // Furniture.
  world.platforms.forEach((p, i) => {
    out.cur = key(K.platform, i);
    if (visible(p.x + p.w / 2, p.w)) sprite(p.sprite, p.x + p.w / 2, p.y);
  });

  // Balloon posts.
  world.checkpoints.forEach((c, i) => {
    out.cur = key(K.checkpoint, i);
    if (visible(c.x)) sprite(c.reached ? 'balloon_post_up' : 'balloon_post_down', c.x, 0, { rot: c.reached ? Math.sin(t * 3 + c.x) * 0.05 : 0 });
  });

  // Finish arch for levels without a boss.
  out.cur = key(K.arch, 0);
  if (!world.level.boss && visible(world.level.finishX, 220)) sprite('party_arch', world.level.finishX, 0);

  // Crates with dogs inside.
  world.cages.forEach((c, i) => {
    if (!visible(c.x + 42, 100)) return;
    if (!c.open) {
      out.cur = key(K.cage, i * 2);
      sprite(dogSprite(c.dog), c.x + 42, c.y + 6, { rot: Math.sin(t * 9 + c.x) * 0.04, scale: 0.95 });
      out.cur = key(K.cage, i * 2 + 1);
      sprite('cage_closed', c.x + 42, c.y);
    } else {
      out.cur = key(K.cage, i * 2 + 1);
      sprite('cage_open', c.x + 42, c.y);
    }
  });

  // Bones and presents bob in place; taken ones float up and fade.
  world.pickups.forEach((p, i) => {
    if (!visible(p.x)) return;
    out.cur = key(K.pickup, i);
    if (p.taken) {
      const takenT = v.timer(p.takenT);
      if (takenT > 0.4 || takenT < 0) return;
      const u = takenT / 0.4;
      sprite(p.sprite, p.x, p.y + u * 50, { alpha: 1 - u, scale: 1 + u * 0.6 });
      return;
    }
    const bob = Math.sin(t * 4 + p.x * 0.05) * 3;
    sprite(p.sprite, p.x, p.y + bob, { rot: p.kind === 'present' ? 0 : Math.sin(t * 3 + p.x) * 0.15 });
  });

  // Squirrels, the cat, the vacuum and toy blocks.
  for (const e of world.enemies) {
    if (!visible(e.x, 80)) continue;
    out.cur = key(K.enemy, e.id);
    const ex = v.pos(e.x, e.px);
    const ey = v.pos(e.y, e.py);
    const et = Math.max(0, v.timer(e.t));
    const flip = e.facing < 0;
    // A hit pops the enemy: a quick stretch up and back, as the stun or flee starts.
    const popT = v.ago ? Math.min(0.18, e.pop + STEP) : e.pop;
    const pop = e.pop > 0 ? 1 + 0.26 * Math.sin((Math.PI * popT) / 0.18) : 1;
    const o = { flip, syScale: pop, sxScale: 1 / Math.sqrt(pop) };
    if (e.type === 'runner' || e.type === 'thrower') {
      if (e.state === 'stunned') sprite('squirrel_stunned', ex, ey, { ...o, rot: et * 9 });
      else if (e.type === 'runner') {
        // Waiting at the edge: idle. Hopping in: the first run frame, stretched up. Charging: the run cycle.
        if (!e.awake) sprite(`squirrel_idle_${Math.floor(t * 3 + e.id) % 2}` as SpriteName, ex, ey, o);
        else if (et < WARN.runnerHop) sprite('squirrel_run_0', ex, ey, o);
        else sprite(`squirrel_run_${Math.floor(t * 14) % 4}` as SpriteName, ex, ey, o);
      } else if (e.windup > 0) {
        // Leaning back with the acorn: the tell before every throw.
        const w = v.ago ? Math.min(WARN.windup, e.windup + STEP) : e.windup;
        const u = 1 - w / WARN.windup;
        const crouch = 1 - 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.15));
        sprite('squirrel_throw_0', ex, ey, { ...o, rot: (flip ? 1 : -1) * 0.32 * u, syScale: pop * crouch, sxScale: (1 / Math.sqrt(pop)) * (1 / Math.sqrt(crouch)) });
      } else if (e.throwing > 0) sprite(e.throwing > 0.15 ? 'squirrel_throw_0' : 'squirrel_throw_1', ex, ey, o);
      else sprite(`squirrel_idle_${Math.floor(t * 3 + e.id) % 2}` as SpriteName, ex, ey, o);
    } else if (e.type === 'cat') {
      if (e.state === 'fled') sprite('cat_awake_0', ex, ey, { ...o, rot: -et * 4 });
      else if (!e.awake) {
        const breathe = 1 + Math.sin(t * 2.4) * 0.03;
        sprite('cat_sleep', ex, ey, { flip, syScale: breathe, sxScale: 1 / Math.sqrt(breathe) });
      } else sprite(`cat_awake_${Math.floor(et * 6) % 2}` as SpriteName, ex, ey, o);
    } else if (e.type === 'vacuum') {
      sprite(`vacuum_${Math.floor(t * 12) % 2}` as SpriteName, ex, ey, o);
    } else {
      sprite('toy_blocks', ex, ey, { ...o, rot: e.state === 'stunned' ? et * 6 : 0 });
    }
  }

  // Where each thrown acorn will land: a shadow ring on the floor that grows and darkens as it drops.
  for (const a of world.acorns) {
    if (a.landT <= 0 || a.rolling || a.reflected || !visible(a.landX)) continue;
    out.cur = key(K.landMark, a.id ?? 0);
    const left = v.ago ? Math.min(WARN.acornFlight, a.landT + STEP) : a.landT;
    const u = 1 - left / WARN.acornFlight;
    sprite('land_mark', a.landX, 1, { scale: 0.6 + 0.55 * u, alpha: 0.5 + 0.5 * u });
  }

  // Acorns.
  for (const a of world.acorns) {
    if (!visible(a.x)) continue;
    out.cur = key(K.acorn, a.id ?? 0);
    const spin = v.ago ? a.spin - STEP * (a.rolling ? -14 : 10) : a.spin;
    sprite(a.golden ? 'acorn_golden' : 'acorn', v.pos(a.x, a.px), v.pos(a.y, a.py) - 9, { rot: spin, scale: a.golden ? 1.4 : 1 });
  }

  // Tennis balls from Ball Mouth.
  for (const ball of world.balls) {
    if (!ball.alive || !visible(ball.x)) continue;
    out.cur = key(K.ball, ball.id ?? 0);
    const bt = Math.max(0, v.timer(ball.t));
    sprite('tennis_ball', v.pos(ball.x, ball.px), v.pos(ball.y, ball.py) - 9, { rot: bt * 18, scale: 1.1 });
  }

  // The wagon with the rescued friends rides behind the dog.
  const friends = followerDraws(world, { t, ago: world.trailMoved ? v.ago : 0, heroX: v.hero.x, heroY: v.hero.y });
  friends.ropes.forEach((r, i) => {
    const dx = r.x1 - r.x0;
    const dy = r.y1 - r.y0;
    out.cur = key(K.rope, i);
    rect((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, Math.hypot(dx, dy), 2.2, COCOA, 0.9, -Math.atan2(dy, dx));
  });
  friends.sprites.forEach((f, i) => {
    out.cur = key(K.follower, i);
    sprite(f.sprite, f.x, f.y, f);
  });

  drawHero(world, v, out, sprite, part, probe);

  // The boss.
  const b = world.boss;
  if (b && b.phase !== 'waiting' && b.phase !== 'gone' && visible(b.x, 140)) {
    const bx = v.pos(b.x, b.px);
    const by = v.pos(b.y, b.py);
    let name: SpriteName = `boss_idle_${Math.floor(t * 4) % 2}` as SpriteName;
    if (b.phase === 'defeated') name = 'boss_defeated';
    else if (b.phase === 'hurt' || b.hurtT > 0) name = 'boss_hurt';
    else if (b.throwing > 0) name = b.throwing > 0.18 ? 'boss_throw_0' : 'boss_throw_1';
    const blink = b.hurtT > 0 && Math.floor(b.hurtT * 20) % 2 === 0 ? 0.5 : 1;
    out.cur = key(K.boss, 0);
    sprite(name, bx, by, { flip: true, alpha: blink });
    // The stolen cake rides on the boss until it is beaten, then drops for the party.
    out.cur = key(K.boss, 1);
    if (b.phase === 'defeated') sprite('cake', bx - 90, 0, { scale: Math.min(1, 0.4 + v.timer(b.t)) });
    else sprite('cake', bx + 30, by + 104, { scale: 0.6, rot: Math.sin(t * 5) * 0.1 });
  }
  out.cur = key(K.cakeGone, 0);
  if (b && b.phase === 'gone') sprite('cake', v.hero.x + BOSS_LEAD - 130, 0);

  // Zoomies: speed lines streak behind the dog.
  const boost = Math.max(v.hero.boost, v.hero.turbo > 0 ? 0.3 : 0);
  if (boost > 0) {
    const strength = Math.min(1, boost / 0.3);
    for (let i = 0; i < 4; i++) {
      const x = v.hero.x - 50 - i * 19 - ((t * 700 + i * 37) % 44);
      const y = v.hero.y + 12 + i * 11 + Math.sin(t * 9 + i) * 2;
      // Ink streaks with a pale core, so they read on the wood floor and the rugs alike.
      out.cur = key(K.speedLine, i * 2);
      rect(x, y, 30 + i * 5, 5, COCOA, 0.5 * strength);
      out.cur = key(K.speedLine, i * 2 + 1);
      rect(x, y, 26 + i * 5, 2, 0xfff4e2, 0.9 * strength);
    }
  }

  // Particles: dust, sparkles, hearts, confetti and the bark burst.
  for (const p of world.particles) {
    if (!visible(p.x)) continue;
    out.cur = key(K.particle, p.id ?? 0);
    const life = v.ago ? Math.min(p.maxLife, p.life + STEP) : p.life;
    const fade = Math.min(1, life / (p.maxLife * 0.35));
    const scale = p.scale1 === undefined ? p.scale : p.scale + (p.scale1 - p.scale) * (1 - life / p.maxLife);
    const rot = v.ago ? p.rot - p.vr * STEP : p.rot;
    const x = v.pos(p.x, p.px);
    const y = v.pos(p.y, p.py);
    if (p.color) rect(x, y, 7, 4.5, hexToInt(p.color), fade, rot);
    else sprite(p.sprite, x, y, { rot, alpha: fade, scale });
  }
}

type SpriteFn = (name: SpriteName, x: number, y: number, opts?: SpriteOpts) => void;
type PartFn = (name: SpriteName, cx: number, cy: number, w: number, h: number, rot: number, alpha: number) => void;

// The Dog Better puppet: pieces placed in the walking sticker's 802 x 714 px canvas (pupFrames.json).
const PUP_CANVAS = { w: 802, h: 714 };
const PUP_S = SPRITES.pup_base.w / PUP_CANVAS.w;
const BASE_BOX = [0, 0, PUP_CANVAS.w, PUP_CANVAS.h];
const LEGS_BOX = [6, 420, 728, 714];
const TAIL_BOX = [72, 229, 292, 392];

/** One piece of the puppet: a frame, the canvas box it was cut from, and how much of it shows. */
interface PupLayer {
  name: SpriteName;
  box: number[];
  alpha: number;
  /** Extra lift for this piece, world units (the legs trail the body a little in the bound). */
  lift?: number;
}

function drawPuppet(part: PartFn, x: number, y: number, o: { rot: number; alpha: number; sxScale: number; syScale: number; big: number }, layers: PupLayer[]) {
  const H = SPRITES.pup_base.h * o.syScale * o.big;
  const cos = Math.cos(o.rot);
  const sin = Math.sin(o.rot);
  // Place a piece by its box in canvas px: squash about the paws, then turn about the pup's middle.
  // Every layer is pushed, even at alpha 0, so the canvas can pair each slot with its previous self.
  for (const l of layers) {
    const alpha = o.alpha * l.alpha;
    const box = l.box;
    const bx = ((box[0] + box[2]) / 2 - PUP_CANVAS.w / 2) * PUP_S * o.sxScale * o.big;
    const by = (PUP_CANVAS.h - (box[1] + box[3]) / 2) * PUP_S * o.syScale * o.big - H / 2;
    const w = (box[2] - box[0]) * PUP_S * o.sxScale * o.big;
    const h = (box[3] - box[1]) * PUP_S * o.syScale * o.big;
    // Screen rotation is clockwise for positive angles; in world space (y up) that is the inverse turn.
    part(l.name, x + bx * cos + by * sin, y + H / 2 - bx * sin + by * cos, w, h, o.rot, alpha);
  }
}

const leg = (i: number): SpriteName => `pup_leg_${i}` as SpriteName;
const tail = (i: number): SpriteName => `pup_tail_${i}` as SpriteName;

/** The puppet's six layers for a pose: body, two tail frames, two stride frames, the rest frame. */
export function puppetLayers(p: HeroPoseOut, probe?: PupProbe): PupLayer[] {
  if (probe) {
    probe.legA = p.legA;
    probe.legB = p.legB;
    probe.legT = p.legT;
    probe.tuckT = 0;
  }
  const live = 1 - p.restT;
  return [
    { name: 'pup_base', box: BASE_BOX, alpha: 1 },
    { name: tail(p.tailA), box: TAIL_BOX, alpha: 1 },
    { name: tail(p.tailB), box: TAIL_BOX, alpha: p.tailT },
    // Adjacent stride frames nearly coincide, so the next one stacks over the current one instead of cross-fading.
    { name: leg(p.legA), box: LEGS_BOX, alpha: live },
    { name: leg(p.legB), box: LEGS_BOX, alpha: live * p.legT },
    { name: 'pup_leg_rest', box: LEGS_BOX, alpha: p.restT },
  ];
}

function drawHero(world: World, v: View, out: OpList, sprite: SpriteFn, part: PartFn, probe?: PupProbe) {
  const h = v.hero;
  if (world.phase === 'respawn' && world.phaseT < 0.9) return;
  const t = v.t;
  const flicker = h.invuln > 0 && Math.floor(h.invuln * 14) % 2 === 0 ? 0.35 : 1;
  const big = h.big;

  if (h.bubble > 0) {
    // The Bubble floats around the pup, breathing a little.
    const puff = 1 + Math.sin(t * 5) * 0.03;
    out.cur = key(K.hero, 100);
    sprite('bubble', h.x + 4, h.y - 6 * big, { scale: 1.35 * big * puff, alpha: 0.9 });
  }

  // Poses with their own sticker: slide, bark, hurt wobble, cheer.
  let name: SpriteName | null = null;
  let rot = 0;
  let lift = 0;
  switch (h.pose) {
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
    default:
      break;
  }
  if (name) {
    const sy = h.boost > 0 ? 0.97 : 1;
    out.cur = key(K.hero, 0);
    sprite(name, h.x, h.y + lift, { rot, alpha: flicker, sxScale: 1 / Math.sqrt(sy), syScale: sy, scale: big });
    return;
  }

  // Running and airborne: the puppet, driven by one continuous pose.
  const pose = heroPose(h, h.stride, STEP);
  const sy = pose.sy * (h.boost > 0 ? 0.97 : 1);
  const layers = puppetLayers(pose, probe);
  const base = key(K.hero, 1);
  let slot = 0;
  drawPuppet(
    (nm, cx, cy, w, hh, r, a) => {
      out.cur = base + slot++;
      part(nm, cx, cy, w, hh, r, a);
    },
    h.x,
    h.y + pose.lift * big,
    { rot: h.pose === 'hurt' ? rot : pose.rot, alpha: flicker, sxScale: 1 / Math.sqrt(sy), syScale: sy, big },
    layers,
  );
}
