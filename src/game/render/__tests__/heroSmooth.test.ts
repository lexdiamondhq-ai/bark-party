// The pup as a 120 Hz screen shows it. Lists are built step by step exactly as the game builds them, the
// real playhead picks what each display frame draws (two display frames per step, lists on time), and every
// frame the drawn pup is measured: where its body is on screen, which leg pose it shows, and where the floor
// is. A smooth run keeps the pup's screen x nearly still, moves its y along a smooth arc, advances the legs
// every frame, and scrolls the floor by the same amount every frame.
// FRAMES=1 npm test -- heroSmooth prints the numbers.
import { CHAPTER_1 } from '../../level/chapter1';
import type { LevelDef } from '../../level/types';
import { STEP, VIEW_H } from '../../constants';
import { ROOM_SIZE } from '../../art';
import { PUP_LEG_FRAMES } from '../../sprites';
import { createWorld, drainEvents, stepWorld } from '../../sim/world';
import { NO_INPUT, type Input, type World } from '../../sim/types';
import { autopilot } from '../../sim/__tests__/autopilot';
import { buildFrame, HEADER, K, OpList, STRIDE, STRIP, type AtlasData, type FrameSetup } from '../buildFrame';
import { advancePlayhead, newPlayhead } from '../drawOps';
import { heroPose } from '../pupPose';
import atlas from '../atlas.json';

const PRINT = !!process.env.FRAMES;
const UI_MS = 1000 / 120;
const STEP_MS = STEP * 1000;
const k = 393 / VIEW_H;
const VIEW_W = 852 / k;
const ATLAS = atlas as unknown as AtlasData;
// Camera shake off: it moves the whole picture on purpose, and this check is about the pup against the room.
const setup: FrameSetup = { atlas: ATLAS, background: { image: ATLAS.pages.length, w: ROOM_SIZE.w, h: ROOM_SIZE.h }, k, screenW: 852, screenH: 393, reduceMotion: true };
const FRAME_NAME = new Map(Object.entries(ATLAS.frames).map(([name, f]) => [f.join(','), name]));

interface Built {
  list: Float64Array;
  keys: number[];
  /** The pup's leg strip index this step, straight from its pose (the ideal, before any drawing). */
  legIndex: number;
  /** What the sim says: on the ground and running (legs should cycle), and the pose. */
  running: boolean;
  pose: string;
}

/** One drawn display frame of the pup: where its paws are on screen, its leg pose, and where the floor is. */
interface Shot {
  step: number;
  /** The leg index the pup should show at this frame's moment (between the two steps of its list). */
  ideal: number;
  x: number;
  y: number;
  /** Leg pose as a continuous strip index (frame + blend), or -1 when no stride legs are drawn. */
  leg: number;
  floor: number;
  running: boolean;
  pose: string;
  /** 'puppet', or the sticker drawn instead (a different drawing has a different middle). */
  drawing: string;
}

/** Lerped value of field f (prev slot f + 7) of op i at blend a. */
const at = (d: Float64Array, i: number, f: number, a: number) => d[i + f + 7] * (1 - a) + d[i + f] * a;

const wrapLeg = (v: number) => ((v % PUP_LEG_FRAMES) + PUP_LEG_FRAMES * 1.5) % PUP_LEG_FRAMES - PUP_LEG_FRAMES / 2;

