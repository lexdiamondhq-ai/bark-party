import type { CoachId, LevelDef } from '../level/types';
import type { Rng } from '../../engine/rng';
import type { DogId, SpriteName } from '../sprites';
import type { ShakeKind, ShakeState } from './feel';

export interface Input {
  /** True on the frame the player starts a jump (tap). */
  jumpPressed: boolean;
  /** True while the finger stays down; letting go early makes a short hop. */
  jumpHeld: boolean;
  /** True on the frame the player swipes down. */
  slidePressed: boolean;
  /** True on the frame the player presses Bark. */
  barkPressed: boolean;
}

export const NO_INPUT: Input = { jumpPressed: false, jumpHeld: false, slidePressed: false, barkPressed: false };

export type HeroPose = 'run' | 'jump' | 'fall' | 'slide' | 'bark' | 'hurt' | 'idle' | 'cheer';

export interface Hero {
  x: number;
  /** Feet height above the floor. */
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** Time since the dog left the ground, for coyote jumps. */
  airTime: number;
  jumpBuffer: number;
  /** A swipe down in the air dives and then slides on landing. */
  slideBuffer: number;
  jumpsUsed: number;
  sliding: number;
  barking: number;
  barkCooldown: number;
  /** A bark pressed a moment early waits here until the cooldown ends. */
  barkBuffer: number;
  /** Zoomies time left after a slide. */
  boost: number;
  /** How hard the last landing was, 0..1, for the squash. */
  landImpact: number;
  invuln: number;
  hearts: number;
  /** Seconds since the last landing, for the squash on touchdown. */
  sinceLand: number;
  /** Run-cycle phase in strides (0..1 repeating). */
  stride: number;
  blocked: boolean;
  /** 0..1, eases up while blocked so the legs settle onto all four paws instead of cutting. */
  restBlend: number;
  pose: HeroPose;
}

/** Where the hero and camera were at the previous step, so a frame between steps can be drawn in between. */
export interface RenderPrev {
  x: number;
  y: number;
  camX: number;
  camY: number;
  t: number;
  stride: number;
}

export type EnemyType = 'runner' | 'thrower' | 'cat' | 'vacuum' | 'blocks';

/** Where a moving thing was at the previous step; the canvas draws it in between (unset until its first step). */
export interface Prev {
  px?: number;
  py?: number;
}

export interface Enemy extends Prev {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  /** active: in play. stunned: knocked out, flying off. fled: running away. */
  state: 'active' | 'stunned' | 'fled';
  t: number;
  /** Seconds until the next acorn (throwers). */
  cooldown: number;
  /** Throw animation timer. */
  throwing: number;
  awake: boolean;
  x0: number;
  x1: number;
  speed: number;
  facing: 1 | -1;
  /** Seconds left of the pop after being hit, for the squash-and-stretch. */
  pop: number;
}

export interface Acorn extends Prev {
  x: number;
  y: number;
  vx: number;
  vy: number;
  golden: boolean;
  /** Rolling acorns stay on the floor; thrown ones fly in an arc. */
  rolling: boolean;
  reflected: boolean;
  alive: boolean;
  spin: number;
}

export interface Pickup {
  kind: 'bone' | 'bone_gold' | 'present';
  x: number;
  y: number;
  taken: boolean;
  /** Seconds since taken, for the fly-to-counter animation. */
  takenT: number;
  sprite: SpriteName;
}

export interface Cage {
  x: number;
  y: number;
  dog: DogId;
  open: boolean;
  openT: number;
}

export interface Platform {
  sprite: SpriteName;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Walkable surface height (absolute, from the floor). */
  top: number;
  solid: boolean;
}

export interface Particle extends Prev {
  sprite: SpriteName;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  rot: number;
  vr: number;
  scale: number;
  /** Scale at the end of the particle's life, when it grows or shrinks (the bark burst). */
  scale1?: number;
  /** Frames to step through over the particle's life (dust puffs). */
  frames?: SpriteName[];
  /** Confetti: a flat colored rectangle instead of a sprite. */
  color?: string;
}

export type BossPhase = 'waiting' | 'intro' | 'fight' | 'hurt' | 'defeated' | 'gone';

export interface Boss extends Prev {
  name: string;
  hitsNeeded: number;
  hits: number;
  phase: BossPhase;
  t: number;
  /** World position (bottom centre). */
  x: number;
  y: number;
  vy: number;
  throwT: number;
  throwing: number;
  pattern: number;
  hurtT: number;
}

export type GameEvent =
  | { type: 'sfx'; name: string }
  | { type: 'haptic'; kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'selection' }
  | { type: 'callout'; coach: CoachId; text: string }
  | { type: 'checkpoint' }
  | { type: 'rescue'; dog: DogId }
  | { type: 'hurt'; hearts: number }
  | { type: 'boss_start' }
  | { type: 'boss_hit'; hits: number; needed: number }
  | { type: 'boss_defeated' }
  | { type: 'won' }
  | { type: 'gameover' }
  | { type: 'music'; name: string };

export type WorldPhase = 'run' | 'boss' | 'respawn' | 'won' | 'dead';

export interface World {
  level: LevelDef;
  viewW: number;
  rng: Rng;
  t: number;
  phase: WorldPhase;
  phaseT: number;
  hero: Hero;
  prev: RenderPrev;
  camX: number;
  /** The camera lifts when the dog is high up, and leads it when it runs fast. */
  camY: number;
  camLead: number;
  shake: ShakeState;
  shakeKind: ShakeKind | null;
  /** Seconds the world stays frozen so a hit lands. */
  hitstop: number;
  /** iOS Reduce Motion: no freezes, a third of the confetti (the renderer drops the shake). */
  reduceMotion: boolean;
  platforms: Platform[];
  floor: [number, number][];
  enemies: Enemy[];
  acorns: Acorn[];
  pickups: Pickup[];
  cages: Cage[];
  checkpoints: { x: number; reached: boolean }[];
  respawnX: number;
  callouts: { x: number; coach: CoachId; text: string; done: boolean }[];
  /** Pups riding in the wagon. */
  followers: DogId[];
  /** Pups just freed, mid-jump from their crate (bottom centre at x, y) into the wagon. */
  boarding: { dog: DogId; x: number; y: number; t: number }[];
  /** Recent hero positions, newest first, for the wagon to trace. */
  trail: { x: number; y: number }[];
  particles: Particle[];
  boss: Boss | null;
  bones: number;
  bonesTotal: number;
  goldBones: number;
  goldTotal: number;
  hurtCount: number;
  events: GameEvent[];
  finished: boolean;
}
