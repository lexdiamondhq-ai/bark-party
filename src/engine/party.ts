import { PLAYER_SLOTS, PUPS, PupId } from './cast';
import { Deck, drawGame, emptyDeck } from './deck';
import { partyDifficulty, partySpeed } from './pacing';
import { Rng } from './rng';
import { RoundPlan, buildPlan } from './round';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const PARTY_BALLS = 3;

/* ---------- lobby ---------- */

export interface LobbyPlayer {
  readonly id: string;
  readonly name: string;
  readonly pup: PupId;
  /** Index into PLAYER_SLOTS: fixes the player's color and shape. */
  readonly slot: number;
}

export interface Lobby {
  readonly players: readonly LobbyPlayer[];
  /** Grows with every add so ids never repeat inside a lobby. */
  readonly nextId: number;
}

export const emptyLobby: Lobby = { players: [], nextId: 1 };

/** Lowest color-and-shape slot nobody holds. */
export function nextFreeSlot(lobby: Lobby): number | null {
  const taken = new Set(lobby.players.map((p) => p.slot));
  const free = PLAYER_SLOTS.find((s) => !taken.has(s.index));
  return free ? free.index : null;
}

/** First pup nobody picked yet, so the default is always a different dog. */
export function suggestedPup(lobby: Lobby): PupId {
  const taken = new Set(lobby.players.map((p) => p.pup));
  return (PUPS.find((p) => !taken.has(p.id)) ?? PUPS[0]).id;
}

/** Adds a player with the next free color and shape. An empty name falls back to the pup's name. */
export function addPlayer(lobby: Lobby, name: string, pup: PupId = suggestedPup(lobby)): Lobby {
  const slot = nextFreeSlot(lobby);
  if (slot === null || lobby.players.length >= MAX_PLAYERS) throw new Error('lobby is full');
  const trimmed = name.trim();
  const player: LobbyPlayer = {
    id: `p${lobby.nextId}`,
    name: trimmed || PUPS.find((p) => p.id === pup)!.name,
    pup,
    slot,
  };
  return { players: [...lobby.players, player], nextId: lobby.nextId + 1 };
}

export function removePlayer(lobby: Lobby, id: string): Lobby {
  return { ...lobby, players: lobby.players.filter((p) => p.id !== id) };
}

export function renamePlayer(lobby: Lobby, id: string, name: string): Lobby {
  return { ...lobby, players: lobby.players.map((p) => (p.id === id && name.trim() ? { ...p, name: name.trim() } : p)) };
}

export function setPup(lobby: Lobby, id: string, pup: PupId): Lobby {
  return { ...lobby, players: lobby.players.map((p) => (p.id === id ? { ...p, pup } : p)) };
}

export function canStart(lobby: Lobby): boolean {
  return lobby.players.length >= MIN_PLAYERS && lobby.players.length <= MAX_PLAYERS;
}

/* ---------- the game ---------- */

export interface PartyPlayer extends LobbyPlayer {
  readonly balls: number;
  readonly wins: number;
  /** Turn number on which the player lost their last ball; null while still in. */
  readonly outOnTurn: number | null;
}

export interface PartyState {
  readonly mode: 'party';
  readonly players: readonly PartyPlayer[];
  /** Index into players of whose turn it is. */
  readonly seat: number;
  /** 1-based turn count across everyone. */
  readonly turn: number;
  /** Completed trips round the table. */
  readonly rotation: number;
  readonly deck: Deck;
  readonly lastWon: boolean | null;
  readonly over: boolean;
}

export function startParty(lobby: Lobby): PartyState {
  if (!canStart(lobby)) throw new Error(`party needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
  return {
    mode: 'party',
    players: lobby.players.map((p) => ({ ...p, balls: PARTY_BALLS, wins: 0, outOnTurn: null })),
    seat: 0,
    turn: 1,
    rotation: 0,
    deck: emptyDeck,
    lastWon: null,
    over: false,
  };
}

/** Rematch keeps the same players, colors and pups. */
export function rematch(state: PartyState): PartyState {
  return startParty({ players: state.players.map(({ id, name, pup, slot }) => ({ id, name, pup, slot })), nextId: 0 });
}

export function alivePlayers(state: PartyState): PartyPlayer[] {
  return state.players.filter((p) => p.balls > 0);
}

/** No boss in party mode. */
export function planPartyTurn(state: PartyState, rng: Rng): { plan: RoundPlan; state: PartyState } {
  if (state.over) throw new Error('party is over');
  const drawn = drawGame(state.deck, rng);
  const plan = buildPlan({
    number: state.turn,
    gameId: drawn.id,
    speed: partySpeed(state.rotation),
    difficulty: partyDifficulty(state.rotation),
    speedUp: false,
    playerId: state.players[state.seat].id,
  });
  return { plan, state: { ...state, deck: drawn.deck } };
}

export function resolvePartyTurn(state: PartyState, plan: RoundPlan, won: boolean): PartyState {
  if (state.over) throw new Error('party is over');
  const current = state.players[state.seat];
  if (plan.playerId !== current.id || plan.number !== state.turn) throw new Error('plan does not match this turn');

  const players = state.players.map((p, i) => {
    if (i !== state.seat) return p;
    const balls = won ? p.balls : p.balls - 1;
    return { ...p, balls, wins: p.wins + (won ? 1 : 0), outOnTurn: balls <= 0 ? state.turn : null };
  });
  const alive = players.filter((p) => p.balls > 0).length;
  if (alive <= 1) return { ...state, players, lastWon: won, over: true };

  // Next seat that still has a ball. Passing seat 0 means a full trip round the table.
  let seat = state.seat;
  let wrapped = false;
  do {
    seat = (seat + 1) % players.length;
    if (seat === 0) wrapped = true;
  } while (players[seat].balls <= 0);

  return {
    ...state,
    players,
    seat,
    turn: state.turn + 1,
    rotation: state.rotation + (wrapped ? 1 : 0),
    lastWon: won,
  };
}

/**
 * Results order: the last dog standing first, then by how long each player lasted,
 * then by games won, then by seat.
 */
export function standings(state: PartyState): PartyPlayer[] {
  const seatOf = new Map(state.players.map((p, i) => [p.id, i]));
  const lasted = (p: PartyPlayer) => (p.outOnTurn === null ? Infinity : p.outOnTurn);
  return state.players.slice().sort(
    (a, b) => lasted(b) - lasted(a) || b.wins - a.wins || seatOf.get(a.id)! - seatOf.get(b.id)!,
  );
}