function shoot(b: Built, a: number, step: number, before?: Built): Shot {
  const d = b.list;
  let x = NaN;
  let y = NaN;
  let legA = -1;
  let legT = 0;
  let floor = NaN;
  let drawing = '';
  b.keys.forEach((key, n) => {
    const i = HEADER + n * STRIDE;
    const cat = Math.floor(key / 1_000_000);
    const slot = key % 1_000_000;
    if (cat === K.floorTile && Number.isNaN(floor)) floor = at(d, i, 5, a);
    if (cat !== K.hero) return;
    const name = FRAME_NAME.get([d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4]].join(',')) ?? '';
    // The body: the middle of the puppet's base layer, which is the point it turns about (so the bound's pitch
    // does not move it), or of a whole-pup sticker (slide, bark, sit).
    if (slot === 1 || (slot === 0 && name.startsWith('pup_'))) {
      x = at(d, i, 5, a);
      y = at(d, i, 6, a);
      drawing = slot === 1 ? 'puppet' : name;
    }
    const alpha = at(d, i, 10, a);
    // The stride strip: the canvas blends its index to this moment and shows the two frames around it.
    if (d[i] === STRIP && d[i + 1] === 0 && alpha > 0.01) {
      const frames = d[i + 4];
      const idx = (((d[i + 3] * (1 - a) + d[i + 2] * a) % frames) + frames) % frames;
      legA = Math.floor(idx);
      legT = idx - legA;
    }
    // (Before strips, the stride was two sprite layers: the frame, and the next one at the blend.)
    if (name.startsWith('pup_leg_') && name !== 'pup_leg_rest') {
      const f = Number(name.slice(8));
      if (slot === 4 && alpha > 0.01) legA = f;
      if (slot === 5) legT = alpha;
    }
  });
  const from = before ? before.legIndex : b.legIndex;
  const ideal = (((from + wrapLeg(b.legIndex - from) * a) % PUP_LEG_FRAMES) + PUP_LEG_FRAMES) % PUP_LEG_FRAMES;
  return { step, ideal, x, y, leg: legA < 0 ? -1 : legA + legT, floor, running: b.running, pose: b.pose, drawing };
}

/** A tiny seeded random, so the jitter is the same every run. */
function rng(seed: number) {
  let v = seed >>> 0;
  return () => {
    v = (v * 1664525 + 1013904223) >>> 0;
    return v / 2 ** 32;
  };
}

/**
 * When each step's list reaches the canvas (ms), or Infinity if it never does (the second of two steps taken
 * in one JS frame replaces the first). `steady`: one step per 60 Hz JS frame, handed over 4 ms later.
 * `jittery120`: the JS frame runs at 120 Hz with +-1.5 ms of jitter and GameView's step rules (a frame within
 * 4 ms of a step counts as one, at most two steps per frame), handed over 3 ms later.
 */
type Schedule = (lists: number) => number[];
const steady: Schedule = (lists) => Array.from({ length: lists }, (_, n) => (n + 1) * STEP_MS + 4);
const jittery120: Schedule = (lists) => {
  const r = rng(5);
  const visible: number[] = [];
  let last = 0;
  let acc = 0;
  for (let j = 1; visible.length < lists; j++) {
    const now = j * UI_MS + (r() - 0.5) * 3;
    let elapsed = now - last;
    last = now;
    if (Math.abs(elapsed - STEP_MS) < 4) elapsed = STEP_MS;
    acc += elapsed;
    let steps = 0;
    while (acc >= STEP_MS && steps < 2) {
      acc -= STEP_MS;
      steps++;
      visible.push(Infinity);
    }
    if (acc >= STEP_MS) acc = 0;
    if (steps) visible[visible.length - 1] = now + 3;
  }
  return visible.slice(0, lists);
};

/** Builds every step's list, then plays them through the playhead at 120 Hz as they reach the canvas. */
function film(w: World, steps: number, input: (w: World, i: number) => Input, schedule: Schedule = steady): Shot[] {
  const out = new OpList();
  const built: Built[] = [];
  for (let i = 0; i < steps && w.phase !== 'won' && w.phase !== 'dead'; i++) {
    stepWorld(w, input(w, i), STEP);
    drainEvents(w);
    buildFrame(w, setup, out);
    built.push({ legIndex: heroPose(w.hero, w.hero.stride, STEP).legIndex, list: out.handOff(i + 1, w.prev.t === w.t), keys: out.keys.slice(), running: w.hero.onGround && w.hero.pose === 'run' && w.hero.restBlend === 0 && w.phase === 'run', pose: w.hero.pose });
  }
  const p = newPlayhead();
  const shots: Shot[] = [];
  const visible = schedule(built.length);
  let n = -1;
  for (let f = 0; f < built.length * 2; f++) {
    const now = f * UI_MS;
    while (n + 1 < built.length && visible[n + 1] <= now) n++;
    // Skip lists that never reached the canvas.
    while (n + 1 < built.length && visible[n + 1] === Infinity && (visible.slice(n + 1).find((v) => v !== Infinity) ?? Infinity) <= now) n++;
    if (n < 0 || visible[n] === Infinity) continue;
    advancePlayhead(p, now, built[n].list);
    const b = built[p.list![0] - 1];
    shots.push(shoot(b, p.a, p.list![0], built[p.list![0] - 2]));
  }
  return shots;
}

