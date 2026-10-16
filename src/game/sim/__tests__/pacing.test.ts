// Pacing probe: plays each chapter with the autopilot at the iPhone's view width and times, for
// every hazard, how long the player gets to see it before it needs an answer. Run with
// PACING=1 npm test -- pacing to print the table; the budget assertions run always.
import { CHAPTER_1 } from '../../level/chapter1';
import { CHAPTER_2 } from '../../level/chapter2';
import { CHAPTER_3 } from '../../level/chapter3';
import type { LevelDef } from '../../level/types';
import { createWorld, drainEvents, stepWorld } from '../world';
import type { World } from '../types';
import { autopilot } from './autopilot';

/** iPhone 16 Pro landscape: 852 x 393 points at VIEW_H 360. */
const VIEW_W = 780;
const DT = 1 / 60;
const PRINT = !!process.env.PACING;

interface Sight {
  kind: string;
  /** Level x of the thing, for finding it in the level file. */
  at: number;
  /** Seconds the thing was on screen before it reached the dog (needed an answer). */
  seen: number | null;
  /** Units it had already moved before it came on screen. */
  preRun: number;
  /** Seconds from the thing coming on screen to the moment it was reached, clock time. */
  tSeen: number | null;
  tReach: number | null;
  /** Throwers: when the first acorn left, so the wind-up can be read against tSeen. */
  tThrow: number | null;
  /** The pup's speed and the gap when the thing came on screen, and how far the pup ran before reaching it. */
  vxSeen: number;
  dxSeen: number;
  ran: number;
  /** Reached during the boss fight, which keeps its own rhythm (the boss is always on screen). */
  boss: boolean;
  /** Answered from afar (a tennis ball, a stomp from a bounce) before it ever got close: not a readability case. */
  early: boolean;
}

interface Report {
  sights: Sight[];
  callouts: { t: number; text: string; busy: string[] }[];
  hurts: { t: number; x: number; near: string }[];
  phase: string;
}

function probe(level: LevelDef): Report {
  const w: World = createWorld(level, VIEW_W, 7);
  const enemies = new Map<number, Sight & { startX: number }>();
  const acorns = new Map<number, Sight>();
  const callouts: Report['callouts'] = [];
  const hurts: Report['hurts'] = [];
  const nearest = () => {
    let best = 'nothing';
    let bd = 1e9;
    for (const e of w.enemies) {
      const d = Math.abs(e.x - w.hero.x);
      if (e.state === 'active' && d < bd) {
        bd = d;
        best = `${e.type}@${Math.round(e.x)}`;
      }
    }
    for (const a of w.acorns) {
      const d = Math.abs(a.x - w.hero.x);
      if (a.alive && d < bd) {
        bd = d;
        best = `acorn@${Math.round(a.x)}`;
      }
    }
    return best;
  };
  for (let i = 0; i < 60 * 120 && w.phase !== 'won' && w.phase !== 'dead'; i++) {
    stepWorld(w, autopilot(w), DT);
    const t = w.t;
    const h = w.hero;
    const right = w.camX + VIEW_W;
    for (const e of w.enemies) {
      let s = enemies.get(e.id);
      if (!s) {
        s = { kind: e.type, at: Math.round(e.x), startX: e.x, seen: null, preRun: 0, tSeen: null, tReach: null, tThrow: null, vxSeen: 0, dxSeen: 0, ran: 0, boss: false, early: false };
        enemies.set(e.id, s);
      }
      if (s.tSeen === null && e.state === 'active' && e.x - e.w / 2 < right) {
        s.tSeen = t;
        s.preRun = Math.round(Math.abs(s.startX - e.x));
        s.vxSeen = Math.round(h.vx);
        s.dxSeen = Math.round(e.x - h.x);
        s.ran = h.x;
      }
      if (s.tThrow === null && e.type === 'thrower' && e.throwing > 0) s.tThrow = t;
      // Reached: inside bark range, or already answered (stomped, barked, fled) before that.
      if (s.tReach === null && s.tSeen !== null && (e.x - h.x <= 160 || e.state !== 'active')) {
        s.tReach = t;
        s.seen = +(t - s.tSeen).toFixed(2);
        s.ran = h.x - s.ran;
        s.early = e.x - h.x > 200;
      }
    }
    for (const a of w.acorns) {
      if (!a.alive) continue;
      const id = a.id ?? -1;
      let s = acorns.get(id);
      if (!s) {
        s = { kind: a.golden ? 'gold acorn' : 'acorn', at: Math.round(a.x), seen: null, preRun: 0, tSeen: null, tReach: null, tThrow: null, vxSeen: 0, dxSeen: 0, ran: 0, boss: w.phase === 'boss', early: false };
        acorns.set(id, s);
      }
      if (s.tSeen === null && a.x < right) {
        s.tSeen = t;
        s.vxSeen = Math.round(h.vx);
        s.dxSeen = Math.round(a.x - h.x);
        s.ran = h.x;
      }
      if (s.tReach === null && (a.x - h.x <= 160 || a.reflected || !a.alive)) {
        s.tReach = t;
        s.seen = s.tSeen === null ? 0 : +(t - s.tSeen).toFixed(2);
        s.ran = h.x - s.ran;
        s.early = a.x - h.x > 200;
      }
    }
    for (const ev of drainEvents(w)) {
      if (ev.type === 'callout') callouts.push({ t, text: ev.text, busy: [] });
      if (ev.type === 'hurt') hurts.push({ t: +t.toFixed(2), x: Math.round(h.x), near: nearest() });
    }
  }
  const sights = [...enemies.values(), ...acorns.values()].filter((s) => s.tSeen !== null);
  // What needed an answer within 1.2 s after each callout fired.
  for (const c of callouts) {
    c.busy = sights.filter((s) => s.tReach !== null && s.tReach >= c.t && s.tReach < c.t + 1.2).map((s) => `${s.kind}@${s.at}`);
  }
  return { sights, callouts, hurts, phase: w.phase };
}

