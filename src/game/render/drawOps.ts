// The UI thread's half of the frame pipeline: which list to draw at which blend (the playhead), and the
// drawing itself. No Skia import (the canvas, paint and scratch objects come in as arguments), so tests
// run both in Node against made-up arrival times and a counting canvas.

import type { SkCanvas, SkImage, SkPaint } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

import { STEP } from '../constants';
import { HEADER, RECT, STRIDE, STRIP } from './buildFrame';

const STEP_MS = STEP * 1000;

/**
 * Steps of slack the picture keeps behind the newest list. Lists cross from the JS thread a few
 * milliseconds early or late; with this much in hand the picture keeps gliding through that instead of
 * stopping when a list is late and jumping when the next one is early. Half a step is 8 ms.
 */
export const SLACK = 0.5;
/** How hard the playhead leans back toward its slack, per list: at most this share faster or slower. */
const RATE_GAIN = 0.1;
const RATE_MAX = 0.1;

/** Where the picture is in time, in simulation steps, and the three newest lists. */
export interface Playhead {
  /** The step the picture shows (fractional); -1 before the first list. */
  at: number;
  /** Display time of the last frame, ms. */
  last: number;
  /** Speed of the playhead against the clock; eases the slack back after a late or early list. */
  rate: number;
  cur: Float64Array | null;
  /**
   * The lists one and two steps before cur, kept so lists that arrive early, or two at once (a tick that
   * stepped twice), never cut a blend short.
   */
  old: Float64Array | null;
  older: Float64Array | null;
  /** A list came in since the last frame. */
  arrived: boolean;
  /** What to draw this frame. */
  list: Float64Array | null;
  a: number;
  /** The moment drawn last frame (in steps), and how often the picture stood still or jumped (for the frame meter). */
  shown: number;
  held: number;
  skips: number;
}

export function newPlayhead(): Playhead {
  return { at: -1, last: 0, rate: 1, cur: null, old: null, older: null, arrived: false, list: null, a: 0, shown: -1, held: 0, skips: 0 };
}

/** Takes the JS thread's next list. Lists come in step order; one that does not follow on from the last starts the history afresh. */
export function receiveList(p: Playhead, list: Float64Array) {
  'worklet';
  if (list === p.cur) return;
  const n = list[0];
  const follows = p.cur !== null && p.cur[0] === n - 1;
  p.older = follows && p.old !== null && p.old[0] === n - 2 ? p.old : null;
  p.old = follows ? p.cur : null;
  p.cur = list;
  p.arrived = true;
}

/**
 * Moves the playhead to display time `now` (ms) and sets p.list and p.a to what should be drawn. Each list
 * holds two moments, its step and the one before, so with the two lists before it the picture can be
 * anywhere in the last three steps; it never runs past the newest moment (no guessing). With `count`, a
 * frame where the picture stood still or jumped is counted (p.held, p.skips); the canvas turns it off while
 * the run is paused or counting in, when no lists come and standing still is right.
 */
export function movePlayhead(p: Playhead, now: number, count = false) {
  'worklet';
  const list = p.cur;
  if (!list) return;
  const n = list[0];
  let dt = 0;
  if (p.at < 0) {
    // The first list: start at its beginning, like every later list would.
    p.at = n - 1;
  } else {
    dt = Math.min(100, Math.max(0, now - p.last));
    p.at += (dt / STEP_MS) * p.rate;
  }
  p.last = now;
  const lo = n - (p.older ? 3 : p.old ? 2 : 1);
  // Out of new moments (the JS thread is late): hold the newest one.
  if (p.at > n) p.at = n;
  // Too far behind (several steps at once with no list between, or a new run): skip ahead to the oldest moment there is.
  if (p.at < lo) p.at = lo;
  if (p.arrived) {
    p.arrived = false;
    // Lean back toward the slack: a little slower when the lists come early, a little faster when late.
    const off = n - p.at - (1 + SLACK);
    p.rate = 1 + Math.max(-RATE_MAX, Math.min(RATE_MAX, off * RATE_GAIN));
  }
  if (p.at >= n - 1 || !p.old) {
    p.list = list;
    p.a = Math.max(0, p.at - (n - 1));
  } else if (p.at >= n - 2 || !p.older) {
    p.list = p.old;
    p.a = Math.max(0, p.at - (n - 2));
  } else {
    p.list = p.older;
    p.a = p.at - (n - 3);
  }
  const shown = p.list[0] - 1 + p.a;
  if (count && p.shown >= 0 && dt > 0) {
    const want = dt / STEP_MS;
    const moved = shown - p.shown;
    if (moved < want * 0.25) p.held++;
    else if (moved > want * 1.75) p.skips++;
  }
  p.shown = shown;
}

