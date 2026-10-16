// Temporary: writes draw ops for a few hero moments to a JSON file so a script can composite them from the atlas.
import { writeFileSync } from 'fs';

import { CHAPTER_1 } from '../../level/chapter1';
import { STEP } from '../../constants';
import { createWorld, stepWorld } from '../../sim/world';
import { NO_INPUT, type Input } from '../../sim/types';
import { buildFrame, type AtlasData } from '../buildFrame';
import atlas from '../atlas.json';

const OUT = process.env.DUMP_FRAMES;
/** Set DUMP_CLIP=1 to dump a 30 fps clip of the hero freeing a pup and jumping a pit with the wagon instead. */
const CLIP = !!process.env.DUMP_CLIP;

(OUT && CLIP ? it : it.skip)('dumps a wagon clip', () => {
  const level = { ...CHAPTER_1, floorSegments: [[-600, 700], [850, 20000]] as [number, number][], platforms: [], enemies: [], pickups: [], cages: [{ x: 380, dog: 'frenchie' as const }], checkpoints: [], callouts: [], decor: [{ sprite: 'rug' as const, x: 300 }, { sprite: 'potted_plant' as const, x: 1000 }], boss: undefined };
  const w = createWorld(level, 640);
  w.followers.push('husky');
  const k = 1.5;
  const setup = { atlas: atlas as unknown as AtlasData, background: null, k, screenW: 640 * k, screenH: 360 * k };
  const frames: { label: string; heroX: number; heroY: number; camX: number; ops: number[] }[] = [];
  const press: Input = { ...NO_INPUT, jumpPressed: true, jumpHeld: true };
  const hold: Input = { ...NO_INPUT, jumpHeld: true };
  // Warm up so the trail is full, then 3 s at 30 fps: free the pup at x≈400, jump the pit at x≈700, land, run on.
  for (let i = 0; i < 30; i++) stepWorld(w, NO_INPUT, STEP);
  let held = 0;
  const per = Number(process.env.DUMP_STEPS ?? 2);
  for (let f = 0; f < 90 * (2 / per); f++) {
    for (let j = 0; j < per; j++) {
      const nearPit = w.hero.x > 640 && w.hero.onGround && held === 0;
      const input = nearPit ? press : held > 0 && held < 12 ? hold : NO_INPUT;
      if (nearPit || (held > 0 && held < 12)) held++;
      stepWorld(w, input, STEP);
    }
    frames.push({ label: '', heroX: w.hero.x, heroY: w.hero.y, camX: w.camX, ops: buildFrame(w, setup).data });
  }
  writeFileSync(OUT!, JSON.stringify({ k, frames }));
});

/** Set DUMP_POWER=1 to dump a 60 fps clip: Mega Pup crushing squirrels, then Ball Mouth at a thrower. */
const POWERCLIP = !!process.env.DUMP_POWER;

(OUT && POWERCLIP ? it : it.skip)('dumps a power clip', () => {
  const level = { ...CHAPTER_1, floorSegments: [[-600, 20000]] as [number, number][], platforms: [], enemies: [{ type: 'runner' as const, x: 700, speed: 0 }, { type: 'runner' as const, x: 1000, speed: 0 }, { type: 'thrower' as const, x: 2100, every: 0.9 }], pickups: [{ kind: 'present' as const, x: 300, y: 18 }], cages: [], checkpoints: [], callouts: [], decor: [{ sprite: 'rug' as const, x: 500 }, { sprite: 'potted_plant' as const, x: 1500 }], boss: undefined };
  const w = createWorld(level, 640, 3);
  w.followers.push('husky');
  const k = 1.5;
  const setup = { atlas: atlas as unknown as AtlasData, background: null, k, screenW: 640 * k, screenH: 360 * k };
  const frames: { label: string; heroX: number; heroY: number; camX: number; ops: number[] }[] = [];
  const dump = () => frames.push({ label: '', heroX: w.hero.x, heroY: w.hero.y, camX: w.camX, ops: buildFrame(w, setup).data });
  for (let i = 0; i < 20; i++) stepWorld(w, NO_INPUT, STEP);
  // Force the present to be Mega Pup for the clip, then Ball Mouth once it wears off.
  let f = 0;
  while (f < 330) {
    const h = w.hero;
    if (f === 25) h.powers = { ...h.powers, mega: 3.2, megaAge: 0 };
    if (f === 230) h.powers = { ...h.powers, ball: 6 };
    const bark = f === 250 || f === 290;
    stepWorld(w, bark ? { ...NO_INPUT, barkPressed: true } : NO_INPUT, STEP);
    dump();
    f++;
  }
  writeFileSync(OUT!, JSON.stringify({ k, frames }));
});

