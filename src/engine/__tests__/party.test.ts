import { PLAYER_SLOTS } from '../cast';
import {
  addPlayer, canStart, emptyLobby, Lobby, nextFreeSlot, PartyState, planPartyTurn, rematch,
  removePlayer, resolvePartyTurn, standings, startParty, suggestedPup,
} from '../party';
import { seededRng } from '../rng';

function lobbyOf(...names: string[]): Lobby {
  return names.reduce((l, n) => addPlayer(l, n), emptyLobby);
}

function turn(state: PartyState, won: boolean) {
  const { plan, state: s } = planPartyTurn(state, seededRng(state.turn));
  return { plan, state: resolvePartyTurn(s, plan, won) };
}

describe('party lobby', () => {
  it('gives each new player the next free color and shape', () => {
    const l = lobbyOf('Ana', 'Ben', 'Cy');
    expect(l.players.map((p) => PLAYER_SLOTS[p.slot].shape)).toEqual(['star', 'heart', 'drop']);
  });

  it('reuses a freed slot for the next player', () => {
    let l = lobbyOf('Ana', 'Ben', 'Cy');
    l = removePlayer(l, l.players[1].id);
    expect(nextFreeSlot(l)).toBe(1);
    l = addPlayer(l, 'Dee');
    expect(l.players.find((p) => p.name === 'Dee')!.slot).toBe(1);
    expect(new Set(l.players.map((p) => p.id)).size).toBe(3);
  });

  it('suggests a pup nobody has picked and names blank players after their pup', () => {
    const l = addPlayer(addPlayer(emptyLobby, 'Ana'), '   ');
    expect(l.players.map((p) => p.pup)).toEqual(['biscuit', 'pepper']);
    expect(l.players[1].name).toBe('Pepper');
    expect(suggestedPup(l)).toBe('nacho');
  });

  it('holds 2 to 6 players', () => {
    expect(canStart(lobbyOf('Ana'))).toBe(false);
    expect(canStart(lobbyOf('Ana', 'Ben'))).toBe(true);
    const six = lobbyOf('a', 'b', 'c', 'd', 'e', 'f');
    expect(canStart(six)).toBe(true);
    expect(() => addPlayer(six, 'g')).toThrow('full');
    expect(() => startParty(lobbyOf('Ana'))).toThrow();
  });
});

describe('party game', () => {
  it('gives everyone 3 balls and starts with player 1 holding the handoff', () => {
    const s = startParty(lobbyOf('Ana', 'Ben', 'Cy'));
    expect(s.players.every((p) => p.balls === 3)).toBe(true);
    const { plan } = planPartyTurn(s, seededRng(1));
    expect(plan.playerId).toBe(s.players[0].id);
    expect(plan.phases.handoffMs).toBe(700);
    expect(plan.boss).toBe(false);
  });

  it('never deals the boss in party mode', () => {
    let s = startParty(lobbyOf('Ana', 'Ben'));
    for (let i = 0; i < 60; i++) {
      const r = turn(s, true);
      expect(r.plan.gameId).not.toBe('squirrel');
      s = r.state;
    }
  });

  it('passes the phone in seat order and speeds up each trip round the table', () => {
    let s = startParty(lobbyOf('Ana', 'Ben', 'Cy'));
    const speeds: number[] = [];
    const seats: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = turn(s, true);
      speeds.push(r.plan.speed);
      seats.push(s.seat);
      s = r.state;
    }
    expect(seats).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(speeds).toEqual([1, 1, 1, 1.15, 1.15, 1.15, 1.3]);
  });

  it('skips players who are out and ends when one dog is left', () => {
    let s = startParty(lobbyOf('Ana', 'Ben', 'Cy'));
    // Ben loses every turn; Ana and Cy win.
    const seatsPlayed: string[] = [];
    while (!s.over) {
      const who = s.players[s.seat].name;
      seatsPlayed.push(who);
      s = turn(s, who !== 'Ben' && !(who === 'Cy' && seatsPlayed.length > 9)).state;
    }
    expect(seatsPlayed.slice(0, 9)).toEqual(['Ana', 'Ben', 'Cy', 'Ana', 'Ben', 'Cy', 'Ana', 'Ben', 'Cy']);
    // After Ben is out on turn 8, the order is Ana, Cy, Ana, Cy...
    expect(seatsPlayed.slice(9)).toEqual(['Ana', 'Cy', 'Ana', 'Cy', 'Ana', 'Cy']);
    const ranked = standings(s);
    expect(ranked.map((p) => p.name)).toEqual(['Ana', 'Cy', 'Ben']);
    expect(ranked[0].outOnTurn).toBeNull();
    expect(() => planPartyTurn(s, seededRng(1))).toThrow('over');
  });

  it('rematch keeps players, colors and pups and resets balls', () => {
    let s = startParty(lobbyOf('Ana', 'Ben'));
    s = turn(s, false).state;
    const again = rematch(s);
    expect(again.players.map(({ id, name, pup, slot, balls, wins }) => ({ id, name, pup, slot, balls, wins }))).toEqual(
      s.players.map(({ id, name, pup, slot }) => ({ id, name, pup, slot, balls: 3, wins: 0 })),
    );
    expect(again).toMatchObject({ turn: 1, seat: 0, rotation: 0, over: false });
  });

  it('breaks a tie on elimination turn by games won', () => {
    let s = startParty(lobbyOf('Ana', 'Ben', 'Cy'));
    s = {
      ...s,
      over: true,
      players: s.players.map((p, i) =>
        i === 0 ? { ...p, balls: 2 } : { ...p, balls: 0, outOnTurn: 5, wins: i === 2 ? 4 : 1 },
      ),
    };
    expect(standings(s).map((p) => p.name)).toEqual(['Ana', 'Cy', 'Ben']);
  });
});
