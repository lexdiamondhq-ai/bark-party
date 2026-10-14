// Glitch probe: both chapters at the iPhone's view width, played by the autopilot and by hostile inputs, with
// every step checked for freezes, snaps, teleports, stuck states and double fires (see glitchProbe.ts), plus one
// test per mechanic that was caught misbehaving. PROBE=1 npm test -- glitch prints what every run saw.
import { CHAPTER_1 } from '../../level/chapter1';
import { CHAPTER_2 } from '../../level/chapter2';
import type { LevelDef } from '../../level/types';
import { HERO_BOX, PHYS, STEP, WARN } from '../../constants';
import { SPRITES } from '../../sprites';
import { NO_BOOSTS } from '../../../engine/progress';
import { followerDraws } from '../../render/followers';
import { HITSTOP } from '../feel';
import { continueFromCheckpoint, createWorld, drainEvents, setReduceMotion, snapPrev, stepWorld } from '../world';
import { NO_INPUT, type Input, type World } from '../types';
import { autopilot } from './autopilot';
import { PHONE_VIEW_W, describe as describeRun, probe } from './glitchProbe';

const PRINT = !!process.env.PROBE;
const MAX_FREEZE_STEPS = Math.ceil(Math.max(...Object.values(HITSTOP).map((v) => v ?? 0)) / STEP) + 1;

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
const run = (w: World, seconds: number, input: Input | ((w: World) => Input) = NO_INPUT) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepWorld(w, typeof input === 'function' ? input(w) : input, STEP);
};
const hurts = (w: World) => drainEvents(w).filter((e) => e.type === 'hurt').length;

/** Puts the pup in the air at (x, y) moving up or down at vy, with both jumps spent. */
function airborne(w: World, x: number, y: number, vy: number) {
  Object.assign(w.hero, { x, y, vy, onGround: false, airTime: 1, jumpsUsed: 2 });
  w.camX = x - 220;
  snapPrev(w);
}

describe('glitch probe: every step of both chapters, played well and played badly', () => {
  // [policy, seed, "Try again" presses]
  const RUNS: [string, number, number][] = [
    ['autopilot', 7, 0],
    ['holdJump', 1, 6],
    ['mashBark', 1, 6],
    ['slideSpam', 1, 6],
    ['none', 1, 4],
    ['diesToBoss', 1, 3],
    ['random', 1, 8],
    ['random', 2, 8],
    ['random', 3, 8],
    ['random', 4, 8],
  ];
  it.each([CHAPTER_1, CHAPTER_2])('$id', (level) => {
    for (const [policy, seed, retries] of RUNS) {
      const r = probe(level, policy, { seed, retries });
      if (PRINT) console.log(describeRun(r));
      const where = `${level.id} ${policy}${seed}`;
      expect({ where, findings: r.findings.map((f) => `${f.kind} t=${f.t} x=${f.x}: ${f.detail}`) }).toEqual({ where, findings: [] });
      // Hit-stops never stack into a stall, and nothing the canvas blends jumps across the screen.
      expect(r.longestFreeze).toBeLessThanOrEqual(MAX_FREEZE_STEPS);
      expect(r.maxHeroStep).toBeLessThan(level.runSpeed * PHYS.boostSpeed * 1.5 * STEP * 1.5);
      expect(r.maxCamStep).toBeLessThan(20);
      expect(r.maxThingStep).toBeLessThan(40);
      expect(r.maxParticles).toBeLessThanOrEqual(260);
      expect(r.maxEvents).toBeLessThan(60);
    }
    // The well-played run wins without a scratch and the boss fight ends.
    const best = probe(level, 'autopilot', { seed: 7 });
    expect(best.phase).toBe('won');
    expect(best.bossFight).not.toBeNull();
  });
});

