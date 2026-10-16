// Starts loading and decoding the game's pictures as the app opens, so the play screen has them on its
// first frame: the atlas pages, the room behind each chapter, and the HUD's stickers (hearts, bones, coaches,
// pups, power icons). On the web Skia is not loaded yet at this point; see preloadArt.web.ts.
import { Image } from 'react-native';

import { COACH_CHEER, DOGS, HUD, ROOMS } from '../art';
import { LEVELS } from '../level/chapter1';
import { ATLAS_PAGES } from './atlasImages';
import { loadArt } from './gameArt';

const POWER_ICONS = [
  require('../../../assets/game/sprites/power_mega.png'),
  require('../../../assets/game/sprites/power_turbo.png'),
  require('../../../assets/game/sprites/power_ball.png'),
  require('../../../assets/game/sprites/power_bubble.png'),
];

let started = false;

export function preloadGameArt() {
  if (started) return;
  started = true;
  for (const src of [...ATLAS_PAGES, ...new Set(LEVELS.map((l) => ROOMS[l.background]))]) loadArt(src);
  // The HUD is plain images: warm the image cache so no sticker pops in after the level appears.
  for (const src of [...Object.values(HUD), ...Object.values(COACH_CHEER), ...Object.values(DOGS), ...POWER_ICONS]) {
    const uri = Image.resolveAssetSource(src)?.uri;
    if (uri && /^https?:/.test(uri)) Image.prefetch(uri).catch(() => {});
  }
}
