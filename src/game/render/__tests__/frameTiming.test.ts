// The whole frame-timing pipeline against phone-like timing: the game loop's tick clock on the JS thread,
// the hand-off of lists, and the playhead on the UI thread (the real receiveList and movePlayhead).
//
// The iPhone (RN 0.86): the game loop's requestAnimationFrame is a zero-delay timer that a 60 Hz display link
// fires, and the JS thread runs it when it gets to it, stamped with performance.now() then. So a tick runs a
// small delay after its vsync, sometimes a big one (a sound starting, a React render, native events queued
// ahead of it). The tick steps the world, hands each new list to the UI thread, and a 120 Hz frame callback
// draws them through the playhead.
//
// First version: the float accumulator with SNAP, and one shared value that each tick overwrote, so a UI frame
// saw only the newest list (a two-step tick handed over only its second list, and two ticks that landed in
// one display frame lost the first). "queue" is that clock with every list queued in order; "now" adds the
// grid clock (stepClock.ts). The queue is what stops the jumps; the clock cuts the doubled steps.
//
// Each row plays a minute: one tick a second runs late by the given amount, on a steady load, on one that
// shifts by 5 ms every 10 s, on displays 0.1% slow or fast against performance.now(), and on the web, where
// requestAnimationFrame runs at the display's own rate. TIMING=1 npm test -- frameTiming prints the table.
import { STEP } from '../../constants';
import { HEADER } from '../buildFrame';
import { movePlayhead, newPlayhead, receiveList } from '../drawOps';
import { countFrames, newStepClock, takeSteps } from '../stepClock';

const PRINT = !!process.env.TIMING;
const STEP_MS = STEP * 1000;
const UI_MS = 1000 / 120;
/** What a tick costs before its lists leave (step, build, hand-off), ms. */
const WORK = 1.5;
const MAX_STEPS = 2;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** GameView's tick clock before this change. */
function firstClock() {
  let last = 0;
  let acc = 0;
  return (now: number) => {
    let elapsed = last ? (now - last) / 1000 : 0;
    last = now;
    if (Math.abs(elapsed - STEP) < 0.004) elapsed = STEP;
    acc += elapsed;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      acc -= STEP;
      steps++;
    }
    if (acc >= STEP) acc = 0;
    return steps;
  };
}

function gridClock() {
  const c = newStepClock();
  return (now: number) => takeSteps(c, countFrames(c, now), MAX_STEPS);
}

interface Load {
  name: string;
  /** A sustained extra delay that switches on and off every 10 s (0 for none). */
  shift: number;
  /** The display's real frame length against nominal (1.001: 0.1% slow). */
  drift: number;
  /** The JS loop's frame rate: 60 on the iPhone; the web runs requestAnimationFrame at the display's rate. */
  jsHz: number;
}

const LOADS: Load[] = [
  { name: 'steady', shift: 0, drift: 1, jsHz: 60 },
  { name: 'shifting', shift: 5, drift: 1, jsHz: 60 },
  { name: 'slow 0.1%', shift: 0, drift: 1.001, jsHz: 60 },
  { name: 'fast 0.1%', shift: 0, drift: 0.999, jsHz: 60 },
  { name: 'web 120', shift: 0, drift: 1, jsHz: 120 },
  { name: 'web 144', shift: 0, drift: 1, jsHz: 144 },
];
const SPIKES = [0, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 30];

/** Tick start times on the JS thread over a minute. */
function ticks(load: Load, spike: number, seed: number): number[] {
  const r = rng(seed);
  const out: number[] = [];
  const frame = (1000 / load.jsHz) * load.drift;
  const perSecond = Math.round(load.jsHz);
  let prev = 0;
  let spikeAt = Math.floor(r() * perSecond);
  for (let i = 0; prev < 60000; i++) {
    // The timer was set at the start of the last tick; the display link fires it at the next vsync, and the JS
    // thread runs it once it is free.
    const vsync = (Math.floor(prev / frame + 1e-9) + 1) * frame;
    let delay = (load.shift && Math.floor(vsync / 10000) % 2 === 1 ? load.shift : 0) + r() * 2;
    if (i % perSecond === spikeAt) delay += spike;
    if (i % perSecond === perSecond - 1) spikeAt = Math.floor(r() * perSecond);
    const start = Math.max(vsync + delay, prev + WORK);
    out.push(start);
    prev = start;
  }
  return out;
}

interface Played {
  /** Ticks that stepped the world twice, and (on the iPhone) ticks that did not step it. */
  twoSteps: number;
  zeroSteps: number;
  /** Display frames where the picture stood still (moved under a quarter of a frame's worth) or jumped (over 1.75x). */
  stops: number;
  jumps: number;
  /** The same stops and jumps as the playhead counts them for the frame meter. */
  held: number;
  skips: number;
}

