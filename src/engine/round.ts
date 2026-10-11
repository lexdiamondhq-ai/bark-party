import { CoachId, WorldId } from './cast';
import { MICROGAMES, MicrogameId } from './microgames';
import { TIMING, playMs } from './pacing';

/** Everything the screens need to run one round. */
export interface RoundPlan {
  /** 1-based count of rounds (solo) or turns (party). */
  number: number;
  gameId: MicrogameId;
  command: string;
  hint: string;
  coach: CoachId;
  world: WorldId;
  speed: number;
  difficulty: number;
  boss: boolean;
  /** Show the FASTER! beat before the command card. */
  speedUp: boolean;
  /** Party only: whose turn it is. */
  playerId: string | null;
  phases: RoundPhases;
}

export interface RoundPhases {
  /** 0 in solo: solo play skips the handoff. */
  handoffMs: number;
  commandMs: number;
  playMs: number;
  verdictWinMs: number;
  verdictLoseMs: number;
}

export function buildPlan(args: {
  number: number;
  gameId: MicrogameId;
  speed: number;
  difficulty: number;
  speedUp: boolean;
  playerId: string | null;
}): RoundPlan {
  const g = MICROGAMES[args.gameId];
  return {
    number: args.number,
    gameId: g.id,
    command: g.command,
    hint: g.hint,
    coach: g.coach,
    world: g.world,
    speed: args.speed,
    difficulty: args.difficulty,
    boss: g.boss,
    speedUp: args.speedUp,
    playerId: args.playerId,
    phases: {
      handoffMs: args.playerId ? TIMING.handoffHoldMs : 0,
      commandMs: TIMING.commandCardMs,
      playMs: playMs(g.basePlayMs, args.speed),
      verdictWinMs: TIMING.verdictWinMs,
      verdictLoseMs: TIMING.verdictLoseMs,
    },
  };
}

/** Total round length for a result, used to check the "about five seconds a round" target. */
export function roundLengthMs(plan: RoundPlan, won: boolean): number {
  const p = plan.phases;
  return p.handoffMs + p.commandMs + p.playMs + (won ? p.verdictWinMs : p.verdictLoseMs);
}
