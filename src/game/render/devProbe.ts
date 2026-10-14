/**
 * Development only: set to true to print one second of per-frame timing at level start and on the first
 * jump (GameView) and the UI thread's frame rate (GameCanvasImpl). Off by default: the report builds a text
 * table on the JS thread mid-run, and in Expo Go every log line also travels the dev tunnel to Metro.
 */
export const LEGS_PROBE = false;

/**
 * Shows a one-line frame readout at the bottom of the play screen (JS and UI thread rates, the worst frame
 * gap each second, frames over 25 ms, and how many JS ticks ran zero or two sim steps). It costs one small
 * text update per second. Turn it off before a release.
 */
export const FRAME_STATS = true;

export interface UiStats {
  fps: number;
  max: number;
  over: number;
}
