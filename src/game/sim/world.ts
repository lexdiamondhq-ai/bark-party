import { BOARD_TIME, HERO_BOX, HERO_SCREEN_X, MAX_HEARTS, MAX_STRIDE_SPEED, PHYS, POWER, STRIDE_LEN } from '../constants';
import type { LevelDef } from '../level/types';
import { SPRITES, type SpriteName } from '../sprites';
import { NO_BOOSTS, type RunBoosts } from '../../engine/progress';
import { seededRng } from '../../engine/rng';
import { HITSTOP, addShake, cameraLead, cameraLift, decayShake, landImpact, type ShakeKind } from './feel';
import type { Acorn, Ball, Boss, Enemy, GameEvent, Hero, Input, Particle, Platform, PowerKind, World } from './types';

/** The legs settle onto four paws over this long when the dog is stopped by a solid piece. */
const REST_BLEND = 0.15;
/** A landing is a touch-down: the bound starts over from the front paws on the floor. */
const LAND_STRIDE = 0;
/** The tail: lags the stride by this share of a bound on the ground, wags on its own in the air. */
const TAIL_LAG = 0.15;
const WAG_HZ = 3.1;
const wrap = (x: number) => x - Math.round(x);
const frac = (x: number) => x - Math.floor(x);

const TRAIL_MAX = 240;
/** Boss stands this far ahead of the dog during the chase. */
export const BOSS_LEAD = 300;
const CONFETTI = ['#FFB020', '#FF5A8A', '#19C3B1', '#48A6FF', '#8EDB3F', '#7B5CFF'];

export function createWorld(level: LevelDef, viewW: number, seed = 1, boosts: RunBoosts = NO_BOOSTS): World {
  const platforms: Platform[] = level.platforms.map((p) => {
    const s = SPRITES[p.sprite] as { w: number; h: number; top?: number };
    const y = p.y ?? 0;
    return { sprite: p.sprite, x: p.x, y, w: s.w, h: s.h, top: y + (s.top ?? s.h), solid: !!p.solid };
  });
  let id = 0;
  const enemies: Enemy[] = level.enemies.map((e) => makeEnemy(e, id++));
  const maxHearts = MAX_HEARTS + boosts.extraHearts;
  const world: World = {
    level,
    viewW,
    boosts,
    maxHearts,
    rng: seededRng(seed),
    t: 0,
    phase: 'run',
    phaseT: 0,
    hero: makeHero(0, level.runSpeed, maxHearts, boosts.startBubble ? 1 : 0),
    prev: { x: 0, y: 0, camX: 0, camY: 0, t: 0, stride: 0, vy: 0, sinceLand: 1, airTime: 0, boost: 0, restBlend: 0, landImpact: 0, invuln: 0, shakeX: 0, shakeY: 0, mega: 0, megaAge: 0, onGround: true, pose: 'run', landVy: 0, wag: 0 },
    camX: 0,
    camY: 0,
    camLead: 0,
    shake: { x: 0, y: 0 },
    shakeKind: null,
    hitstop: 0,
    reduceMotion: false,
    platforms,
    floor: level.floorSegments.map(([a, b]) => [a, b] as [number, number]),
    enemies,
    acorns: [],
    balls: [],
    nextId: 1,
    pickups: level.pickups.map((p) => ({
      kind: p.kind,
      x: p.x,
      y: p.y,
      taken: false,
      takenT: 0,
      sprite: pickupSprite(p.kind, p.x),
    })),
    cages: level.cages.map((c) => ({ x: c.x, y: c.y ?? 0, dog: c.dog, open: false, openT: 0 })),
    checkpoints: level.checkpoints.map((x) => ({ x, reached: false })),
    respawnX: 0,
    callouts: level.callouts.map((c) => ({ ...c, done: false })),
    followers: [],
    boarding: [],
    trail: [],
    trailMoved: false,
    particles: [],
    boss: level.boss
      ? {
          name: level.boss.name,
          hitsNeeded: level.boss.hits,
          hits: 0,
          phase: 'waiting',
          t: 0,
          x: level.boss.x + 600,
          y: 0,
          vy: 0,
          throwT: 0,
          throwing: 0,
          pattern: 0,
          hurtT: 0,
        }
      : null,
    bones: 0,
    bonesTotal: level.pickups.filter((p) => p.kind === 'bone').length,
    goldBones: 0,
    goldTotal: level.pickups.filter((p) => p.kind === 'bone_gold').length,
    hurtCount: 0,
    events: [],
    finished: false,
  };
  world.camX = cameraTarget(world);
  snapPrev(world);
  return world;
}

/** The screen turned or resized: the world keeps the visible width so the camera and sleeping enemies follow. */
export function resizeView(world: World, viewW: number) {
  world.viewW = viewW;
}

/** Forgets where the hero was, so the next frame draws it exactly here (after a teleport or respawn). */
export function snapPrev(world: World) {
  const p = world.prev;
  p.x = world.hero.x;
  p.y = world.hero.y;
  p.camX = world.camX;
  p.camY = world.camY;
  p.t = world.t;
  const h = world.hero;
  p.stride = h.stride;
  p.vy = h.vy;
  p.sinceLand = h.sinceLand;
  p.airTime = h.airTime;
  p.boost = h.boost;
  p.restBlend = h.restBlend;
  p.landImpact = h.landImpact;
  p.invuln = h.invuln;
  p.shakeX = world.shake.x;
  p.shakeY = world.shake.y;
  p.mega = h.powers.mega;
  p.megaAge = h.powers.megaAge;
  p.onGround = h.onGround;
  p.pose = h.pose;
  p.landVy = h.landVy;
  p.wag = h.wag;
  for (const b of world.balls) {
    b.px = b.x;
    b.py = b.y;
    if (b.id === undefined) b.id = world.nextId++;
  }
  for (const a of world.acorns) if (a.id === undefined) a.id = world.nextId++;
  for (const q of world.particles) if (q.id === undefined) q.id = world.nextId++;
  for (const e of world.enemies) {
    e.px = e.x;
    e.py = e.y;
  }
  for (const a of world.acorns) {
    a.px = a.x;
    a.py = a.y;
  }
  for (const q of world.particles) {
    q.px = q.x;
    q.py = q.y;
  }
  if (world.boss) {
    world.boss.px = world.boss.x;
    world.boss.py = world.boss.y;
  }
}

