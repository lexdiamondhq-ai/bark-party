// Dog Runner tuning. Units are "world units": the visible play area is VIEW_H units tall
// (the view width follows the screen's aspect ratio). Heights are measured up from the floor.

export const VIEW_H = 360;
/** The simulation advances in fixed steps; the renderer interpolates between the last two. */
export const STEP = 1 / 60;
/** Ground covered by one full leg cycle, and the fastest the legs will cycle for (units per second). */
export const STRIDE_LEN = 96;
export const MAX_STRIDE_SPEED = 360;
/** Screen-space y of the floor line, in world units from the top of the view. */
export const FLOOR_SCREEN_Y = 310;
/** Hero's x position on screen, as a share of the view width. */
export const HERO_SCREEN_X = 0.28;

export const PHYS = {
  // Gravity and jump speeds are scaled together with the run speed (260): the arc covers the same
  // ground and height as it did at 300, it just takes a touch longer, so every pit and shelf still reads.
  gravity: 2000,
  /** Holding the jump past this point keeps full height; letting go early cuts the rise. */
  jumpVelocity: 735,
  doubleJumpVelocity: 660,
  jumpCut: 0.45,
  maxFall: 1300,
  coyoteTime: 0.1,
  jumpBuffer: 0.14,
  slideTime: 0.55,
  barkTime: 0.32,
  barkCooldown: 0.7,
  barkRange: 170,
  hurtInvuln: 1.3,
  /** Seconds the pup wobbles after losing a heart. */
  hurtPose: 0.35,
  stompBounce: 585,
  /** Height above the platform top within which a falling hero still lands on it. */
  landTolerance: 22,
  /** Zoomies: finishing a slide gives this much extra speed for this long. */
  boostSpeed: 1.25,
  boostTime: 0.6,
  /** A bark pressed this long before the cooldown ends still fires. */
  barkBuffer: 0.12,
  /** Running off an edge gives a tiny hop so the drop feels bouncy, not like slipping. */
  ledgeHop: 105,
} as const;

/** How enemies announce themselves, so nothing arrives without warning. */
export const WARN = {
  /** A runner hops on the spot this long after it enters the view before it charges. */
  runnerHop: 0.35,
  runnerHopVy: 230,
  /** A thrower leans back this long before the acorn leaves. */
  windup: 0.5,
  /** Seconds the acorn is in the air, and how close (ahead of the pup) a live acorn blocks the next throw. */
  acornFlight: 1.1,
  acornSpacing: 320,
} as const;

/** The hero's collision box, centred on x, standing on y. */
export const HERO_BOX = { w: 40, h: 54, slideH: 26 } as const;

export const MAX_HEARTS = 3;

/** Power treats: how long each lasts, how big and fast the pup gets, how the balls fly. */
export const POWER = {
  megaTime: 8,
  megaScale: 1.6,
  turboTime: 6,
  turboSpeed: 1.5,
  ballTime: 10,
  ballSpeed: 720,
  ballLife: 1.1,
  /** Seconds the grow-in and shrink-out of Mega Pup take. */
  megaRamp: 0.3,
} as const;

/** Seconds a freed pup takes to jump from its crate into the wagon. */
export const BOARD_TIME = 0.55;