function print(id: string, r: Report) {
  if (!PRINT) return;
  const rows = r.sights
    .filter((s) => s.tReach !== null)
    .sort((a, b) => a.tReach! - b.tReach!)
    .map((s) => `${s.tReach!.toFixed(1).padStart(6)}s  ${s.kind.padEnd(11)} x=${String(s.at).padStart(5)}  seen ${String(s.seen).padStart(5)}s  from ${s.dxSeen} ahead at vx ${s.vxSeen}${s.preRun ? `  pre-run ${s.preRun}` : ''}${s.tThrow !== null ? `  threw after ${(s.tThrow - s.tSeen!).toFixed(2)}s` : ''}${s.boss ? '  (boss)' : ''}${s.early ? '  (answered early)' : ''}`);
  const calls = r.callouts.map((c) => `${c.t.toFixed(1).padStart(6)}s  "${c.text}"${c.busy.length ? `  <- busy: ${c.busy.join(', ')}` : ''}`);
  const hurts = r.hurts.map((h) => `${h.t.toFixed(1).padStart(6)}s  hurt at x=${h.x} by ${h.near}`);
  console.log([`${id}: ${r.phase}`, ...rows, '', ...calls, '', ...hurts].join('\n'));
}

/** Seconds a thing must be on screen before it needs an answer (reaching bark range). */
const BUDGET: Record<string, number> = { runner: 1.0, thrower: 1.3, cat: 1.3, blocks: 1.4, vacuum: 1.0, acorn: 0.6, 'gold acorn': 0.6 };
/** Seconds a thrower leans back before the acorn leaves, as the player sees it. */
const MIN_WINDUP = 0.45;
/** Two answers closer than this stack; throwers themselves stand still, so only their acorns count. */
const MIN_BEAT = 0.6;

describe('pacing: every hazard is on screen long enough to answer', () => {
  it.each([CHAPTER_1, CHAPTER_2, CHAPTER_3])('$id', (level) => {
    const r = probe(level);
    print(level.id, r);
    expect(r.phase).toBe('won');
    const live = r.sights.filter((s) => s.tReach !== null && !s.boss && !s.early);
    // Budgets are in seconds at the level's run speed: Turbo and zoomies are the player's own choice,
    // so a faster pup is held to the same distance, not the same time (with a hard floor for acorns),
    // and a pup held up at a solid piece still had the real seconds.
    const seenAtPace = (s: Sight) => Math.max(s.seen!, s.ran / level.runSpeed);
    const short = live.filter((s) => seenAtPace(s) < BUDGET[s.kind] || s.seen! < 0.35).map((s) => `${s.kind}@${s.at} seen ${s.seen}s (${seenAtPace(s).toFixed(2)}s at pace)`);
    expect(short).toEqual([]);
    const quick = live.filter((s) => s.tThrow !== null && s.tThrow - s.tSeen! < MIN_WINDUP).map((s) => `thrower@${s.at}`);
    expect(quick).toEqual([]);
    const answers = live.filter((s) => s.kind !== 'thrower').sort((a, b) => a.tReach! - b.tReach!);
    const stacked = answers.filter((s, i) => i > 0 && s.tReach! - answers[i - 1].tReach! < MIN_BEAT).map((s) => `${s.kind}@${s.at}`);
    expect(stacked).toEqual([]);
    const busy = r.callouts.filter((c) => c.busy.some((b) => !b.startsWith('gold acorn'))).map((c) => `"${c.text}" with ${c.busy.join(', ')}`);
    expect(busy).toEqual([]);
  });
});
