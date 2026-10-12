/**
 * The Dog Better mascot animated from its own art, with no redrawn dog anywhere:
 * - Walking: the walking sticker bent (not cut) into a trot stride and a tail wag (scripts/pup-frames.py).
 * - Changing pose: a hop. He crouches, springs up, changes pose at the top of the hop while he is moving
 *   fastest, and lands in the new pose with a squash and a springy settle. The drawings are never bent, so
 *   legs never distort, and the change happens inside the motion instead of as a swap at rest.
 * - At rest: the untouched walking, sit, speak, and lie-down stickers.
 *
 * Everything here runs as a Reanimated worklet on the UI thread. Helpers are defined above their users,
 * and no parameter default reads a module constant, since captured values only exist inside the body there.
 * Units are pixels of the walking sticker (802 by 714).
 */

export type PupPose = 'stand' | 'sit' | 'bark' | 'down';
export const PUP_POSE: Record<PupPose, number> = { stand: 0, sit: 1, bark: 2, down: 3 };

/** The walking sticker's size; every frame and sticker is placed in these pixels. */
export const CANVAS = { w: 802, h: 714 };
/** Paws rest on this line. */
export const GROUND = 702;

/**
 * The pose stickers scaled so the eye is the walking sticker's size (43 px) and placed with the eye in
 * line and paws on the ground, so his head barely moves when one pose hands over to the next.
 */
export const STICKERS = {
  sit: { w: 677, h: 715, scale: 43 / 42, eye: { x: 443, y: 144 }, bottom: 703 },
  bark: { w: 820, h: 713, scale: 43 / 44, eye: { x: 562, y: 152 }, bottom: 701 },
  down: { w: 1128, h: 699, scale: 43 / 57, eye: { x: 829, y: 178 }, bottom: 687 },
};
const WALK_EYE_X = 559;

export function stickerBox(name: keyof typeof STICKERS) {
  const s = STICKERS[name];
  return {
    left: WALK_EYE_X - s.eye.x * s.scale,
    top: GROUND - s.bottom * s.scale,
    width: s.w * s.scale,
    height: s.h * s.scale,
  };
}

const DEG = Math.PI / 180;

/**
 * Leg strip: WALK frames of one stride with knees flexing (the last repeats the first), then the untouched
 * sticker (REST), which stacks above the stride so it can fade in as a treadmill trot stops, then SETTLE
 * frames: the last half stride of a walk-in with its size easing to nothing, ending on REST. TAIL frames are
 * one wag.
 */
export const FRAMES = { walk: 49, settle: 23, tail: 11 };
export const REST = FRAMES.walk;
const SETTLE_AT = REST + 1;
export const LEG_FRAMES = SETTLE_AT + FRAMES.settle;

/**
 * The hop, as fractions of the move: crouch, rise to the peak (where the pose changes), fall, then land
 * and settle. HOP.swap is how long the change takes, centred on the peak: under one frame, so it is a clean
 * cut inside the fastest part of the motion, never two dogs at once.
 */
export const HOP = { crouch: 0.18, peak: 0.45, land: 0.7, swap: 0.015, height: 56 };

/** One trot cycle covers this many pixels of ground: long enough that he walks at an easy two strides a second. */
export const STRIDE = 210;
/** Tail wags per second while standing, and while trotting. */
const WAG = { still: 1.6, walking: 2.4 };

export type PuppetInput = {
  /** Seconds, for the tail wag. */
  t: number;
  /** Pixels walked so far; drives the legs so the stride matches the ground covered. */
  dist: number;
  /** 0 standing, 1 trotting. */
  walk: number;
  /** Sticker px left to walk in, or -1 when not walking in. The last half stride settles onto all four paws. */
  left: number;
  from: number;
  to: number;
  /** Progress from `from` to `to`, 0 to 1. */
  k: number;
  /** 0 to 1 while an "arf" pops. */
  bark: number;
};

export type PuppetFrame = {
  /** Opacity of the walking puppet and of each pose sticker at rest. */
  puppet: number;
  sit: number;
  barkPose: number;
  down: number;
  /** The hop: lift (sticker px, up is positive), squash and stretch about the paws. */
  lift: number;
  scaleX: number;
  scaleY: number;
  /** Leg strip frames: `legA` shows fully, `legB` on top at `legT`, and REST on top at `restT` as he stops. */
  legA: number;
  legB: number;
  legT: number;
  restT: number;
  tailA: number;
  tailB: number;
  tailT: number;
  /** Speak: the sticker hops and tips back a little on each "arf". */
  barkY: number;
  barkRot: number;
};

