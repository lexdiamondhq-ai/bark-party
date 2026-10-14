// A simple autopilot that plays a chapter the way a decent player would: barks at what is in reach,
// jumps pits, solid boxes, hazards and steps, double jumps over tall furniture. Shared by the level
// tests and the pacing probe, so a level change that breaks a section shows up in both.
import { groundBelow } from '../world';
import { NO_INPUT, type Input, type World } from '../types';

export const PRESS: Input = { jumpPressed: true, jumpHeld: true, slidePressed: false, barkPressed: false };
export const HOLD: Input = { ...NO_INPUT, jumpHeld: true };

export function autopilot(w: World): Input {
  const h = w.hero;
  const look = (d: number) => groundBelow(w, h.x + d, 4, 9999);
  const bark = h.barkCooldown <= 0;
  // Bark at nearby acorns and squirrels at head height.
  for (const a of w.acorns) {
    const dx = a.x - h.x;
    if (!a.reflected && dx > -10 && dx < 170 && Math.abs(a.y - h.y) < 160 && bark) return { ...NO_INPUT, barkPressed: true, jumpHeld: true };
  }
  for (const e of w.enemies) {
    if (e.state !== 'active') continue;
    const dx = e.x - h.x;
    if ((e.type === 'runner' || e.type === 'thrower' || (e.type === 'cat' && e.awake)) && dx > 0 && dx < 150 && Math.abs(e.y - h.y) < 60 && bark)
      return { ...NO_INPUT, barkPressed: true, jumpHeld: true };
  }
  if (!h.onGround) {
    // Second jump if we are falling toward a pit.
    const below = look(40);
    if (h.vy < 0 && h.jumpsUsed === 1 && (below === null || below < h.y - 150)) return PRESS;
    // Second jump when a tall solid piece (the fridge) is still above us.
    const wall = w.platforms.some((p) => p.solid && p.x - h.x > -10 && p.x - h.x < 120 && p.top > h.y + 10);
    if (h.vy < 60 && h.jumpsUsed === 1 && wall) return PRESS;
    return HOLD;
  }
  // Jump for pits, solid boxes, vacuums, blocks and higher furniture.
  const pit = look(50) === null || look(90) === null;
  const solidAhead = w.platforms.some((p) => p.solid && p.x - h.x > 0 && p.x - h.x < 70 && p.top > h.y + 4 && p.y <= h.y + 4);
  const hazard = w.enemies.some(
    (e) => e.state === 'active' && (e.type === 'vacuum' || e.type === 'blocks') && e.x - h.x > 0 && e.x - h.x < 110 && Math.abs(e.y - h.y) < 30,
  );
  const step = w.platforms.some((p) => p.x - h.x > 10 && p.x - h.x < 60 && p.top > h.y + 10 && p.top < h.y + 130);
  if (pit || solidAhead || hazard || step) return PRESS;
  return HOLD;
}