/** Set DUMP_FEEL=1 to dump the slide, zoomies, stomp and bark moments every 50 ms. */
const FEEL = !!process.env.DUMP_FEEL;

(OUT && FEEL ? it : it.skip)('dumps feel moments', () => {
  const level = { ...CHAPTER_1, floorSegments: [[-600, 20000]] as [number, number][], platforms: [], enemies: [{ type: 'runner' as const, x: 900, speed: 0 }], pickups: [], cages: [], checkpoints: [], callouts: [], decor: [], boss: undefined };
  const w = createWorld(level, 640);
  const k = 1.5;
  const setup = { atlas: atlas as unknown as AtlasData, background: null, k, screenW: 640 * k, screenH: 360 * k };
  const frames: { label: string; heroX: number; heroY: number; camX: number; ops: number[] }[] = [];
  const dump = (label: string) => frames.push({ label, heroX: w.hero.x, heroY: w.hero.y, camX: w.camX, ops: buildFrame(w, setup).data });
  for (let i = 0; i < 30; i++) stepWorld(w, NO_INPUT, STEP);
  stepWorld(w, { ...NO_INPUT, slidePressed: true }, STEP);
  for (let f = 0; f < 24; f++) {
    for (let j = 0; j < 3; j++) stepWorld(w, NO_INPUT, STEP);
    dump(`slide ${(f + 1) * 50}ms boost=${w.hero.boost.toFixed(2)} vx=${w.hero.vx.toFixed(0)}`);
  }
  // Jump onto the squirrel at 900.
  while (w.hero.x < 790) stepWorld(w, NO_INPUT, STEP);
  stepWorld(w, { ...NO_INPUT, jumpPressed: true, jumpHeld: true }, STEP);
  for (let f = 0; f < 16; f++) {
    for (let j = 0; j < 3; j++) stepWorld(w, f < 3 ? { ...NO_INPUT, jumpHeld: true } : NO_INPUT, STEP);
    dump(`stomp ${(f + 1) * 50}ms hs=${w.hitstop.toFixed(2)} e=${w.enemies[0]?.state}`);
  }
  stepWorld(w, { ...NO_INPUT, barkPressed: true }, STEP);
  for (let f = 0; f < 8; f++) {
    for (let j = 0; j < 3; j++) stepWorld(w, NO_INPUT, STEP);
    dump(`bark ${(f + 1) * 50}ms`);
  }
  writeFileSync(OUT!, JSON.stringify({ k, frames }));
});

/** Set DUMP_WARN=1 to dump a thrower winding up and lobbing with its landing mark, then a runner hopping in. */
const WARN_CLIP = !!process.env.DUMP_WARN;

(OUT && WARN_CLIP ? it : it.skip)('dumps enemy warnings', () => {
  const level = {
    ...CHAPTER_1,
    floorSegments: [[-600, 20000]] as [number, number][],
    platforms: [{ sprite: 'bookshelf' as const, x: 900 }],
    enemies: [
      { type: 'thrower' as const, x: 950, y: 168, every: 1.8 },
      { type: 'runner' as const, x: 1900 },
    ],
    pickups: [],
    cages: [],
    checkpoints: [],
    callouts: [],
    decor: [],
    boss: undefined,
  };
  const w = createWorld(level, 780);
  const k = 1.2;
  const setup = { atlas: atlas as unknown as AtlasData, background: null, k, screenW: 780 * k, screenH: 360 * k };
  const frames: { label: string; heroX: number; heroY: number; camX: number; ops: number[] }[] = [];
  const dump = (label: string) => frames.push({ label, heroX: w.hero.x, heroY: w.hero.y, camX: w.camX, ops: buildFrame(w, setup).data });
  // Every 100 ms from the moment the thrower comes into view until the runner has charged.
  while (w.enemies[0].x - w.hero.x > 600) stepWorld(w, NO_INPUT, STEP);
  for (let f = 0; f < 60; f++) {
    for (let j = 0; j < 6; j++) stepWorld(w, NO_INPUT, STEP);
    const e = w.enemies[0];
    const r = w.enemies[1];
    const a = w.acorns[0];
    dump(`${(f + 1) * 100}ms thrower dx=${(e.x - w.hero.x).toFixed(0)} windup=${e.windup.toFixed(2)}${a ? ` acorn dx=${(a.x - w.hero.x).toFixed(0)} landT=${a.landT.toFixed(2)}` : ''} runner dx=${(r.x - w.hero.x).toFixed(0)} awake=${r.awake}`);
  }
  writeFileSync(OUT!, JSON.stringify({ k, frames }));
});

(OUT && !CLIP && !FEEL && !POWERCLIP && !WARN_CLIP ? it : it.skip)('dumps frames', () => {
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