export function clamp01(v: number) {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smooth(u: number) {
  'worklet';
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
}

/** Which stride frames to show and how far between them, by phase through the stride. */
export function legFrames(phase: number) {
  'worklet';
  const pos = (phase - Math.floor(phase)) * (FRAMES.walk - 1);
  const a = Math.floor(pos);
  return { a, b: Math.min(a + 1, FRAMES.walk - 1), t: pos - a };
}

/**
 * The hop at progress `k` (0 to 1): how high he is and how much he squashes or stretches. Squash keeps his
 * volume roughly constant (wider when shorter), which is what makes it read as weight, not scaling.
 */
export function hop(k: number) {
  'worklet';
  const x = clamp01(k);
  let lift = 0;
  let squash = 0; // positive squashes (shorter, wider), negative stretches
  if (x < HOP.crouch) {
    squash = 0.07 * Math.sin((Math.PI / 2) * (x / HOP.crouch));
  } else if (x < HOP.land) {
    const u = (x - HOP.crouch) / (HOP.land - HOP.crouch);
    lift = HOP.height * Math.sin(Math.PI * u);
    // Snap from the crouch into a stretch on take-off, relax at the top, stretch again falling.
    squash = 0.07 * (1 - smooth(u / 0.18)) - 0.05 * Math.sin(Math.PI * u) * (1 - Math.abs(u - 0.5));
  } else {
    // Land into a squash, bounce back through a small stretch, and settle exactly at rest.
    const u = (x - HOP.land) / (1 - HOP.land);
    squash = 0.2 * Math.sin(Math.PI * 2 * u) * Math.exp(-3.5 * u);
  }
  return { lift, scaleX: 1 + squash * 0.6, scaleY: 1 - squash };
}

/**
 * The settle at progress `u` (0 to 1) through the last half stride: from mid-stride, through the settle
 * frames, onto REST. REST sits between the stride and the settle, so the first step blends from the stride.
 */
export function settleFrames(u: number) {
  'worklet';
  const pos = clamp01(u) * (FRAMES.settle + 1);
  const step = Math.floor(pos);
  const t = pos - step;
  if (step >= FRAMES.settle + 1) return { a: REST, b: REST, t: 0 };
  // Frame index for each settle step: 0 is the mid-stride walk frame, FRAMES.settle + 1 is REST.
  const at = (i: number) => {
    'worklet';
    return i <= 0 ? (FRAMES.walk - 1) / 2 : i > FRAMES.settle ? REST : SETTLE_AT + i - 1;
  };
  const a = at(step);
  const b = at(step + 1);
  // Frames stack in index order, so the lower one shows fully and the upper one blends over or away.
  return b > a ? { a, b, t } : { a: b, b: a, t: 1 - t };
}

/** How far to walk in so the gait ends a whole cycle later, with every leg back where the sticker has it. */
export function walkDistance(want: number) {
  return Math.max(1, Math.ceil(want / STRIDE)) * STRIDE;
}

export function puppetFrame(input: PuppetInput): PuppetFrame {
  'worklet';
  const walk = clamp01(input.walk);
  const k = clamp01(input.k);
  const from = input.from;
  const to = input.to;

  // Rest poses: 0 the walking puppet, 1 to 3 the stickers. The change is a quick blend at the top of the hop.
  const stills = [0, 0, 0, 0];
  const moving = from !== to && k < 1;
  if (!moving) {
    stills[to] = 1;
  } else {
    const c = smooth((k - (HOP.peak - HOP.swap / 2)) / HOP.swap);
    stills[from] = 1 - c;
    stills[to] += c;
  }
  const h = moving ? hop(k) : { lift: 0, scaleX: 1, scaleY: 1 };

  const cycles = input.dist / STRIDE;
  const settling = input.left >= 0 && input.left < STRIDE / 2;
  const walking = input.left >= 0 ? input.left > 0 : walk > 0.01;
  const legs = !walking ? { a: REST, b: REST, t: 0 } : settling ? settleFrames(1 - input.left / (STRIDE / 2)) : legFrames(cycles);
  const wags = input.t * (WAG.still + (WAG.walking - WAG.still) * walk);
  const tailPos = (wags - Math.floor(wags)) * (FRAMES.tail - 1);
  const tailA = Math.floor(tailPos);

  return {
    puppet: stills[0],
    sit: stills[1],
    barkPose: stills[2],
    down: stills[3],
    lift: h.lift,
    scaleX: h.scaleX,
    scaleY: h.scaleY,
    legA: legs.a,
    legB: legs.b,
    legT: legs.t,
    // The stride never has every leg straight, so as he slows the true sticker fades in over it.
    restT: walking && input.left < 0 ? 1 - walk : 0,
    tailA,
    tailB: Math.min(tailA + 1, FRAMES.tail - 1),
    tailT: tailPos - tailA,
    barkY: -7 * input.bark,
    barkRot: -2.5 * DEG * input.bark,
  };
}

/**
 * React Native turns a view about its centre. To turn a piece by `angle` about `pivot` instead, move it by
 * where that centre would land, minus the centre. All in the same pixels as `centre` and `pivot`.
 */
export function aboutPivot(angle: number, pivot: { x: number; y: number }, centre: { x: number; y: number }) {
  'worklet';
  const dx = centre.x - pivot.x;
  const dy = centre.y - pivot.y;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { tx: pivot.x + dx * cos - dy * sin - centre.x, ty: pivot.y + dx * sin + dy * cos - centre.y };
}
