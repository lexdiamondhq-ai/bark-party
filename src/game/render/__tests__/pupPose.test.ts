import { PUP_LEG_FRAMES } from '../../sprites';
import { CHAPTER_1 } from '../../level/chapter1';
import { MAX_STRIDE_SPEED, STEP, STRIDE_LEN } from '../../constants';
import { createWorld, stepWorld } from '../../sim/world';
import { NO_INPUT, type Hero } from '../../sim/types';
import { AIR_DOWN, AIR_UP, GALLOP, airLeg, gallopBody, gallopLegIndex, heroPose, landSquash, legFrames } from '../pupPose';
import { STRIDE, buildFrame, puppetLayers, type AtlasData } from '../buildFrame';

const hero = (over: Partial<Hero> = {}): Hero => ({
  x: 0,
  y: 0,
  vx: 300,
  vy: 0,
  onGround: true,
  airTime: 0,
  jumpBuffer: 0,
  slideBuffer: 0,
  jumpsUsed: 0,
  sliding: 0,
  barking: 0,
  barkCooldown: 0,
  barkBuffer: 0,
  boost: 0,
  landImpact: 0,
  invuln: 0,
  hearts: 3,
  sinceLand: 1,
  stride: 0,
  blocked: false,
  restBlend: 0,
  landVy: 0,
  wag: 0,
  pose: 'run',
  powers: { mega: 0, turbo: 0, ball: 0, megaAge: 0, bubble: 0 },
  ...over,
});

describe('leg frames', () => {
  it('wraps from the last frame straight to the first', () => {
    expect(legFrames(0.999).a).toBe(PUP_LEG_FRAMES - 1);
    expect(legFrames(0.999).b).toBe(0);
    expect(legFrames(0).a).toBe(0);
    expect(legFrames(1).a).toBe(0);
  });

  it('visits every frame once per cycle and never repeats a pair', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 480; i++) seen.add(legFrames(i / 480).a);
    expect(seen.size).toBe(PUP_LEG_FRAMES);
  });

  it('blends continuously across the wrap', () => {
    const before = legFrames(1 - 0.5 / PUP_LEG_FRAMES);
    const after = legFrames(0.5 / PUP_LEG_FRAMES);
    expect(before.t).toBeCloseTo(0.5);
    expect(after.t).toBeCloseTo(0.5);
    expect(before.b).toBe(after.a);
  });

});

describe('air and landing', () => {
  it('flings the legs out on the way up and reaches down on the way in', () => {
    expect(airLeg(600)).toBeCloseTo(AIR_UP);
    expect(airLeg(-600)).toBeCloseTo(AIR_DOWN);
    expect(airLeg(0)).toBeGreaterThan(AIR_DOWN);
    expect(airLeg(0)).toBeLessThan(AIR_UP);
  });

  it('squashes harder after a long fall, with one overshoot', () => {
    const soft = landSquash(STEP, -200, 0, STEP);
    const hard = landSquash(STEP, -800, 0.5, STEP);
    expect(hard).toBeGreaterThan(soft);
    expect(hard).toBeGreaterThan(0.15);
    // Past the first bounce the squash goes slightly negative (a stretch), then dies out.
    const later = landSquash(STEP + 0.12, -800, 0.5, STEP);
    expect(later).toBeLessThan(0);
    expect(Math.abs(landSquash(0.6, -800, 0.5, STEP))).toBeLessThan(0.001);
  });

  it('scrubs the legs from the stride to the air pose after take-off, never jumping', () => {
    let last = heroPose(hero({ onGround: true, sinceLand: 1 }), 0.3, STEP).legIndex;
    for (let i = 1; i <= 8; i++) {
      const p = heroPose(hero({ onGround: false, airTime: i * STEP, vy: 600 }), 0.3, STEP);
      expect(Math.abs(p.legIndex - last)).toBeLessThan(6);
      last = p.legIndex;
    }
    expect(last).toBeCloseTo(AIR_UP, 0);
  });
});

describe('gallop', () => {
  it('sweeps the legs from touch to push while planted, then reaches fully in the air', () => {
    expect(gallopLegIndex(0)).toBeCloseTo(GALLOP.legTouch);
    expect(gallopLegIndex(GALLOP.contact)).toBeCloseTo(GALLOP.legPush);
    expect(gallopLegIndex(GALLOP.reachAt)).toBeCloseTo(GALLOP.legReach);
    let lo = 99;
    let hi = -1;
    for (let i = 0; i < 400; i++) {
      const f = gallopLegIndex(i / 400);
      lo = Math.min(lo, f);
      hi = Math.max(hi, f);
    }
    expect(lo).toBeGreaterThanOrEqual(GALLOP.legPush - 0.5);
    expect(hi).toBeLessThanOrEqual(GALLOP.legReach + 0.5);
  });

  it('bounds: on the ground through contact, highest mid-flight, squashed after touch, stretched after push-off', () => {
    expect(gallopBody(0).lift).toBe(0);
    expect(gallopBody(GALLOP.contact / 2).lift).toBe(0);
    const peak = GALLOP.contact + (1 - GALLOP.contact) / 2;
    expect(gallopBody(peak).lift).toBeCloseTo(GALLOP.lift);
    expect(gallopBody(0.1).sy).toBeLessThan(1);
    expect(gallopBody(GALLOP.contact + 0.08).sy).toBeGreaterThan(1);
    // Nose down at touch, up at push.
    expect(gallopBody(0.02).rot).toBeGreaterThan(0);
    expect(gallopBody(GALLOP.contact + 0.02).rot).toBeLessThan(0);
  });
});

