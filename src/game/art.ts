// Pictures used outside the Skia game canvas (story panels, HUD, menus).
import type { CoachId } from './level/types';
import type { DogId } from './sprites';

export const ROOMS = {
  room_living: require('../../assets/game/dogbetter/room_living.webp'),
  room_cosy: require('../../assets/game/dogbetter/room_cosy.webp'),
  room_kitchen: require('../../assets/game/dogbetter/room_kitchen.webp'),
  room_park: require('../../assets/game/dogbetter/room_park.webp'),
  room_yard: require('../../assets/game/dogbetter/room_yard.webp'),
} as const;

/** Room pictures are 820 x 550. */
export const ROOM_SIZE = { w: 820, h: 550 };

export const COACH_CHEER: Record<CoachId, number> = {
  leo: require('../../assets/game/dogbetter/coach_leo_cheer.webp'),
  maya: require('../../assets/game/dogbetter/coach_maya_cheer.webp'),
  alex: require('../../assets/game/dogbetter/coach_alex_cheer.webp'),
  hana: require('../../assets/game/dogbetter/coach_hana_cheer.webp'),
};

export const COACH_FULL: Record<CoachId, number> = {
  leo: require('../../assets/game/dogbetter/coach_leo_full.webp'),
  maya: require('../../assets/game/dogbetter/coach_maya_full.webp'),
  alex: require('../../assets/game/dogbetter/coach_alex_full.webp'),
  hana: require('../../assets/game/dogbetter/coach_hana_full.webp'),
};

export const DOGS: Record<DogId, number> = {
  beagle: require('../../assets/game/dogbetter/dog_beagle.webp'),
  collie: require('../../assets/game/dogbetter/dog_collie.webp'),
  dachshund: require('../../assets/game/dogbetter/dog_dachshund.webp'),
  frenchie: require('../../assets/game/dogbetter/dog_frenchie.webp'),
  golden: require('../../assets/game/dogbetter/dog_golden.webp'),
  husky: require('../../assets/game/dogbetter/dog_husky.webp'),
  lab: require('../../assets/game/dogbetter/dog_lab.webp'),
  poodle: require('../../assets/game/dogbetter/dog_poodle.webp'),
  rottweiler: require('../../assets/game/dogbetter/dog_rottweiler.webp'),
  shepherd: require('../../assets/game/dogbetter/dog_shepherd.webp'),
};

/** HUD and menu pictures drawn from the same sprite art as the game. */
export const HUD = {
  heartFull: require('../../assets/game/sprites/heart_full.png'),
  heartEmpty: require('../../assets/game/sprites/heart_empty.png'),
  bone: require('../../assets/game/sprites/bone_icon.png'),
  cake: require('../../assets/game/sprites/cake.png'),
  wagon: require('../../assets/game/sprites/wagon.png'),
};

export const PUP = {
  walk: require('../../assets/game/dogbetter/mascot-walking.webp'),
  bark: require('../../assets/game/dogbetter/mascot-bark.webp'),
  sit: require('../../assets/game/dogbetter/mascot.webp'),
  down: require('../../assets/game/dogbetter/mascot-down.webp'),
};
