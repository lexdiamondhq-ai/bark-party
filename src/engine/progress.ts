// Saved progress rules: what a run adds, what unlocks, what bones buy. Pure, no storage, no React.

export const PROGRESS_VERSION = 1;

export interface ChapterRecord {
  /** Best star count, 0..3. 0 means never finished. */
  stars: number;
  bestBones: number;
  bonesTotal: number;
  /** Most golden bones found in one run, and how many the chapter has. */
  goldBones: number;
  goldTotal: number;
  rescued: number;
  rescueTotal: number;
  /** Fastest finish in seconds, or null if never finished. */
  bestTime: number | null;
  runs: number;
}

export type UpgradeId = 'heart' | 'bark' | 'magnet' | 'jump';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  blurb: string;
  /** Bone cost of each level, in order. */
  costs: number[];
}

/** Treats the pup can buy with bones. Each level makes a real difference in the run. */
export const UPGRADES: Upgrade[] = [
  { id: 'heart', name: 'Big Heart', blurb: 'One more heart every run.', costs: [40, 90] },
  { id: 'bark', name: 'Loud Bark', blurb: 'The bark reaches farther.', costs: [30, 70] },
  { id: 'magnet', name: 'Bone Sniffer', blurb: 'Bones nearby come to you.', costs: [35, 80] },
  { id: 'jump', name: 'Spring Legs', blurb: 'The double jump goes higher.', costs: [45] },
];

export interface Progress {
  version: number;
  /** Bones in the jar, spendable. */
  bones: number;
  /** Bones ever collected, for bragging. */
  bonesEver: number;
  chapters: Record<string, ChapterRecord>;
  upgrades: Partial<Record<UpgradeId, number>>;
}

export interface RunOutcome {
  chapterId: string;
  /** Finished the chapter (reached the arch or beat the boss). */
  finished: boolean;
  stars: number;
  bones: number;
  bonesTotal: number;
  goldBones: number;
  goldTotal: number;
  rescued: number;
  rescueTotal: number;
  time: number;
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, bones: 0, bonesEver: 0, chapters: {}, upgrades: {} };
}

function emptyRecord(): ChapterRecord {
  return { stars: 0, bestBones: 0, bonesTotal: 0, goldBones: 0, goldTotal: 0, rescued: 0, rescueTotal: 0, bestTime: null, runs: 0 };
}

export function chapterRecord(p: Progress, chapterId: string): ChapterRecord {
  return p.chapters[chapterId] ?? emptyRecord();
}

/** Adds a run: bones go in the jar whether or not the chapter was finished; records only improve. */
export function recordRun(p: Progress, run: RunOutcome): Progress {
  const prev = chapterRecord(p, run.chapterId);
  const next: ChapterRecord = {
    stars: run.finished ? Math.max(prev.stars, run.stars) : prev.stars,
    bestBones: Math.max(prev.bestBones, run.bones),
    bonesTotal: run.bonesTotal,
    goldBones: Math.max(prev.goldBones, run.goldBones),
    goldTotal: run.goldTotal,
    rescued: Math.max(prev.rescued, run.rescued),
    rescueTotal: run.rescueTotal,
    bestTime: run.finished ? (prev.bestTime === null ? run.time : Math.min(prev.bestTime, run.time)) : prev.bestTime,
    runs: prev.runs + 1,
  };
  return {
    ...p,
    bones: p.bones + run.bones,
    bonesEver: p.bonesEver + run.bones,
    chapters: { ...p.chapters, [run.chapterId]: next },
  };
}

/** Chapter 1 is always open; each later chapter opens when the one before is finished. */
export function isChapterOpen(p: Progress, chapterIds: string[], chapterId: string): boolean {
  const i = chapterIds.indexOf(chapterId);
  if (i <= 0) return i === 0;
  return chapterRecord(p, chapterIds[i - 1]).stars > 0;
}

/** The first chapter not yet finished, or the last one when all are done. */
export function nextChapter(p: Progress, chapterIds: string[]): string {
  for (const id of chapterIds) if (chapterRecord(p, id).stars === 0) return id;
  return chapterIds[chapterIds.length - 1];
}

export function upgradeLevel(p: Progress, id: UpgradeId): number {
  return p.upgrades[id] ?? 0;
}

/** Cost of the next level, or null when maxed out. */
export function nextCost(p: Progress, id: UpgradeId): number | null {
  const u = UPGRADES.find((x) => x.id === id)!;
  const level = upgradeLevel(p, id);
  return level < u.costs.length ? u.costs[level] : null;
}

export function canBuy(p: Progress, id: UpgradeId): boolean {
  const cost = nextCost(p, id);
  return cost !== null && p.bones >= cost;
}

export function buy(p: Progress, id: UpgradeId): Progress {
  const cost = nextCost(p, id);
  if (cost === null || p.bones < cost) return p;
  return { ...p, bones: p.bones - cost, upgrades: { ...p.upgrades, [id]: upgradeLevel(p, id) + 1 } };
}

/** What the upgrades do to a run. The sim reads these; the shop only changes levels. */
export interface RunBoosts {
  extraHearts: number;
  barkRangeBonus: number;
  /** Pull radius for bones, 0 when off. */
  magnetRange: number;
  doubleJumpBonus: number;
}

export function runBoosts(p: Progress): RunBoosts {
  return {
    extraHearts: upgradeLevel(p, 'heart'),
    barkRangeBonus: upgradeLevel(p, 'bark') * 50,
    magnetRange: [0, 70, 120][upgradeLevel(p, 'magnet')] ?? 120,
    doubleJumpBonus: upgradeLevel(p, 'jump') * 90,
  };
}

export const NO_BOOSTS: RunBoosts = { extraHearts: 0, barkRangeBonus: 0, magnetRange: 0, doubleJumpBonus: 0 };

/** Reads saved data defensively: anything missing or malformed falls back to empty. */
export function parseProgress(raw: unknown): Progress {
  const empty = emptyProgress();
  if (!raw || typeof raw !== 'object') return empty;
  const r = raw as Partial<Progress>;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  const chapters: Record<string, ChapterRecord> = {};
  if (r.chapters && typeof r.chapters === 'object') {
    for (const [id, c] of Object.entries(r.chapters as Record<string, Partial<ChapterRecord>>)) {
      if (!c || typeof c !== 'object') continue;
      chapters[id] = {
        ...emptyRecord(),
        stars: Math.min(3, num(c.stars)),
        bestBones: num(c.bestBones),
        bonesTotal: num(c.bonesTotal),
        goldBones: num(c.goldBones),
        goldTotal: num(c.goldTotal),
        rescued: num(c.rescued),
        rescueTotal: num(c.rescueTotal),
        bestTime: typeof c.bestTime === 'number' && c.bestTime > 0 ? c.bestTime : null,
        runs: num(c.runs),
      };
    }
  }
  const upgrades: Partial<Record<UpgradeId, number>> = {};
  for (const u of UPGRADES) {
    const level = num((r.upgrades as Partial<Record<UpgradeId, number>> | undefined)?.[u.id]);
    if (level > 0) upgrades[u.id] = Math.min(u.costs.length, Math.floor(level));
  }
  return { version: PROGRESS_VERSION, bones: Math.floor(num(r.bones)), bonesEver: Math.floor(num(r.bonesEver)), chapters, upgrades };
}
