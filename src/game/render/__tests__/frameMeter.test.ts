// The frame meter's counting (frameMeter.ts): slow screen frames and what they came after, the playhead's
// stills and jumps per second and per run, and the lines Alex screenshots.
import { DID_HAPTIC, DID_HUD, DID_SOUND, addJs, meterFrame, meterLines, newJsMeter, newUiMeter, startJsSecond, type UiMeter, type UiReport } from '../frameMeter';

const FRAME = 1000 / 120;

/** Frames every `gap` ms from `t` until the meter reports; returns the report and the time after it. */
function untilReport(m: UiMeter, t: number, gap = FRAME, held = 0, skips = 0): [UiReport, number] {
  for (;;) {
    const r = meterFrame(m, t, 0, held, skips);
    t += gap;
    if (r) return [r, t];
  }
}

describe('frame meter', () => {
  it('a steady 120 Hz second is 120 frames with nothing slow', () => {
    const [r] = untilReport(newUiMeter(), 1);
    expect(r.fps).toBeGreaterThanOrEqual(119);
    expect(r.second.slow).toBe(0);
    expect(r.second.worst).toBeLessThan(FRAME + 0.01);
  });

  it('the first second counts no frame as slow, since it does not know the display rate yet', () => {
    const [r] = untilReport(newUiMeter(), 1, 1000 / 60);
    expect(r.fps).toBeGreaterThanOrEqual(59);
    expect(r.second.slow).toBe(0);
  });

  it('a frame 25 ms late right after a haptic counts as slow, after a haptic', () => {
    const m = newUiMeter();
    let [, t] = untilReport(m, 1);
    // The haptic comes in with this frame, and the next frame is 25 ms late.
    meterFrame(m, t, DID_HAPTIC, 0, 0);
    t += 25;
    meterFrame(m, t, 0, 0, 0);
    const [r] = untilReport(m, t + FRAME);
    const run = r.run;
    expect({ slow: run.slow, haptic: run.slowHaptic, sound: run.slowSound, hud: run.slowHud, other: run.slowOther }).toEqual({ slow: 1, haptic: 1, sound: 0, hud: 0, other: 0 });
    expect(run.worst).toBeCloseTo(25, 5);
  });

  it('a slow frame with nothing before it counts as other', () => {
    const m = newUiMeter();
    let [, t] = untilReport(m, 1);
    t += 30;
    const [r] = untilReport(m, t);
    expect({ slow: r.run.slow, other: r.run.slowOther }).toEqual({ slow: 1, other: 1 });
  });

  it('the count-in and the pause screen count frames but no slips', () => {
    const m = newUiMeter();
    let [, t] = untilReport(m, 1);
    meterFrame(m, t, DID_HUD, 0, 0, false);
    t += 140;
    meterFrame(m, t, 0, 0, 0, false);
    let r: UiReport | null = null;
    for (t += FRAME; !r; t += FRAME) r = meterFrame(m, t, 0, 0, 0, false);
    expect({ slow: r.run.slow, worst: r.run.worst < FRAME + 0.01, framesCounted: r.second.frames > 0 }).toEqual({ slow: 0, worst: true, framesCounted: true });
  });

  it('stills and jumps are counted per second and for the run', () => {
    const m = newUiMeter();
    const [a, t] = untilReport(m, 1, FRAME, 3, 1);
    expect({ held: a.second.held, skips: a.second.skips, runHeld: a.run.held }).toEqual({ held: 3, skips: 1, runHeld: 3 });
    const [b] = untilReport(m, t, FRAME, 5, 1);
    expect({ held: b.second.held, skips: b.second.skips, runHeld: b.run.held, runSkips: b.run.skips }).toEqual({ held: 2, skips: 0, runHeld: 5, runSkips: 1 });
  });

  it('the lines carry every number read off the phone', () => {
    const m = newUiMeter();
    meterFrame(m, 1, DID_SOUND | DID_HUD, 0, 0);
    const [r] = untilReport(m, 1 + FRAME);
    const js = newJsMeter();
    addJs(js, { ticks: 60, worst: 19, late: 0, two: 1 });
    addJs(js, { sounds: 2, soundMs: 1.25, haptics: 1, tickMs: 0.8, eventsMs: 2.4 });
    js.runTime = 75;
    const lines = meterLines(r, js);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^1s {3}JS 60Hz worst 19ms late 0 2step 1 0step 0 \| UI 12\dHz worst 8\.3ms slow 0 held 0 skip 0$/);
    expect(lines[1]).toBe('run 1:15 UI slow 0 [sound 0 haptic 0 hud 0 other 0] held 0 skip 0 worst 8.3ms');
    expect(lines[2]).toBe('run 1:15 JS late 0 2step 1 0step 0 worst 19ms | tick 0.8ms events 2.4ms | sounds 2 max 1.3ms | haptics 1');
    startJsSecond(js);
    expect({ second: js.second.ticks, run: js.run.ticks }).toEqual({ second: 0, run: 60 });
  });
});
