// The frame meter at the bottom of the play screen (FRAME_STATS): what each thread did in the last second
// and over the whole run. The UI thread counts its own frames and sends them once a second (reportUi, run on
// the JS thread through scheduleOnRN); the game loop keeps its numbers in a JsMeter. Neither thread ever
// waits for the other, and nothing but the meter's own text re-renders.
//
// A slow screen frame is counted with what happened just before it: a sound started, a haptic fired, or the
// HUD changed (a React render). That is the evidence for which of them costs the phone a frame.

/** What a game-loop tick did, sent to the UI thread with its lists (GameCanvas notes it for the next frames). */
export const DID_SOUND = 1;
export const DID_HAPTIC = 2;
export const DID_HUD = 4;

export interface UiCounts {
  frames: number;
  /** The longest gap between two frames, ms. */
  worst: number;
  /** Frames that came over one and a half display frames late, and what happened just before them. */
  slow: number;
  slowSound: number;
  slowHaptic: number;
  slowHud: number;
  slowOther: number;
  /** Frames where the picture stood still or jumped while the run was on (drawOps' playhead). */
  held: number;
  skips: number;
}

export interface UiMeter {
  /** Time of the last frame, and the start of this second, ms. */
  last: number;
  start: number;
  /** One display frame, ms (the shortest gap of the last second); 0 until known. */
  frame: number;
  shortest: number;
  /** What the last three frames took in from the game loop (DID_* bits). */
  did0: number;
  did1: number;
  did2: number;
  /** The playhead's totals when this second began. */
  heldAt: number;
  skipsAt: number;
  second: UiCounts;
  run: UiCounts;
}

export interface UiReport {
  fps: number;
  second: UiCounts;
  run: UiCounts;
}

/** A worklet like everything meterFrame calls: a plain function called on the UI thread throws there and closes the app. */
function zeroCounts(): UiCounts {
  'worklet';
  return { frames: 0, worst: 0, slow: 0, slowSound: 0, slowHaptic: 0, slowHud: 0, slowOther: 0, held: 0, skips: 0 };
}

export function newUiMeter(): UiMeter {
  return { last: 0, start: 0, frame: 0, shortest: 1000, did0: 0, did1: 0, did2: 0, heldAt: 0, skipsAt: 0, second: zeroCounts(), run: zeroCounts() };
}

function addFrame(c: UiCounts, gap: number, slow: boolean, did: number, live: boolean) {
  'worklet';
  c.frames++;
  // The count-in and the pause screen have their own hitches (the art's first draw); only the run counts.
  if (!live) return;
  if (gap > c.worst) c.worst = gap;
  if (!slow) return;
  c.slow++;
  if (did & DID_SOUND) c.slowSound++;
  if (did & DID_HAPTIC) c.slowHaptic++;
  if (did & DID_HUD) c.slowHud++;
  if (!did) c.slowOther++;
}

/**
 * One display frame at `now` (ms): `did` is what came in from the game loop since the last frame, `held` and
 * `skips` what the playhead counted so far (running totals), `live` whether the run is on. Returns a report
 * once a second, else null.
 */
export function meterFrame(m: UiMeter, now: number, did: number, held: number, skips: number, live = true): UiReport | null {
  'worklet';
  m.did2 = m.did1;
  m.did1 = m.did0;
  m.did0 = did;
  if (m.last) {
    const gap = now - m.last;
    if (gap < m.shortest) m.shortest = gap;
    const slow = m.frame > 0 && gap > m.frame * 1.5;
    const recent = m.did0 | m.did1 | m.did2;
    addFrame(m.second, gap, slow, recent, live);
    addFrame(m.run, gap, slow, recent, live);
  }
  m.last = now;
  m.second.held = held - m.heldAt;
  m.second.skips = skips - m.skipsAt;
  m.run.held = held;
  m.run.skips = skips;
  if (!m.start) m.start = now;
  if (now - m.start < 1000) return null;
  m.heldAt = held;
  m.skipsAt = skips;
  const report: UiReport = { fps: Math.round((m.second.frames * 1000) / (now - m.start)), second: { ...m.second }, run: { ...m.run } };
  m.frame = m.shortest < 1000 ? m.shortest : 0;
  m.shortest = 1000;
  m.start = now;
  m.second = zeroCounts();
  return report;
}

/** The game loop's half: kept on the JS thread, read when the UI thread's report comes in. */
export interface JsCounts {
  ticks: number;
  /** The longest gap between two ticks, ms; ticks over 25 ms apart (a 60 Hz frame missed). */
  worst: number;
  late: number;
  /** Running ticks that stepped the world twice, or not at all. */
  two: number;
  zero: number;
  /** The longest tick (step, build and hand-off) and the longest event handling after it, ms. */
  tickMs: number;
  eventsMs: number;
  sounds: number;
  soundMs: number;
  haptics: number;
}

export interface JsMeter {
  second: JsCounts;
  run: JsCounts;
  /** Seconds of run (the world's clock). */
  runTime: number;
}

const zeroJs = (): JsCounts => ({ ticks: 0, worst: 0, late: 0, two: 0, zero: 0, tickMs: 0, eventsMs: 0, sounds: 0, soundMs: 0, haptics: 0 });

export function newJsMeter(): JsMeter {
  return { second: zeroJs(), run: zeroJs(), runTime: 0 };
}

/** A new second for the per-second counts (the run keeps adding up). */
export function startJsSecond(m: JsMeter) {
  m.second = zeroJs();
}

/** Adds to this second and to the run: counts add up, maxima keep the larger. */
export function addJs(m: JsMeter, add: Partial<JsCounts>) {
  for (const c of [m.second, m.run]) {
    for (const k of Object.keys(add) as (keyof JsCounts)[]) {
      const v = add[k]!;
      if (k === 'worst' || k === 'tickMs' || k === 'eventsMs' || k === 'soundMs') c[k] = Math.max(c[k], v);
      else c[k] += v;
    }
  }
}

const ms = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

/** The meter's lines: the last second, then the run on the UI thread, then the run on the JS thread. */
export function meterLines(ui: UiReport, js: JsMeter): string[] {
  const s = ui.second;
  const r = ui.run;
  const j = js.second;
  const jr = js.run;
  const t = Math.floor(js.runTime);
  const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  return [
    `1s   JS ${j.ticks}Hz worst ${ms(j.worst)}ms late ${j.late} 2step ${j.two} 0step ${j.zero} | UI ${ui.fps}Hz worst ${ms(s.worst)}ms slow ${s.slow} held ${s.held} skip ${s.skips}`,
    `run ${clock} UI slow ${r.slow} [sound ${r.slowSound} haptic ${r.slowHaptic} hud ${r.slowHud} other ${r.slowOther}] held ${r.held} skip ${r.skips} worst ${ms(r.worst)}ms`,
    `run ${clock} JS late ${jr.late} 2step ${jr.two} 0step ${jr.zero} worst ${ms(jr.worst)}ms | tick ${ms(jr.tickMs)}ms events ${ms(jr.eventsMs)}ms | sounds ${jr.sounds} max ${ms(jr.soundMs)}ms | haptics ${jr.haptics}`,
  ];
}

let listener: ((report: UiReport) => void) | null = null;

/** The meter on screen listens here for the UI thread's reports. */
export function onUiReport(fn: (report: UiReport) => void) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Runs on the JS thread (the canvas schedules it from the UI thread once a second). */
export function reportUi(report: UiReport) {
  listener?.(report);
}
