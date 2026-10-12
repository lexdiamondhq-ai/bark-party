import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInLeft,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { COACH_FULL, DOGS, PUP, ROOMS } from '../game/art';
import { initAudio, playMusic, playSfx } from '../game/audio';
import { STORIES, type Actor, type StoryPanel } from '../game/story';
import { STORY_SPRITES } from '../game/storyArt';
import { colors, fonts, springs } from '../theme/tokens';

/** `scene` is `<chapter>_intro` or `<chapter>_outro`; an intro leads into the chapter, an outro back to the title. */
function sceneFor(scene: string): { panels: StoryPanel[]; next: { pathname: '/play' | '/'; params?: { chapter: string } } } {
  const m = /^(.+)_(intro|outro)$/.exec(scene);
  const chapter = m?.[1] ?? 'ch1';
  const story = STORIES[chapter] ?? STORIES.ch1;
  if (m?.[2] === 'outro' && story.outro) return { panels: story.outro, next: { pathname: '/' } };
  return { panels: story.intro, next: { pathname: '/play', params: { chapter } } };
}

const CPS = 48; // typewriter characters per second

export default function Story() {
  const { scene = 'ch1_intro' } = useLocalSearchParams<{ scene?: string }>();
  const def = sceneFor(scene);
  const [index, setIndex] = useState(0);
  // Characters typed so far, tagged with their panel so a new panel starts at zero without a reset in an effect.
  const [typed, setTyped] = useState({ index: 0, n: 0 });
  const shown = typed.index === index ? typed.n : 0;
  const reduce = useRef(false);
  const panel = def.panels[index];

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    initAudio();
    playMusic('music_story');
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => (reduce.current = v))
      .catch(() => {});
  }, []);

  // Typewriter.
  useEffect(() => {
    if (panel.slam) {
      playSfx('boss_laugh');
      if (!reduce.current)
        shake.set(withSequence(withTiming(14, { duration: 40 }), withRepeat(withTiming(-14, { duration: 60 }), 5, true), withSpring(0, springs.snap)));
    } else if (panel.dark) playSfx('squirrel_chitter');
    const start = Date.now();
    const id = setInterval(() => {
      const n = Math.min(panel.text.length, Math.floor(((Date.now() - start) / 1000) * CPS));
      setTyped({ index, n });
      if (n % 3 === 0) playSfx('blip');
      if (n >= panel.text.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [index, panel, shake]);

  const finish = () => {
    playSfx('whoosh');
    router.replace(def.next);
  };

  const advance = () => {
    if (shown < panel.text.length) {
      setTyped({ index, n: panel.text.length });
      return;
    }
    playSfx('button');
    if (index + 1 >= def.panels.length) finish();
    else setIndex(index + 1);
  };

  // The tap target is a sibling of Skip, not its parent, so neither platform sees a button inside a button.
  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={advance} accessibilityRole="button" accessibilityLabel="Next" />
      <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]} pointerEvents="none">
        <ImageBackground source={ROOMS[panel.room]} style={StyleSheet.absoluteFill} resizeMode="cover" imageStyle={{ width: '100%', height: '100%' }}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: panel.dark ? 'rgba(10,5,20,0.82)' : 'rgba(20,10,31,0.15)' }]} />
        </ImageBackground>

        <View style={styles.stage}>
          <View style={styles.side}>{panel.left && <ActorView key={`l${index}`} actor={panel.left} side="left" dark={panel.dark} />}</View>
          <View style={styles.side}>{panel.right && <ActorView key={`r${index}`} actor={panel.right} side="right" dark={panel.dark} />}</View>
        </View>

        <Animated.View key={index} entering={FadeIn.duration(180)} style={styles.box}>
          <View style={styles.nameTag}>
            <Text style={styles.name}>{panel.speaker}</Text>
          </View>
          <Text style={styles.line}>{panel.text.slice(0, shown)}</Text>
          {shown >= panel.text.length && <Text style={styles.more}>{index + 1 >= def.panels.length ? 'Tap to go!' : 'Tap'}</Text>}
        </Animated.View>
      </Animated.View>

      <Pressable onPress={finish} style={styles.skip} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip story">
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  );
}

function ActorView({ actor, side, dark }: { actor: Actor; side: 'left' | 'right'; dark?: boolean }) {
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(-6, { duration: 420 }), withTiming(0, { duration: 420 })), -1, true);
  }, [bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  let source: number | undefined;
  let size = { width: 220, height: 220 };
  let flip = false;
  switch (actor.kind) {
    case 'coach':
      source = COACH_FULL[actor.id];
      size = { width: 150, height: 300 };
      break;
    case 'dog':
      source = DOGS[actor.id];
      size = { width: 170, height: 170 };
      flip = side === 'right';
      break;
    case 'pup':
      source = PUP[actor.pose];
      size = { width: 230, height: 200 };
      flip = side === 'right';
      break;
    case 'boss':
      source = STORY_SPRITES.boss;
      size = { width: 230, height: 250 };
      break;
    case 'gang':
      source = STORY_SPRITES.gang;
      size = { width: 260, height: 220 };
      flip = side === 'right';
      break;
    case 'cake':
      source = STORY_SPRITES.cake;
      size = { width: 180, height: 170 };
      break;
    case 'cage':
      source = STORY_SPRITES.cage;
      size = { width: 200, height: 200 };
      break;
  }

  const entering = side === 'left' ? FadeInLeft.springify().damping(14) : FadeInRight.springify().damping(14);
  // The entrance animates the outer view and the bob the inner one, so neither overwrites the other's transform.
  return (
    <Animated.View entering={entering}>
      <Animated.View style={[styles.actor, bobStyle]}>
        {actor.kind === 'cage' && <Image source={DOGS[actor.dog]} style={[styles.caged, { opacity: dark ? 0.4 : 1 }]} resizeMode="contain" />}
        {source !== undefined && (
          <Image
            source={source}
            style={[size, { transform: [{ scaleX: flip ? -1 : 1 }] }, dark ? { tintColor: '#000', opacity: 0.85 } : null]}
            resizeMode="contain"
          />
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.velvetNight },
  stage: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: '8%', paddingBottom: 96 },
  side: { minWidth: 200, alignItems: 'center', justifyContent: 'flex-end' },
  actor: { alignItems: 'center', justifyContent: 'flex-end' },
  caged: { position: 'absolute', bottom: 24, width: 130, height: 130 },
  box: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    bottom: 16,
    backgroundColor: colors.marshmallow,
    borderColor: colors.cocoa,
    borderWidth: 3,
    borderBottomWidth: 7,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    minHeight: 92,
  },
  nameTag: {
    position: 'absolute',
    top: -18,
    left: 18,
    backgroundColor: colors.biscuitGold,
    borderColor: colors.cocoa,
    borderWidth: 2.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  name: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.cocoa },
  line: { fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 26, color: colors.cocoa },
  more: { position: 'absolute', right: 16, bottom: 8, fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.cocoa, opacity: 0.6 },
  skip: {
    position: 'absolute',
    top: 14,
    right: 18,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(26,15,11,0.5)',
  },
  skipText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.marshmallow },
});
