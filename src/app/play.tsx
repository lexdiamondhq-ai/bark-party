import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { recordRun, runBoosts } from '../engine/progress';
import { GameView } from '../game/GameView';
import { LEVELS, levelById } from '../game/level/chapter1';
import type { LevelResult } from '../game/sim/world';
import { updateProgress, useProgress } from '../lib/progress';
import { colors } from '../theme/tokens';

export default function Play() {
  const { at, chapter } = useLocalSearchParams<{ at?: string; chapter?: string }>();
  const level = levelById(chapter) ?? LEVELS[0];
  const { progress, loaded } = useProgress();

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

  // The run reads the shop treats once, as it starts: wait for the save so they are in it (a link straight
  // to a level can arrive before the save has loaded).
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.velvetNight }} />;

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
        router.navigate('/party');
      }}
    />
  );
}
