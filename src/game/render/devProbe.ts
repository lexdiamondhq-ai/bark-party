/**
 * Development only: set to true to print one second of per-frame timing at level start and on the first
 * jump (GameView) and the UI thread's frame rate (GameCanvasImpl). Off by default: the report builds a text
 * table on the JS thread mid-run, and in Expo Go every log line also travels the dev tunnel to Metro.
 */
export const LEGS_PROBE = false;
