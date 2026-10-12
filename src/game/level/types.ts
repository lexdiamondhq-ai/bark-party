import type { DogId, SpriteName } from '../sprites';

export type CoachId = 'leo' | 'maya' | 'alex' | 'hana';

/** Furniture the dog can land on from above (one-way) or bump into (solid). */
export interface PlatformDef {
  sprite: SpriteName;
  /** Left edge in world units. */
  x: number;
  /** Bottom edge, height above the floor. Furniture sits on the floor (0) unless stacked. */
  y?: number;
  /** Solid pieces stop the dog from the side; others only catch it from above. */
  solid?: boolean;
}

export type EnemyDef =
  /** Runs at the dog along the floor or a platform. Stomp it or bark at it. */
  | { type: 'runner'; x: number; y?: number; speed?: number }
  /** Stands still and lobs acorns in an arc when the dog comes near. */
  | { type: 'thrower'; x: number; y?: number; every?: number }
  /** Sleeps on furniture; wakes and swipes when the dog gets close. Bark to scare it off. */
  | { type: 'cat'; x: number; y?: number }
  /** Patrols between x0 and x1 on the floor. Cannot be stunned: jump it. */
  | { type: 'vacuum'; x0: number; x1: number; speed?: number }
  /** A static trip hazard. */
  | { type: 'blocks'; x: number; y?: number };

export interface PickupDef {
  kind: 'bone' | 'bone_gold' | 'present';
  x: number;
  y: number;
}

export interface CageDef {
  x: number;
  y?: number;
  dog: DogId;
}

/** A coach shouts a tip when the dog reaches x. */
export interface CalloutDef {
  x: number;
  coach: CoachId;
  text: string;
}

export interface BossDef {
  /** The chase starts when the dog passes this x. */
  x: number;
  name: string;
  /** Hits needed: each one is a golden acorn barked back at the boss. */
  hits: number;
}

export interface LevelDef {
  id: string;
  chapter: number;
  title: string;
  subtitle: string;
  background: 'room_living' | 'room_cosy' | 'room_kitchen' | 'room_park' | 'room_yard';
  floor: SpriteName;
  music: string;
  /** Auto-run speed in units per second. */
  runSpeed: number;
  /** Floor segments [x0, x1]; the gaps between them are pits. */
  floorSegments: [number, number][];
  platforms: PlatformDef[];
  enemies: EnemyDef[];
  pickups: PickupDef[];
  cages: CageDef[];
  checkpoints: number[];
  callouts: CalloutDef[];
  /** Decorations drawn behind the action, standing on the floor. */
  decor: { sprite: SpriteName; x: number; y?: number }[];
  boss?: BossDef;
  /** Finish arch position (ignored when there is a boss: beating it finishes the level). */
  finishX: number;
}
