import { buy, buyGear, canBuy, canBuyGear, emptyProgress, hasGear, isChapterOpen, nextChapter, nextCost, parseProgress, recordRun, runBoosts, type RunOutcome } from '../progress';

const run = (over: Partial<RunOutcome> = {}): RunOutcome => ({
  chapterId: 'ch1',
  finished: true,
  stars: 2,
  bones: 30,
  bonesTotal: 45,
  goldBones: 1,
  goldTotal: 3,
  rescued: 2,
  rescueTotal: 3,
  time: 95,
  ...over,
});

describe('recording runs', () => {
  it('banks bones and keeps the best of everything', () => {
    let p = recordRun(emptyProgress(), run());
    p = recordRun(p, run({ stars: 1, bones: 10, goldBones: 2, rescued: 1, time: 120 }));
    const c = p.chapters.ch1;
    expect(p.bones).toBe(40);
    expect(c.stars).toBe(2);
    expect(c.bestBones).toBe(30);
    expect(c.goldBones).toBe(2);
    expect(c.rescued).toBe(2);
    expect(c.bestTime).toBe(95);
    expect(c.runs).toBe(2);
  });

  it('an unfinished run still banks bones but earns no stars or time', () => {
    const p = recordRun(emptyProgress(), run({ finished: false, stars: 0, bones: 12 }));
    expect(p.bones).toBe(12);
    expect(p.chapters.ch1.stars).toBe(0);
    expect(p.chapters.ch1.bestTime).toBeNull();
  });
});

describe('chapters', () => {
  const ids = ['ch1', 'ch2', 'ch3'];
  it('opens one chapter at a time', () => {
    const p0 = emptyProgress();
    expect(isChapterOpen(p0, ids, 'ch1')).toBe(true);
    expect(isChapterOpen(p0, ids, 'ch2')).toBe(false);
    const p1 = recordRun(p0, run());
    expect(isChapterOpen(p1, ids, 'ch2')).toBe(true);
    expect(isChapterOpen(p1, ids, 'ch3')).toBe(false);
    expect(isChapterOpen(p1, ids, 'nope')).toBe(false);
  });

  it('points at the next unfinished chapter', () => {
    expect(nextChapter(emptyProgress(), ids)).toBe('ch1');
    const p = recordRun(recordRun(emptyProgress(), run()), run({ chapterId: 'ch2' }));
    expect(nextChapter(p, ids)).toBe('ch3');
    expect(nextChapter(recordRun(p, run({ chapterId: 'ch3' })), ids)).toBe('ch3');
  });
});

describe('treats', () => {
  it('cost bones, level up and max out', () => {
    let p = { ...emptyProgress(), bones: 100 };
    expect(nextCost(p, 'bark')).toBe(30);
    expect(canBuy(p, 'bark')).toBe(true);
    p = buy(p, 'bark');
    expect(p.bones).toBe(70);
    expect(nextCost(p, 'bark')).toBe(70);
    p = buy(p, 'bark');
    expect(p.bones).toBe(0);
    expect(nextCost(p, 'bark')).toBeNull();
    expect(canBuy(p, 'bark')).toBe(false);
    expect(buy(p, 'heart')).toBe(p);
  });

  it('turn into run boosts', () => {
    const p = { ...emptyProgress(), upgrades: { heart: 1, magnet: 2, jump: 1 } };
    expect(runBoosts(p)).toEqual({ extraHearts: 1, barkRangeBonus: 0, magnetRange: 120, doubleJumpBonus: 90 });
  });
});

describe('party gear', () => {
  it('is bought once and stays', () => {
    let p = { ...emptyProgress(), bones: 50 };
    expect(canBuyGear(p, 'balloons')).toBe(true);
    expect(canBuyGear(p, 'arch')).toBe(false);
    p = buyGear(p, 'balloons');
    expect(p.bones).toBe(30);
    expect(hasGear(p, 'balloons')).toBe(true);
    expect(buyGear(p, 'balloons')).toBe(p);
    expect(parseProgress(JSON.parse(JSON.stringify(p))).gear).toEqual(['balloons']);
    expect(parseProgress({ gear: ['cake', 'nope', 3] }).gear).toEqual(['cake']);
  });
});

describe('loading saved data', () => {
  it('survives garbage and clamps what it can', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('x')).toEqual(emptyProgress());
    const p = parseProgress({ bones: -5, chapters: { ch1: { stars: 9, bestTime: 0 }, bad: null }, upgrades: { bark: 7, nope: 1 } });
    expect(p.bones).toBe(0);
    expect(p.chapters.ch1.stars).toBe(3);
    expect(p.chapters.ch1.bestTime).toBeNull();
    expect(p.chapters.bad).toBeUndefined();
    expect(p.upgrades).toEqual({ bark: 2 });
  });

  it('round-trips through JSON', () => {
    const p = buy(recordRun({ ...emptyProgress(), bones: 50 }, run()), 'bark');
    expect(parseProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});