describe('solid furniture', () => {
  it('a pup coming down on the top corner of a box or the fridge lands on it, never inside it', () => {
    // The approaches the traces caught: dropping past the corner, sliding over the lip with the paws just under
    // the top (the side check forgives 4 units there), and a swipe-down dive.
    const inside: string[] = [];
    let landedOnTop = 0;
    for (const sprite of ['cardboard_box', 'fridge'] as const) {
      const top = SPRITES[sprite].top;
      for (let dx = -70; dx <= -18; dx += 1.7) {
        for (const vy of [380, 200, 60, -60, -250, -500]) {
          for (const dy of [-3.9, -2, 0, 5, 16, 30]) {
            for (const dive of [false, true]) {
              const w = createWorld(flat({ platforms: [{ sprite, x: 600, solid: true }] }), PHONE_VIEW_W);
              airborne(w, 600 + dx, top + dy, vy);
              for (let i = 0; i < 90 && w.hero.x < 600 + SPRITES[sprite].w; i++) {
                stepWorld(w, { ...NO_INPUT, slidePressed: dive && i === 2 }, STEP);
                const h = w.hero;
                const ox = Math.min(h.x + HERO_BOX.w / 2, 600 + SPRITES[sprite].w) - Math.max(h.x - HERO_BOX.w / 2, 600);
                const oy = Math.min(h.y + (h.sliding > 0 ? HERO_BOX.slideH : HERO_BOX.h), top) - Math.max(h.y, 0);
                if (ox > 4 && oy > 4) {
                  inside.push(`${sprite} from dx=${dx.toFixed(1)} dy=${dy} vy=${vy}${dive ? ' dive' : ''}: ${ox.toFixed(0)} x ${oy.toFixed(0)} deep`);
                  break;
                }
                if (h.onGround && h.y === top) {
                  landedOnTop++;
                  break;
                }
              }
            }
          }
        }
      }
    }
    expect(inside.slice(0, 5)).toEqual([]);
    expect(landedOnTop).toBeGreaterThan(100);
  });

  it('the Chapter 1 autopilot lands on the stacked boxes instead of falling through them', () => {
    // The exact approach the autopilot took at 780 wide before the fix: it sank through both boxes to the floor.
    const w = createWorld(CHAPTER_1, PHONE_VIEW_W, 7);
    airborne(w, 2725.7, 135.4, -207);
    let lowest = Infinity;
    // 14 steps keep the pup over the upper box (2760-2820).
    for (let i = 0; i < 14; i++) {
      stepWorld(w, { ...NO_INPUT, jumpHeld: true }, STEP);
      lowest = Math.min(lowest, w.hero.y);
    }
    expect(lowest).toBeGreaterThanOrEqual(119.5);
    expect(w.hero.onGround).toBe(true);
  });

  it('a solid box still stops a pup that runs into its side', () => {
    const w = createWorld(flat({ platforms: [{ sprite: 'cardboard_box', x: 300, solid: true }] }), PHONE_VIEW_W);
    run(w, 2);
    expect(w.hero.blocked).toBe(true);
    expect(w.hero.x).toBeLessThanOrEqual(300 - HERO_BOX.w / 2 + 0.01);
    expect(w.hero.y).toBe(0);
  });
});

