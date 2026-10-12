// Sprite sizes in world units. Physics reads these; the renderer looks the same names up in the atlas.
// `top` is the walkable surface height (from the bottom) for furniture the dog can stand on.

export interface SpriteSize {
  w: number;
  h: number;
  top?: number;
}

export const SPRITES = {
  // Hero: the Dog Better pup
  pup_walk: { w: 76, h: 67 },
  pup_bark: { w: 76, h: 66 },
  pup_down: { w: 82, h: 50 },
  pup_sit: { w: 64, h: 68 },
  // Dog Better pup puppet: body, leg stride (every other frame of 49), rest legs and tail wag.
  pup_base: { w: 76, h: 67.66 },
  pup_leg_0: { w: 68.42, h: 27.86 },
  pup_leg_1: { w: 68.42, h: 27.86 },
  pup_leg_2: { w: 68.42, h: 27.86 },
  pup_leg_3: { w: 68.42, h: 27.86 },
  pup_leg_4: { w: 68.42, h: 27.86 },
  pup_leg_5: { w: 68.42, h: 27.86 },
  pup_leg_6: { w: 68.42, h: 27.86 },
  pup_leg_7: { w: 68.42, h: 27.86 },
  pup_leg_8: { w: 68.42, h: 27.86 },
  pup_leg_9: { w: 68.42, h: 27.86 },
  pup_leg_10: { w: 68.42, h: 27.86 },
  pup_leg_11: { w: 68.42, h: 27.86 },
  pup_leg_12: { w: 68.42, h: 27.86 },
  pup_leg_13: { w: 68.42, h: 27.86 },
  pup_leg_14: { w: 68.42, h: 27.86 },
  pup_leg_15: { w: 68.42, h: 27.86 },
  pup_leg_16: { w: 68.42, h: 27.86 },
  pup_leg_17: { w: 68.42, h: 27.86 },
  pup_leg_18: { w: 68.42, h: 27.86 },
  pup_leg_19: { w: 68.42, h: 27.86 },
  pup_leg_20: { w: 68.42, h: 27.86 },
  pup_leg_21: { w: 68.42, h: 27.86 },
  pup_leg_22: { w: 68.42, h: 27.86 },
  pup_leg_23: { w: 68.42, h: 27.86 },
  pup_leg_24: { w: 68.42, h: 27.86 },
  pup_leg_rest: { w: 68.42, h: 27.86 },
  pup_tail_0: { w: 20.85, h: 15.45 },
  pup_tail_1: { w: 20.85, h: 15.45 },
  pup_tail_2: { w: 20.85, h: 15.45 },
  pup_tail_3: { w: 20.85, h: 15.45 },
  pup_tail_4: { w: 20.85, h: 15.45 },
  pup_tail_5: { w: 20.85, h: 15.45 },
  pup_tail_6: { w: 20.85, h: 15.45 },
  pup_tail_7: { w: 20.85, h: 15.45 },
  pup_tail_8: { w: 20.85, h: 15.45 },
  pup_tail_9: { w: 20.85, h: 15.45 },
  pup_tail_10: { w: 20.85, h: 15.45 },

  // Dog Better breed dogs (sitting portraits), used for rescued friends
  dog_beagle: { w: 50, h: 52 },
  dog_collie: { w: 52, h: 52 },
  dog_dachshund: { w: 62, h: 43 },
  dog_frenchie: { w: 42, h: 52 },
  dog_golden: { w: 52, h: 52 },
  dog_husky: { w: 49, h: 52 },
  dog_lab: { w: 50, h: 52 },
  dog_poodle: { w: 50, h: 52 },
  dog_rottweiler: { w: 49, h: 52 },
  dog_shepherd: { w: 47, h: 52 },

  // Squirrel gang
  squirrel_run_0: { w: 56, h: 48 },
  squirrel_run_1: { w: 56, h: 48 },
  squirrel_run_2: { w: 56, h: 48 },
  squirrel_run_3: { w: 56, h: 48 },
  squirrel_throw_0: { w: 56, h: 48 },
  squirrel_throw_1: { w: 56, h: 48 },
  squirrel_stunned: { w: 56, h: 48 },
  squirrel_idle_0: { w: 56, h: 48 },
  squirrel_idle_1: { w: 56, h: 48 },
  boss_idle_0: { w: 120, h: 130 },
  boss_idle_1: { w: 120, h: 130 },
  boss_throw_0: { w: 120, h: 130 },
  boss_throw_1: { w: 120, h: 130 },
  boss_hurt: { w: 120, h: 130 },
  boss_defeated: { w: 120, h: 130 },

  // Props and pickups
  acorn: { w: 16, h: 18 },
  acorn_golden: { w: 16, h: 18 },
  bone: { w: 28, h: 14 },
  bone_gold: { w: 36, h: 18 },
  cake: { w: 60, h: 56 },
  present_red: { w: 36, h: 36 },
  present_blue: { w: 36, h: 36 },
  present_green: { w: 36, h: 36 },
  cage_closed: { w: 84, h: 84 },
  cage_open: { w: 84, h: 84 },
  balloon_post_down: { w: 30, h: 90 },
  balloon_post_up: { w: 30, h: 90 },
  party_arch: { w: 200, h: 150 },

  // Hazards
  cat_sleep: { w: 70, h: 50 },
  cat_awake_0: { w: 70, h: 50 },
  cat_awake_1: { w: 70, h: 50 },
  vacuum_0: { w: 60, h: 26 },
  vacuum_1: { w: 60, h: 26 },
  toy_blocks: { w: 40, h: 40 },

  // Living Room furniture
  couch: { w: 220, h: 90, top: 50 },
  armchair: { w: 110, h: 90, top: 48 },
  side_table: { w: 90, h: 70, top: 68 },
  bookshelf: { w: 100, h: 170, top: 168 },
  cardboard_box: { w: 60, h: 60, top: 59.5 },
  cushion: { w: 80, h: 30, top: 26 },
  floor_lamp: { w: 40, h: 160 },
  potted_plant: { w: 50, h: 80 },
  rug: { w: 240, h: 16 },
  floor_living: { w: 128, h: 40 },

  // Effects and UI
  dust_0: { w: 24, h: 16 },
  dust_1: { w: 24, h: 16 },
  dust_2: { w: 24, h: 16 },
  star: { w: 12, h: 12 },
  heart: { w: 16, h: 16 },
  bark_burst: { w: 90, h: 56 },
  heart_full: { w: 24, h: 22 },
  heart_empty: { w: 24, h: 22 },
  bone_icon: { w: 28, h: 16 },
} as const satisfies Record<string, SpriteSize>;

export type SpriteName = keyof typeof SPRITES;

export type DogId =
  | 'beagle'
  | 'collie'
  | 'dachshund'
  | 'frenchie'
  | 'golden'
  | 'husky'
  | 'lab'
  | 'poodle'
  | 'rottweiler'
  | 'shepherd';

export function dogSprite(dog: DogId): SpriteName {
  return `dog_${dog}` as SpriteName;
}
