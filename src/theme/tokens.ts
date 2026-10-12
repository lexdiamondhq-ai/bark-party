// Design tokens from the Bark Party style guide (https://claude.ai/artifact/MiWbuu8tPfKX7aSH2cYQvD).
// Do not change these values without asking Alex: they are the guide's design rules.

export const colors = {
  biscuitGold: '#FFB020', // the one "press me" button per glass panel, and rewards
  blueRaspberry: '#48A6FF',
  bubblegum: '#FF5A8A',
  poolTeal: '#19C3B1',
  grapeSoda: '#7B5CFF',
  grapeSodaChip: '#9C86FF', // player 4 chips, so Cocoa text stays readable
  kiwi: '#8EDB3F',
  tomato: '#FF5A36',
  marshmallow: '#FFF4E2', // text on night, sticker paper, the paw button
  cocoa: '#1A0F0B', // every ink line and all text on candy colors; never black
  velvetNight: '#140A1F', // the stage behind menus and night worlds
} as const;

export type ColorName = keyof typeof colors;

/** Reanimated withSpring configs. Mass 1 everywhere. */
export const springs = {
  squish: { mass: 1, stiffness: 520, damping: 18 }, // every press
  bouncy: { mass: 1, stiffness: 300, damping: 12 }, // stickers, stamps, counters
  gentle: { mass: 1, stiffness: 170, damping: 22 }, // panels, sheets, the back slide
  wobble: { mass: 1, stiffness: 160, damping: 7 }, // ears, hats, the sneeze wind
  snap: { mass: 1, stiffness: 700, damping: 34 }, // selection, toggles
} as const;

/** The pup rig's own springs. */
export const pupSprings = {
  head: { mass: 1, stiffness: 90, damping: 12 },
  tilt: { mass: 1, stiffness: 70, damping: 10 },
  ears: { mass: 1, stiffness: 160, damping: 7 },
  squash: { mass: 1, stiffness: 420, damping: 16 },
  boop: { mass: 1, stiffness: 520, damping: 18 },
  mouth: { mass: 1, stiffness: 260, damping: 22 },
} as const;

export const fonts = {
  display: 'BagelFatOne_400Regular', // commands, logo, scores, titles
  body: 'BricolageGrotesque_500Medium',
  bodyBold: 'BricolageGrotesque_700Bold',
  bodyHeavy: 'BricolageGrotesque_800ExtraBold',
} as const;

/** Type scale in points: [size, lineHeight]. */
export const typeScale = {
  command: [88, 80],
  title: [44, 44],
  score: [34, 34],
  headline: [28, 30],
  button: [22, 24],
  body: [17, 24],
  label: [13, 16],
} as const;

/** Bagel Fat One is never set below this size. */
export const DISPLAY_MIN_PT = 24;
/** Commands tilt this many degrees. */
export const COMMAND_TILT_DEG = -6;

/** Durations in milliseconds for interface motion. */
export const motion = {
  touchResponseMaxMs: 50,
  pawPortalMs: 480,
  pawPortalStampMs: 120,
  backSlideMs: 360,
  reduceMotionFadeMs: 200,
  reduceMotionConfettiShare: 1 / 3,
} as const;

/**
 * Squash keeps volume: width = 1 / sqrt(height), measured from the floor.
 * Marked as a worklet because animated styles call it on the UI thread.
 */
export function squashWidth(heightScale: number): number {
  'worklet';
  if (heightScale <= 0) throw new RangeError('heightScale must be positive');
  return 1 / Math.sqrt(heightScale);
}
