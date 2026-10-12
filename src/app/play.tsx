import { router, useLocalSearchParams } from 'expo-router';

import { GameView } from '../game/GameView';
import { CHAPTER_1 } from '../game/level/chapter1';

export default function Play() {
  const { at } = useLocalSearchParams<{ at?: string }>();
  return (
    <GameView
      key={CHAPTER_1.id}
      level={CHAPTER_1}
      startX={at ? Number(at) : undefined}
      onWin={(r) =>
        router.replace({
          pathname: '/results',
          params: { stars: r.stars, bones: r.bones, bonesTotal: r.bonesTotal, gold: r.goldBones, goldTotal: r.goldTotal, rescued: r.rescued, rescueTotal: r.rescueTotal, time: Math.round(r.time) },
        })
      }
      onQuit={() => router.replace('/')}
    />
  );
}
