// The UI thread's half of the frame pipeline, in Node.
//
// 1. Playhead: a 120 Hz display draws lists that the JS thread makes at 60 Hz and that arrive a few ms
//    early or late. The picture's time must advance by the same amount every display frame (smooth), and
//    must not stop and then jump. Compared with the first version, which started each list's blend when it
//    arrived. Arrival times here are a model (no phone to measure); the rules under test are the real code.
// 2. drawOps: the real draw loop against a counting canvas over every list of Chapter 1, next to what the
//    first version did per frame (a new recorder, paint and rect objects every frame).
// FRAMES=1 npm test -- uiThread prints the numbers.
import type { SkCanvas, SkImage, SkPaint } from '@shopify/react-native-skia';

import { CHAPTER_1 } from '../../level/chapter1';
import { STEP, VIEW_H } from '../../constants';
import { ROOM_SIZE } from '../../art';
import { createWorld, drainEvents, stepWorld } from '../../sim/world';
import { autopilot } from '../../sim/__tests__/autopilot';
import { buildFrame, HEADER, OpList, RECT, STRIDE, STRIP, STRIP_AT, stripTable, type AtlasData, type FrameSetup } from '../buildFrame';
import { drawOps, movePlayhead, newPlayhead, receiveList, SLACK, type DrawScratch } from '../drawOps';
import atlas from '../atlas.json';

const PRINT = !!process.env.FRAMES;
const STEP_MS = STEP * 1000;
const UI_120 = 1000 / 120;

/** A tiny seeded random, so every run of the model is the same. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Arrival {
  /** UI time the list is first visible to a display frame, ms. */
  at: number;
  step: number;
}

/**
 * JS ticks on a 60 Hz vsync. A tick that takes `work` ms hands its list over that long after the vsync; the
 * UI thread sees it at the first display frame after that. A tick can be late by whole frames (`stalls`):
 * the world then takes up to two steps at once and drops the rest (GameView's MAX_STEPS), and hands over a
 * list for each step.
 */
function arrivals(frames: number, work: () => number, stalls: Record<number, number> = {}, ui = UI_120): Arrival[] {
  const out: Arrival[] = [];
  let step = 0;
  let t = 0;
  for (let f = 0; f < frames; f++) {
    const missed = stalls[f] ?? 0;
    t += STEP_MS * (1 + missed);
    const ready = t + work();
    for (let s = Math.min(2, 1 + missed); s > 0; s--) out.push({ at: Math.ceil(ready / ui - 1e-9) * ui, step: ++step });
  }
  return out;
}

/** The picture's time (in steps) on every display frame, for the new playhead and the first version. */
function play(lists: Arrival[], ui = UI_120) {
  const end = lists[lists.length - 1].at;
  const made = new Map<number, Float64Array>();
  const listFor = (step: number) => {
    let l = made.get(step);
    if (!l) {
      l = new Float64Array(HEADER);
      l[0] = step;
      made.set(step, l);
    }
    return l;
  };
  const p = newPlayhead();
  let seenAt = 0;
  let seen = -1;
  const now: number[] = [];
  const old: number[] = [];
  /** How far the picture is behind the newest moment the UI thread has. */
  const behind: number[] = [];
  let j = -1;
  for (let t = lists[0].at; t <= end; t += ui) {
    // Every list that came in since the last frame, in order (GameCanvas's inbox).
    while (j + 1 < lists.length && lists[j + 1].at <= t + 1e-6) receiveList(p, listFor(lists[++j].step));
    const step = lists[j].step;
    movePlayhead(p, t);
    now.push(p.list![0] - 1 + p.a);
    behind.push(step - now[now.length - 1]);
    // First version: a list blends from its own arrival, over one step, then holds.
    if (step !== seen) {
      seen = step;
      seenAt = t;
    }
    old.push(step - 1 + Math.min(1, (t - seenAt) / STEP_MS));
  }
  return { now, old, behind };
}

/** Frames where the picture stopped (moved under a quarter of its frame's worth) or jumped (over 1.75x). */
function judder(times: number[], ui = UI_120, skip = 30) {
  const per = ui / STEP_MS;
  let stops = 0;
  let jumps = 0;
  let worst = 0;
  for (let i = skip + 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d < per * 0.25) stops++;
    if (d > per * 1.75) jumps++;
    worst = Math.max(worst, Math.abs(d - per));
  }
  return { stops, jumps, worst: +worst.toFixed(2) };
}

describe('playhead: the picture glides through late and early lists', () => {
  const frames = 600;
  const UI_60 = 1000 / 60;
  const every2s = (missed: number) => Object.fromEntries(Array.from({ length: 5 }, (_, i) => [100 + i * 120, missed]));
  const cases: [string, Arrival[], number][] = [
    ['steady 3 ms tick', arrivals(frames, () => 3), UI_120],
    ['tick 2-7 ms (random)', arrivals(frames, ((r) => () => 2 + r() * 5)(rng(1))), UI_120],
    ['tick 1-12 ms (random)', arrivals(frames, ((r) => () => 1 + r() * 11)(rng(2))), UI_120],
    ['tick 1-14 ms, 60 Hz display', arrivals(frames, ((r) => () => 1 + r() * 13)(rng(3)), {}, UI_60), UI_60],
    ['one missed JS frame every 2 s', arrivals(frames, () => 3, every2s(1)), UI_120],
    ['a 50 ms stall every 2 s', arrivals(frames, () => 3, every2s(3)), UI_120],
  ];
  const table: string[] = [];
  it.each(cases)('%s', (name, lists, ui) => {
    const { now, old, behind } = play(lists, ui);
    const a = judder(now, ui);
    const b = judder(old, ui);
    table.push(`${name.padEnd(30)} playhead stops ${String(a.stops).padStart(3)} jumps ${String(a.jumps).padStart(3)} worst ${a.worst.toFixed(2)} | first version stops ${String(b.stops).padStart(3)} jumps ${String(b.jumps).padStart(3)} worst ${b.worst.toFixed(2)} | behind max ${Math.max(...behind.slice(30)).toFixed(2)} steps`);
    if (/stall|missed/.test(name)) {
      // A stall on the JS thread is real lost time: the picture may stop or skip once per stall, never more
      // than one step at a time, and never more often than the first version did.
      expect(a.stops + a.jumps).toBeLessThanOrEqual(b.stops + b.jumps);
      expect(a.worst).toBeLessThanOrEqual(1);
    } else {
      expect({ stops: a.stops, jumps: a.jumps }).toEqual({ stops: 0, jumps: 0 });
    }
    // The price of the glide is a little delay: never more than the slack and two steps behind the newest list.
    expect(Math.max(...behind.slice(30))).toBeLessThanOrEqual(2 + SLACK);
  });
  afterAll(() => {
    if (PRINT) console.log(table.join('\n'));
  });
});

