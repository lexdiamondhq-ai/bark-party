// Offline clips of the moments the glitch probe watches: every respawn, hit-stop, the first thrower, the cat,
// the vacuum, each rescue, the boss's entrance, each boss hit and the cake. Writes one JSON per chapter with the
// draw ops of every step around each moment (the same ops the phone draws), for a script to composite.
// GLITCH_CLIPS=/some/dir npx jest glitchClips   (skipped otherwise)
import { writeFileSync } from 'fs';

import { CHAPTER_1 } from '../../level/chapter1';
import { CHAPTER_2 } from '../../level/chapter2';
import type { LevelDef } from '../../level/types';
import { PHYS } from '../../constants';
import { buildFrame, type AtlasData } from '../../render/buildFrame';
import atlas from '../../render/atlas.json';
import type { GameEvent, World } from '../types';
import { PHONE_VIEW_W, probe } from './glitchProbe';

const DIR = process.env.GLITCH_CLIPS;
const K = 1.2;
const BEFORE = 8;
const AFTER = 40;

interface Moment {
  name: string;
  frames: { label: string; ops: number[] }[];
}

function record(level: LevelDef, policy: string, seed: number, retries: number, file: string, only?: (name: string) => boolean) {
  const setup = { atlas: atlas as unknown as AtlasData, background: null, k: K, screenW: PHONE_VIEW_W * K, screenH: 360 * K };
  const ring: { label: string; ops: number[] }[] = [];
  const moments: Moment[] = [];
  const open: { m: Moment; left: number }[] = [];
  const seen = new Set<string>();
  let lastHitstop = 0;
  let lastPhase = 'run';
  let bossHits = 0;
  const trigger = (name: string, once = true, after = AFTER) => {
    if (once && seen.has(name)) return;
    if (only && !only(name)) return;
    seen.add(name);
    const m: Moment = { name: `${level.id} ${policy}${seed} ${name}`, frames: [...ring] };
    moments.push(m);
    open.push({ m, left: after });
  };
  probe(level, policy, {
    seed,
    retries,
    onStep: (w: World, events: GameEvent[]) => {
      const h = w.hero;
      const label = `t=${w.t.toFixed(2)} ${w.phase}${w.phase === 'respawn' ? ' ' + w.phaseT.toFixed(2) : ''} hs=${w.hitstop.toFixed(2)} x=${h.x.toFixed(0)} y=${h.y.toFixed(0)} ${h.pose}${h.invuln > 0 ? ' inv' : ''}`;
      const frame = { label, ops: buildFrame(w, setup).data.slice() };
      for (const o of open) {
        o.m.frames.push(frame);
        o.left--;
      }
      while (open.length && open[0].left <= 0) open.shift();
      ring.push(frame);
      if (ring.length > BEFORE) ring.shift();

      if (w.phase === 'respawn' && lastPhase !== 'respawn') trigger(`respawn@${Math.round(h.x)}`, false, 90);
      if (level.id === 'ch1' && h.x > 2700 && h.x < 2720) trigger('stacked boxes');
      if (w.hitstop > 0 && lastHitstop <= 0) trigger(`hitstop ${w.shakeKind}`, true);
      lastHitstop = w.hitstop;
      lastPhase = w.phase;
      for (const e of w.enemies) {
        if (e.type === 'thrower' && e.windup > 0) trigger('first thrower');
        if (e.type === 'cat' && e.awake) trigger('cat');
        if (e.type === 'vacuum' && Math.abs(e.x - h.x) < 120) trigger('vacuum');
        if (e.type === 'runner' && e.awake && Math.abs(e.t - 0.017) < 0.001) trigger(`runner hop@${e.x}`, true);
      }
      if (h.vy === PHYS.stompBounce * 1.25) trigger('vacuum bounce', false);
      for (const e of events) {
        if (e.type === 'rescue') trigger(`rescue ${e.dog}`);
        if (e.type === 'boss_start') trigger('boss intro', false);
        if (e.type === 'boss_hit') trigger(`boss hit ${++bossHits}`, false);
        if (e.type === 'boss_defeated') trigger('cake', false);
        if (e.type === 'power') trigger(`power ${e.kind}`);
        if (e.type === 'gameover') trigger('gameover', false, 60);
      }
    },
  });
  writeFileSync(`${DIR}/${file}.json`, JSON.stringify({ k: K, screenW: setup.screenW, screenH: setup.screenH, moments }));
}

(DIR ? it : it.skip)('dumps the moments a player sees', () => {
  record(CHAPTER_1, 'autopilot', 7, 0, 'ch1_autopilot');
  record(CHAPTER_2, 'autopilot', 7, 0, 'ch2_autopilot');
  // Respawns, retries and the boss retry.
  record(CHAPTER_1, 'diesToBoss', 1, 1, 'ch1_bossretry', (n) => n.startsWith('gameover') || n.startsWith('boss') || n.startsWith('respawn'));
  record(CHAPTER_1, 'random', 3, 3, 'ch1_random3', (n) => n.startsWith('respawn') || n.startsWith('gameover') || n.startsWith('vacuum bounce'));
});