function makeHero(x: number, vx: number, hearts: number, bubble = 0): Hero {
  return {
    x,
    y: 0,
    vx,
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
    landVy: 0,
    wag: 0,
    invuln: 0,
    hearts,
    sinceLand: 1,
    stride: 0,
    blocked: false,
    restBlend: 0,
    pose: 'run',
    powers: { mega: 0, turbo: 0, ball: 0, megaAge: 0, bubble },
  };
}

/** How big the pup is right now: 1, or up to POWER.megaScale while Mega Pup is on (ramping in and out). */
export function heroScale(h: Hero): number {
  const pw = h.powers;
  if (pw.mega <= 0) return 1;
  const ramp = Math.min(1, pw.megaAge / POWER.megaRamp, pw.mega / POWER.megaRamp);
  return 1 + (POWER.megaScale - 1) * ramp;
}

/** A present opens into one of the four powers, chosen at random; the pup keeps the ones it has. */
function grantPower(world: World, kind: PowerKind) {
  const h = world.hero;
  const pw = h.powers;
  let seconds = 0;
  if (kind === 'mega') {
    if (pw.mega <= 0) pw.megaAge = 0;
    seconds = POWER.megaTime + world.boosts.megaBonus;
    pw.mega = Math.max(pw.mega, seconds);
    impact(world, 'boss_hit', 0.5);
  } else if (kind === 'turbo') {
    seconds = POWER.turboTime + world.boosts.turboBonus;
    pw.turbo = Math.max(pw.turbo, seconds);
    sfx(world, 'whoosh');
  } else if (kind === 'ball') {
    seconds = POWER.ballTime;
    pw.ball = Math.max(pw.ball, seconds);
  } else {
    pw.bubble += 1;
  }
  haptic(world, 'success');
  emit(world, { type: 'power', kind, seconds });
  for (let i = 0; i < 10; i++) spark(world, h.x, h.y + 30, 'star');
}

const POWER_KINDS: PowerKind[] = ['mega', 'turbo', 'ball', 'bubble'];

function pickupSprite(kind: 'bone' | 'bone_gold' | 'present', x: number): SpriteName {
  if (kind === 'bone') return 'bone';
  if (kind === 'bone_gold') return 'bone_gold';
  const presents: SpriteName[] = ['present_red', 'present_blue', 'present_green'];
  return presents[Math.abs(Math.round(x / 7)) % 3];
}

function makeEnemy(e: LevelDef['enemies'][number], id: number): Enemy {
  const base: Enemy = {
    id,
    type: e.type,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    w: 40,
    h: 40,
    state: 'active',
    t: 0,
    cooldown: 0.6,
    throwing: 0,
    awake: false,
    x0: 0,
    x1: 0,
    speed: 0,
    facing: -1,
    pop: 0,
  };
  switch (e.type) {
    case 'runner':
      return { ...base, x: e.x, y: e.y ?? 0, w: 40, h: 36, speed: e.speed ?? 95 };
    case 'thrower':
      return { ...base, x: e.x, y: e.y ?? 0, w: 40, h: 40, cooldown: 0.4, speed: e.every ?? 1.6 };
    case 'cat':
      return { ...base, x: e.x, y: e.y ?? 0, w: 56, h: 40 };
    case 'vacuum':
      return { ...base, x: e.x0, x0: e.x0, x1: e.x1, w: 56, h: 22, speed: e.speed ?? 80 };
    case 'blocks':
      return { ...base, x: e.x, y: e.y ?? 0, w: 34, h: 38 };
  }
}

export function cameraTarget(world: World): number {
  return world.hero.x - world.viewW * HERO_SCREEN_X + world.camLead;
}

/** A hit: the camera shakes its own way for this kind and the world freezes for a few frames. */
function impact(world: World, kind: ShakeKind, scale = 1) {
  addShake(world.shake, kind, scale);
  world.shakeKind = kind;
  if (!world.reduceMotion) world.hitstop = Math.max(world.hitstop, (HITSTOP[kind] ?? 0) * scale);
}

