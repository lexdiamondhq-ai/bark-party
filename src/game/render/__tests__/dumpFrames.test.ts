// Temporary: writes draw ops for a few hero moments to a JSON file so a script can composite them from the atlas.
import { writeFileSync } from 'fs';

import { CHAPTER_1 } from '../../level/chapter1';
import { STEP } from '../../constants';
import { createWorld, stepWorld } from '../../sim/world';
import { NO_INPUT, type Input } from '../../sim/types';
import { buildFrame, type AtlasData } from '../buildFrame';
import atlas from '../atlas.json';

const OUT = process.env.DUMP_FRAMES;

(OUT ? it : it.skip)('dumps frames', () => {
  const flat = { ...CHAPTER_1, floorSegments: [[-600, 20000]] as [number, number][], platforms: [{ sprite: 'cardboard_box' as const, x: 2200, solid: true }], enemies: [], pickups: [], cages: [], checkpoints: [], callouts: [], decor: [], boss: undefined };
  const w = createWorld(flat, 640);
  const k = 2;
  const setup = { atlas: atlas as unknown as AtlasData, background: null, k, screenW: 640 * k, screenH: 360 * k };
  const frames: { label: string; heroX: number; heroY: number; camX: number; ops: number[] }[] = [];
  const dump = (label: string) => {
    const f = buildFrame(w, setup);
    frames.push({ label, heroX: w.hero.x, heroY: w.hero.y, camX: w.camX, ops: f.data });
  };
  const press: Input = { ...NO_INPUT, jumpPressed: true, jumpHeld: true };
  const hold: Input = { ...NO_INPUT, jumpHeld: true };

  // 1 s of running, then 8 consecutive steps.
  for (let i = 0; i < 60; i++) stepWorld(w, NO_INPUT, STEP);
  for (let i = 0; i < 8; i++) {
    stepWorld(w, NO_INPUT, STEP);
    dump(`run ${i}`);
  }
  // Jump: frames every 50 ms through take-off, apex and landing.
  stepWorld(w, press, STEP);
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 3; j++) stepWorld(w, i < 4 ? hold : NO_INPUT, STEP);
    dump(`jump ${i * 50 + 50}ms`);
  }
  // Run into the box and settle.
  while (!w.hero.blocked) stepWorld(w, NO_INPUT, STEP);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 2; j++) stepWorld(w, NO_INPUT, STEP);
    dump(`blocked ${w.hero.restBlend.toFixed(2)}`);
  }
  writeFileSync(OUT!, JSON.stringify({ k, frames }));
});
