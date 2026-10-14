import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, ImageBackground, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
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

import { PupWalker } from '../components/PupWalker';
import { COACH_FULL, DOGS, PUP, ROOMS } from '../game/art';
import { initAudio, playMusic, playSfx } from '../game/audio';
import { STORIES, type Actor, type StoryPanel } from '../game/story';
import { STORY_SPRITES } from '../game/storyArt';
import { colors, fonts, springs } from '../theme/tokens';

/** `scene` is `<chapter>_intro` or `<chapter>_outro`; an intro leads into the chapter, an outro back to the title. */
function sceneFor(scene: string): { panels: StoryPanel[]; next: { pathname: '/play' | '/party'; params?: { chapter: string } } } {
  const m = /^(.+)_(intro|outro)$/.exec(scene);
  const chapter = m?.[1] ?? 'ch1';
  const story = STORIES[chapter] ?? STORIES.ch1;
  if (m?.[2] === 'outro' && story.outro) return { panels: story.outro, next: { pathname: '/party' } };
  return { panels: story.intro, next: { pathname: '/play', params: { chapter } } };
}

const CPS = 48; // typewriter characters per second
/** Room the stage leaves for the text card at the bottom, and the breathing room above the tallest head. */
const CARD_SPACE = 124;
const HEAD_ROOM = 10;

/** Each actor's height as a share of the stage, and its width per unit of height (the art's own proportions). */
const SHAPES: Record<Actor['kind'], { h: number; ratio: number }> = {
  coach: { h: 0.96, ratio: 170 / 340 },
  dog: { h: 0.62, ratio: 1 },
  pup: { h: 0.7, ratio: 252 / 220 },
  boss: { h: 0.9, ratio: 258 / 280 },
  gang: { h: 0.8, ratio: 290 / 246 },
  cake: { h: 0.62, ratio: 200 / 190 },
  cage: { h: 0.74, ratio: 1 },
};