/** iOS Reduce Motion, from the host: hits no longer freeze the world and confetti thins out. */
export function setReduceMotion(world: World, on: boolean) {
  world.reduceMotion = on;
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/** Height of the highest surface at x that is at or below `maxY` (the dog's feet), or null over a pit. */
export function groundBelow(world: World, x: number, halfW: number, maxY: number): number | null {
  let best: number | null = null;
  if (world.phase === 'boss' || onFloor(world, x, halfW)) best = 0;
  for (const p of world.platforms) {
    if (x + halfW <= p.x + 6 || x - halfW >= p.x + p.w - 6) continue;
    if (p.top <= maxY + 0.01 && (best === null || p.top > best)) best = p.top;
  }
  return best;
}

function onFloor(world: World, x: number, halfW: number): boolean {
  // The dog needs its centre over the floor, so it can teeter over the edge a little.
  for (const [a, b] of world.floor) if (x >= a - halfW * 0.4 && x <= b + halfW * 0.4) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Step                                                                */
/* ------------------------------------------------------------------ */

export function stepWorld(world: World, input: Input, dtRaw: number): void {
  const dt = Math.min(dtRaw, 1 / 30);
  snapPrev(world);
  world.trailMoved = false;
  if (world.hitstop > 0) {
    // Frozen for a few frames after a hit. Presses made now are kept for when it ends.
    world.hitstop -= dt;
    if (input.jumpPressed) world.hero.jumpBuffer = PHYS.jumpBuffer;
    if (input.barkPressed) world.hero.barkBuffer = PHYS.barkBuffer;
    return;
  }
  world.t += dt;
  world.phaseT += dt;
  decayShake(world.shake, world.shakeKind, dt);

  if (world.phase === 'respawn') {
    if (world.phaseT > 0.9) respawn(world);
    stepParticles(world, dt);
    return;
  }
  if (world.phase === 'dead') {
    stepParticles(world, dt);
    return;
  }

  stepHero(world, input, dt);
  stepEnemies(world, dt);
  stepAcorns(world, dt);
  stepBalls(world, dt);
  stepBoss(world, dt);
  collectPickups(world, dt);
  openCages(world);
  stepBoarding(world, dt);
  passCheckpoints(world);
  fireCallouts(world);
  stepParticles(world, dt);

  // Trail for followers.
  world.trail.unshift({ x: world.hero.x, y: world.hero.y });
  world.trailMoved = true;
  if (world.trail.length > TRAIL_MAX) world.trail.length = TRAIL_MAX;

  // Camera eases toward the dog; it never lags far enough to lose it. It leads a fast dog and lifts for a high one.
  world.camLead += (cameraLead(world.hero.vx, world.level.runSpeed) - world.camLead) * Math.min(1, dt * 4);
  world.camY += (cameraLift(world.hero.y) - world.camY) * Math.min(1, dt * 5);
  const target = cameraTarget(world);
  world.camX += (target - world.camX) * Math.min(1, dt * 10);

  if (world.phase === 'won') {
    if (!world.finished && world.phaseT > 2.2) {
      world.finished = true;
      emit(world, { type: 'won' });
    }
    return;
  }

  // Finish arch (levels without a boss).
  if (!world.level.boss && world.hero.x >= world.level.finishX) win(world);
}

function emit(world: World, e: GameEvent) {
  world.events.push(e);
}

function sfx(world: World, name: string) {
  world.events.push({ type: 'sfx', name });
}

function haptic(world: World, kind: Extract<GameEvent, { type: 'haptic' }>['kind']) {
  world.events.push({ type: 'haptic', kind });
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function stepHero(world: World, input: Input, dt: number) {
  const h = world.hero;
  const won = world.phase === 'won';
  h.invuln = Math.max(0, h.invuln - dt);
  h.barkCooldown = Math.max(0, h.barkCooldown - dt);
  h.barkBuffer = Math.max(0, h.barkBuffer - dt);
  h.barking = Math.max(0, h.barking - dt);
  if (h.barking > 0) barkWave(world);
  const wasSliding = h.sliding > 0;
  h.sliding = Math.max(0, h.sliding - dt);
  h.boost = Math.max(0, h.boost - dt);
  const pw = h.powers;
  if (pw.mega > 0) {
    pw.megaAge += dt;
    pw.mega = Math.max(0, pw.mega - dt);
    if (pw.mega === 0) {
      sfx(world, 'slide');
      dust(world, h.x, h.y, 3);
    }
  }
  pw.turbo = Math.max(0, pw.turbo - dt);
  pw.ball = Math.max(0, pw.ball - dt);
  h.sinceLand += dt;
  h.jumpBuffer = Math.max(0, h.jumpBuffer - dt);
  h.slideBuffer = Math.max(0, h.slideBuffer - dt);

  // Zoomies: coming out of a slide on the ground gives a burst of speed, so the slide is a move, not just a dodge.
  if (wasSliding && h.sliding === 0 && h.onGround && !won) {
    h.boost = PHYS.boostTime;
    sfx(world, 'whoosh');
    haptic(world, 'light');
    impact(world, 'zoomies');
    dust(world, h.x - 20, h.y, 3);
  }

  if (!won) {
    if (input.jumpPressed) h.jumpBuffer = PHYS.jumpBuffer;
    if (input.barkPressed) h.barkBuffer = PHYS.barkBuffer;
    if (h.barkBuffer > 0 && h.barkCooldown <= 0) {
      h.barkBuffer = 0;
      bark(world);
    }
    if (input.slidePressed) {
      if (h.onGround) {
        h.sliding = PHYS.slideTime;
        sfx(world, 'slide');
        dust(world, h.x - 10, h.y, 2);
      } else {
        // Swipe down in the air: dive to the ground fast, then slide on landing.
        h.vy = Math.min(h.vy, -900);
        h.slideBuffer = 0.35;
      }
    }
  }

  // Running speed: auto-run (faster during zoomies), stopping only when blocked or after the win.
  if (won) h.vx = Math.max(0, h.vx - dt * 500);
  else {
    const speed = world.level.runSpeed * (h.boost > 0 ? PHYS.boostSpeed : 1) * (h.powers.turbo > 0 ? POWER.turboSpeed : 1);
    h.vx += (speed - h.vx) * Math.min(1, dt * 10);
  }

  // Jumping: ground jump (with coyote time) or one air jump.
  const canGroundJump = h.onGround || h.airTime < PHYS.coyoteTime;
  if (h.jumpBuffer > 0 && !won) {
    if (canGroundJump && h.jumpsUsed === 0) {
      h.vy = PHYS.jumpVelocity;
      h.jumpsUsed = 1;
      h.onGround = false;
      h.sliding = 0;
      h.jumpBuffer = 0;
      sfx(world, 'jump');
      haptic(world, 'light');
      dust(world, h.x, h.y, 3);
    } else if (h.jumpsUsed < 2) {
      h.vy = PHYS.doubleJumpVelocity + world.boosts.doubleJumpBonus;
      h.jumpsUsed = 2;
      h.jumpBuffer = 0;
      sfx(world, 'double_jump');
      haptic(world, 'light');
      for (let i = 0; i < 6; i++) spark(world, h.x, h.y + 10, 'star');
    }
  }
  // Variable height: let go early and the rise is cut short.
  if (!input.jumpHeld && h.vy > 0 && h.jumpsUsed > 0) h.vy *= Math.pow(PHYS.jumpCut, dt * 12);

  // Horizontal move with solid-side blocking.
  const halfW = HERO_BOX.w / 2;
  const heroH = h.sliding > 0 ? HERO_BOX.slideH : HERO_BOX.h;
  const xBefore = h.x;
  let nx = h.x + h.vx * dt;
  h.blocked = false;
  for (const p of world.platforms) {
    if (!p.solid) continue;
    const overlapsY = h.y < p.top - 4 && h.y + heroH > p.y;
    if (overlapsY && h.x + halfW <= p.x + 2 && nx + halfW > p.x) {
      nx = p.x - halfW;
      h.blocked = true;
    }
  }
  h.x = nx;

  // Vertical move and landing.
  h.vy = Math.max(-PHYS.maxFall, h.vy - PHYS.gravity * dt);
  const prevY = h.y;
  let ny = h.y + h.vy * dt;
  const ground = groundBelow(world, h.x, halfW * 0.8, prevY + PHYS.landTolerance * (h.vy <= 0 ? 1 : 0));
  const wasOnGround = h.onGround;
  if (ground !== null && h.vy <= 0 && ny <= ground && prevY >= ground - 1) {
    ny = ground;
    if (!wasOnGround) {
      // The harder the landing, the deeper the squash, the bigger the dust and the more the camera thumps.
      h.sinceLand = 0;
      h.landImpact = landImpact(h.vy);
      h.landVy = h.vy;
      if (h.vy < -500) {
        sfx(world, 'land');
        dust(world, h.x, ground, 2 + Math.round(h.landImpact * 4));
        impact(world, 'land_hard', 0.4 + h.landImpact);
      }
    }
    h.vy = 0;
    if (!wasOnGround) h.stride = LAND_STRIDE;
    h.onGround = true;
    h.airTime = 0;
    h.jumpsUsed = 0;
    if (h.slideBuffer > 0 && !won) {
      h.slideBuffer = 0;
      h.sliding = PHYS.slideTime;
      sfx(world, 'slide');
      dust(world, h.x - 10, ground, 2);
    }
  } else {
    if (wasOnGround && h.vy <= 0 && !won) {
      // Ran off an edge: a tiny hop, so the drop reads as a bound and not a slip.
      h.vy = PHYS.ledgeHop;
      ny = prevY + h.vy * dt;
      dust(world, h.x - 8, prevY, 1);
    }
    h.onGround = false;
    h.airTime += dt;
  }
  h.y = ny;

  // Fell into a pit.
  if (h.y < -140 && world.phase !== 'won') {
    loseHeart(world, true);
  }

  // Pose for the renderer.
  if (won) h.pose = h.vx > 5 ? 'run' : 'cheer';
  else if (h.invuln > PHYS.hurtInvuln - 0.35) h.pose = 'hurt';
  else if (h.barking > 0) h.pose = 'bark';
  else if (h.sliding > 0) h.pose = 'slide';
  else if (!h.onGround) h.pose = h.vy > 0 ? 'jump' : 'fall';
  else h.pose = 'run';

  // Legs follow the ground actually covered, so they stop when the dog is blocked and never spin faster than a run.
  if (h.onGround) {
    const before = h.stride;
    const dStride = Math.min(h.x - xBefore, MAX_STRIDE_SPEED * dt) / STRIDE_LEN;
    h.stride = (h.stride + dStride) % 1;
    // Each bound touches down on the front paws: a small puff there keeps the run on the ground.
    if (h.stride < before && h.vx > 200 && h.pose === 'run') dust(world, h.x + 12, h.y, 1);
    // The tail follows the stride a beat late.
    h.wag = frac(h.wag + dStride + 3 * dt * wrap(h.stride - TAIL_LAG - h.wag));
  } else {
    h.wag = frac(h.wag + dt * WAG_HZ);
  }
  h.restBlend = Math.min(1, Math.max(0, h.restBlend + (h.blocked ? dt : -dt) / REST_BLEND));
}

function bark(world: World) {
  const h = world.hero;
  h.barking = PHYS.barkTime;
  h.barkCooldown = PHYS.barkCooldown;
  if (h.powers.ball > 0) {
    // Ball Mouth: the bark comes out as tennis balls.
    const n = world.boosts.balls;
    for (let i = 0; i < n; i++) {
      world.balls.push({ x: h.x + 30 * heroScale(h), y: h.y + 34 * heroScale(h) + (n > 1 ? (i - (n - 1) / 2) * 16 : 0), vx: POWER.ballSpeed + h.vx, t: 0, alive: true });
    }
    sfx(world, 'acorn_throw');
    h.barkCooldown = PHYS.barkCooldown * 0.55;
  }
  sfx(world, world.phase === 'boss' ? 'bark_big' : 'bark');
  haptic(world, 'medium');
  impact(world, 'bark');
  // The "WOOF!" bursts out of the muzzle and grows as it flies.
  world.particles.push({
    sprite: 'bark_burst',
    x: h.x + 56,
    y: h.y + 36,
    vx: world.level.runSpeed + 60,
    vy: 40,
    gravity: 0,
    life: 0.45,
    maxLife: 0.45,
    rot: -0.15,
    vr: 0.3,
    scale: 0.45,
    scale1: 1.15,
  });

  barkWave(world);
}

/** The bark keeps swatting for its whole duration, so a slightly early press still works. */
function barkWave(world: World) {
  const h = world.hero;
  const reach = PHYS.barkRange + world.boosts.barkRangeBonus;
  for (const e of world.enemies) {
    if (e.state !== 'active') continue;
    if (e.type === 'vacuum' || e.type === 'blocks') continue;
    const dx = e.x - h.x;
    if (dx < -20 || dx > reach) continue;
    if (Math.abs(e.y - h.y) > 100) continue;
    if (e.type === 'cat') {
      e.state = 'fled';
      e.vx = 260;
      e.vy = 300;
      e.facing = 1;
      e.pop = 0.18;
      sfx(world, 'cat_hiss');
    } else {
      stun(world, e, 380, 420);
      impact(world, 'bark_hit');
    }
  }
  for (const a of world.acorns) {
    if (!a.alive || a.reflected) continue;
    const dx = a.x - h.x;
    if (dx < -10 || dx > reach + 40 || Math.abs(a.y - h.y) > 170) continue;
    a.reflected = true;
    a.rolling = false;
    if (a.golden && world.boss && world.phase === 'boss') {
      // Aim back at the boss.
      const b = world.boss;
      const tFly = 0.55;
      a.vx = (b.x - a.x) / tFly + world.level.runSpeed;
      a.vy = (b.y + 70 - a.y) / tFly + (PHYS.gravity * 0.5 * tFly) / 2;
    } else {
      a.vx = 520;
      a.vy = 520;
    }
    sfx(world, 'acorn_hit');
  }
}

function stun(world: World, e: Enemy, vx: number, vy: number) {
  e.state = 'stunned';
  e.vx = vx;
  e.vy = vy;
  e.t = 0;
  e.pop = 0.18;
  sfx(world, 'squirrel_stun');
  for (let i = 0; i < 5; i++) spark(world, e.x, e.y + e.h, 'star');
}

function hurt(world: World) {
  const h = world.hero;
  if (h.invuln > 0 || world.phase === 'won') return;
  if (h.powers.bubble > 0) {
    // The Bubble takes the hit and pops.
    h.powers.bubble -= 1;
    h.invuln = 0.8;
    impact(world, 'bark_hit');
    sfx(world, 'acorn_hit');
    haptic(world, 'medium');
    emit(world, { type: 'bubble_pop' });
    for (let i = 0; i < 12; i++) spark(world, h.x, h.y + 36, 'star');
    return;
  }
  loseHeart(world, false);
}

function loseHeart(world: World, fell: boolean) {
  const h = world.hero;
  h.hearts -= 1;
  world.hurtCount += 1;
  h.invuln = PHYS.hurtInvuln;
  h.boost = 0;
  impact(world, 'hurt');
  sfx(world, 'hurt');
  haptic(world, 'error');
  emit(world, { type: 'hurt', hearts: h.hearts });
  if (h.hearts <= 0) {
    world.phase = 'dead';
    world.phaseT = 0;
    sfx(world, 'game_over');
    emit(world, { type: 'gameover' });
    return;
  }
  if (fell) {
    world.phase = 'respawn';
    world.phaseT = 0;
  } else {
    h.vy = Math.max(h.vy, 380);
    for (let i = 0; i < 4; i++) spark(world, h.x, h.y + 30, 'heart');
  }
}

function respawn(world: World) {
  const h = world.hero;
  const kept = h.powers;
  Object.assign(h, makeHero(world.respawnX, world.level.runSpeed, h.hearts));
  h.powers = { ...kept, mega: 0, turbo: 0, megaAge: 0 };
  world.balls = [];
  h.invuln = 1.2;
  h.y = groundBelow(world, h.x, 10, 999) ?? 0;
  world.phase = world.boss && world.boss.phase !== 'waiting' && world.boss.phase !== 'gone' ? 'boss' : 'run';
  world.phaseT = 0;
  world.acorns = [];
  world.trail = [];
  world.camLead = 0;
  world.camY = 0;
  world.camX = cameraTarget(world);
  snapPrev(world);
}

/** After a game over: try again from the last balloon post with full hearts. */
export function continueFromCheckpoint(world: World) {
  world.hero.hearts = world.maxHearts;
  respawn(world);
  if (world.boss && world.boss.phase !== 'waiting') {
    // The boss fight restarts from the top so the chase stays fair.
    world.boss.hits = 0;
    world.boss.phase = 'intro';
    world.boss.t = 0;
    world.boss.x = world.hero.x + BOSS_LEAD + 200;
    world.phase = 'boss';
  }
}

/* ------------------------------------------------------------------ */
/* Enemies                                                             */
/* ------------------------------------------------------------------ */

function stepEnemies(world: World, dt: number) {
  const h = world.hero;
  const big = heroScale(h);
  const heroH = (h.sliding > 0 ? HERO_BOX.slideH : HERO_BOX.h) * big;
  const mega = h.powers.mega > 0;
  for (const e of world.enemies) {
    e.t += dt;
    e.pop = Math.max(0, e.pop - dt);
    if (e.state === 'stunned' || e.state === 'fled') {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy -= PHYS.gravity * 0.6 * dt;
      continue;
    }
    // Sleep enemies far off-screen.
    if (e.x - h.x > world.viewW * 1.3 || h.x - e.x > world.viewW) continue;

    switch (e.type) {
      case 'runner': {
        e.x -= e.speed * dt;
        e.facing = -1;
        break;
      }
      case 'thrower': {
        e.facing = -1;
        e.throwing = Math.max(0, e.throwing - dt);
        const dx = e.x - h.x;
        if (dx > 40 && dx < 460) {
          e.cooldown -= dt;
          if (e.cooldown <= 0) {
            e.cooldown = e.speed;
            e.throwing = 0.3;
            throwAcorn(world, e.x - 16, e.y + 34, h, false);
          }
        }
        break;
      }
      case 'cat': {
        const dx = e.x - h.x;
        if (!e.awake && dx < 150 && dx > -40) {
          e.awake = true;
          e.t = 0;
          sfx(world, 'cat_hiss');
        }
        break;
      }
      case 'vacuum': {
        e.x += e.facing * e.speed * dt;
        if (e.x < e.x0) e.facing = 1;
        if (e.x > e.x1) e.facing = -1;
        break;
      }
      case 'blocks':
        break;
    }

    // Contact with the dog.
    const ex0 = e.x - e.w / 2;
    const ex1 = e.x + e.w / 2;
    const hx0 = h.x - (HERO_BOX.w / 2) * big + 4;
    const hx1 = h.x + (HERO_BOX.w / 2) * big - 4;
    if (hx1 < ex0 || hx0 > ex1) continue;
    const ey0 = e.y;
    const ey1 = e.y + e.h;
    if (h.y + heroH < ey0 || h.y > ey1) continue;

    if (mega) {
      // Mega Pup crushes whatever it runs into; the cat bolts.
      if (e.type === 'cat') {
        e.state = 'fled';
        e.vx = 300;
        e.vy = 320;
        e.pop = 0.18;
        sfx(world, 'cat_hiss');
      } else {
        stun(world, e, 380, 360);
        impact(world, 'stomp');
        haptic(world, 'medium');
      }
      continue;
    }

    const fromAbove = h.vy < 0 && h.y > ey1 - 18;
    if (e.type === 'cat') {
      if (!e.awake) continue;
      if (fromAbove) {
        e.state = 'fled';
        e.vx = 240;
        e.vy = 260;
        e.pop = 0.18;
        h.vy = PHYS.stompBounce;
        h.jumpsUsed = 1;
        sfx(world, 'cat_hiss');
        impact(world, 'stomp');
      } else hurt(world);
      continue;
    }
    if (e.type === 'vacuum') {
      if (fromAbove) {
        // Bounce off the vacuum like a trampoline.
        h.vy = PHYS.stompBounce * 1.25;
        h.jumpsUsed = 1;
        e.pop = 0.18;
        sfx(world, 'jump');
        haptic(world, 'light');
        impact(world, 'stomp', 0.6);
      } else hurt(world);
      continue;
    }
    if (e.type === 'blocks') {
      if (!fromAbove) {
        hurt(world);
        e.state = 'stunned';
        e.vx = 200;
        e.vy = 300;
        e.pop = 0.18;
      }
      continue;
    }
    // Squirrels: stomp, slide-tackle or get bitten.
    if (fromAbove) {
      stun(world, e, 300, 200);
      h.vy = PHYS.stompBounce;
      h.jumpsUsed = 1;
      haptic(world, 'medium');
      impact(world, 'stomp');
    } else if (h.sliding > 0) {
      stun(world, e, 420, 380);
      impact(world, 'bark_hit');
    } else hurt(world);
  }
  // Drop enemies that are long gone.
  world.enemies = world.enemies.filter((e) => e.y > -300 && e.x > h.x - world.viewW * 1.5);
}

function throwAcorn(world: World, x: number, y: number, target: Hero, golden: boolean) {
  // Aim where the dog will be when the acorn comes down to its head height.
  const tFly = 0.8;
  const tx = target.x + world.level.runSpeed * tFly;
  const ty = target.y + 30;
  world.acorns.push({
    x,
    y,
    vx: (tx - x) / tFly,
    vy: (ty - y) / tFly + (PHYS.gravity * 0.5 * tFly) / 2,
    golden,
    rolling: false,
    reflected: false,
    alive: true,
    spin: 0,
  });
  sfx(world, 'acorn_throw');
}

function stepAcorns(world: World, dt: number) {
  const h = world.hero;
  const heroH = h.sliding > 0 ? HERO_BOX.slideH : HERO_BOX.h;
  for (const a of world.acorns) {
    if (!a.alive) continue;
    a.spin += dt * (a.rolling ? -14 : 10);
    if (a.rolling) {
      a.x += a.vx * dt;
      a.y = 0;
    } else {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.vy -= PHYS.gravity * 0.5 * dt;
      if (a.y < 0 && !a.reflected) {
        // Bounce once, then roll away.
        a.y = 0;
        a.rolling = true;
        a.vx = Math.min(a.vx, -60);
      }
    }
    if (a.y < -200 || a.x < h.x - world.viewW || a.x > h.x + world.viewW * 2) a.alive = false;

    if (a.reflected) {
      const b = world.boss;
      if (a.golden && b && world.phase === 'boss' && b.phase === 'fight') {
        if (Math.abs(a.x - b.x) < 50 && a.y > b.y + 20 && a.y < b.y + 130) {
          a.alive = false;
          hitBoss(world);
        }
      }
      continue;
    }
    // Hit the dog? Mega Pup just bats it away.
    const big = heroScale(h);
    if (Math.abs(a.x - h.x) < (HERO_BOX.w / 2) * big + 6 && a.y > h.y - 4 && a.y < h.y + heroH * big) {
      a.alive = false;
      if (h.powers.mega > 0) {
        sfx(world, 'acorn_hit');
        for (let i = 0; i < 3; i++) spark(world, a.x, a.y, 'star');
      } else hurt(world);
    }
  }
  world.acorns = world.acorns.filter((a) => a.alive);
}

/** Tennis balls fly straight, stun squirrels, pop acorns and hit the boss. */
function stepBalls(world: World, dt: number) {
  const b = world.boss;
  for (const ball of world.balls) {
    if (!ball.alive) continue;
    ball.t += dt;
    ball.x += ball.vx * dt;
    if (ball.t > POWER.ballLife) ball.alive = false;
    for (const e of world.enemies) {
      if (e.state !== 'active' || e.type === 'vacuum') continue;
      if (Math.abs(e.x - ball.x) < e.w / 2 + 9 && ball.y > e.y - 6 && ball.y < e.y + e.h + 6) {
        ball.alive = false;
        if (e.type === 'cat') {
          e.state = 'fled';
          e.vx = 260;
          e.vy = 300;
          e.pop = 0.18;
          sfx(world, 'cat_hiss');
        } else if (e.type === 'blocks') {
          e.state = 'stunned';
          e.vx = 220;
          e.vy = 320;
          e.pop = 0.18;
        } else stun(world, e, 360, 380);
        impact(world, 'bark_hit', 0.7);
        break;
      }
    }
    if (!ball.alive) continue;
    for (const a of world.acorns) {
      if (!a.alive) continue;
      if (Math.abs(a.x - ball.x) < 18 && Math.abs(a.y - ball.y) < 24) {
        a.alive = false;
        ball.alive = false;
        sfx(world, 'acorn_hit');
        for (let i = 0; i < 4; i++) spark(world, a.x, a.y, 'star');
        break;
      }
    }
    if (!ball.alive) continue;
    if (b && world.phase === 'boss' && b.phase === 'fight' && Math.abs(ball.x - b.x) < 50 && ball.y > b.y + 10 && ball.y < b.y + 130) {
      ball.alive = false;
      hitBoss(world);
    }
  }
  world.balls = world.balls.filter((x) => x.alive);
}

/* ------------------------------------------------------------------ */
/* Boss                                                                */
/* ------------------------------------------------------------------ */

function stepBoss(world: World, dt: number) {
  const b = world.boss;
  const def = world.level.boss;
  if (!b || !def) return;
  const h = world.hero;
  b.t += dt;
  b.throwing = Math.max(0, b.throwing - dt);
  b.hurtT = Math.max(0, b.hurtT - dt);

  if (b.phase === 'waiting') {
    if (h.x >= def.x) {
      b.phase = 'intro';
      b.t = 0;
      b.x = h.x + BOSS_LEAD + 260;
      world.phase = 'boss';
      world.phaseT = 0;
      // Clear the run-up so the chase is the only thing on screen.
      world.enemies = world.enemies.filter((e) => e.x < h.x - 60);
      emit(world, { type: 'boss_start' });
      emit(world, { type: 'music', name: 'music_boss' });
      sfx(world, 'boss_laugh');
    }
    return;
  }
  if (b.phase === 'gone') return;

  // Hop along ahead of the dog.
  const targetX = h.x + BOSS_LEAD;
  if (b.phase === 'defeated') {
    b.x += (h.x + BOSS_LEAD - 40 - b.x) * Math.min(1, dt * 2);
  } else {
    b.x += (targetX - b.x) * Math.min(1, dt * (b.phase === 'intro' ? 1.5 : 4));
  }
  b.vy -= PHYS.gravity * 0.7 * dt;
  b.y += b.vy * dt;
  if (b.y <= 0) {
    b.y = 0;
    b.vy = b.phase === 'defeated' ? 0 : 260 + world.rng() * 140;
  }

  if (b.phase === 'intro') {
    if (b.t > 1.4) {
      b.phase = 'fight';
      b.t = 0;
      b.throwT = 0.6;
    }
    return;
  }
  if (b.phase === 'hurt') {
    if (b.t > 0.9) {
      b.phase = 'fight';
      b.t = 0;
      b.throwT = 0.5;
    }
    return;
  }
  if (b.phase === 'defeated') {
    if (b.t > 2.4) {
      b.phase = 'gone';
    }
    return;
  }

  // Fight: a short loop of normal throws and one golden roller to bark back.
  b.throwT -= dt;
  if (b.throwT <= 0) {
    const step = b.pattern % 4;
    b.pattern++;
    b.throwing = 0.35;
    if (step === 3) {
      // Golden acorn rolls along the floor: bark it back!
      world.acorns.push({
        x: b.x - 40,
        y: 0,
        vx: -260,
        vy: 0,
        golden: true,
        rolling: true,
        reflected: false,
        alive: true,
        spin: 0,
      });
      sfx(world, 'acorn_throw');
      if (b.hits === 0 && b.pattern < 5) emit(world, { type: 'callout', coach: 'leo', text: 'Golden acorn! Bark it back!' });
      b.throwT = 1.5;
    } else {
      throwAcorn(world, b.x - 30, b.y + 90, h, false);
      b.throwT = Math.max(0.75, 1.15 - b.hits * 0.15);
    }
  }
}

function hitBoss(world: World) {
  const b = world.boss!;
  b.hits += 1;
  b.hurtT = 0.6;
  impact(world, 'boss_hit');
  sfx(world, 'boss_hit');
  haptic(world, 'heavy');
  for (let i = 0; i < 10; i++) spark(world, b.x, b.y + 80, 'star');
  emit(world, { type: 'boss_hit', hits: b.hits, needed: b.hitsNeeded });
  if (b.hits >= b.hitsNeeded) {
    b.phase = 'defeated';
    b.t = 0;
    world.acorns = [];
    emit(world, { type: 'boss_defeated' });
    win(world);
  } else {
    b.phase = 'hurt';
    b.t = 0;
  }
}

function win(world: World) {
  if (world.phase === 'won') return;
  world.phase = 'won';
  world.phaseT = 0;
  sfx(world, 'victory');
  haptic(world, 'success');
  emit(world, { type: 'music', name: 'none' });
  const h = world.hero;
  for (let i = 0; i < 60; i++) confetti(world, h.x + 120 + world.rng() * 200, 340);
}

/* ------------------------------------------------------------------ */
/* Pickups, cages, checkpoints, callouts                               */
/* ------------------------------------------------------------------ */

function collectPickups(world: World, dt: number) {
  const h = world.hero;
  const magnet = world.boosts.magnetRange;
  for (const p of world.pickups) {
    if (p.taken) {
      p.takenT += dt;
      continue;
    }
    if (magnet > 0 && p.kind === 'bone') {
      // The Bone Sniffer: bones within reach drift to the dog's nose.
      const dx = h.x - p.x;
      const dy = h.y + 30 - p.y;
      const d = Math.hypot(dx, dy);
      if (d < magnet && d > 1) {
        const pull = Math.min(1, (dt * 9 * (1.2 - d / magnet)) / 1);
        p.x += dx * pull;
        p.y += dy * pull;
      }
    }
    if (Math.abs(p.x - h.x) < 34 && p.y + 10 > h.y - 6 && p.y < h.y + HERO_BOX.h + 10) {
      p.taken = true;
      if (p.kind === 'bone') {
        world.bones += h.powers.turbo > 0 ? 2 : 1;
        sfx(world, 'bone');
        haptic(world, 'selection');
      } else if (p.kind === 'bone_gold') {
        world.goldBones += 1;
        sfx(world, 'bone_gold');
        haptic(world, 'success');
        for (let i = 0; i < 8; i++) spark(world, p.x, p.y, 'star');
      } else {
        // A present: one of the four powers, at random.
        sfx(world, 'bone_gold');
        for (let i = 0; i < 16; i++) confetti(world, p.x, p.y + 20);
        grantPower(world, POWER_KINDS[Math.floor(world.rng() * POWER_KINDS.length)]);
      }
    }
  }
}

function openCages(world: World) {
  const h = world.hero;
  for (const c of world.cages) {
    if (c.open) continue;
    if (Math.abs(c.x + 42 - h.x) < 50 && h.y < c.y + 80 && h.y + HERO_BOX.h > c.y) {
      c.open = true;
      world.boarding.push({ dog: c.dog, x: c.x + 42, y: c.y + 6, t: 0 });
      impact(world, 'rescue');
      sfx(world, 'cage_open');
      sfx(world, 'rescue');
      haptic(world, 'success');
      emit(world, { type: 'rescue', dog: c.dog });
      for (let i = 0; i < 24; i++) confetti(world, c.x + 42, c.y + 60);
      for (let i = 0; i < 6; i++) spark(world, c.x + 42, c.y + 50, 'heart');
    }
  }
}

/** Freed pups land in the wagon once their jump is over. */
function stepBoarding(world: World, dt: number) {
  for (const b of world.boarding) b.t += dt;
  while (world.boarding.length && world.boarding[0].t >= BOARD_TIME) {
    world.followers.push(world.boarding.shift()!.dog);
    sfx(world, 'land');
  }
}

function passCheckpoints(world: World) {
  for (const c of world.checkpoints) {
    if (!c.reached && world.hero.x >= c.x) {
      c.reached = true;
      world.respawnX = c.x;
      sfx(world, 'checkpoint');
      emit(world, { type: 'checkpoint' });
      for (let i = 0; i < 12; i++) confetti(world, c.x, 90);
    }
  }
}

function fireCallouts(world: World) {
  for (const c of world.callouts) {
    if (!c.done && world.hero.x >= c.x) {
      c.done = true;
      emit(world, { type: 'callout', coach: c.coach, text: c.text });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */

function dust(world: World, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    world.particles.push({
      sprite: 'dust_0',
      frames: ['dust_0', 'dust_1', 'dust_2'],
      x: x - 10 + world.rng() * 20,
      y,
      vx: -60 - world.rng() * 80,
      vy: 20 + world.rng() * 40,
      gravity: 0,
      life: 0.4,
      maxLife: 0.4,
      rot: 0,
      vr: 0,
      scale: 0.8 + world.rng() * 0.6,
    });
  }
}

function spark(world: World, x: number, y: number, sprite: SpriteName) {
  const a = world.rng() * Math.PI * 2;
  const s = 120 + world.rng() * 180;
  world.particles.push({
    sprite,
    x,
    y,
    vx: Math.cos(a) * s + world.level.runSpeed * 0.6,
    vy: Math.abs(Math.sin(a)) * s + 80,
    gravity: 600,
    life: 0.7,
    maxLife: 0.7,
    rot: world.rng() * 6,
    vr: (world.rng() - 0.5) * 10,
    scale: 0.8 + world.rng() * 0.5,
  });
}

function confetti(world: World, x: number, y: number) {
  if (world.reduceMotion && world.rng() > 1 / 3) return;
  world.particles.push({
    sprite: 'star',
    color: CONFETTI[Math.floor(world.rng() * CONFETTI.length)],
    x,
    y,
    vx: (world.rng() - 0.5) * 360,
    vy: 160 + world.rng() * 320,
    gravity: 520,
    life: 1.6 + world.rng() * 0.8,
    maxLife: 2.4,
    rot: world.rng() * 6,
    vr: (world.rng() - 0.5) * 16,
    scale: 1,
  });
}

function stepParticles(world: World, dt: number) {
  for (const p of world.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= p.gravity * dt;
    p.rot += p.vr * dt;
    if (p.frames) {
      const k = 1 - p.life / p.maxLife;
      p.sprite = p.frames[Math.min(p.frames.length - 1, Math.floor(k * p.frames.length))];
    }
  }
  world.particles = world.particles.filter((p) => p.life > 0);
  if (world.particles.length > 260) world.particles.splice(0, world.particles.length - 260);
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export interface LevelResult {
  bones: number;
  bonesTotal: number;
  goldBones: number;
  goldTotal: number;
  rescued: number;
  rescueTotal: number;
  stars: number;
  time: number;
}

/** One star for finishing, one for 80% of the bones, one for every golden bone. */
export function levelResult(world: World): LevelResult {
  const bonesOk = world.bonesTotal === 0 || world.bones >= Math.ceil(world.bonesTotal * 0.8);
  const goldOk = world.goldBones >= world.goldTotal;
  return {
    bones: world.bones,
    bonesTotal: world.bonesTotal,
    goldBones: world.goldBones,
    goldTotal: world.goldTotal,
    rescued: world.followers.length + world.boarding.length,
    rescueTotal: world.cages.length,
    stars: 1 + (bonesOk ? 1 : 0) + (goldOk ? 1 : 0),
    time: world.t,
  };
}

/** Hands the host the events from the last steps and clears them. */
export function drainEvents(world: World): GameEvent[] {
  const out = world.events;
  world.events = [];
  return out;
}

export type { Acorn, Ball, Boss, Particle };