/** One display frame with `list` the newest list: receiveList, then movePlayhead. */
export function advancePlayhead(p: Playhead, now: number, list: Float64Array, count = false) {
  'worklet';
  receiveList(p, list);
  movePlayhead(p, now, count);
}

/**
 * Lists on their way from the game loop to the next display frame, oldest first. A queue, not one shared
 * value the loop overwrites: two lists can land between two display frames (a tick that stepped twice, or a
 * late tick and the next), and the playhead needs both or the picture jumps a step.
 */
export interface Inbox {
  lists: Float64Array[];
  /** What the game loop did since the last frame (frameMeter's DID_* bits). */
  did: number;
  /** The run is on (not paused, over or counting in), and a list has come in since: stills and jumps count. */
  live: boolean;
  armed: boolean;
}

export function newInbox(): Inbox {
  return { lists: [], did: 0, live: false, armed: false };
}

/** Lists kept for a display frame that is late; older ones are dropped (the playhead keeps three steps). */
const INBOX_MAX = 6;

/** Runs on the UI thread: the game loop schedules it once per list (scheduleOnUI keeps them in order). */
export function deliverList(inbox: SharedValue<Inbox>, list: Float64Array) {
  'worklet';
  const box = inbox.value;
  box.lists.push(list);
  if (box.lists.length > INBOX_MAX) box.lists.shift();
}

/** Runs on the UI thread: what the tick that sent the last lists did (sounds, haptics, HUD). */
export function noteDid(inbox: SharedValue<Inbox>, did: number) {
  'worklet';
  inbox.value.did |= did;
}

/** Runs on the UI thread when the run starts, pauses, resumes or ends. */
export function setLive(inbox: SharedValue<Inbox>, live: boolean) {
  'worklet';
  const box = inbox.value;
  box.live = live;
  if (!live) box.armed = false;
}

/** Takes everything in the inbox into the playhead, in order, and returns what the game loop did meanwhile. */
export function takeInbox(box: Inbox, p: Playhead): number {
  'worklet';
  const n = box.lists.length;
  for (let i = 0; i < n; i++) receiveList(p, box.lists[i]);
  if (n) {
    box.lists.length = 0;
    if (box.live) box.armed = true;
  }
  const did = box.did;
  box.did = 0;
  return did;
}

/** One paint and a few plain objects, made once on the UI thread and reused by every op of every frame. */
export interface DrawScratch {
  paint: SkPaint;
  src: { x: number; y: number; width: number; height: number };
  dst: { x: number; y: number; width: number; height: number };
  color: Float32Array;
  /** The rect color, alpha and anti-aliasing last put on the paint, so an unchanged one is not set again. */
  rgb: number;
  alpha: number;
  aa: boolean;
  /** FilterMode.Linear and MipmapMode.None, passed in so this file needs no Skia import. */
  filter: number;
  mipmap: number;
  /** buildFrame's stripTable and STRIP_AT: where each strip frame sits in the atlas. */
  strips: Float64Array;
  stripAt: readonly number[];
}

