import { Deck, drawGame, emptyDeck } from './deck';
import { BOSS_ID, MICROGAMES } from './microgames';
import { isSoloSpeedUp, soloDifficulty, soloSpeed } from './pacing';
import { Rng } from './rng';
import { RoundPlan, buildPlan } from './round';

export const SOLO_BALLS = 4;
/** Every 10th solo round is the Squirrel boss. */
export const BOSS_EVERY = 10;

export interface SoloState {
  readonly mode: 'solo';
  readonly round: number;
  readonly balls: number;
  /** Games cleared. */
  readonly score: number;
  readonly topSpeed: number;
  readonly deck: Deck;
  readonly lastWon: boolean | null;
  readonly over: boolean;
}

export function startSolo(): SoloState {
  return { mode: 'solo', round: 1, balls: SOLO_BALLS, score: 0, topSpeed: 1, deck: emptyDeck, lastWon: null, over: false };
}

export function isBossRound(round: number): boolean {
  return round % BOSS_EVERY === 0;
}

/** Picks the next microgame. Returns the plan and the state with the deck advanced. */
export function planSoloRound(state: SoloState, rng: Rng): { plan: RoundPlan; state: SoloState } {
  if (state.over) throw new Error('solo run is over');
  let deck = state.deck;
  let gameId = BOSS_ID;
  if (!isBossRound(state.round)) {
    const drawn = drawGame(deck, rng);
    gameId = drawn.id;
    deck = drawn.deck;
  }
  const plan = buildPlan({
    number: state.round,
    gameId,
    speed: soloSpeed(state.round),
    difficulty: soloDifficulty(state.round),
    speedUp: isSoloSpeedUp(state.round),
    playerId: null,
  });
  return { plan, state: { ...state, deck } };
}

/** Applies a round's result. A win clears a game; beating the boss wins a ball back (never above 4). */
export function resolveSoloRound(state: SoloState, plan: RoundPlan, won: boolean): SoloState {
  if (state.over) throw new Error('solo run is over');
  if (plan.number !== state.round) throw new Error(`plan is for round ${plan.number}, run is on ${state.round}`);
  const boss = MICROGAMES[plan.gameId].boss;
  const balls = won ? (boss ? Math.min(SOLO_BALLS, state.balls + 1) : state.balls) : state.balls - 1;
  const over = balls <= 0;
  return {
    ...state,
    balls,
    score: state.score + (won ? 1 : 0),
    topSpeed: Math.max(state.topSpeed, plan.speed),
    lastWon: won,
    over,
    round: over ? state.round : state.round + 1,
  };
}