export default function Story() {
  const { scene = 'ch1_intro' } = useLocalSearchParams<{ scene?: string }>();
  const { height } = useWindowDimensions();
  // The actors are sized from the stage, so the tallest coach always fits between the top edge and the card.
  const stageH = Math.max(150, height - CARD_SPACE - HEAD_ROOM);
  const def = sceneFor(scene);
  const [index, setIndex] = useState(0);
  // Whether the current line has fully typed, reported by the Typewriter so the screen itself never re-renders per character.
  const [done, setDone] = useState<{ index: number; done: boolean }>({ index: 0, done: false });
  const shown = done.index === index && done.done;
  const skipTo = useRef<(() => void) | null>(null);
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

  useEffect(() => {
    if (panel.slam) {
      playSfx('boss_laugh');
      if (!reduce.current)
        shake.set(withSequence(withTiming(14, { duration: 40 }), withRepeat(withTiming(-14, { duration: 60 }), 5, true), withSpring(0, springs.snap)));
    } else if (panel.dark) playSfx('squirrel_chitter');
  }, [index, panel, shake]);

  const finish = () => {
    playSfx('whoosh');
    if (def.next.pathname === '/party') router.navigate('/party');
    else router.replace(def.next);
  };

  const advance = () => {
    if (!shown) {
      skipTo.current?.();
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
      {/* The room stays put; only the people and the box shake on the slam, so no edge ever shows. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <ImageBackground source={ROOMS[panel.room]} style={StyleSheet.absoluteFill} resizeMode="cover" imageStyle={{ width: '100%', height: '100%' }}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: panel.dark ? 'rgba(10,5,20,0.82)' : 'rgba(20,10,31,0.15)' }]} />
        </ImageBackground>
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]} pointerEvents="none">
        <View style={styles.stage}>
          <View style={styles.side}>{panel.left && <ActorView key={`l${index}`} actor={panel.left} side="left" dark={panel.dark} stageH={stageH} />}</View>
          <View style={styles.side}>{panel.right && <ActorView key={`r${index}`} actor={panel.right} side="right" dark={panel.dark} stageH={stageH} />}</View>
        </View>

        <Animated.View key={index} entering={FadeIn.duration(180)} style={styles.box}>
          <View style={styles.nameTag}>
            <Text style={styles.name}>{panel.speaker}</Text>
          </View>
          <Typewriter key={index} text={panel.text} onDone={() => setDone({ index, done: true })} skipRef={skipTo} />
          {shown && <Text style={styles.more}>{index + 1 >= def.panels.length ? 'Tap to go!' : 'Tap'}</Text>}
        </Animated.View>
      </Animated.View>

      <Pressable onPress={finish} style={styles.skip} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip story">
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  );
}

/** Types one line at CPS characters a second, re-rendering only itself. Tap skips to the end through `skipRef`. */
function Typewriter({ text, onDone, skipRef }: { text: string; onDone: () => void; skipRef: React.MutableRefObject<(() => void) | null> }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = Date.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(id);
      setN(text.length);
      onDone();
    };
    const id = setInterval(() => {
      const k = Math.min(text.length, Math.floor(((Date.now() - start) / 1000) * CPS));
      setN(k);
      if (k % 3 === 0) playSfx('blip');
      if (k >= text.length) finish();
    }, 30);
    skipRef.current = finish;
    return () => {
      clearInterval(id);
      if (skipRef.current === finish) skipRef.current = null;
    };
  }, [text, onDone, skipRef]);
  return <Text style={styles.line}>{text.slice(0, n)}</Text>;
}

function ActorView({ actor, side, dark, stageH }: { actor: Actor; side: 'left' | 'right'; dark?: boolean; stageH: number }) {
  // Living things breathe: a slow, barely visible rise of the chest from the feet up. Props hold still.
  const alive = actor.kind === 'coach' || actor.kind === 'dog' || actor.kind === 'pup' || actor.kind === 'boss' || actor.kind === 'gang';
  const breath = useSharedValue(0);
  useEffect(() => {
    if (alive) breath.set(withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) })), -1, false));
  }, [alive, breath]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + breath.value * 0.012 }, { scaleX: 1 - breath.value * 0.004 }] }));

  const shape = SHAPES[actor.kind];
  const size = { height: Math.round(stageH * shape.h), width: Math.round(stageH * shape.h * shape.ratio) };
  let source: number | undefined;
  let flip = false;
  switch (actor.kind) {
    case 'coach':
      source = COACH_FULL[actor.id];
      break;
    case 'dog':
      source = DOGS[actor.id];
      flip = side === 'right';
      break;
    case 'pup':
      source = PUP[actor.pose];
      flip = side === 'right';
      break;
    case 'boss':
      source = STORY_SPRITES.boss;
      break;
    case 'gang':
      source = STORY_SPRITES.gang;
      flip = side === 'right';
      break;
    case 'cake':
      source = STORY_SPRITES.cake;
      break;
    case 'cage':
      source = STORY_SPRITES.cage;
      break;
  }
  // The caged pup sits inside the bars: two thirds of the cage, resting a little above its floor.
  const caged = { width: size.height * 0.65, height: size.height * 0.65, bottom: size.height * 0.12 };

  // A short eased step in from the side; the bob rides on the inner view so neither overwrites the other's transform.
  const entering = (side === 'left' ? FadeInLeft : FadeInRight).duration(320).easing(Easing.out(Easing.cubic));
  return (
    <Animated.View entering={entering}>
      <Animated.View style={[styles.actor, bobStyle]}>
        {actor.kind === 'cage' && <Image source={DOGS[actor.dog]} style={[styles.caged, caged, { opacity: dark ? 0.4 : 1 }]} resizeMode="contain" />}
        {actor.kind === 'pup' && actor.pose === 'walk' && !dark && (
          <View style={{ transform: [{ scaleX: flip ? -1 : 1 }] }}>
            <PupWalker width={size.width} />
          </View>
        )}
        {source !== undefined && !(actor.kind === 'pup' && actor.pose === 'walk' && !dark) && (
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
  stage: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: '6%', paddingBottom: CARD_SPACE },
  side: { minWidth: '24%', alignItems: 'center', justifyContent: 'flex-end' },
  actor: { alignItems: 'center', justifyContent: 'flex-end', transformOrigin: 'bottom' },
  caged: { position: 'absolute' },
  box: {
    position: 'absolute',
    left: '7%',
    right: '7%',
    bottom: 14,
    backgroundColor: colors.marshmallow,
    borderColor: colors.cocoa,
    borderWidth: 3,
    borderBottomWidth: 7,
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
    minHeight: 112,
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
  name: { fontFamily: fonts.bodyHeavy, fontSize: 18, color: colors.cocoa },
  line: { fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 31, color: colors.cocoa },
  more: { position: 'absolute', right: 18, bottom: 10, fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.cocoa, opacity: 0.6 },
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
