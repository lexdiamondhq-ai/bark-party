// Glitch probe: plays a chapter one fixed step at a time and checks, after every step, the things that
// read on the phone as a freeze, a snap, a teleport, a stuck state or a double fire. The canvas draws
// each step as a blend from `world.prev` to the world now, so anything that moves far in one step
// without snapPrev streaks across the screen, and a step that does not move the clock is a frozen frame.
// Shared by glitch.test.ts (the assertions) and glitchClips.test.ts (the offline frame dumps).
import { HERO_BOX, PHYS, POWER, STEP } from '../../constants';
import type { LevelDef } from '../../level/types';
import { followerDraws } from '../../render/followers';
import { HITSTOP } from '../feel';
import { continueFromCheckpoint, createWorld, drainEvents, stepWorld } from '../world';
import { NO_INPUT, type GameEvent, type Input, type World } from '../types';
import { autopilot } from './autopilot';

/** iPhone 16 Pro landscape: 852 x 393 points; the view is VIEW_H (360) units tall, so k = 393 / 360. */
export const PHONE_VIEW_W = 852 / (393 / 360);

export type Policy = (w: World, step: number) => Input;

export interface Finding {
  kind: string;
  t: number;
  x: number;
  detail: string;
}

export interface ProbeReport {
  level: string;
  policy: string;
  phase: string;
  steps: number;
  findings: Finding[];
  /** Longest run of steps in which the clock stood still (hit-stop). */
  longestFreeze: number;
  /** Most frozen steps inside any one second of play. */
  frozenInASecond: number;
  /** Largest per-step move the canvas blends, for the hero and the camera (world units). */
  maxHeroStep: number;
  maxHeroStepY: number;
  maxCamStep: number;
  maxThingStep: number;
  maxParticles: number;
  maxAcorns: number;
  maxBalls: number;
  maxEvents: number;
  respawns: number;
  retries: number;
  hurts: number;
  /** Seconds from the boss's entrance to its defeat (null if it never ended). */
  bossFight: number | null;
}

const MAX_HITSTOP = Math.max(...Object.values(HITSTOP).map((v) => v ?? 0));
/** The fastest the pup can run: Turbo with zoomies on top. */
const fastest = (level: LevelDef) => level.runSpeed * PHYS.boostSpeed * POWER.turboSpeed;

const finite = (...xs: number[]) => xs.every((v) => Number.isFinite(v));

/** A deterministic random source for the hostile inputs. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const POLICIES: Record<string, (seed?: number) => Policy> = {
  autopilot: () => (w) => autopilot(w),
  /** Jump pressed and held on every single frame. */
  holdJump: () => () => ({ jumpPressed: true, jumpHeld: true, slidePressed: false, barkPressed: false }),
  /** The autopilot, with BARK mashed on every frame on top. */
  mashBark: () => (w) => ({ ...autopilot(w), barkPressed: true }),
  /** The autopilot, with a slide swiped on every frame it is not jumping. */
  slideSpam: () => (w) => {
    const i = autopilot(w);
    return i.jumpPressed ? i : { ...i, slidePressed: true };
  },
  /** Random taps, holds, swipes and barks. */
  random: (seed = 1) => {
    const r = lcg(seed);
    let held = false;
    return () => {
      const jump = r() < 0.06;
      if (jump) held = true;
      else if (r() < 0.08) held = false;
      return { jumpPressed: jump, jumpHeld: held, slidePressed: r() < 0.03, barkPressed: r() < 0.05 };
    };
  },
  /** Nothing at all: the pup runs into the first pit, again and again. */
  none: () => () => NO_INPUT,
  /** The autopilot until the boss shows up, then nothing: dies in the fight and tries again. */
  diesToBoss: () => {
    let retried = false;
    return (w) => {
      if (w.phase === 'run' && w.boss && w.boss.phase !== 'waiting') retried = true;
      if (w.phase === 'boss' && !retried) return NO_INPUT;
      return autopilot(w);
    };
  },
};