/** Draws one list at blend `a` (0 = one step ago, 1 = now). Runs on the UI thread. */
export function drawOps(canvas: SkCanvas, d: Float64Array, a: number, images: (SkImage | null)[], s: DrawScratch) {
  'worklet';
  const b = 1 - a;
  const paint = s.paint;
  const dst = s.dst;
  for (let i = HEADER; i + STRIDE <= d.length; i += STRIDE) {
    const img = d[i];
    const alpha = d[i + 17] * b + d[i + 10] * a;
    if (alpha <= 0.01) continue;
    const cx = d[i + 12] * b + d[i + 5] * a;
    const cy = d[i + 13] * b + d[i + 6] * a;
    const dw = d[i + 14] * b + d[i + 7] * a;
    const dh = d[i + 15] * b + d[i + 8] * a;
    const rot = d[i + 16] * b + d[i + 9] * a;
    let im: SkImage | null = null;
    // A strip: the index is blended to this very moment, then the two frames around it are stacked.
    let im2: SkImage | null = null;
    let alpha2 = 0;
    let o1 = 0;
    let o2 = 0;
    if (img === STRIP) {
      const frames = d[i + 4];
      let idx = d[i + 3] * b + d[i + 2] * a;
      idx = ((idx % frames) + frames) % frames;
      const f = Math.floor(idx);
      const at = s.stripAt[d[i + 1]];
      o1 = (at + f) * 5;
      o2 = (at + ((f + 1) % frames)) * 5;
      const t = s.strips;
      im = t[o1] >= 0 ? images[t[o1]] : null;
      im2 = t[o2] >= 0 ? images[t[o2]] : null;
      alpha2 = alpha * (idx - f);
      if (!im && (!im2 || alpha2 <= 0.01)) continue;
    } else if (img === RECT) {
      const c = d[i + 11];
      if (c !== s.rgb) {
        s.color[0] = ((c >> 16) & 255) / 255;
        s.color[1] = ((c >> 8) & 255) / 255;
        s.color[2] = (c & 255) / 255;
        s.color[3] = 1;
        paint.setColor(s.color);
        s.rgb = c;
        s.alpha = 1;
      }
    } else {
      im = images[img];
      if (!im) continue;
    }
    // Only the alpha of the paint reaches a sprite, so sprites and rects share it.
    if (alpha !== s.alpha && (im || img === RECT)) {
      paint.setAlphaf(alpha);
      s.alpha = alpha;
    }
    // Only turned pieces get soft edges. Upright ones (the room, the floor, furniture) keep their edges on whole
    // pixels, so where two copies of the room meet there is no faint seam flickering as the camera glides
    // (soft edges let the dark backdrop show through by a different amount every frame). Their picture is
    // still filtered, so they move as smoothly as before.
    const aa = rot !== 0;
    if (aa !== s.aa) {
      paint.setAntiAlias(aa);
      s.aa = aa;
    }
    const w = Math.abs(dw);
    // Upright and unmirrored (the floor, furniture, most props): straight into place, no transform.
    const plain = rot === 0 && dw >= 0;
    if (plain) {
      dst.x = cx - w / 2;
      dst.y = cy - dh / 2;
    } else {
      canvas.save();
      canvas.translate(cx, cy);
      if (rot !== 0) canvas.rotate((rot * 180) / Math.PI, 0, 0);
      if (dw < 0) canvas.scale(-1, 1);
      dst.x = -w / 2;
      dst.y = -dh / 2;
    }
    dst.width = w;
    dst.height = dh;
    const src = s.src;
    if (img === STRIP) {
      const t = s.strips;
      if (im) {
        src.x = t[o1 + 1];
        src.y = t[o1 + 2];
        src.width = t[o1 + 3];
        src.height = t[o1 + 4];
        canvas.drawImageRectOptions(im, src, dst, s.filter, s.mipmap, paint);
      }
      if (im2 && alpha2 > 0.01) {
        paint.setAlphaf(alpha2);
        s.alpha = alpha2;
        src.x = t[o2 + 1];
        src.y = t[o2 + 2];
        src.width = t[o2 + 3];
        src.height = t[o2 + 4];
        canvas.drawImageRectOptions(im2, src, dst, s.filter, s.mipmap, paint);
      }
    } else if (im) {
      src.x = d[i + 1];
      src.y = d[i + 2];
      src.width = d[i + 3];
      src.height = d[i + 4];
      canvas.drawImageRectOptions(im, src, dst, s.filter, s.mipmap, paint);
    } else {
      canvas.drawRect(dst, paint);
    }
    if (!plain) canvas.restore();
  }
}