/** Counts what a frame costs the UI thread: calls into Skia, and Skia objects it makes. */
function counter() {
  const n = { calls: 0, objects: 0 };
  const call = () => {
    n.calls++;
  };
  const canvas = { save: call, restore: call, translate: call, rotate: call, scale: call, drawRect: call, drawImageRectOptions: call } as unknown as SkCanvas;
  const paint = { setColor: call, setAlphaf: call, setAntiAlias: call } as unknown as SkPaint;
  return { n, canvas, paint };
}

/** The first version of the draw loop, op for op, as a count (it made its Skia objects inline). */
function firstVersionCost(d: Float64Array, a: number) {
  const b = 1 - a;
  // Per frame: Skia.Paint(), setAntiAlias, and createPicture's PictureRecorder, bounds rect, canvas, picture.
  let calls = 4;
  let objects = 5;
  const layer = (alpha: number, rot: number, dw: number, rect: boolean) => {
    if (alpha <= 0.01) return;
    calls += 3 + (rot !== 0 ? 1 : 0); // save, translate, restore, rotate
    calls += 3; // setColor (with a new Float32Array), setAlphaf, the draw
    if (rect) objects += 1;
    else {
      objects += 2;
      if (dw < 0) calls++;
    }
  };
  for (let i = HEADER; i + STRIDE <= d.length; i += STRIDE) {
    const alpha = d[i + 17] * b + d[i + 10] * a;
    const rot = d[i + 16] * b + d[i + 9] * a;
    const dw = d[i + 14] * b + d[i + 7] * a;
    if (d[i] === STRIP) {
      // The first version drew a strip as two separate sprite layers: the frame, and the next at the fraction.
      const idx = d[i + 2];
      layer(alpha, rot, dw, false);
      layer(alpha * (idx - Math.floor(idx)), rot, dw, false);
    } else layer(alpha, rot, dw, d[i] === RECT);
  }
  return { calls, objects };
}

describe('drawOps: what each display frame costs the UI thread', () => {
  it('Chapter 1, every list, drawn half way', () => {
    const k = 393 / VIEW_H;
    const setup: FrameSetup = {
      atlas: atlas as unknown as AtlasData,
      background: { image: (atlas as unknown as AtlasData).pages.length, w: ROOM_SIZE.w, h: ROOM_SIZE.h },
      k,
      screenW: 852,
      screenH: 393,
    };
    const w = createWorld(CHAPTER_1, 852 / k, 11);
    const out = new OpList();
    const { n, canvas, paint } = counter();
    const scratch: DrawScratch = {
      paint,
      src: { x: 0, y: 0, width: 0, height: 0 },
      dst: { x: 0, y: 0, width: 0, height: 0 },
      color: new Float32Array(4),
      rgb: -1,
      alpha: 1,
      aa: true,
      filter: 1,
      mipmap: 0,
      strips: stripTable(atlas as unknown as AtlasData),
      stripAt: STRIP_AT,
    };
    const images = Array.from({ length: setup.background!.image + 1 }, () => ({}) as SkImage);
    const now = { calls: [] as number[] };
    const first = { calls: [] as number[], objects: [] as number[] };
    let step = 0;
    for (let i = 0; i < 60 * 150 && w.phase !== 'won' && w.phase !== 'dead'; i++) {
      stepWorld(w, autopilot(w), STEP);
      drainEvents(w);
      buildFrame(w, setup, out);
      const list = out.handOff(++step, w.prev.t === w.t);
      n.calls = 0;
      n.objects = 0;
      drawOps(canvas, list, 0.5, images, scratch);
      // Plus beginRecording and finishRecordingAsPicture (a canvas and a picture object) and one dispose.
      now.calls.push(n.calls + 3);
      const f = firstVersionCost(list, 0.5);
      first.calls.push(f.calls);
      first.objects.push(f.objects);
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    if (PRINT) {
      console.log(
        [
          `Chapter 1, ${now.calls.length} lists, Skia calls per display frame:`,
          `  now           mean ${mean(now.calls).toFixed(0)}, max ${Math.max(...now.calls)}; Skia objects made: 2 (a canvas and a picture), old pictures freed`,
          `  first version mean ${mean(first.calls).toFixed(0)}, max ${Math.max(...first.calls)}; Skia objects made: mean ${mean(first.objects).toFixed(0)}, max ${Math.max(...first.objects)} (one a picture recorder the GC is told weighs 1 MB), none freed`,
        ].join('\n'),
      );
    }
    expect(mean(now.calls)).toBeLessThan(mean(first.calls) * 0.75);
    expect(Math.max(...now.calls)).toBeLessThan(700);
  });
});
