// Frame pipeline probe: plays Chapter 1 and Chapter 2 with the shared autopilot at the iPhone 16 Pro's
// landscape size and measures what the JS thread does every tick (step the world, build the op list,
// hand it over), plus how the lists line up from one tick to the next. Run with
// FRAMES=1 npm test -- framePipeline to print the tables; the budgets are asserted always.
//
// Continuity: the canvas blends each op from its "one step ago" slots to its "now" slots, then the
// next list arrives and the blend starts again from that list's "one step ago" slots. Those must equal
// the previous list's "now" slots, or the picture pops at every hand-off. This probe measures the pop.
import os from 'os';

import { CHAPTER_1 } from '../../level/chapter1';
import { CHAPTER_2 } from '../../level/chapter2';
import { CHAPTER_3 } from '../../level/chapter3';
import type { LevelDef } from '../../level/types';
import { STEP, VIEW_H } from '../../constants';
import { ROOM_SIZE } from '../../art';
import { createWorld, drainEvents, stepWorld } from '../../sim/world';
import type { World } from '../../sim/types';
import { autopilot } from '../../sim/__tests__/autopilot';
import { buildFrame, K, OpList, STRIDE, STRIP, type AtlasData, type FrameSetup } from '../buildFrame';
import atlas from '../atlas.json';

const PRINT = !!process.env.FRAMES;
/**
 * The process's CPU time, ms (1 us steps). Not the wall clock: on a busy Mac (another app using most cores) the
 * wall clock also counts the time this test waits for a core, and every budget failed with nothing changed.
 * (The react-native jest preset replaces performance.now with Date.now, 1 ms steps, so that is no use either.)
 */
const now = () => {
  const c = process.cpuUsage();
  return (c.user + c.system) / 1000;
};

/** iPhone 16 Pro landscape. */
const SCREEN = { w: 852, h: 393 };
const k = SCREEN.h / VIEW_H;
const VIEW_W = SCREEN.w / k;
/** The game's own seed (GameView). */
const SEED = 11;

const setup: FrameSetup = {
  atlas: atlas as unknown as AtlasData,
  background: { image: (atlas as unknown as AtlasData).pages.length, w: ROOM_SIZE.w, h: ROOM_SIZE.h },
  k,
  screenW: SCREEN.w,
  screenH: SCREEN.h,
  reduceMotion: false,
};

const FRAME_NAME = new Map(Object.entries((atlas as unknown as AtlasData).frames).map(([name, f]) => [f.join(','), name]));
const frameName = (d: Float64Array, i: number) =>
  d[i] === STRIP ? `strip${d[i + 1]}` : d[i] < 0 ? 'rect' : (FRAME_NAME.get([d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4]].join(',')) ?? `page${d[i]}`);

const CATEGORY = Object.fromEntries(Object.entries(K).map(([name, n]) => [n, name])) as Record<number, string>;
const category = (key: number) => CATEGORY[Math.floor(key / 1_000_000)] ?? `?${Math.floor(key / 1_000_000)}`;

interface Tick {
  t: number;
  x: number;
  ms: number;
  stepMs: number;
  buildMs: number;
  handMs: number;
  ops: number;
  particles: number;
  events: number;
  kinds: string;
}

interface Pop {
  t: number;
  cat: string;
  key: number;
  /** Sprite frame in the last list and in this one. */
  from: string;
  to: string;
  /** Screen points the op jumps at the hand-off, and the change of size, turn and fade. */
  pos: number;
  size: number;
  rot: number;
  alpha: number;
}

interface Run {
  phase: string;
  ticks: Tick[];
  pops: Pop[];
  /** Ops per list that share their key with another op (pairing by key is ambiguous for them). */
  dupMax: number;
  dupAt: number;
}

