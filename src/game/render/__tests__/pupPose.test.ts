import { PUP_LEG_FRAMES, PUP_TAIL_FRAMES } from '../../sprites';
import { CHAPTER_1 } from '../../level/chapter1';
import { MAX_STRIDE_SPEED, STEP, STRIDE_LEN } from '../../constants';
import { createWorld, stepWorld } from '../../sim/world';
import { NO_INPUT, type Hero } from '../../sim/types';
import { TUCK_BLEND, fallShare, legFrames, tailFrames, tuckShare } from '../pupPose';
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
  pose: 'run',
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

  it('wags the tail through every frame and back to the first', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(tailFrames(i / 400).a);
    expect(seen.size).toBe(PUP_TAIL_FRAMES);
    expect(tailFrames(1 / 2.4 - 1e-6).b).toBe(0);
  });
});

describe('tuck and fall', () => {
  it('eases in over the first moments in the air and out after landing', () => {
    expect(tuckShare(hero({ onGround: false, airTime: 0 }))).toBe(0);
    expect(tuckShare(hero({ onGround: false, airTime: TUCK_BLEND / 2 }))).toBeCloseTo(0.5);
    expect(tuckShare(hero({ onGround: false, airTime: 1 }))).toBe(1);
    expect(tuckShare(hero({ onGround: true, sinceLand: 0 }))).toBe(1);
    expect(tuckShare(hero({ onGround: true, sinceLand: TUCK_BLEND }))).toBe(0);
  });

  it('turns the tuck over across the top of the jump, not at one instant', () => {
    expect(fallShare(500)).toBe(0);
    expect(fallShare(0)).toBeCloseTo(0.5);
    expect(fallShare(-500)).toBe(1);
    expect(fallShare(30)).toBeGreaterThan(0);
    expect(fallShare(30)).toBeLessThan(0.5);
  });
});

describe('puppet layers', () => {
  it('shows two stride frames on the ground and only the tuck in the air', () => {
    const run = puppetLayers(hero(), 0.3, 1).filter((l) => l.alpha > 0.01 && l.name.startsWith('pup_leg'));
    expect(run.map((l) => l.name)).toEqual(['pup_leg_14', 'pup_leg_15']);
    const air = puppetLayers(hero({ onGround: false, airTime: 1, vy: 400 }), 0.3, 1).filter((l) => l.alpha > 0.01 && l.name.startsWith('pup_leg'));
    expect(air.map((l) => l.name)).toEqual(['pup_leg_12']);
  });

  it('rests on all four paws when blocked', () => {
    const legs = puppetLayers(hero({ restBlend: 1 }), 0.3, 1).filter((l) => l.alpha > 0.01 && l.name.startsWith('pup_leg'));
    expect(legs.map((l) => l.name)).toEqual(['pup_leg_rest']);
  });
});

describe('stride in the simulation', () => {
  const flat = { ...CHAPTER_1, floorSegments: [[-600, 20000]] as [number, number][], platforms: [], enemies: [], pickups: [], cages: [], checkpoints: [], callouts: [], boss: undefined };

  it('advances one cycle per STRIDE_LEN of ground covered', () => {
    const w = createWorld(flat, 640);
    for (let i = 0; i < 32; i++) stepWorld(w, NO_INPUT, STEP);
    expect(w.hero.x).toBeCloseTo(160, 0);
    expect(w.hero.stride).toBeCloseTo((160 / STRIDE_LEN) % 1);
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

  it('gives every op where it was one step ago, in the previous camera', () => {
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
  });

  it('starts a fresh world with no motion to blend from', () => {
    const w = createWorld({ ...CHAPTER_1, enemies: [], pickups: [], cages: [], boss: undefined }, 640);
    const hero = find(buildFrame(w, setup).data, 10)!;
    expect(hero.pcx).toBe(hero.cx);
  });
});