interface Report {
  frames: number;
  /** Frames where the pup's screen x moved more than this from the frame before. */
  xJolts: number;
  xMax: number;
  /** Frames where the pup's height turned around and back within three frames (a jitter, not an arc). */
  yWobbles: number;
  /** The largest change of vertical speed between frames outside take-off and landing (pt per frame). */
  yKink: number;
  /** Running frames where the legs did not move on although they should have, or moved against the gallop. */
  legRepeats: number;
  legBack: number;
  legFrames: number;
  /** How far the drawn leg pose is from where it should be at that moment (strip frames). */
  legOff: number;
  legOffMax: number;
  /** Frames where the floor scrolled unevenly (pt). */
  floorJolts: number;
  floorMax: number;
  where: string[];
}

function judge(shots: Shot[]): Report {
  const r: Report = { frames: shots.length, xJolts: 0, xMax: 0, yWobbles: 0, yKink: 0, legRepeats: 0, legBack: 0, legFrames: 0, legOff: 0, legOffMax: 0, floorJolts: 0, floorMax: 0, where: [] };
  let offSum = 0;
  const counts = new Map<string, number>();
  const note = (s: string) => {
    const kind = s.split(' ').slice(0, 2).join(' ');
    const n = counts.get(kind) ?? 0;
    counts.set(kind, n + 1);
    if (n < 8) r.where.push(s);
  };
  for (let i = 3; i < shots.length; i++) {
    const s = shots[i];
    const p = shots[i - 1];
    const pp = shots[i - 2];
    if ([s, p, pp].some((q) => Number.isNaN(q.x) || Number.isNaN(q.y))) continue;
    // A different drawing (puppet to bark sticker, say) has its own middle: not a move of the pup.
    const next = shots[i + 1];
    const same = s.drawing === p.drawing && p.drawing === pp.drawing && (!next || next.drawing === s.drawing);
    const dx = Math.abs(s.x - p.x);
    if (same) r.xMax = Math.max(r.xMax, dx);
    if (same && dx > 1 && s.step > 30) {
      r.xJolts++;
      note(`x jolt ${dx.toFixed(2)} pt at step ${s.step} (${p.pose}->${s.pose})`);
    }
    // Screen y grows downward; a wobble is a direction change that reverses again within three frames.
    const d1 = p.y - pp.y;
    const d2 = s.y - p.y;
    const d3 = i + 1 < shots.length && !Number.isNaN(shots[i + 1].y) ? shots[i + 1].y - s.y : d2;
    if (same && Math.abs(d1) > 0.05 && Math.abs(d2) > 0.05 && Math.abs(d3) > 0.05 && Math.sign(d1) !== Math.sign(d2) && Math.sign(d2) !== Math.sign(d3)) {
      r.yWobbles++;
      note(`y wobble at step ${s.step} (${d1.toFixed(2)}, ${d2.toFixed(2)}, ${d3.toFixed(2)}) ${pp.pose} ${p.pose} ${s.pose}`);
    }
    const sameAir = s.pose === p.pose && p.pose === pp.pose && (s.pose === 'jump' || s.pose === 'fall');
    if (sameAir && Math.abs(d2 - d1) > r.yKink) {
      r.yKink = Math.abs(d2 - d1);
      if (r.yKink > 1) note(`y kink ${(d2 - d1).toFixed(2)} pt/frame at step ${s.step} (${pp.pose} ${p.pose} ${s.pose})`);
    }
    if (s.running && p.running && s.leg >= 0 && p.leg >= 0) {
      r.legFrames++;
      const shown = wrapLeg(s.leg - p.leg);
      const should = wrapLeg(s.ideal - p.ideal);
      if (Math.abs(should) > 0.1 && Math.abs(shown) < 1e-6) r.legRepeats++;
      else if (Math.abs(should) > 0.1 && Math.sign(shown) !== Math.sign(should)) r.legBack++;
      const off = Math.abs(wrapLeg(s.leg - s.ideal));
      offSum += off;
      r.legOffMax = Math.max(r.legOffMax, off);
    }
    if (!Number.isNaN(s.floor) && !Number.isNaN(p.floor) && !Number.isNaN(pp.floor)) {
      const jolt = Math.abs(s.floor - p.floor - (p.floor - pp.floor));
      // A floor tile key changes when a new tile becomes the first one on screen; skip that frame.
      if (Math.abs(s.floor - p.floor) < 40 && Math.abs(p.floor - pp.floor) < 40) {
        r.floorMax = Math.max(r.floorMax, jolt);
        if (jolt > 0.75) r.floorJolts++;
      }
    }
  }
  r.legOff = offSum / Math.max(1, r.legFrames);
  return r;
}

