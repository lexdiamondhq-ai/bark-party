import { CHAPTER_1 } from '../../level/chapter1';
import { CHAPTER_2 } from '../../level/chapter2';
import type { LevelDef } from '../../level/types';
import { HERO_BOX, PHYS } from '../../constants';
import { createWorld, drainEvents, groundBelow, levelResult, stepWorld } from '../world';
import { NO_INPUT, type Input, type World } from '../types';
import { autopilot } from './autopilot';

const DT = 1 / 60;

function flat(extra: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 'test',
    chapter: 0,
    title: 'Test',
    subtitle: '',
    winTitle: 'Done!',
    background: 'room_living',
    floor: 'floor_living',
    music: 'none',
    runSpeed: 300,
    floorSegments: [[-600, 20000]],
    platforms: [],
    enemies: [],
    pickups: [],
    cages: [],
    checkpoints: [],
    callouts: [],
    decor: [],
    finishX: 20000,
    ...extra,
  };
}

function run(world: World, seconds: number, input: (w: World) => Input = () => NO_INPUT) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) stepWorld(world, input(world), DT);
}

const press: Input = { jumpPressed: true, jumpHeld: true, slidePressed: false, barkPressed: false };
const hold: Input = { ...NO_INPUT, jumpHeld: true };

describe('hero movement', () => {
  it('auto-runs at the level speed', () => {
    const w = createWorld(flat(), 640);
    run(w, 1);
    expect(w.hero.x).toBeCloseTo(300, -1);
    expect(w.hero.onGround).toBe(true);
  });

  it('holding jump goes higher than a tap', () => {
    const peak = (holdFrames: number) => {
      const w = createWorld(flat(), 640);
      let best = 0;
      let f = 0;
      run(w, 1.2, () => {
        best = Math.max(best, w.hero.y);
        f++;
        if (f === 1) return press;
        return f < holdFrames ? hold : NO_INPUT;
      });
      return best;
    };
    const tap = peak(2);
    const full = peak(60);
    expect(full).toBeGreaterThan(120);
    expect(tap).toBeLessThan(full * 0.7);
  });

  it('allows one air jump', () => {
    const w = createWorld(flat(), 640);
    stepWorld(w, press, DT);
    run(w, 0.25, () => hold);
    stepWorld(w, press, DT);
    expect(w.hero.jumpsUsed).toBe(2);
    const vy = w.hero.vy;
    stepWorld(w, press, DT);
    expect(w.hero.vy).toBeLessThan(vy);
  });

  it('lands on furniture from above', () => {
    const w = createWorld(flat({ platforms: [{ sprite: 'couch', x: 200 }] }), 640);
    let f = 0;
    run(w, 1.4, () => (f++ === 15 ? press : hold));
    expect(w.hero.x).toBeGreaterThan(300);
    const g = groundBelow(w, w.hero.x, 10, 999);
    if (w.hero.x < 420) expect(g).toBe(50);
  });

  it('a solid box stops the dog until it jumps', () => {
    const w = createWorld(flat({ platforms: [{ sprite: 'cardboard_box', x: 200, solid: true }] }), 640);
    run(w, 2);
    expect(w.hero.x).toBeLessThanOrEqual(200 - HERO_BOX.w / 2 + 0.01);
    expect(w.hero.blocked).toBe(true);
    stepWorld(w, press, DT);
    run(w, 1, () => hold);
    expect(w.hero.x).toBeGreaterThan(260);
  });

  it('falling in a pit costs a heart and respawns at the checkpoint', () => {
    const w = createWorld(flat({ floorSegments: [[-600, 500], [800, 5000]], checkpoints: [100] }), 640);
    // Edge hop, fall, hit-stop and the respawn pause: back on the floor a little after three seconds.
    run(w, 3.5);
    const events = drainEvents(w);
    expect(events.some((e) => e.type === 'hurt')).toBe(true);
    expect(w.hero.hearts).toBe(2);
    expect(w.hero.x).toBeLessThan(500);
    expect(w.hero.x).toBeGreaterThanOrEqual(100);
  });
});