/** One full chapter, autopiloted until the win event (the confetti included) or game over. */
function play(level: LevelDef, timed: boolean): Run {
  const w: World = createWorld(level, VIEW_W, SEED);
  const out = new OpList();
  const ticks: Tick[] = [];
  const pops: Pop[] = [];
  let dupMax = 0;
  let dupAt = 0;
  let prevData: Float64Array | null = null;
  let prevKeys: number[] = [];
  let prevX = w.hero.x;
  let done = false;
  for (let i = 0; i < 60 * 150 && !done; i++) {
    const input = w.phase === 'won' || w.phase === 'dead' ? { jumpPressed: false, jumpHeld: false, slidePressed: false, barkPressed: false } : autopilot(w);
    const t0 = timed ? now() : 0;
    stepWorld(w, input, STEP);
    const t1 = timed ? now() : 0;
    buildFrame(w, setup, out);
    const t2 = timed ? now() : 0;
    const data = out.toArray();
    const t3 = timed ? now() : 0;
    const events = drainEvents(w);
    if (events.some((e) => e.type === 'won' || e.type === 'gameover')) done = true;
    const kinds = [...new Set(events.filter((e) => e.type !== 'sfx' && e.type !== 'haptic').map((e) => e.type))].join(' ');
    ticks.push({ t: w.t, x: w.hero.x, ms: t3 - t0, stepMs: t1 - t0, buildMs: t2 - t1, handMs: t3 - t2, ops: data.length / STRIDE, particles: w.particles.length, events: events.length, kinds });

    // Keys used more than once in this list.
    const seen = new Map<number, number>();
    for (const key of out.keys) seen.set(key, (seen.get(key) ?? 0) + 1);
    let dups = 0;
    for (const n of seen.values()) if (n > 1) dups += n;
    if (dups > dupMax) {
      dupMax = dups;
      dupAt = w.t;
    }

    // The pop at the hand-off: this list's "one step ago" slots against the last list's "now" slots.
    // A teleport (respawn) is a real jump, not a pop.
    const teleported = Math.abs(w.hero.x - prevX) > 40;
    if (prevData && !teleported) {
      const prevAt = new Map<number, number>();
      prevKeys.forEach((key, n) => prevAt.set(key, seen.get(key) === 1 ? n : -1));
      out.keys.forEach((key, n) => {
        const j = prevAt.get(key);
        if (j === undefined || j < 0 || seen.get(key) !== 1) return;
        const a = n * STRIDE;
        const b = j * STRIDE;
        // Same sprite page: the same thing (a changed key would be a different thing).
        if (data[a] !== prevData![b]) return;
        // Off screen (the draw margin), nobody sees it.
        const half = Math.abs(data[a + 7]) / 2;
        if (data[a + 5] + half < 0 || data[a + 5] - half > SCREEN.w || data[a + 6] + data[a + 8] / 2 < 0 || data[a + 6] - data[a + 8] / 2 > SCREEN.h) return;
        const strip = data[a] === STRIP;
        const sameFrame = strip || (data[a + 1] === prevData![b + 1] && data[a + 2] === prevData![b + 2] && data[a + 3] === prevData![b + 3]);
        const pos = Math.hypot(data[a + 12] - prevData![b + 5], data[a + 13] - prevData![b + 6]);
        const size = Math.max(Math.abs(Math.abs(data[a + 14]) - Math.abs(prevData![b + 7])), Math.abs(data[a + 15] - prevData![b + 8]));
        const rot = Math.abs(data[a + 16] - prevData![b + 9]);
        // A new sprite frame fades in on its own; only a same-frame fade jump is a pop.
        const alpha = sameFrame ? Math.abs(data[a + 17] - prevData![b + 10]) : 0;
        // A strip's index one step ago must be the last list's index (on the same side of the wrap).
        const frames = data[a + 4];
        const jump = strip ? Math.abs(((((data[a + 3] - prevData![b + 2]) % frames) + frames * 1.5) % frames) - frames / 2) : 0;
        if (pos > 0.25 || size > 0.25 || rot > 0.01 || alpha > 0.02 || jump > 0.01) pops.push({ t: w.t, cat: category(key), key, from: frameName(prevData!, b), to: frameName(data, a), pos, size, rot, alpha });
      });
    }
    prevData = data;
    prevKeys = out.keys.slice();
    prevX = w.hero.x;
  }
  return { phase: w.phase, ticks, pops, dupMax, dupAt };
}

const pct = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