const flat: LevelDef = {
  ...CHAPTER_1,
  floorSegments: [[-600, 30000]],
  platforms: [{ sprite: 'cardboard_box', x: 3300, solid: true }],
  enemies: [],
  pickups: [],
  cages: [],
  checkpoints: [],
  callouts: [],
  decor: [],
  boss: undefined,
  finishX: 30000,
};

/** A scripted run: run, a full jump, a short hop, a double jump, a bark in the air, a slide, a bark on the run, into a box. */
function script(w: World, i: number): Input {
  const s = (from: number, to: number) => i >= from && i < to;
  if (i === 60 || i === 160 || i === 260 || i === 285 || i === 400) return { ...NO_INPUT, jumpPressed: true, jumpHeld: true };
  if (s(61, 90) || s(261, 330) || s(401, 440)) return { ...NO_INPUT, jumpHeld: true };
  if (i === 420) return { ...NO_INPUT, barkPressed: true, jumpHeld: true };
  if (i === 520) return { ...NO_INPUT, slidePressed: true };
  if (i === 620) return { ...NO_INPUT, barkPressed: true };
  return NO_INPUT;
}

describe('the pup at 120 Hz', () => {
  // The floor's evenness budget: a quarter of a point on the flat run; in Chapter 1 the hit-stops stop the
  // scroll for a few frames on purpose, which is one frame's worth of scroll (2.4 pt) at a time.
  const cases: [string, () => Shot[], number][] = [
    ['scripted jumps on a flat floor', () => film(createWorld(flat, VIEW_W, 11), 900, script), 0.75],
    ['scripted jumps, JS frames at 120 Hz with jitter', () => film(createWorld(flat, VIEW_W, 11), 900, script, jittery120), 0.75],
    ['Chapter 1 with the autopilot', () => film(createWorld(CHAPTER_1, VIEW_W, 11), 60 * 150, (w) => autopilot(w)), 2.6],
  ];
  it.each(cases)('%s', (name, run, floorBudget) => {
    const r = judge(run());
    if (PRINT) {
      console.log(
        [
          `${name}: ${r.frames} display frames`,
          `  pup screen x: ${r.xJolts} frames moved over 1 pt (max ${r.xMax.toFixed(2)} pt)`,
          `  pup screen y: ${r.yWobbles} wobbles; largest kink in the air ${r.yKink.toFixed(2)} pt/frame`,
          `  legs while running: ${r.legFrames} frames; ${r.legRepeats} held the pose although it should move (${((100 * r.legRepeats) / Math.max(1, r.legFrames)).toFixed(0)}%), ${r.legBack} moved against the gallop; off the ideal pose by ${r.legOff.toFixed(2)} frames on average, ${r.legOffMax.toFixed(2)} at most`,
          `  floor scroll: ${r.floorJolts} uneven frames (max ${r.floorMax.toFixed(2)} pt)`,
          ...r.where.map((s) => `    ${s}`),
        ].join('\n'),
      );
    }
    expect(r.frames).toBeGreaterThan(500);
    // The legs move on every display frame, the way the gallop goes, and show the pose of that very moment.
    expect({ held: r.legRepeats, against: r.legBack }).toEqual({ held: 0, against: 0 });
    expect(r.legOff).toBeLessThan(0.05);
    // The pup's height never jitters, and on screen it only drifts as the camera eases (when it stops at a box).
    expect(r.yWobbles).toBe(0);
    expect(r.xMax).toBeLessThan(2.5);
    expect(r.floorMax).toBeLessThan(floorBudget);
  });
});
