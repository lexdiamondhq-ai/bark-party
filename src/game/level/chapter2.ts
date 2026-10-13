import type { LevelDef } from './types';

// Chapter 2: The Kitchen.
// The Nutsy Gang went for the party snacks next. Counters, stools and the fridge make a
// staircase up high, the robot vacuum patrols the tiles, and the gang's cook is waiting at the end.
//
// Reach guide at runSpeed 320: a single jump clears about 200 units of pit and 130 high;
// a double jump clears about 350 and 230 high. Counter tops are 70 high, stools 58, the fridge 158.

const bones = (x0: number, n: number, gap: number, y = 18) =>
  Array.from({ length: n }, (_, i) => ({ kind: 'bone' as const, x: x0 + i * gap, y }));

const arc = (x0: number, n: number, gap: number, base: number, rise: number) =>
  Array.from({ length: n }, (_, i) => {
    const k = n === 1 ? 0.5 : i / (n - 1);
    return { kind: 'bone' as const, x: x0 + i * gap, y: base + Math.sin(k * Math.PI) * rise };
  });

export const CHAPTER_2: LevelDef = {
  id: 'ch2',
  chapter: 2,
  title: 'The Kitchen',
  subtitle: 'Snack attack!',
  winTitle: 'Snacks saved!',
  background: 'room_kitchen',
  floor: 'floor_kitchen',
  music: 'music_kitchen',
  runSpeed: 320,
  floorSegments: [
    [-600, 1700],
    [1880, 3500],
    [3720, 5200],
    [5440, 6900],
    [7120, 20000],
  ],
  platforms: [
    // Warm-up: stool, counter, stool.
    { sprite: 'stool', x: 600 },
    { sprite: 'kitchen_counter', x: 820 },
    { sprite: 'stool', x: 1150 },
    // First pit: counters on both sides.
    { sprite: 'kitchen_counter', x: 1500 },
    { sprite: 'kitchen_counter', x: 1920 },
    // The fridge climb: stool, counter, fridge top with a golden bone.
    { sprite: 'stool', x: 2500 },
    { sprite: 'kitchen_counter', x: 2700 },
    { sprite: 'fridge', x: 2940, solid: true },
    { sprite: 'kitchen_counter', x: 3150 },
    // Second pit and the vacuum run.
    { sprite: 'stool', x: 3800 },
    { sprite: 'kitchen_counter', x: 4300 },
    { sprite: 'stool', x: 4700 },
    { sprite: 'fridge', x: 4960, solid: true },
    // Last stretch: counters and a stool before the boss.
    { sprite: 'kitchen_counter', x: 5600 },
    { sprite: 'stool', x: 6000 },
    { sprite: 'kitchen_counter', x: 6300 },
    { sprite: 'stool', x: 6700 },
    { sprite: 'kitchen_counter', x: 7300 },
  ],
  enemies: [
    { type: 'runner', x: 1300 },
    { type: 'thrower', x: 2120, y: 70, every: 1.7 },
    { type: 'runner', x: 2300, speed: 120 },
    { type: 'cat', x: 2755, y: 70 },
    { type: 'runner', x: 3300, speed: 140 },
    { type: 'vacuum', x0: 3900, x1: 4250, speed: 100 },
    { type: 'thrower', x: 4380, y: 70, every: 1.5 },
    { type: 'runner', x: 4600 },
    { type: 'vacuum', x0: 5500, x1: 5900, speed: 120 },
    { type: 'thrower', x: 6380, y: 70, every: 1.4 },
    { type: 'runner', x: 6850, speed: 150 },
    { type: 'runner', x: 7500, speed: 160 },
  ],
  pickups: [
    ...bones(250, 4, 50),
    ...arc(600, 3, 40, 80, 30),
    ...bones(850, 4, 50, 90),
    ...arc(1700, 4, 50, 30, 120),
    ...bones(1940, 3, 50, 90),
    { kind: 'bone_gold', x: 2985, y: 180 },
    ...bones(3170, 3, 50, 90),
    ...arc(3500, 4, 55, 30, 110),
    { kind: 'present', x: 4380, y: 150 },
    ...bones(4320, 3, 50, 90),
    ...arc(5200, 4, 60, 30, 120),
    { kind: 'bone_gold', x: 5005, y: 180 },
    ...bones(5630, 4, 50, 90),
    ...arc(6900, 4, 60, 30, 120),
    { kind: 'bone_gold', x: 6720, y: 140 },
    ...bones(7330, 4, 50, 90),
  ],
  cages: [
    { x: 1990, y: 70, dog: 'golden' },
    { x: 4300, y: 70, dog: 'dachshund' },
    { x: 6600, dog: 'collie' },
  ],
  checkpoints: [1900, 3750, 5460, 7150],
  callouts: [
    { x: 150, coach: 'leo', text: 'The snacks went this way. Up the stools!' },
    { x: 1350, coach: 'maya', text: 'Squirrel on the tiles. Bounce it!' },
    { x: 2450, coach: 'hana', text: 'Stool, counter, fridge: climb for the golden bone!' },
    { x: 3850, coach: 'alex', text: 'The robot vacuum! Jump on it to bounce high.' },
    { x: 5450, coach: 'maya', text: 'Slide under the acorns, then zoom!' },
    { x: 7150, coach: 'leo', text: 'The cook is up ahead. Bark the golden acorns back!' },
  ],
  decor: [
    { sprite: 'dog_bowl', x: 180 },
    { sprite: 'potted_plant', x: 1380 },
    { sprite: 'dog_bowl', x: 2250 },
    { sprite: 'potted_plant', x: 3650 },
    { sprite: 'dog_bowl', x: 4620 },
    { sprite: 'potted_plant', x: 5300 },
    { sprite: 'dog_bowl', x: 6150 },
    { sprite: 'potted_plant', x: 7050 },
  ],
  boss: { x: 8000, name: 'Chef Nutsy', hits: 4 },
  finishX: 9200,
};