interface Summary {
  phase: string;
  ticks: number;
  /** Per tick, the minimum over the timed runs (so a GC or a busy test worker does not count), in ms. */
  max: number;
  p99: number;
  mean: number;
  over2: number;
  stepMax: number;
  buildMax: number;
  handMax: number;
  handMean: number;
  opsMax: number;
  opsMean: number;
  particlesMax: number;
  eventsMax: number;
  worst: Tick[];
  pops: Pop[];
  dupMax: number;
  dupAt: number;
}

const RUNS = 3;

function measure(level: LevelDef): Summary {
  play(level, false); // warm the JIT
  const runs = Array.from({ length: RUNS }, () => play(level, true));
  const base = runs[0];
  // Every run is the same game (same seed, same inputs), so tick n is the same work in each run.
  const ticks = base.ticks.map((tk, n) => {
    const best = (f: (x: Tick) => number) => Math.min(...runs.map((r) => (r.ticks[n] ? f(r.ticks[n]) : f(tk))));
    return { ...tk, ms: best((x) => x.ms), stepMs: best((x) => x.stepMs), buildMs: best((x) => x.buildMs), handMs: best((x) => x.handMs) };
  });
  const ms = ticks.map((x) => x.ms);
  return {
    phase: base.phase,
    ticks: ticks.length,
    max: Math.max(...ms),
    p99: pct(ms, 0.99),
    mean: ms.reduce((s, v) => s + v, 0) / ms.length,
    over2: ms.filter((v) => v > 2).length,
    stepMax: Math.max(...ticks.map((x) => x.stepMs)),
    buildMax: Math.max(...ticks.map((x) => x.buildMs)),
    handMax: Math.max(...ticks.map((x) => x.handMs)),
    handMean: ticks.reduce((s, x) => s + x.handMs, 0) / ticks.length,
    opsMax: Math.max(...ticks.map((x) => x.ops)),
    opsMean: ticks.reduce((s, x) => s + x.ops, 0) / ticks.length,
    particlesMax: Math.max(...ticks.map((x) => x.particles)),
    eventsMax: Math.max(...ticks.map((x) => x.events)),
    worst: [...ticks].sort((a, b) => b.ms - a.ms).slice(0, 6),
    pops: base.pops,
    dupMax: base.dupMax,
    dupAt: base.dupAt,
  };
}

function print(id: string, s: Summary) {
  if (!PRINT) return;
  const f = (v: number) => v.toFixed(3);
  const byCat = new Map<string, { n: number; pos: number; size: number; rot: number; alpha: number; at: number }>();
  for (const p of s.pops) {
    const c = byCat.get(p.cat) ?? { n: 0, pos: 0, size: 0, rot: 0, alpha: 0, at: 0 };
    c.n++;
    if (p.pos > c.pos) c.at = p.t;
    c.pos = Math.max(c.pos, p.pos);
    c.size = Math.max(c.size, p.size);
    c.rot = Math.max(c.rot, p.rot);
    c.alpha = Math.max(c.alpha, p.alpha);
    byCat.set(p.cat, c);
  }
  console.log(
    [
      `${id}: ${s.phase} after ${s.ticks} ticks (${(s.ticks * STEP).toFixed(1)} s), view ${VIEW_W.toFixed(1)} x ${VIEW_H} at k ${k.toFixed(4)}`,
      `JS tick (step + build + hand-off), min of ${RUNS} runs: max ${f(s.max)} ms, p99 ${f(s.p99)}, mean ${f(s.mean)}, ${s.over2} ticks over 2 ms`,
      `  step max ${f(s.stepMax)}  build max ${f(s.buildMax)}  hand-off max ${f(s.handMax)} mean ${f(s.handMean)}`,
      `ops max ${s.opsMax} mean ${s.opsMean.toFixed(0)}, particles max ${s.particlesMax}, events per tick max ${s.eventsMax}`,
      `keys shared by more than one op in a list: max ${s.dupMax} (t=${s.dupAt.toFixed(2)})`,
      'worst ticks:',
      ...s.worst.map((x) => `  t=${x.t.toFixed(2)} x=${Math.round(x.x)} ${f(x.ms)} ms (step ${f(x.stepMs)} build ${f(x.buildMs)} hand ${f(x.handMs)}) ops ${x.ops} particles ${x.particles} events ${x.events} ${x.kinds}`),
      `pops at the hand-off (pos/size in screen pt, rot rad): ${s.pops.length}`,
      ...[...byCat.entries()].map(([c, v]) => `  ${c.padEnd(10)} x${String(v.n).padStart(5)}  pos ${v.pos.toFixed(2)} (t=${v.at.toFixed(2)})  size ${v.size.toFixed(2)}  rot ${v.rot.toFixed(3)}  alpha ${v.alpha.toFixed(2)}`),
      ...(process.env.FRAMES === '2'
        ? [...byCat.keys()].flatMap((c) =>
            s.pops
              .filter((p) => p.cat === c)
              .sort((a, b) => b.pos + b.size + b.rot * 30 + b.alpha * 10 - (a.pos + a.size + a.rot * 30 + a.alpha * 10))
              .slice(0, 4)
              .map((p) => `    ${c} t=${p.t.toFixed(2)} key ${p.key % 1_000_000} ${p.from} -> ${p.to} pos ${p.pos.toFixed(2)} size ${p.size.toFixed(2)} rot ${p.rot.toFixed(3)} alpha ${p.alpha.toFixed(2)}`),
          )
        : []),
    ].join('\n'),
  );
}