interface Before {
  t: number;
  phase: World['phase'];
  heroX: number;
  heroY: number;
  vy: number;
  camX: number;
  hearts: number;
  invuln: number;
  windup: Map<number, number>;
  awake: Map<number, boolean>;
}

function capture(w: World): Before {
  const windup = new Map<number, number>();
  const awake = new Map<number, boolean>();
  for (const e of w.enemies) {
    windup.set(e.id, e.windup);
    awake.set(e.id, e.awake);
  }
  return { t: w.t, phase: w.phase, heroX: w.hero.x, heroY: w.hero.y, vy: w.hero.vy, camX: w.camX, hearts: w.hero.hearts, invuln: w.hero.invuln, windup, awake };
}

export interface ProbeOptions {
  viewW?: number;
  seed?: number;
  /** "Try again" presses allowed after a game over. */
  retries?: number;
  maxSeconds?: number;
  /** Called after every step with that step's events, for the clip dumper. */
  onStep?: (w: World, events: GameEvent[], step: number) => void;
}

export function probe(level: LevelDef, policyName: string, opts: ProbeOptions = {}): ProbeReport {
  const viewW = opts.viewW ?? PHONE_VIEW_W;
  const w = createWorld(level, viewW, opts.seed ?? 7);
  const policy = POLICIES[policyName](opts.seed);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  /** Records a finding; `once` keys collapse repeats of the same thing into one line. */
  const add = (kind: string, detail: string, once?: string) => {
    if (once !== undefined) {
      if (seen.has(kind + once)) return;
      seen.add(kind + once);
    }
    findings.push({ kind, t: +w.t.toFixed(2), x: Math.round(w.hero.x), detail });
  };
  const r: ProbeReport = {
    level: level.id,
    policy: policyName,
    phase: w.phase,
    steps: 0,
    findings,
    longestFreeze: 0,
    frozenInASecond: 0,
    maxHeroStep: 0,
    maxHeroStepY: 0,
    maxCamStep: 0,
    maxThingStep: 0,
    maxParticles: 0,
    maxAcorns: 0,
    maxBalls: 0,
    maxEvents: 0,
    respawns: 0,
    retries: 0,
    hurts: 0,
    bossFight: null,
  };
  const heroBound = fastest(level) * STEP * 1.5;
  let retriesLeft = opts.retries ?? 0;
  let frozenRun = 0;
  const frozenAt: number[] = [];
  const callouts = new Map<string, number>();
  let phaseSince = 0;
  let lastProgress = 0;
  let progressX = w.hero.x;
  let bossStart: number | null = null;
  let vacuumBounceStep = -99;
  let respawnedStep = -99;
  const levelEnemies = level.enemies.length;
  const maxSteps = Math.round((opts.maxSeconds ?? 180) / STEP);

  for (let i = 0; i < maxSteps; i++) {
    const b = capture(w);
    stepWorld(w, policy(w, i), STEP);
    const events = drainEvents(w);
    r.steps++;
    const h = w.hero;

    // --- The clock: hit-stop never stacks past the biggest single freeze, and freezes never chain into a stall.
    const frozen = w.t === b.t;
    if (frozen) {
      frozenRun++;
      frozenAt.push(i);
    } else frozenRun = 0;
    r.longestFreeze = Math.max(r.longestFreeze, frozenRun);
    while (frozenAt.length && frozenAt[0] <= i - 60) frozenAt.shift();
    r.frozenInASecond = Math.max(r.frozenInASecond, frozenAt.length);
    if (w.hitstop > MAX_HITSTOP + 1e-9) add('hitstop_stacked', `hitstop ${w.hitstop.toFixed(3)} s > ${MAX_HITSTOP}`);

    // --- Phase holds.
    if (w.phase !== b.phase) phaseSince = w.t;
    if (w.phase === 'respawn' && w.t - phaseSince > 0.9 + 2 * STEP + 1e-9) add('respawn_hold_long', `${(w.t - phaseSince).toFixed(2)} s`, 'r');
    if (w.phase === 'won' && !w.finished && w.t - phaseSince > 2.2 + 2 * STEP + 1e-9) add('won_hold_long', `${(w.t - phaseSince).toFixed(2)} s`, 'w');

    // --- Teleports: the canvas blends from world.prev, so every big move must come with snapPrev.
    const realDx = Math.abs(h.x - b.heroX);
    const blendDx = Math.abs(h.x - w.prev.x);
    const blendDy = Math.abs(h.y - w.prev.y);
    const blendCam = Math.abs(w.camX - w.prev.camX);
    r.maxHeroStep = Math.max(r.maxHeroStep, blendDx);
    r.maxHeroStepY = Math.max(r.maxHeroStepY, blendDy);
    r.maxCamStep = Math.max(r.maxCamStep, blendCam);
    if (blendDx > heroBound) add('hero_streak', `hero blends ${blendDx.toFixed(1)} units in one step (bound ${heroBound.toFixed(1)})`);
    if (blendDy > PHYS.maxFall * STEP + PHYS.landTolerance) add('hero_streak_y', `hero blends ${blendDy.toFixed(1)} units up/down in one step`);
    if (blendCam > heroBound + 12) add('camera_streak', `camera blends ${blendCam.toFixed(1)} units in one step`);
    if (realDx > heroBound && (w.prev.x !== h.x || w.prev.camX !== w.camX)) add('teleport_without_snap', `moved ${realDx.toFixed(0)} without snapPrev`);

    // Everything else the canvas blends.
    for (const e of w.enemies) {
      if (e.px === undefined || e.py === undefined) continue;
      const d = Math.hypot(e.x - e.px, e.y - e.py);
      r.maxThingStep = Math.max(r.maxThingStep, d);
      if (d > 40) add('enemy_streak', `${e.type}#${e.id} blends ${d.toFixed(0)} units`, `${e.id}`);
    }
    for (const a of w.acorns) {
      if (a.px === undefined || a.py === undefined) continue;
      const d = Math.hypot(a.x - a.px, a.y - a.py);
      r.maxThingStep = Math.max(r.maxThingStep, d);
      if (d > 40) add('acorn_streak', `acorn blends ${d.toFixed(0)} units`);
    }
    if (w.boss && w.boss.px !== undefined && w.boss.phase !== 'waiting') {
      const d = Math.hypot(w.boss.x - w.boss.px, w.boss.y - (w.boss.py ?? w.boss.y));
      if (d > 40) add('boss_streak', `boss blends ${d.toFixed(0)} units`, 'b' + Math.round(w.t));
    }

    // --- Ids: the renderer pairs each acorn, ball and particle with its previous self by id.
    for (const [name, list] of [['acorn', w.acorns], ['ball', w.balls], ['particle', w.particles]] as const) {
      const ids = new Set<number>();
      for (const q of list) {
        if (q.id === undefined) add('no_id_at_render', `${name} drawn before it has an id`, name);
        else if (ids.has(q.id)) add('duplicate_id', `${name} id ${q.id} twice`, name);
        else ids.add(q.id);
      }
    }

    // --- Counts stay bounded.
    r.maxParticles = Math.max(r.maxParticles, w.particles.length);
    r.maxAcorns = Math.max(r.maxAcorns, w.acorns.length);
    r.maxBalls = Math.max(r.maxBalls, w.balls.length);
    r.maxEvents = Math.max(r.maxEvents, events.length);
    if (w.enemies.length > levelEnemies) add('enemy_count', `${w.enemies.length} enemies`, 'e');
    if (w.particles.length > 260) add('particle_count', `${w.particles.length} particles`, 'p');
    if (w.acorns.length > 8) add('acorn_count', `${w.acorns.length} acorns`, 'a');
    if (w.balls.length > 12) add('ball_count', `${w.balls.length} balls`, 'b');
    if (w.trail.length > 240) add('trail_count', `${w.trail.length}`, 't');
    if (w.followers.length + w.boarding.length > w.cages.length) add('follower_count', `${w.followers.length}+${w.boarding.length}`, 'f');
    if (events.length > 60) add('event_burst', `${events.length} events in one step`);

    // --- No NaN anywhere the canvas reads.
    if (!finite(h.x, h.y, h.vx, h.vy, h.stride, h.wag, h.restBlend, w.camX, w.camY, w.camLead, w.shake.x, w.shake.y, w.hitstop)) add('nan', 'hero or camera', 'h');
    for (const e of w.enemies) if (!finite(e.x, e.y, e.vx, e.vy, e.t)) add('nan', `${e.type}#${e.id}`, `e${e.id}`);
    for (const a of w.acorns) if (!finite(a.x, a.y, a.vx, a.vy, a.landX, a.landT, a.spin)) add('nan', 'acorn', 'a');
    for (const q of w.balls) if (!finite(q.x, q.y, q.vx)) add('nan', 'ball', 'b');
    for (const q of w.particles) if (!finite(q.x, q.y, q.vx, q.vy, q.life, q.rot)) add('nan', 'particle', 'p');
    if (w.boss && !finite(w.boss.x, w.boss.y, w.boss.vy, w.boss.t)) add('nan', 'boss', 'boss');

    // --- Hearts and timers.
    if (h.hearts < 0 || h.hearts > w.maxHearts) add('hearts_range', `hearts ${h.hearts}`);
    if (b.hearts - h.hearts > 1) add('double_hurt', `lost ${b.hearts - h.hearts} hearts in one step`);
    const hurtsNow = events.filter((e) => e.type === 'hurt').length;
    r.hurts += hurtsNow;
    if (hurtsNow > 1) add('double_hurt_event', `${hurtsNow} hurt events in one step`);
    for (const [k, v] of Object.entries({ invuln: h.invuln, barkCooldown: h.barkCooldown, barkBuffer: h.barkBuffer, sliding: h.sliding, boost: h.boost, jumpBuffer: h.jumpBuffer, slideBuffer: h.slideBuffer, barking: h.barking }))
      if (v < 0) add('timer_negative', `hero.${k} = ${v}`, k);
    for (const e of w.enemies) {
      if (e.windup < 0 || e.throwing < 0 || e.pop < 0) add('timer_negative', `${e.type}#${e.id} windup/throwing/pop`, `e${e.id}`);
    }

    // --- Callouts fire once each (the boss's own "golden acorn" tip once per fight).
    for (const e of events) {
      if (e.type !== 'callout') continue;
      const n = (callouts.get(e.text) ?? 0) + 1;
      callouts.set(e.text, n);
      if (n > 1 + r.retries) add('callout_twice', `"${e.text}" x${n}`);
    }

    // --- Mechanics a player would call a glitch.
    // A vacuum bounce that hurts on the way up.
    if (h.vy === PHYS.stompBounce * 1.25) vacuumBounceStep = i;
    if (hurtsNow && i - vacuumBounceStep <= 10) add('vacuum_bounce_hurts', `hurt ${i - vacuumBounceStep} steps after bouncing off the vacuum`);
    // The pup inside a solid box (fell in past its top corner, or stood up under it). A pup whose centre is already
    // past the box's right edge is only brushing the corner on its way down (the same teeter every edge allows).
    if (w.phase === 'run' || w.phase === 'boss') {
      const hx0 = h.x - HERO_BOX.w / 2;
      const hx1 = h.x + HERO_BOX.w / 2;
      const hy1 = h.y + (h.sliding > 0 ? HERO_BOX.slideH : HERO_BOX.h);
      for (const p of w.platforms) {
        if (!p.solid || h.x >= p.x + p.w) continue;
        const ox = Math.min(hx1, p.x + p.w) - Math.max(hx0, p.x);
        const oy = Math.min(hy1, p.top) - Math.max(h.y, p.y);
        if (ox > 4 && oy > 4) add('inside_solid', `${p.sprite}@${p.x}: ${ox.toFixed(0)} x ${oy.toFixed(0)} units deep`, `${p.x}`);
      }
    }
    // A thrower that lets go when the pup has already run past it (the acorn comes from behind).
    for (const e of w.enemies) {
      if (e.type !== 'thrower') continue;
      const was = b.windup.get(e.id) ?? 0;
      if (was > 0 && e.windup === 0 && e.throwing === 0.3 && e.x - h.x < 40) add('thrown_from_behind', `thrower@${e.x} let go ${Math.round(h.x - e.x)} units behind the pup`, `${e.id}@${Math.round(w.t)}`);
    }
    // A runner wakes (its hop and sparkle) as it crosses the right edge of the view, never already well inside it.
    for (const e of w.enemies) {
      if (e.type !== 'runner' || !e.awake || b.awake.get(e.id) !== false) continue;
      const inside = w.camX + viewW + 8 - (e.x - e.w / 2);
      if (inside > 40) add('runner_wakes_in_view', `runner@${Math.round(e.x)} woke ${Math.round(inside)} units inside the view`, `${e.id}`);
    }
    // Squirrels and the cat standing on air (no furniture top under them).
    for (const e of w.enemies) {
      if (e.state !== 'active' || e.type === 'vacuum' || e.type === 'blocks') continue;
      const y = e.type === 'runner' ? e.y0 : e.y;
      if (y <= 0.5) continue;
      if (e.x < w.camX - 40 || e.x > w.camX + viewW + 40) continue;
      const under = w.platforms.some((p) => e.x >= p.x - 2 && e.x <= p.x + p.w + 2 && Math.abs(p.top - y) <= 3);
      if (!under) add('floating_enemy', `${e.type}@${Math.round(e.x)} stands ${Math.round(y)} units up with nothing under it`, `${e.id}`);
    }
    // Respawns: where the pup comes back and what is around it.
    if (b.phase === 'respawn' && w.phase !== 'respawn') {
      r.respawns++;
      respawnedStep = i;
      progressX = h.x;
      lastProgress = w.t;
      for (const e of w.enemies) {
        if (e.state === 'active' && Math.abs(e.x - h.x) < 90 && Math.abs(e.y - h.y) < 60) add('respawn_next_to_enemy', `${e.type}@${Math.round(e.x)} ${Math.round(e.x - h.x)} units from the respawn`);
      }
    }
    if (i - respawnedStep < 30 && h.pose === 'hurt') add('hurt_pose_on_respawn', 'the pup wobbles in its hurt pose right after a respawn', `${respawnedStep}`);
    // While the pup is hidden in the respawn hold, the wagon (drawn from the trail) must not hang on screen in mid-air.
    if (w.phase === 'respawn' && w.phaseT > 0.5 && w.followers.length) {
      const wagon = followerDraws(w, { t: w.t, ago: 0, heroX: h.x, heroY: h.y }).sprites.find((s) => s.sprite === 'wagon');
      const bottomOfView = -(360 - 310) + w.camY;
      if (wagon && wagon.y + 44 > bottomOfView && wagon.y > 2) add('wagon_hangs_in_air', `wagon at y=${Math.round(wagon.y)} while the pup is in the pit`, `${Math.round(w.t - w.phaseT)}`);
    }
    // The boss enters from beyond the right edge of the view, never popping in half visible.
    if (w.boss && w.boss.phase === 'intro' && w.boss.t === 0 && w.boss.x - 60 < w.camX + viewW) add('boss_pops_in', `boss appears ${Math.round(w.camX + viewW - (w.boss.x - 60))} units inside the view`);
    // Stuck: no forward progress for four seconds while running (a solid box holds the pup until it jumps, by design).
    if (h.x > progressX + 1 || h.blocked) {
      progressX = Math.max(progressX, h.x);
      lastProgress = w.t;
    }
    if ((w.phase === 'run' || w.phase === 'boss') && w.t - lastProgress > 4) add('stuck', `no progress for ${(w.t - lastProgress).toFixed(1)} s at x=${Math.round(h.x)}`, `${Math.round(progressX)}`);
    // The boss fight's length.
    for (const e of events) {
      if (e.type === 'boss_start') bossStart = w.t;
      if (e.type === 'boss_defeated' && bossStart !== null) r.bossFight = +(w.t - bossStart).toFixed(1);
    }
    if (bossStart !== null && r.bossFight === null && w.t - bossStart > 90) add('boss_never_ends', `${(w.t - bossStart).toFixed(0)} s`, 'boss');

    opts.onStep?.(w, events, i);

    if (w.phase === 'dead') {
      if (retriesLeft <= 0) break;
      retriesLeft--;
      r.retries++;
      const bossWas = w.boss?.phase;
      continueFromCheckpoint(w);
      drainEvents(w);
      phaseSince = w.t;
      lastProgress = w.t;
      progressX = w.hero.x;
      respawnedStep = i;
      if (w.hitstop > 0) add('retry_starts_frozen', `"Try again" starts with ${(w.hitstop / STEP).toFixed(1)} frozen steps and shake ${w.shake.x.toFixed(2)}`, 'rf');
      else if (w.shake.x > 0.05) add('retry_starts_shaking', `"Try again" starts with shake ${w.shake.x.toFixed(2)}`, 'rs');
      if (w.boss && bossWas !== 'waiting' && w.boss.phase !== 'waiting') {
        const def = level.boss!;
        const between = w.platforms.filter((p) => p.x + p.w > w.hero.x && p.x < def.x);
        const foes = w.enemies.filter((e) => e.state === 'active' && e.x > w.hero.x && e.x < def.x);
        if (between.length || foes.length)
          add('boss_retry_over_furniture', `boss fight restarts at x=${Math.round(w.hero.x)}, ${Math.round(def.x - w.hero.x)} units before the arena: ${between.map((p) => `${p.sprite}${p.solid ? '(solid)' : ''}`).join(', ')}${foes.length ? `; still awake: ${foes.map((e) => `${e.type}@${Math.round(e.x)}`).join(', ')}` : ''}`);
      }
    }
    if (w.phase === 'won' && w.finished) break;
  }
  r.phase = w.phase;
  return r;
}

/** One line per run plus its findings, for PROBE=1. */
export function describe(r: ProbeReport): string {
  const head =
    `${r.level} ${r.policy.padEnd(10)} ${r.phase.padEnd(7)} ${(r.steps * STEP).toFixed(0).padStart(4)}s ` +
    `freeze<=${r.longestFreeze} steps (${r.frozenInASecond}/s) heroStep<=${r.maxHeroStep.toFixed(1)} camStep<=${r.maxCamStep.toFixed(1)} thing<=${r.maxThingStep.toFixed(0)} ` +
    `particles<=${r.maxParticles} acorns<=${r.maxAcorns} balls<=${r.maxBalls} events<=${r.maxEvents} respawns=${r.respawns} retries=${r.retries} hurts=${r.hurts} boss=${r.bossFight ?? '-'}s`;
  const kinds = new Map<string, Finding[]>();
  for (const f of r.findings) kinds.set(f.kind, [...(kinds.get(f.kind) ?? []), f]);
  const lines = [...kinds.entries()].map(([k, fs]) => `    ${k} x${fs.length}: ${fs.slice(0, 3).map((f) => `t=${f.t} x=${f.x} ${f.detail}`).join(' | ')}`);
  return [head, ...lines].join('\n');
}
