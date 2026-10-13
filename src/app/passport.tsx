// The Pup Passport: the chapter map and the shop in one little book. Every finished chapter is a
// round room stamp with its stars; the next chapter waits as a dotted stamp; the stickers page spends
// bones on treats that stick to the pup's collar and change the next run.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { UPGRADES, buy, canBuy, chapterRecord, isChapterOpen, nextCost, upgradeLevel, type UpgradeId } from '../engine/progress';
import { HUD, PUP, ROOMS } from '../game/art';
import { initAudio, playMusic, playSfx } from '../game/audio';
import { CHAPTER_IDS, LEVELS } from '../game/level/chapter1';
import { HERO_NAME, STORIES } from '../game/story';
import { updateProgress, useProgress } from '../lib/progress';
import { colors, fonts, springs } from '../theme/tokens';

const STICKER: Record<UpgradeId, number> = {
  heart: require('../../assets/game/sprites/heart_full.png'),
  bark: require('../../assets/game/sprites/bark_burst.png'),
  magnet: require('../../assets/game/sprites/bone_gold.png'),
  jump: require('../../assets/game/sprites/star.png'),
};
const STAR = require('../../assets/game/sprites/star.png');

/** Chapters still being drawn show as dotted stamps so the book looks like it has room to fill. */
const COMING: { title: string; background: keyof typeof ROOMS }[] = [
  { title: 'The Park', background: 'room_park' },
  { title: 'The Yard', background: 'room_yard' },
];

