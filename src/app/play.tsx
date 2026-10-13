import { router, useLocalSearchParams } from 'expo-router';

import { recordRun, runBoosts } from '../engine/progress';
import { GameView } from '../game/GameView';
import { LEVELS, levelById } from '../game/level/chapter1';
import type { LevelResult } from '../game/sim/world';
import { updateProgress, useProgress } from '../lib/progress';

export default function Play() {
  const { at, chapter } = useLocalSearchParams<{ at?: string; chapter?: string }>();
  const level = levelById(chapter) ?? LEVELS[0];
  const { progress } = useProgress();

  const bank = (r: LevelResult, finished: boolean) =>
    updateProgress((p) =>
      recordRun(p, {
        chapterId: level.id,
        finished,
        stars: r.stars,
        bones: r.bones,
        bonesTotal: r.bonesTotal,
        goldBones: r.goldBones,
        goldTotal: r.goldTotal,
        rescued: r.rescued,
        rescueTotal: r.rescueTotal,
        time: r.time,
      }),
    );

  return (
    <GameView
      key={level.id}
      level={level}
      boosts={runBoosts(progress)}
      startX={at ? Number(at) : undefined}
      onWin={(r) => {
        bank(r, true);
        router.replace({
          pathname: '/results',
          params: {
            chapter: level.id,
            stars: r.stars,
            bones: r.bones,
            bonesTotal: r.bonesTotal,
            gold: r.goldBones,
            goldTotal: r.goldTotal,
            rescued: r.rescued,
            rescueTotal: r.rescueTotal,
            time: Math.round(r.time),
          },
        });
      }}
      onQuit={(r) => {
        if (r.bones > 0) bank(r, false);
        router.navigate('/');
      }}
    />
  );
}