describe('enemies', () => {
  it('bouncing off the robot vacuum never hurts on the way up', () => {
    let bounces = 0;
    const bad: string[] = [];
    for (let vy = -200; vy >= -1300; vy -= 50) {
      for (let y = 40; y <= 60; y += 1.7) {
        const w = createWorld(flat({ enemies: [{ type: 'vacuum', x0: 400, x1: 401, speed: 0 }] }), PHONE_VIEW_W);
        airborne(w, 400, y, vy);
        let bounced = false;
        for (let i = 0; i < 40; i++) {
          stepWorld(w, { ...NO_INPUT, jumpHeld: true }, STEP);
          if (w.hero.vy === PHYS.stompBounce * 1.25) bounced = true;
          if (hurts(w)) {
            if (bounced) bad.push(`vy=${vy} y=${y.toFixed(1)}`);
            break;
          }
        }
        if (bounced) bounces++;
      }
    }
    expect(bounces).toBeGreaterThan(200);
    expect(bad).toEqual([]);
  });

  it('a thrower the pup runs past during its wind-up keeps its acorn instead of lobbing it backwards', () => {
    const w = createWorld(flat({ platforms: [{ sprite: 'bookshelf', x: 650 }], enemies: [{ type: 'thrower', x: 700, y: 168, every: 99 }] }), PHONE_VIEW_W);
    w.hero.x = 610;
    w.camX = 610 - 220;
    snapPrev(w);
    stepWorld(w, NO_INPUT, STEP);
    expect(w.enemies[0].windup).toBeGreaterThan(0);
    run(w, 1);
    expect(w.hero.x).toBeGreaterThan(700);
    expect(w.acorns.length).toBe(0);
  });

  it('a thrower stunned mid wind-up never throws', () => {
    const w = createWorld(flat({ enemies: [{ type: 'thrower', x: 300, every: 99 }] }), PHONE_VIEW_W);
    w.hero.x = 140;
    snapPrev(w);
    stepWorld(w, NO_INPUT, STEP);
    expect(w.enemies[0].windup).toBeGreaterThan(0);
    stepWorld(w, { ...NO_INPUT, barkPressed: true }, STEP);
    expect(w.enemies[0].state).toBe('stunned');
    run(w, WARN.windup + 0.5);
    expect(w.acorns.length).toBe(0);
  });

  it('an acorn flies on through the blinking pup and lands on its mark instead of vanishing', () => {
    // On the bookshelf, so the pup runs under the squirrel itself.
    const w = createWorld(flat({ platforms: [{ sprite: 'bookshelf', x: 850 }], enemies: [{ type: 'thrower', x: 900, y: 168, every: 99 }] }), PHONE_VIEW_W);
    let passed = false;
    let vanishedOnPup = false;
    for (let i = 0; i < 240; i++) {
      const a = w.acorns[0];
      if (a) w.hero.invuln = 0.6;
      const near = a && Math.abs(a.x - w.hero.x) < HERO_BOX.w && a.y > w.hero.y && a.y < w.hero.y + HERO_BOX.h;
      stepWorld(w, NO_INPUT, STEP);
      if (a && near && !w.acorns.includes(a) && a.y > 2) vanishedOnPup = true;
      if (a && near && w.acorns.includes(a)) passed = true;
    }
    expect(vanishedOnPup).toBe(false);
    expect(passed).toBe(true);
    expect(w.hurtCount).toBe(0);
  });

  it.each([false, true])('a lobbed acorn comes down on its landing mark as the mark runs out (pup mid-jump at the throw: %s)', (jumping) => {
    const w = createWorld(flat({ enemies: [{ type: 'thrower', x: 900, every: 99 }] }), PHONE_VIEW_W);
    let markX: number | null = null;
    let markGone: number | null = null;
    let pop: { x: number; t: number } | null = null;
    let jumped = false;
    let lastLandT: number = WARN.acornFlight;
    for (let i = 0; i < 60 * 5 && !pop; i++) {
      w.hero.invuln = 1; // the pup never stops it; this is about where it lands
      const e = w.enemies[0];
      const jump = jumping && !jumped && e.windup > 0 && e.windup < 0.2;
      if (jump) jumped = true;
      const a = w.acorns[0];
      stepWorld(w, { ...NO_INPUT, jumpPressed: jump, jumpHeld: jumped }, STEP);
      const b = w.acorns[0];
      if (b) {
        markX ??= b.landX;
        // The canvas draws the mark one step ago at landT + STEP (capped at WARN.acornFlight): never more than that.
        expect(b.landT).toBeLessThanOrEqual(Math.min(WARN.acornFlight, lastLandT) + 1e-9);
        expect(lastLandT - b.landT).toBeLessThanOrEqual(STEP + 1e-9);
        lastLandT = b.landT;
        if (b.landT === 0 && markGone === null) markGone = w.t;
      }
      if (a && !w.acorns.includes(a)) pop = { x: a.x, t: w.t };
    }
    expect(markX !== null && pop).toBeTruthy();
    expect(Math.abs(pop!.x - markX!)).toBeLessThan(6);
    // The mark runs out as the acorn pops (the step-by-step fall lags the exact arc by about a step).
    expect(pop!.t - (markGone ?? pop!.t)).toBeLessThanOrEqual(2 * STEP + 1e-9);
  });

  it('a stomp and a bite in the same step freeze for the longer hit, not both added up', () => {
    // Two squirrels on one spot: the pup stomps one and the other bites on the bounce.
    const w = createWorld(flat({ enemies: [{ type: 'runner', x: 330, speed: 0 }, { type: 'runner', x: 330, speed: 0 }] }), PHONE_VIEW_W);
    let frozen = 0;
    let longest = 0;
    let f = 0;
    for (let i = 0; i < 120; i++) {
      const t = w.t;
      f++;
      stepWorld(w, { ...NO_INPUT, jumpPressed: f === 40, jumpHeld: f >= 40 && f < 50 }, STEP);
      frozen = w.t === t ? frozen + 1 : 0;
      longest = Math.max(longest, frozen);
    }
    expect(w.hurtCount).toBe(1);
    expect(longest).toBeLessThanOrEqual(Math.ceil(HITSTOP.hurt! / STEP) + 1);
  });
});

