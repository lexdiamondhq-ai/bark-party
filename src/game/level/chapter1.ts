import { CHAPTER_2 } from './chapter2';
import type { LevelDef } from './types';

// Chapter 1: The Living Room.
// The squirrel gang crashed Biscuit's Bark Party prep, locked the pups in crates and ran off
// with the birthday cake. Run through the living room, free Pepper and Nacho, and catch the boss.
//
// Reach guide at runSpeed 300: a single jump clears about 190 units of pit and 130 high;
// a double jump clears about 330 and 230 high.

const bones = (x0: number, n: number, gap: number, y = 18) =>
  Array.from({ length: n }, (_, i) => ({ kind: 'bone' as const, x: x0 + i * gap, y }));

const arc = (x0: number, n: number, gap: number, base: number, rise: number) =>
  Array.from({ length: n }, (_, i) => {
    const k = n === 1 ? 0.5 : i / (n - 1);
    return { kind: 'bone' as const, x: x0 + i * gap, y: base + Math.sin(k * Math.PI) * rise };
  });

export const CHAPTER_1: LevelDef = {
  id: 'ch1',
  chapter: 1,
  title: 'The Living Room',
  subtitle: 'The cake is missing!',
  winTitle: 'Cake saved!',
  background: 'room_living',
  floor: 'floor_living',
  music: 'music_living',
  runSpeed: 300,
  floorSegments: [
    [-600, 1500],
    [1660, 3300],
    [3480, 4700],
    [4900, 6350],
    [6580, 20000],
  ],
  platforms: [
    // Warm-up: hop onto a cushion and the couch.
    { sprite: 'cushion', x: 700 },
    { sprite: 'couch', x: 1000 },
    // Over the first pit.
    { sprite: 'cardboard_box', x: 1900, solid: true },
    { sprite: 'side_table', x: 2250 },
    { sprite: 'cardboard_box', x: 2700, solid: true },
    { sprite: 'cardboard_box', x: 2760, y: 60, solid: true },
    // Bookshelf climb.
    { sprite: 'armchair', x: 3600 },
    { sprite: 'side_table', x: 3780 },
    { sprite: 'bookshelf', x: 3960 },
    { sprite: 'cushion', x: 4500 },
    // Cat's armchair and the vacuum run.
    { sprite: 'armchair', x: 5150 },
    { sprite: 'couch', x: 5700 },
    { sprite: 'cardboard_box', x: 6150, solid: true },
    // Last stretch before the boss.
    { sprite: 'side_table', x: 6800 },
    { sprite: 'cardboard_box', x: 7100, solid: true },
    { sprite: 'couch', x: 7400 },
  ],
  enemies: [
    { type: 'runner', x: 2050 },
    { type: 'blocks', x: 2550 },
    { type: 'runner', x: 3150, speed: 120 },
    { type: 'thrower', x: 4010, y: 168, every: 1.8 },
    { type: 'runner', x: 4400 },
    { type: 'cat', x: 5205, y: 48 },
    { type: 'vacuum', x0: 5300, x1: 5650, speed: 90 },
    { type: 'thrower', x: 6000 },
    { type: 'runner', x: 6200, y: 60 },
    { type: 'blocks', x: 6700 },
    { type: 'runner', x: 7000, speed: 140 },
    { type: 'thrower', x: 7520, y: 50, every: 1.5 },
  ],
  pickups: [
    ...bones(250, 4, 50),
    ...arc(720, 3, 40, 50, 30),
    ...bones(1030, 4, 50, 70),
    ...arc(1500, 4, 50, 30, 110),
    { kind: 'bone_gold', x: 2295, y: 150 },
    ...bones(2400, 3, 50),
    ...arc(3290, 4, 55, 30, 110),
    ...bones(3990, 3, 34, 190),
    { kind: 'present', x: 4200, y: 260 },
    ...arc(4700, 4, 60, 30, 120),
    ...bones(5180, 2, 40, 70),
    { kind: 'bone_gold', x: 5480, y: 120 },
    ...bones(5730, 4, 50, 70),
    ...arc(6340, 4, 60, 30, 120),
    ...bones(6830, 2, 40, 90),
    { kind: 'bone_gold', x: 7180, y: 200 },
    ...bones(7430, 4, 50, 70),
  ],
  cages: [
    { x: 2950, dog: 'husky' },
    { x: 4120, y: 168, dog: 'beagle' },
    { x: 6420, dog: 'frenchie' },
  ],
  checkpoints: [1700, 3500, 4950, 6600],
  callouts: [
    { x: 150, coach: 'maya', text: 'Tap to jump. Hold for a big one!' },
    { x: 1250, coach: 'leo', text: 'Tap again in the air to double jump!' },
    { x: 1950, coach: 'alex', text: 'Squirrel! Bounce on its head!' },
    { x: 2850, coach: 'hana', text: 'Pepper is in that crate. Run into it!' },
    { x: 3700, coach: 'leo', text: 'Acorns! Hit BARK to swat them away.' },
    { x: 4950, coach: 'maya', text: 'Swipe down to slide under trouble.' },
    { x: 5050, coach: 'hana', text: 'Shh, a sleeping cat. Or bark it awake!' },
    { x: 6600, coach: 'alex', text: 'There goes the cake! After him!' },
  ],
  decor: [
    { sprite: 'rug', x: 200 },
    { sprite: 'floor_lamp', x: 560 },
    { sprite: 'potted_plant', x: 1380 },
    { sprite: 'floor_lamp', x: 2150 },
    { sprite: 'rug', x: 3700 },
    { sprite: 'potted_plant', x: 4600 },
    { sprite: 'floor_lamp', x: 5000 },
    { sprite: 'rug', x: 5300 },
    { sprite: 'potted_plant', x: 6250 },
    { sprite: 'floor_lamp', x: 7300 },
  ],
  boss: { x: 7900, name: 'Big Nutsy', hits: 3 },
  finishX: 9000,
};

export const LEVELS: LevelDef[] = [CHAPTER_1, CHAPTER_2];
export const CHAPTER_IDS = LEVELS.map((l) => l.id);

export function levelById(id: string | undefined): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