export default function Passport() {
  const { width, height } = useWindowDimensions();
  const { progress, loaded } = useProgress();
  const [tab, setTab] = useState<'stamps' | 'stickers'>('stamps');
  const flip = useSharedValue(1);
  const pageStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: flip.value }] }));
  const wag = useSharedValue(0);
  const pupStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wag.value * 6}deg` }] }));
  const bonesBump = useSharedValue(1);
  const bonesStyle = useAnimatedStyle(() => ({ transform: [{ scale: bonesBump.value }] }));

  useEffect(() => {
    initAudio();
    playMusic('music_menu');
  }, []);

  const turn = (to: 'stamps' | 'stickers') => {
    if (to === tab) return;
    playSfx('whoosh');
    flip.set(withSequence(withTiming(0, { duration: 120 }), withTiming(1, { duration: 160 })));
    setTimeout(() => setTab(to), 120);
  };

  const stick = (id: UpgradeId) => {
    if (!canBuy(progress, id)) return;
    updateProgress((p) => buy(p, id));
    playSfx('bone_gold');
    wag.set(withSequence(withTiming(1, { duration: 90 }), withTiming(-1, { duration: 90 }), withSpring(0, springs.wobble)));
    bonesBump.set(withSequence(withTiming(0.8, { duration: 70 }), withSpring(1, springs.bouncy)));
  };

  const run = (id: string) => {
    playSfx('bark');
    const record = chapterRecord(progress, id);
    // The story plays the first time; after that the stamp goes straight to the run.
    if (record.stars === 0 && STORIES[id]) router.push({ pathname: '/story', params: { scene: `${id}_intro` } });
    else router.push({ pathname: '/play', params: { chapter: id } });
  };

  const totalStars = CHAPTER_IDS.reduce((s, id) => s + chapterRecord(progress, id).stars, 0);
  const collar = UPGRADES.filter((u) => upgradeLevel(progress, u.id) > 0);
  const bookW = Math.min(width * 0.84, 880);
  const bookH = Math.min(height * 0.82, 420);
  const nextId = CHAPTER_IDS.find((id) => chapterRecord(progress, id).stars === 0 && isChapterOpen(progress, CHAPTER_IDS, id));

  return (
    <View style={styles.root}>
      <View style={[styles.book, { width: bookW, height: bookH }]}>
        {/* Left page: the pup and the totals. */}
        <View style={styles.page}>
          <Text style={styles.passport}>PUP PASSPORT</Text>
          <View style={styles.photoFrame}>
            <Animated.Image source={PUP.sit} style={[styles.photo, pupStyle]} resizeMode="contain" />
            {collar.map((u, i) => (
              <Animated.Image
                key={u.id}
                entering={ZoomIn.springify().damping(9)}
                source={STICKER[u.id]}
                style={[styles.collarSticker, { left: 24 + i * 28, transform: [{ rotate: `${(i % 2 ? 1 : -1) * 12}deg` }] }]}
                resizeMode="contain"
              />
            ))}
          </View>
          <Text style={styles.name}>{HERO_NAME}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Bones</Text>
            <Image source={HUD.bone} style={styles.boneIcon} />
            <Animated.Text style={[styles.value, bonesStyle]}>{loaded ? progress.bones : '…'}</Animated.Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Stars</Text>
            <Image source={STAR} style={styles.starIcon} />
            <Text style={styles.value}>{totalStars}</Text>
          </View>
          <View style={styles.tabs}>
            {(['stamps', 'stickers'] as const).map((t) => (
              <Pressable key={t} style={[styles.tabBtn, tab === t && styles.tabOn]} onPress={() => turn(t)} accessibilityRole="button">
                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'stamps' ? 'Stamps' : 'Stickers'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.spine} />

        {/* Right page: stamps or stickers. */}
        <Animated.View style={[styles.page, pageStyle]}>
          {tab === 'stamps' ? (
            <View style={styles.stamps}>
              {LEVELS.map((level, i) => {
                const record = chapterRecord(progress, level.id);
                const open = isChapterOpen(progress, CHAPTER_IDS, level.id);
                const done = record.stars > 0;
                const isNext = level.id === nextId;
                return (
                  <Animated.View key={level.id} entering={FadeIn.delay(i * 60)} style={[styles.stampWrap, { transform: [{ rotate: `${(i % 2 ? 1 : -1) * 6}deg` }] }]}>
                    <Pressable
                      disabled={!open}
                      onPress={() => run(level.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Chapter ${level.chapter}, ${level.title}`}
                      style={({ pressed }) => [styles.stamp, !done && styles.stampEmpty, !open && styles.stampLocked, pressed && styles.stampPressed]}
                    >
                      {done ? <Image source={ROOMS[level.background]} style={styles.stampImg} /> : <Text style={styles.stampNext}>{isNext ? 'NEXT' : `${level.chapter}`}</Text>}
                      {done && (
                        <View style={styles.ribbon}>
                          <Text style={styles.ribbonText}>STAMPED</Text>
                        </View>
                      )}
                    </Pressable>
                    <Text style={styles.stampTitle}>{level.title}</Text>
                    <View style={styles.starsRow}>
                      {[0, 1, 2].map((k) => (
                        <Image key={k} source={STAR} style={[styles.starIcon, { opacity: k < record.stars ? 1 : 0.2 }]} />
                      ))}
                    </View>
                  </Animated.View>
                );
              })}
              {COMING.map((c, i) => (
                <View key={c.title} style={[styles.stampWrap, { transform: [{ rotate: `${(i % 2 ? -1 : 1) * 6}deg` }] }]}>
                  <View style={[styles.stamp, styles.stampEmpty, styles.stampLocked]}>
                    <Text style={styles.stampSoon}>Soon</Text>
                  </View>
                  <Text style={styles.stampTitle}>{c.title}</Text>
                  <View style={styles.starsRow}>
                    {[0, 1, 2].map((k) => (
                      <Image key={k} source={STAR} style={[styles.starIcon, { opacity: 0.2 }]} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.stickers}>
              <Text style={styles.stickerHeading}>Stick a treat on the collar</Text>
              {UPGRADES.map((u) => {
                const level = upgradeLevel(progress, u.id);
                const cost = nextCost(progress, u.id);
                const can = canBuy(progress, u.id);
                return (
                  <Pressable
                    key={u.id}
                    style={[styles.sticker, cost === null && styles.stickerMax, !can && cost !== null && styles.stickerOff]}
                    onPress={() => stick(u.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${u.name}, ${cost === null ? 'maxed out' : `${cost} bones`}`}
                  >
                    <Image source={STICKER[u.id]} style={styles.stickerArt} resizeMode="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stickerName}>{u.name}</Text>
                      <Text style={styles.stickerBlurb}>{u.blurb}</Text>
                    </View>
                    <View style={styles.pips}>
                      {u.costs.map((_, i) => (
                        <View key={i} style={[styles.pip, i < level && styles.pipOn]} />
                      ))}
                    </View>
                    <View style={[styles.cost, cost === null && styles.costMax]}>
                      <Text style={styles.costText}>{cost === null ? 'Max' : cost}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Animated.View>
      </View>

      <Pressable style={styles.back} onPress={() => router.navigate('/')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to title">
        <Text style={styles.backText}>Title</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.velvetNight, alignItems: 'center', justifyContent: 'center' },
  book: { flexDirection: 'row', backgroundColor: colors.grapeSoda, borderRadius: 22, borderWidth: 3, borderColor: colors.cocoa, padding: 10, gap: 10 },
  page: { flex: 1, backgroundColor: colors.marshmallow, borderRadius: 14, padding: 14, paddingBottom: 12, gap: 6 },
  spine: { width: 4, borderRadius: 2, backgroundColor: 'rgba(26,15,11,0.35)' },
  passport: { fontFamily: fonts.bodyHeavy, fontSize: 12, letterSpacing: 2, color: colors.cocoa, opacity: 0.7 },
  photoFrame: { width: 150, height: 124, borderRadius: 12, borderWidth: 2.5, borderColor: colors.cocoa, backgroundColor: '#FFE9C2', alignItems: 'center', justifyContent: 'flex-end' },
  photo: { width: 126, height: 116 },
  collarSticker: { position: 'absolute', bottom: 32, width: 30, height: 28 },
  name: { fontFamily: fonts.display, fontSize: 30, color: colors.cocoa },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { width: 56, fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.cocoa, opacity: 0.7 },
  boneIcon: { width: 28, height: 16, resizeMode: 'contain' },
  starIcon: { width: 18, height: 18 },
  value: { fontFamily: fonts.display, fontSize: 24, color: colors.cocoa },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 'auto' },
  tabBtn: { flex: 1, alignItems: 'center', borderRadius: 14, borderWidth: 2.5, borderColor: colors.cocoa, paddingVertical: 6, backgroundColor: '#FFE9C2' },
  tabOn: { backgroundColor: colors.biscuitGold, borderBottomWidth: 5 },
  tabText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cocoa, opacity: 0.7 },
  tabTextOn: { opacity: 1 },
  stamps: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', alignContent: 'center', gap: 6 },
  stampWrap: { alignItems: 'center', gap: 3, width: '44%' },
  stamp: { width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: colors.tomato, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE9C2' },
  stampEmpty: { borderStyle: 'dashed', borderColor: colors.cocoa },
  stampLocked: { opacity: 0.45 },
  stampPressed: { transform: [{ scale: 0.94 }] },
  stampImg: { width: 92, height: 92 },
  stampNext: { fontFamily: fonts.display, fontSize: 24, color: colors.cocoa },
  stampSoon: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cocoa },
  ribbon: { position: 'absolute', backgroundColor: colors.tomato, borderColor: colors.cocoa, borderWidth: 2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 1, transform: [{ rotate: '-14deg' }] },
  ribbonText: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: colors.marshmallow, letterSpacing: 1 },
  stampTitle: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.cocoa },
  starsRow: { flexDirection: 'row', gap: 3 },
  stickers: { flex: 1, gap: 6 },
  stickerHeading: { fontFamily: fonts.display, fontSize: 22, color: colors.cocoa },
  sticker: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFE9C2', borderColor: colors.cocoa, borderWidth: 2, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  stickerMax: { backgroundColor: '#DFF5D0' },
  stickerOff: { opacity: 0.5 },
  stickerArt: { width: 36, height: 32 },
  stickerName: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cocoa },
  stickerBlurb: { fontFamily: fonts.body, fontSize: 12, color: colors.cocoa, opacity: 0.8 },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.cocoa },
  pipOn: { backgroundColor: colors.kiwi },
  cost: { minWidth: 48, alignItems: 'center', backgroundColor: colors.biscuitGold, borderColor: colors.cocoa, borderWidth: 2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  costMax: { backgroundColor: colors.kiwi },
  costText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cocoa },
  back: { position: 'absolute', top: 14, left: 18, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(26,15,11,0.5)' },
  backText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.marshmallow },
});
