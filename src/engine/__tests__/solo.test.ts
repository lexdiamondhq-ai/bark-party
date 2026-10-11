import { seededRng } from '../rng';
import { roundLengthMs } from '../round';
import { planSoloRound, resolveSoloRound, SoloState, startSolo, SOLO_BALLS } from '../solo';

function play(state: SoloState, won: boolean, seed = 1) {
  const { plan, state: s } = planSoloRound(state, seededRng(seed + state.round));
  return { plan, state: resolveSoloRound(s, plan, won) };
}

describe('solo run', () => {
  it('starts with 4 balls on round 1', () => {
    expect(startSolo()).toMatchObject({ round: 1, balls: 4, score: 0, over: false });
  });

  it('skips the handoff and runs the guide timings at 1x', () => {
    const { plan } = planSoloRound(startSolo(), seededRng(1));
    expect(plan.phases).toEqual({ handoffMs: 0, commandMs: 800, playMs: 3000, verdictWinMs: 900, verdictLoseMs: 700 });
    expect(plan.playerId).toBeNull();
    // About five seconds a round: 800 + 3000 + 700..900.
    expect(roundLengthMs(plan, false)).toBe(4500);
    expect(roundLengthMs(plan, true)).toBe(4700);
  });

  it('a win scores, a loss costs a ball, and four losses end the run', () => {
    let s = startSolo();
    s = play(s, true).state;
    expect(s).toMatchObject({ round: 2, score: 1, balls: 4 });
    for (let i = 0; i < 3; i++) s = play(s, false).state;
    expect(s).toMatchObject({ balls: 1, over: false });
    s = play(s, false).state;
    expect(s).toMatchObject({ balls: 0, over: true, round: 5, score: 1 });
    expect(() => planSoloRound(s, seededRng(1))).toThrow('over');
  });

  it('sends the Squirrel boss every 10th round and nowhere else', () => {
    let s = startSolo();
    const bossRounds: number[] = [];
    for (let i = 0; i < 30; i++) {
      const r = play(s, true);
      if (r.plan.boss) bossRounds.push(r.plan.number);
      s = r.state;
    }
    expect(bossRounds).toEqual([10, 20, 30]);
  });

  it('beating the boss wins a ball back, never above 4', () => {
    let s: SoloState = { ...startSolo(), round: 10, balls: 2 };
    s = play(s, true).state;
    expect(s.balls).toBe(3);
    s = { ...s, round: 20, balls: SOLO_BALLS };
    s = play(s, true).state;
    expect(s.balls).toBe(SOLO_BALLS);
  });

  it('losing to the boss costs a ball like any round', () => {
    const s = play({ ...startSolo(), round: 10, balls: 2 }, false).state;
    expect(s.balls).toBe(1);
  });

  it('records top speed and flags speed-ups', () => {
    let s = startSolo();
    const ups: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = play(s, true);
      if (r.plan.speedUp) ups.push(r.plan.number);
      s = r.state;
    }
    expect(ups).toEqual([5, 9]);
    expect(s.topSpeed).toBe(1.2);
  });

  it('refuses a plan from another round', () => {
    const { plan } = planSoloRound(startSolo(), seededRng(1));
    expect(() => resolveSoloRound({ ...startSolo(), round: 3 }, plan, true)).toThrow();
  });
});
