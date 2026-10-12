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
  gravity: 2300,
  /** Holding the jump past this point keeps full height; letting go early cuts the rise. */
  jumpVelocity: 780,
  doubleJumpVelocity: 700,
  jumpCut: 0.45,
  maxFall: 1300,
  coyoteTime: 0.1,
  jumpBuffer: 0.14,
  slideTime: 0.55,
  barkTime: 0.32,
  barkCooldown: 0.7,
  barkRange: 170,
  hurtInvuln: 1.3,
  stompBounce: 620,
  /** Height above the platform top within which a falling hero still lands on it. */
  landTolerance: 22,
} as const;

/** The hero's collision box, centred on x, standing on y. */
export const HERO_BOX = { w: 40, h: 54, slideH: 26 } as const;

export const MAX_HEARTS = 3;