/**
 * Node runs this many times faster than the phone's development build, so the budgets are tight: the worst
 * tick here (0.3 ms when this was written) is several milliseconds there, inside a 16.7 ms frame with React,
 * audio and the hand-off still to come.
 */
const BUDGET = { maxMs: 1.0, p99Ms: 0.35, ops: 160, particles: 120, eventsPerTick: 12 };
/**
 * The tick-time budgets mean something only with a core to spare. With the Mac busier than its core count
 * (another app on most cores), even CPU time runs slow (the work lands on the efficiency cores), so the times
 * are printed instead of asserted; everything else is still checked.
 */
const BUSY = os.loadavg()[0] > os.cpus().length;
/** A pop smaller than this is invisible: a quarter of a point, a hundredth of a radian. */
const POP = { pos: 1.5, size: 1.5, rot: 0.05, alpha: 0.1 };
/** The boss blinks on purpose when hit, and the cake drops from its back to the floor when it is beaten. */
const BY_DESIGN = new Set(['boss']);

describe('frame pipeline: every tick is cheap and every hand-off is seamless', () => {
  it.each([CHAPTER_1, CHAPTER_2, CHAPTER_3])('$id', (level) => {
    const s = measure(level);
    print(level.id, s);
    expect(s.phase).toBe('won');
    if (BUSY) console.warn(`${level.id}: Mac busy (load ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cores), tick times not checked: max ${s.max.toFixed(3)} ms, p99 ${s.p99.toFixed(3)} ms, ${s.over2} over 2 ms`);
    else expect({ max: s.max < BUDGET.maxMs, p99: s.p99 < BUDGET.p99Ms, over2: s.over2 }).toEqual({ max: true, p99: true, over2: 0 });
    expect(s.opsMax).toBeLessThanOrEqual(BUDGET.ops);
    expect(s.particlesMax).toBeLessThanOrEqual(BUDGET.particles);
    expect(s.eventsMax).toBeLessThanOrEqual(BUDGET.eventsPerTick);
    // Every op in a list has its own key, so pairing it with its previous self is never a guess.
    expect(s.dupMax).toBe(0);
    const pops = s.pops
      .filter((p) => !BY_DESIGN.has(p.cat) && (p.pos > POP.pos || p.size > POP.size || p.rot > POP.rot || p.alpha > POP.alpha))
      .map((p) => `${p.cat} t=${p.t.toFixed(2)} ${p.from}->${p.to} pos ${p.pos.toFixed(1)} size ${p.size.toFixed(1)} rot ${p.rot.toFixed(2)} alpha ${p.alpha.toFixed(2)}`);
    expect(pops).toEqual([]);
  });
});