function play(load: Load, spike: number, clock: () => (now: number) => number, queued: boolean): Played {
  const starts = ticks(load, spike, 7 + spike);
  const tick = clock();
  const ui = UI_MS * load.drift;
  // Each list, and the display frame that first sees it.
  const lists: { seen: number; list: Float64Array }[] = [];
  let step = 0;
  let zeroSteps = 0;
  let twoSteps = 0;
  for (let i = 0; i < starts.length; i++) {
    const n = tick(starts[i]);
    step += n;
    // The first half second warms the clock up.
    if (starts[i] < 500) continue;
    if (n === 0) zeroSteps++;
    if (n >= 2) twoSteps++;
    const seen = Math.ceil((starts[i] + WORK) / ui - 1e-9) * ui;
    // The first version handed over only the newest list of a tick.
    for (let s = queued ? n - 1 : 0; n > 0 && s >= 0; s--) {
      const list = new Float64Array(HEADER);
      list[0] = step - s;
      lists.push({ seen, list });
    }
  }
  const p = newPlayhead();
  const times: number[] = [];
  let j = 0;
  for (let f = Math.round(lists[0].seen / ui); f * ui <= lists[lists.length - 1].seen + 1e-6; f++) {
    const t = f * ui;
    const due: Float64Array[] = [];
    while (j < lists.length && lists[j].seen <= t + 1e-6) due.push(lists[j++].list);
    // The first version's shared value: a frame saw only the last list written before it.
    if (queued) for (const l of due) receiveList(p, l);
    else if (due.length) receiveList(p, due[due.length - 1]);
    movePlayhead(p, t, true);
    times.push(p.list![0] - 1 + p.a);
  }
  const per = ui / STEP_MS;
  let stops = 0;
  let jumps = 0;
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d < per * 0.25) stops++;
    else if (d > per * 1.75) jumps++;
  }
  // On the web a tick per display frame is normal, so there a 0-step tick is not a slip.
  if (load.jsHz > 60) zeroSteps = 0;
  return { twoSteps, zeroSteps, stops, jumps, held: p.held, skips: p.skips };
}

const VARIANTS = {
  first: [firstClock, false],
  queue: [firstClock, true],
  now: [gridClock, true],
} as const;
type Variant = keyof typeof VARIANTS;

describe('frame timing: late ticks never make the picture jump', () => {
  const results = new Map<string, Played>();
  const get = (load: string, spike: number, v: Variant) => results.get(`${load} ${spike} ${v}`)!;
  const rows: string[] = [];
  for (const load of LOADS) {
    for (const spike of SPIKES) {
      const cells: string[] = [];
      for (const v of Object.keys(VARIANTS) as Variant[]) {
        const [clock, queued] = VARIANTS[v];
        const r = play(load, spike, clock, queued);
        results.set(`${load.name} ${spike} ${v}`, r);
        cells.push(`${v.padEnd(5)} 2-step ${String(r.twoSteps).padStart(3)} 0-step ${String(r.zeroSteps).padStart(3)} stops ${String(r.stops).padStart(3)} jumps ${String(r.jumps).padStart(3)}`);
      }
      rows.push(`${load.name.padEnd(9)} late ${String(spike).padStart(2)} ms | ${cells.join(' | ')}`);
    }
  }

  it('repro: in the first version one tick 4 ms late a second already makes the picture jump', () => {
    for (const load of ['steady', 'shifting']) expect(get(load, 4, 'first').jumps).toBeGreaterThan(0);
  });

  it('now: the picture never jumps, and only stands still when a tick misses its frame outright', () => {
    for (const load of LOADS) {
      for (const spike of SPIKES) {
        const r = get(load.name, spike, 'now');
        expect({ load: load.name, spike, jumps: r.jumps }).toEqual({ load: load.name, spike, jumps: 0 });
        if (spike <= 14) expect({ load: load.name, spike, stops: r.stops }).toEqual({ load: load.name, spike, stops: 0 });
      }
    }
  });

  it('now: no doubled steps for a tick up to 10 ms late on a steady or drifting display, and fewer than the first clock overall', () => {
    // A load that shifts and stays shifted leaves the clock half a step ahead, where a tick 4 ms late doubles a
    // step; the queue keeps that off the screen (above), and over every load the doubled steps still fall.
    let first = 0;
    let now = 0;
    for (const load of LOADS.filter((l) => l.jsHz === 60)) {
      for (const spike of SPIKES) {
        const r = get(load.name, spike, 'now');
        if (spike <= 10 && load.shift === 0) expect({ load: load.name, spike, two: r.twoSteps, zero: r.zeroSteps }).toEqual({ load: load.name, spike, two: 0, zero: 0 });
        if (spike <= 14) {
          first += get(load.name, spike, 'queue').twoSteps;
          now += r.twoSteps;
        }
      }
    }
    if (PRINT) console.log(`doubled steps, ticks up to 14 ms late, every iPhone load: first clock ${first}, now ${now}`);
    expect(now).toBeLessThan(first);
  });

  it('the playhead counts the same stops and jumps the eye would see (what the frame meter shows)', () => {
    for (const [key, r] of results) expect({ key, held: r.held, skips: r.skips }).toEqual({ key, held: r.stops, skips: r.jumps });
  });

  afterAll(() => {
    if (PRINT) console.log(rows.join('\n'));
  });
});
