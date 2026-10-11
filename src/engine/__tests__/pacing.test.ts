import { isSoloSpeedUp, partySpeed, playMs, soloDifficulty, soloSpeed, TIMING } from '../pacing';
import { squashWidth } from '../../theme/tokens';

describe('solo speed', () => {
  it('holds 1x for rounds 1 to 4 and steps up 0.1x every 4th round', () => {
    expect([1, 2, 3, 4].map(soloSpeed)).toEqual([1, 1, 1, 1]);
    expect(soloSpeed(5)).toBe(1.1);
    expect(soloSpeed(9)).toBe(1.2);
  });
  it('caps at 2x from round 41', () => {
    expect(soloSpeed(40)).toBe(1.9);
    expect(soloSpeed(41)).toBe(2);
    expect(soloSpeed(500)).toBe(2);
  });
  it('flags the first round of each new step as a speed-up', () => {
    const ups = Array.from({ length: 13 }, (_, i) => i + 1).filter(isSoloSpeedUp);
    expect(ups).toEqual([5, 9, 13]);
    expect(isSoloSpeedUp(45)).toBe(false); // already capped
  });
  it('rejects round 0', () => {
    expect(() => soloSpeed(0)).toThrow(RangeError);
  });
});

describe('play time', () => {
  it('is 3,000 ms at 1x and 1,500 ms at 2x', () => {
    expect(playMs(3000, 1)).toBe(3000);
    expect(playMs(3000, 2)).toBe(1500);
    expect(playMs(3000, 1.5)).toBe(2000);
  });
  it('never drops under 1,500 ms', () => {
    expect(playMs(3000, 5)).toBe(TIMING.minPlayMs);
  });
});

describe('party speed and difficulty', () => {
  it('adds 0.15x per trip round the table, capped at 2x', () => {
    expect(partySpeed(0)).toBe(1);
    expect(partySpeed(2)).toBe(1.3);
    expect(partySpeed(7)).toBe(2);
  });
  it('solo difficulty ramps from 0 to 1 over 17 rounds', () => {
    expect(soloDifficulty(1)).toBe(0);
    expect(soloDifficulty(17)).toBe(1);
    expect(soloDifficulty(99)).toBe(1);
  });
});

describe('squash keeps volume', () => {
  it('width = 1 / sqrt(height)', () => {
    expect(squashWidth(1)).toBe(1);
    expect(squashWidth(0.64)).toBeCloseTo(1.25);
    expect(squashWidth(0.64) ** 2 * 0.64).toBeCloseTo(1);
  });
});