describe('enemies', () => {
  it('stomping a squirrel stuns it and bounces the dog', () => {
    const w = createWorld(flat({ enemies: [{ type: 'runner', x: 330, speed: 0 }] }), 640);
    let f = 0;
    run(w, 1.2, () => (f++ === 30 ? press : hold));
    expect(w.enemies.every((e) => e.state !== 'active')).toBe(true);
    expect(w.hero.hearts).toBe(3);
  });

  it('running into a squirrel hurts', () => {
    const w = createWorld(flat({ enemies: [{ type: 'runner', x: 300 }] }), 640);
    run(w, 1);
    expect(w.hero.hearts).toBe(2);
  });

  it('bark stuns a squirrel in range', () => {
    const w = createWorld(flat({ enemies: [{ type: 'runner', x: 260, speed: 0 }] }), 640);
    run(w, 0.3);
    stepWorld(w, { ...NO_INPUT, barkPressed: true }, DT);
    expect(w.enemies[0].state).toBe('stunned');
  });

  it('sliding under a thrown acorn avoids it', () => {
    const w = createWorld(flat({ enemies: [{ type: 'thrower', x: 700, every: 99 }] }), 640);
    let slid = false;
    run(w, 2, (ww) => {
      const a = ww.acorns[0];
      if (a && !slid && a.x - ww.hero.x < 120) {
        slid = true;
        return { ...NO_INPUT, slidePressed: true };
      }
      // Hop over the squirrel itself once past the acorn.
      if (ww.enemies[0] && ww.enemies[0].x - ww.hero.x < 90 && ww.hero.onGround && ww.hero.sliding <= 0) return press;
      return hold;
    });
    expect(slid).toBe(true);
    expect(w.hurtCount).toBe(0);
  });
});

describe('pickups and friends', () => {
  it('collects bones and frees a caged dog who then follows', () => {
    const w = createWorld(
      flat({ pickups: [{ kind: 'bone', x: 200, y: 18 }, { kind: 'bone_gold', x: 260, y: 18 }], cages: [{ x: 400, dog: 'husky' }] }),
      640,
    );
    run(w, 2);
    expect(w.bones).toBe(1);
    expect(w.goldBones).toBe(1);
    expect(w.followers).toEqual(['husky']);
    expect(levelResult(w).stars).toBe(3);
  });

  it('finishing a level without a boss wins', () => {
    const w = createWorld(flat({ finishX: 600 }), 640);
    run(w, 5);
    expect(w.phase).toBe('won');
    expect(drainEvents(w).some((e) => e.type === 'won')).toBe(true);
  });
});

describe('boss', () => {
  it('golden acorns barked back beat the boss', () => {
    const w = createWorld(flat({ boss: { x: 100, name: 'Big Nutsy', hits: 3 } }), 640);
    let won = false;
    run(w, 40, (ww) => {
      if (ww.phase === 'won') won = true;
      for (const a of ww.acorns) {
        const dx = a.x - ww.hero.x;
        if (a.golden && !a.reflected && dx > 0 && dx < 140 && ww.hero.barkCooldown <= 0) return { ...NO_INPUT, barkPressed: true };
        if (!a.golden && !a.reflected && dx > 0 && dx < 150 && ww.hero.barkCooldown <= 0) return { ...NO_INPUT, barkPressed: true };
      }
      return NO_INPUT;
    });
    expect(w.boss!.hits).toBe(3);
    expect(won).toBe(true);
  });
});

// A simple autopilot that plays Chapter 1 the way a decent player would. If a change to the
// level or the physics makes a section impossible, this test stops at that spot.
describe('Chapter 1', () => {
  it('the autopilot can reach the boss and win', () => {
    const w = createWorld(CHAPTER_1, 640, 7);
    let maxX = 0;
    for (let i = 0; i < 60 * 120 && w.phase !== 'won' && w.phase !== 'dead'; i++) {
      stepWorld(w, autopilot(w), DT);
      maxX = Math.max(maxX, w.hero.x);
    }
    const r = levelResult(w);
    // Helpful when tuning the level: where the run ended and what it picked up.
    console.log(`phase=${w.phase} maxX=${Math.round(maxX)} hurt=${w.hurtCount} bones=${r.bones}/${r.bonesTotal} gold=${r.goldBones}/${r.goldTotal} friends=${r.rescued}/${r.rescueTotal}`);
    expect(w.phase).toBe('won');
    expect(PHYS.gravity).toBeGreaterThan(0);
  });

  it('the autopilot can reach the Chapter 2 boss and win', () => {
    const w = createWorld(CHAPTER_2, 640, 7);
    let maxX = 0;
    for (let i = 0; i < 60 * 120 && w.phase !== 'won' && w.phase !== 'dead'; i++) {
      stepWorld(w, autopilot(w), DT);
      maxX = Math.max(maxX, w.hero.x);
    }
    const r = levelResult(w);
    console.log(`ch2 phase=${w.phase} maxX=${Math.round(maxX)} hurt=${w.hurtCount} bones=${r.bones}/${r.bonesTotal} gold=${r.goldBones}/${r.goldTotal} friends=${r.rescued}/${r.rescueTotal}`);
    expect(w.phase).toBe('won');
  });
});
