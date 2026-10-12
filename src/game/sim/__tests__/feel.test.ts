import { CHAPTER_1 } from '../../level/chapter1';
import { PHYS, STEP } from '../../constants';
import type { LevelDef } from '../../level/types';
import { HITSTOP, cameraLead, cameraLift, landImpact } from '../feel';
import { createWorld, drainEvents, stepWorld } from '../world';
import { NO_INPUT, type Input } from '../types';

const flat = (extra: Partial<LevelDef> = {}): LevelDef => ({
  ...CHAPTER_1,
  floorSegments: [[-600, 20000]],
  platforms: [],
  enemies: [],
  pickups: [],
  cages: [],
  checkpoints: [],
  callouts: [],
  decor: [],
  boss: undefined,
  ...extra,
});
const run = (w: ReturnType<typeof createWorld>, seconds: number, input: Input = NO_INPUT) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepWorld(w, input, STEP);
};

describe('feel rules', () => {
  it('rates a landing by its fall speed', () => {
    expect(landImpact(-100)).toBe(0);
    expect(landImpact(-1150)).toBe(1);
    expect(landImpact(-750)).toBeCloseTo(0.5);
  });

  it('leads the camera only when the dog runs faster than the level speed', () => {
    expect(cameraLead(300, 300)).toBe(0);
    expect(cameraLead(375, 300)).toBeCloseTo(22.5);
  });

  it('lifts the camera only when the dog is well off the floor', () => {
    expect(cameraLift(50)).toBe(0);
    expect(cameraLift(210)).toBeCloseTo(45);
  });
});

describe('feel in the simulation', () => {
  it('freezes the world for a few frames on a stomp, then carries on', () => {
    const w = createWorld(flat({ enemies: [{ type: 'runner', x: 330, speed: 0 }] }), 640);
    let f = 0;
    let frozen = 0;
    for (let i = 0; i < 120; i++) {
      f++;
      const press = f === 40;
      const before = w.t;
      stepWorld(w, { ...NO_INPUT, jumpPressed: press, jumpHeld: f >= 40 && f < 50 }, STEP);
      if (w.t === before) frozen++;
    }
    expect(w.enemies[0].state).toBe('stunned');
    const want = HITSTOP.stomp! / STEP;
    expect(frozen).toBeGreaterThanOrEqual(Math.floor(want));
    expect(frozen).toBeLessThanOrEqual(Math.ceil(want) + 1);
    expect(w.hero.x).toBeGreaterThan(330);
  });

  it('keeps a jump pressed during the freeze', () => {
    const w = createWorld(flat(), 640);
    w.hitstop = 0.05;
    stepWorld(w, { ...NO_INPUT, jumpPressed: true, jumpHeld: true }, STEP);
    expect(w.hero.jumpBuffer).toBe(PHYS.jumpBuffer);
  });

  it('gives zoomies after a slide and the camera leads the dog', () => {
    const w = createWorld(flat(), 640);
    run(w, 0.5);
    stepWorld(w, { ...NO_INPUT, slidePressed: true }, STEP);
    run(w, PHYS.slideTime + 0.1);
    expect(w.hero.boost).toBeGreaterThan(0);
    expect(w.hero.vx).toBeGreaterThan(w.level.runSpeed * 1.1);
    expect(drainEvents(w).some((e) => e.type === 'sfx' && e.name === 'whoosh')).toBe(true);
    run(w, 0.3);
    expect(w.camLead).toBeGreaterThan(5);
    run(w, 1.5);
    expect(w.hero.boost).toBe(0);
    expect(w.hero.vx).toBeCloseTo(w.level.runSpeed, 0);
  });

  it('hops a little when running off an edge', () => {
    // Start on top of a box and run off its far edge.
    const w = createWorld(flat({ platforms: [{ sprite: 'cardboard_box', x: 200 }] }), 640);
    w.hero.x = 220;
    w.hero.y = 59.5;
    let peakAfterEdge = 0;
    let onBox = false;
    for (let i = 0; i < 60; i++) {
      stepWorld(w, NO_INPUT, STEP);
      if (w.hero.onGround && w.hero.y > 50) onBox = true;
      if (onBox && !w.hero.onGround && w.hero.vy > 0) peakAfterEdge = Math.max(peakAfterEdge, w.hero.vy);
    }
    expect(onBox).toBe(true);
    expect(peakAfterEdge).toBeCloseTo(PHYS.ledgeHop);
  });

  it('a hard landing squashes more than a soft one', () => {
    const soft = createWorld(flat(), 640);
    stepWorld(soft, { ...NO_INPUT, jumpPressed: true }, STEP);
    run(soft, 1);
    const hard = createWorld(flat({ platforms: [{ sprite: 'bookshelf', x: 100 }] }), 640);
    hard.hero.y = 168;
    run(hard, 1.5);
    expect(hard.hero.landImpact).toBeGreaterThan(soft.hero.landImpact);
    expect(hard.hero.landImpact).toBeGreaterThan(0.3);
  });
});