describe('hit-stop', () => {
  it('a swipe made during a freeze still slides when it ends', () => {
    const w = createWorld(flat(), PHONE_VIEW_W);
    run(w, 0.5);
    w.hitstop = HITSTOP.hurt!;
    stepWorld(w, { ...NO_INPUT, slidePressed: true }, STEP);
    run(w, HITSTOP.hurt! + STEP);
    expect(w.hero.sliding).toBeGreaterThan(0);
    expect(w.hero.pose).toBe('slide');
  });

  it('Reduce Motion never freezes the world', () => {
    const w = createWorld(flat({ enemies: [{ type: 'runner', x: 330, speed: 0 }, { type: 'blocks', x: 900 }] }), PHONE_VIEW_W);
    setReduceMotion(w, true);
    let frozen = 0;
    let f = 0;
    for (let i = 0; i < 240; i++) {
      const t = w.t;
      f++;
      stepWorld(w, { ...NO_INPUT, jumpPressed: f === 40, jumpHeld: f >= 40 && f < 50 }, STEP);
      if (w.t === t) frozen++;
    }
    expect(w.enemies[0].state).toBe('stunned');
    expect(w.hurtCount).toBe(1);
    expect(frozen).toBe(0);
  });
});

describe('respawns and "Try again"', () => {
  const pit = () => flat({ floorSegments: [[-600, 500], [800, 5000]], checkpoints: [100], cages: [{ x: 150, dog: 'husky' }] });

  it('the pup comes back from a pit blinking, but without the hurt wobble; a bite still wobbles', () => {
    const w = createWorld(pit(), PHONE_VIEW_W);
    let respawned = -1;
    let wobbleAfterRespawn = 0;
    for (let i = 0; i < 60 * 4; i++) {
      const was = w.phase;
      stepWorld(w, NO_INPUT, STEP);
      if (was === 'respawn' && w.phase === 'run') respawned = i;
      if (respawned >= 0 && i - respawned < 40 && w.hero.pose === 'hurt') wobbleAfterRespawn++;
    }
    expect(respawned).toBeGreaterThan(0);
    expect(wobbleAfterRespawn).toBe(0);
    const b = createWorld(flat({ enemies: [{ type: 'runner', x: 300 }] }), PHONE_VIEW_W);
    let wobble = 0;
    for (let i = 0; i < 90; i++) {
      stepWorld(b, NO_INPUT, STEP);
      if (b.hero.pose === 'hurt') wobble++;
    }
    expect(b.hurtCount).toBe(1);
    expect(wobble).toBeGreaterThanOrEqual(19);
    expect(wobble).toBeLessThanOrEqual(22);
  });

  it('during the respawn hold the wagon follows the pup down into the pit instead of hanging in mid-air', () => {
    const w = createWorld(pit(), PHONE_VIEW_W);
    run(w, 1.2);
    expect(w.followers).toEqual(['husky']);
    let checked = 0;
    for (let i = 0; i < 60 * 3; i++) {
      stepWorld(w, NO_INPUT, STEP);
      if (w.phase === 'respawn' && w.phaseT > 0.5) {
        const wagon = followerDraws(w, { t: w.t, ago: 0, heroX: w.hero.x, heroY: w.hero.y }).sprites.find((s) => s.sprite === 'wagon')!;
        // Below the bottom of the view (the floor line sits 50 units above it).
        expect(wagon.y + SPRITES.wagon.h).toBeLessThan(-50);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('"Try again" after a game over starts moving at once, with a still camera', () => {
    const w = createWorld(flat({ enemies: [{ type: 'runner', x: 300 }], checkpoints: [50] }), PHONE_VIEW_W, 1, NO_BOOSTS);
    w.hero.hearts = 1;
    run(w, 1.5);
    expect(w.phase).toBe('dead');
    continueFromCheckpoint(w);
    drainEvents(w);
    const t = w.t;
    stepWorld(w, NO_INPUT, STEP);
    expect(w.t).toBeGreaterThan(t);
    expect(w.shake.x).toBe(0);
    expect(w.shake.y).toBe(0);
    expect(w.hero.pose).toBe('run');
  });

  it('losing to the boss starts the fight over at its arena, with its entrance, not over the furniture', () => {
    const w = createWorld(CHAPTER_1, PHONE_VIEW_W, 7);
    for (let i = 0; i < 60 * 120 && w.phase !== 'boss'; i++) stepWorld(w, autopilot(w), STEP);
    expect(w.boss!.phase).toBe('intro');
    run(w, 60, () => NO_INPUT);
    expect(w.phase).toBe('dead');
    continueFromCheckpoint(w);
    drainEvents(w);
    expect(w.hero.x).toBe(6600);
    expect(w.phase).toBe('run');
    expect(w.boss!.phase).toBe('waiting');
    let entered = false;
    for (let i = 0; i < 60 * 30 && !entered; i++) {
      stepWorld(w, autopilot(w), STEP);
      entered = drainEvents(w).some((e) => e.type === 'boss_start');
    }
    expect(entered).toBe(true);
    expect(w.hero.x).toBeGreaterThanOrEqual(CHAPTER_1.boss!.x);
    expect(w.boss!.hits).toBe(0);
  });
});

describe('the boss', () => {
  it.each([CHAPTER_1, CHAPTER_2])('$id: hops in from beyond the right edge at the phone width', (level) => {
    const w = createWorld({ ...flat(), boss: level.boss, runSpeed: level.runSpeed }, PHONE_VIEW_W);
    for (let i = 0; i < 60 * 60 && w.boss!.phase === 'waiting'; i++) stepWorld(w, NO_INPUT, STEP);
    const b = w.boss!;
    expect(b.phase).toBe('intro');
    expect(b.x - SPRITES.boss_idle_0.w / 2).toBeGreaterThanOrEqual(w.camX + w.viewW);
    // Never drawn where it waited, so the canvas has nothing to blend it in from.
    expect(b.px).toBe(b.x);
  });

  it('an acorn still in the air when the boss falls pops with a sparkle instead of blinking out', () => {
    const w = createWorld(flat({ boss: { x: 100, name: 'Big Nutsy', hits: 1 } }), PHONE_VIEW_W);
    for (let i = 0; i < 60 * 10 && w.boss!.phase !== 'fight'; i++) stepWorld(w, NO_INPUT, STEP);
    const b = w.boss!;
    expect(b.phase).toBe('fight');
    // One acorn in the air ahead of the pup, and a golden one barked back that reaches the boss this step.
    const stray = { id: 900001, x: w.hero.x + 150, y: 120, vx: -100, vy: 0, golden: false, rolling: false, reflected: false, alive: true, spin: 0, landX: 0, landT: 0, floorT: 0 };
    w.acorns.push(stray, { ...stray, id: 900002, x: b.x, y: b.y + 70, vx: 0, golden: true, reflected: true });
    const firstNew = w.nextId;
    stepWorld(w, NO_INPUT, STEP);
    expect(b.phase).toBe('defeated');
    expect(w.acorns.length).toBe(0);
    const pops = w.particles.filter((p) => (p.id ?? 0) >= firstNew && !p.color && Math.hypot(p.x - stray.x, p.y - stray.y) < 15);
    expect(pops.length).toBeGreaterThan(0);
  });
});

describe('ids for the canvas', () => {
  it('every acorn, ball and particle has its own id on the step it is made', () => {
    const w = createWorld(flat({ enemies: [{ type: 'thrower', x: 800, every: 0.5 }] }), PHONE_VIEW_W, 1, { ...NO_BOOSTS, balls: 2 });
    w.hero.powers.ball = 5;
    for (let i = 0; i < 120; i++) {
      stepWorld(w, { ...NO_INPUT, barkPressed: i % 25 === 0, jumpPressed: i === 60, jumpHeld: i >= 60 && i < 70 }, STEP);
      const ids = [...w.acorns, ...w.balls, ...w.particles].map((q) => q.id);
      expect(ids.every((id) => id !== undefined)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('level data', () => {
  it.each([CHAPTER_1, CHAPTER_2])('$id: every squirrel and cat above the floor stands on a piece of furniture', (level) => {
    const w = createWorld(level, PHONE_VIEW_W);
    const floating = w.enemies
      .filter((e) => e.type !== 'vacuum' && e.type !== 'blocks' && e.y > 0)
      .filter((e) => !w.platforms.some((p) => e.x >= p.x - 2 && e.x <= p.x + p.w + 2 && Math.abs(p.top - e.y) <= 3))
      .map((e) => `${e.type}@${e.x} y=${e.y}`);
    expect(floating).toEqual([]);
  });
});