describe('puppet layers', () => {
  it('always pushes six layers, two stride frames showing on the ground', () => {
    const p = heroPose(hero(), 0.33, STEP);
    const layers = puppetLayers(p);
    expect(layers.length).toBe(6);
    const legs = layers.filter((l) => l.alpha > 0.01 && l.name.startsWith('pup_leg'));
    expect(legs.map((l) => l.name)).toEqual([`pup_leg_${p.legA}`, `pup_leg_${p.legB}`]);
  });

  it('rests on all four paws when blocked', () => {
    const layers = puppetLayers(heroPose(hero({ restBlend: 1 }), 0.3, STEP));
    expect(layers.filter((l) => l.alpha > 0.01 && l.name.startsWith('pup_leg')).map((l) => l.name)).toEqual(['pup_leg_rest']);
  });
});

describe('stride in the simulation', () => {
  const flat = { ...CHAPTER_1, floorSegments: [[-600, 20000]] as [number, number][], platforms: [], enemies: [], pickups: [], cages: [], checkpoints: [], callouts: [], boss: undefined };

  it('advances one cycle per STRIDE_LEN of ground covered', () => {
    const w = createWorld(flat, 640);
    for (let i = 0; i < 32; i++) stepWorld(w, NO_INPUT, STEP);
    const covered = 32 * STEP * flat.runSpeed;
    expect(w.hero.x).toBeCloseTo(covered, 0);
    expect(w.hero.stride).toBeCloseTo((covered / STRIDE_LEN) % 1);
  });

  it('never cycles faster than MAX_STRIDE_SPEED', () => {
    const w = createWorld({ ...flat, runSpeed: 900 }, 640);
    const s0 = w.hero.stride;
    stepWorld(w, NO_INPUT, STEP);
    expect(w.hero.stride - s0).toBeCloseTo((MAX_STRIDE_SPEED * STEP) / STRIDE_LEN);
  });

  it('freezes the legs and settles to rest against a solid box', () => {
    const w = createWorld({ ...flat, platforms: [{ sprite: 'cardboard_box', x: 400, solid: true }] }, 640);
    for (let i = 0; i < 120; i++) stepWorld(w, NO_INPUT, STEP);
    expect(w.hero.blocked).toBe(true);
    expect(w.hero.restBlend).toBe(1);
    const s = w.hero.stride;
    stepWorld(w, NO_INPUT, STEP);
    expect(w.hero.stride).toBe(s);
  });
});

describe('frame interpolation', () => {
  const atlas: AtlasData = { pages: ['p'], frames: { pup_base: [0, 0, 0, 10, 10], couch: [0, 0, 0, 20, 20] } };
  const setup = { atlas, background: null, k: 1, screenW: 640, screenH: 360 };
  const find = (data: number[], srcW: number) => {
    for (let i = 0; i < data.length; i += STRIDE) if (data[i] === 0 && data[i + 3] === srcW) return { cx: data[i + 5], cy: data[i + 6], pcx: data[i + 12], pcy: data[i + 13] };
    return null;
  };

  it('gives every op where it was one step ago, in the previous camera, and its previous tilt', () => {
    const w = createWorld({ ...CHAPTER_1, enemies: [], pickups: [], cages: [], boss: undefined, platforms: [{ sprite: 'couch', x: 300 }] }, 640);
    stepWorld(w, NO_INPUT, STEP);
    stepWorld(w, NO_INPUT, STEP);
    const data = buildFrame(w, setup).data;
    const hero = find(data, 10)!;
    const couch = find(data, 20)!;
    // The hero ran 5 units and the camera followed part of the way, so on screen the hero moved by the difference.
    expect(hero.cx - hero.pcx).toBeCloseTo(w.hero.x - w.prev.x - (w.camX - w.prev.camX));
    // The couch stands still in the world, so on screen it moved back by the camera's move.
    expect(couch.cx - couch.pcx).toBeCloseTo(-(w.camX - w.prev.camX));
    expect(couch.cy).toBe(couch.pcy);
    // The hero's tilt changes with the bound, and the previous tilt rides along in the op.
    const rot = (data: number[], srcW: number) => {
      for (let i = 0; i < data.length; i += STRIDE) if (data[i] === 0 && data[i + 3] === srcW) return { rot: data[i + 9], prot: data[i + 16] };
      return null;
    };
    const r = rot(data, 10)!;
    expect(r.prot).not.toBe(r.rot);
  });

  it('starts a fresh world with no motion to blend from', () => {
    const w = createWorld({ ...CHAPTER_1, enemies: [], pickups: [], cages: [], boss: undefined }, 640);
    const hero = find(buildFrame(w, setup).data, 10)!;
    expect(hero.pcx).toBe(hero.cx);
  });
});
