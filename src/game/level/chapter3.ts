import type { LevelDef } from './types';

// Chapter 3: The Park.
// The Nutsy Gang ran off to the park with three more pups. Stumps, benches and picnic tables
// make the steps, two playground towers are the high spots, and Pine Nutsy waits at the end.
//
// Reach guide at runSpeed 280 (gravity and jumps scaled with it): a single jump clears about 200 units of pit and 130 high;
// a double jump clears about 350 and 230 high. Bench seats are 36 high, stumps 50, picnic tables 70, the towers 158.

const bones = (x0: number, n: number, gap: number, y = 18) =>
  Array.from({ length: n }, (_, i) => ({ kind: 'bone' as const, x: x0 + i * gap, y }));

const arc = (x0: number, n: number, gap: number, base: number, rise: number) =>
  Array.from({ length: n }, (_, i) => {
    const k = n === 1 ? 0.5 : i / (n - 1);
    return { kind: 'bone' as const, x: x0 + i * gap, y: base + Math.sin(k * Math.PI) * rise };
  });

export const CHAPTER_3: LevelDef = {
  id: 'ch3',
  chapter: 3,
  title: 'The Park',
  subtitle: 'Picnic panic!',
  winTitle: 'Park saved!',
  background: 'room_park',
  floor: 'floor_park',
  music: 'music_park',
  runSpeed: 280,
  floorSegments: [
    [-600, 1800],
    [2000, 3600],
    [3830, 5300],
    [5540, 7000],
    [7200, 20000],
  ],
  platforms: [
    // Warm-up: stump, bench, picnic table.
    { sprite: 'tree_stump', x: 520 },
    { sprite: 'park_bench', x: 700 },
    { sprite: 'picnic_table', x: 1000 },
    // First pit: picnic tables on both sides.
    { sprite: 'tree_stump', x: 1420 },
    { sprite: 'picnic_table', x: 1620 },
    { sprite: 'picnic_table', x: 2010 },
    { sprite: 'park_bench', x: 2400 },
    // The first tower: stump, table, tower deck with a golden bone.
    { sprite: 'tree_stump', x: 2760 },
    { sprite: 'picnic_table', x: 2900 },
    { sprite: 'play_tower', x: 3120, solid: true },
    { sprite: 'picnic_table', x: 3300 },
    // Second pit, then the sandbox stretch and the second tower.
    { sprite: 'park_bench', x: 4120 },
    { sprite: 'tree_stump', x: 4380 },
    { sprite: 'picnic_table', x: 4520 },
    { sprite: 'play_tower', x: 4760, solid: true },
    // Last stretch before the boss.
    { sprite: 'park_bench', x: 5600 },
    { sprite: 'picnic_table', x: 5900 },
    { sprite: 'tree_stump', x: 6240 },
    { sprite: 'picnic_table', x: 6420 },
    { sprite: 'park_bench', x: 6800 },
    { sprite: 'picnic_table', x: 7350 },
  ],
  enemies: [
    { type: 'runner', x: 1250 },
    { type: 'thrower', x: 2090, y: 70, every: 1.7 },
    { type: 'cat', x: 2470, y: 36 },
    { type: 'runner', x: 2950, speed: 120 },
    { type: 'thrower', x: 3360, y: 70, every: 1.6 },
    { type: 'blocks', x: 4000 },
    { type: 'runner', x: 4300, speed: 130 },
    { type: 'cat', x: 4580, y: 70 },
    { type: 'runner', x: 5450, speed: 140 },
    { type: 'cat', x: 5680, y: 36 },
    { type: 'thrower', x: 5980, y: 70, every: 1.4 },
    { type: 'blocks', x: 6650 },
    { type: 'runner', x: 7500, speed: 160 },
  ],
  pickups: [
    ...bones(250, 4, 50),
    ...arc(520, 3, 40, 70, 30),
    ...bones(1030, 4, 40, 90),
    ...arc(1800, 4, 50, 30, 120),
    ...bones(2030, 3, 50, 90),
    { kind: 'present', x: 1900, y: 150 },
    { kind: 'bone_gold', x: 3170, y: 180 },
    ...bones(3320, 3, 50, 90),
    ...arc(3620, 4, 55, 30, 110),
    { kind: 'present', x: 4810, y: 240 },
    ...bones(4540, 3, 50, 90),
    { kind: 'bone_gold', x: 4810, y: 180 },
    ...arc(5320, 4, 60, 30, 120),
    ...bones(5930, 3, 50, 90),
    { kind: 'present', x: 6300, y: 150 },
    ...arc(7020, 4, 55, 30, 120),
    { kind: 'bone_gold', x: 6875, y: 120 },
    ...bones(7380, 4, 40, 90),
  ],
  cages: [
    { x: 1700, y: 70, dog: 'lab' },
    { x: 4250, dog: 'shepherd' },
    { x: 6500, y: 70, dog: 'poodle' },
  ],
  checkpoints: [2020, 3850, 5560, 7220],
  callouts: [
    { x: 150, coach: 'hana', text: 'The gang ran to the park. Follow those paw prints!' },
    { x: 1300, coach: 'leo', text: 'Benches and tables make great steps.' },
    { x: 2820, coach: 'maya', text: 'Climb the tower for the golden bone!' },
    { x: 3420, coach: 'alex', text: 'Toy blocks in the sandbox. Jump them!' },
    { x: 4700, coach: 'hana', text: 'Cats love benches. Bark them off!' },
    { x: 6730, coach: 'leo', text: 'Pine Nutsy is up ahead. Bark the golden acorns back!' },
  ],
  decor: [
    { sprite: 'flower_bed', x: 180 },
    { sprite: 'bush', x: 1300 },
    { sprite: 'flower_bed', x: 2250 },
    { sprite: 'bush', x: 3500 },
    { sprite: 'flower_bed', x: 4660 },
    { sprite: 'bush', x: 5400 },
    { sprite: 'flower_bed', x: 6140 },
    { sprite: 'bush', x: 7050 },
  ],
  boss: { x: 8000, name: 'Pine Nutsy', hits: 4 },
  finishX: 9200,
};
