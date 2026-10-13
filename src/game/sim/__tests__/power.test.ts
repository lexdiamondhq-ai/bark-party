import { CHAPTER_1 } from '../../level/chapter1';
import type { LevelDef } from '../../level/types';
import { POWER, STEP } from '../../constants';
import { NO_BOOSTS } from '../../../engine/progress';
import { createWorld, drainEvents, heroScale, stepWorld } from '../world';
import { NO_INPUT, type Input, type PowerKind } from '../types';

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
/** Picks a seed whose first present gives `kind`. */
function worldWithPresent(kind: PowerKind, extra: Partial<LevelDef> = {}) {
  for (let seed = 1; seed < 60; seed++) {
    const w = createWorld(flat({ pickups: [{ kind: 'present', x: 120, y: 18 }], ...extra }), 640, seed);
    run(w, 0.6);
    const got = drainEvents(w).find((e) => e.type === 'power');
    if (got && got.type === 'power' && got.kind === kind) return w;
  }
  throw new Error(`no seed gives ${kind}`);
}

describe('presents', () => {
  it('give one of the four powers', () => {
    const seen = new Set<PowerKind>();
    for (let seed = 1; seed < 40 && seen.size < 4; seed++) {
      const w = createWorld(flat({ pickups: [{ kind: 'present', x: 120, y: 18 }] }), 640, seed);
      run(w, 0.6);
      for (const e of drainEvents(w)) if (e.type === 'power') seen.add(e.kind);
    }
    expect(seen.size).toBe(4);
  });
});

describe('Mega Pup', () => {
  it('grows in, crushes a squirrel on contact and shrugs off acorns', () => {
    const w = worldWithPresent('mega', { enemies: [{ type: 'runner', x: 400, speed: 0 }, { type: 'thrower', x: 900, every: 0.4 }] });
    expect(w.hero.powers.mega).toBeCloseTo(POWER.megaTime, 0);
    expect(heroScale(w.hero)).toBeLessThan(POWER.megaScale);
    run(w, 0.4);
    expect(heroScale(w.hero)).toBeCloseTo(POWER.megaScale);
    run(w, 1.2);
    expect(w.enemies[0].state).toBe('stunned');
    expect(w.hero.hearts).toBe(3);
    run(w, 2.5);
    expect(w.hero.hearts).toBe(3);
    expect(w.hurtCount).toBe(0);
  });

  it('wears off and the bonus from the shop makes it last longer', () => {
    const w = createWorld(flat(), 640, 1, { ...NO_BOOSTS, megaBonus: 3 });
    w.hero.powers.mega = POWER.megaTime + 3;
    run(w, POWER.megaTime + 2);
    expect(w.hero.powers.mega).toBeGreaterThan(0);
    run(w, 1.5);
    expect(w.hero.powers.mega).toBe(0);
    expect(heroScale(w.hero)).toBe(1);
  });
});

describe('Turbo', () => {
  it('runs faster and bones count double', () => {
    const w = worldWithPresent('turbo', { pickups: [{ kind: 'present', x: 120, y: 18 }, { kind: 'bone', x: 700, y: 18 }] });
    run(w, 1.2);
    expect(w.hero.vx).toBeGreaterThan(w.level.runSpeed * 1.4);
    run(w, 1);
    expect(w.bones).toBe(2);
  });
});

describe('Ball Mouth', () => {
  it('turns the bark into a ball that stuns a squirrel far ahead', () => {
    const w = worldWithPresent('ball', { enemies: [{ type: 'runner', x: 700, speed: 0 }] });
    stepWorld(w, { ...NO_INPUT, barkPressed: true }, STEP);
    expect(w.balls.length).toBe(1);
    run(w, 0.5);
    expect(w.enemies[0].state).toBe('stunned');
    expect(w.balls.length).toBe(0);
  });

  it('fires two balls with the Twin Balls treat', () => {
    const w = createWorld(flat(), 640, 1, { ...NO_BOOSTS, balls: 2 });
    w.hero.powers.ball = 5;
    stepWorld(w, { ...NO_INPUT, barkPressed: true }, STEP);
    expect(w.balls.length).toBe(2);
  });
});

describe('Bubble', () => {
  it('eats one hit, pops, and the next hit costs a heart', () => {
    const w = createWorld(flat({ enemies: [{ type: 'blocks', x: 300 }, { type: 'blocks', x: 900 }] }), 640, 1, { ...NO_BOOSTS, startBubble: true });
    expect(w.hero.powers.bubble).toBe(1);
    run(w, 1.4);
    expect(w.hero.powers.bubble).toBe(0);
    expect(w.hero.hearts).toBe(3);
    expect(drainEvents(w).some((e) => e.type === 'bubble_pop')).toBe(true);
    run(w, 2.2);
    expect(w.hero.hearts).toBe(2);
  });
});
