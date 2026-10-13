// Party Prep: the map is the party itself. Swipe between the rooms you have opened, each with its
// stars and a Run button; Decorate spends bones on party gear that stays in the living room for good,
// and on treats that change the next run.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { GEAR, UPGRADES, buy, buyGear, canBuy, canBuyGear, chapterRecord, hasGear, isChapterOpen, nextCost, upgradeLevel, type GearId, type UpgradeId } from '../engine/progress';
import { HUD, PUP, ROOMS } from '../game/art';
import { initAudio, playMusic, playSfx } from '../game/audio';
import { CHAPTER_IDS, LEVELS } from '../game/level/chapter1';
import { STORIES } from '../game/story';
import { updateProgress, useProgress } from '../lib/progress';
import { colors, fonts, springs } from '../theme/tokens';

const ART = {
  balloon: require('../../assets/game/sprites/balloon_post_up.png'),
  arch: require('../../assets/game/sprites/party_arch.png'),
  present: require('../../assets/game/sprites/present_red.png'),
  present2: require('../../assets/game/sprites/present_blue.png'),
  star: require('../../assets/game/sprites/star.png'),
};
const GEAR_ART: Record<GearId, number> = { balloons: ART.balloon, presents: ART.present, arch: ART.arch, cake: HUD.cake };
const TREAT_ART: Record<UpgradeId, number> = {
  heart: require('../../assets/game/sprites/heart_full.png'),
  bark: require('../../assets/game/sprites/bark_burst.png'),
  magnet: require('../../assets/game/sprites/bone_gold.png'),
  jump: require('../../assets/game/sprites/star.png'),
};

/** Rooms still being drawn show at the end of the row, so the party has somewhere to grow. */
const COMING: { title: string; chapter: number; background: keyof typeof ROOMS }[] = [
  { title: 'The Park', chapter: 3, background: 'room_park' },
  { title: 'The Yard', chapter: 4, background: 'room_yard' },
];

export default function Party() {
  const { width, height } = useWindowDimensions();
  const { progress, loaded } = useProgress();
  const [shop, setShop] = useState<'gear' | 'treats' | null>(null);
  const [page, setPage] = useState(0);
  const [barking, setBarking] = useState(false);
  const pupHop = useSharedValue(0);
  const pupStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -pupHop.value * 26 }, { rotate: `${-pupHop.value * 8}deg` }] }));
  const bonesBump = useSharedValue(1);
  const bonesStyle = useAnimatedStyle(() => ({ transform: [{ scale: bonesBump.value }] }));
  const pageW = Math.min(width * 0.62, 620);
  const gap = 16;

  useEffect(() => {
    initAudio();
    playMusic('music_menu');
  }, []);

  const celebrate = () => {
    setBarking(true);
    setTimeout(() => setBarking(false), 450);
    playSfx('bone_gold');
    pupHop.set(withSequence(withTiming(1, { duration: 140 }), withSpring(0, springs.bouncy)));
    bonesBump.set(withSequence(withTiming(0.8, { duration: 70 }), withSpring(1, springs.bouncy)));
  };
  const buyOne = (id: GearId) => {
    if (!canBuyGear(progress, id)) return;
    updateProgress((p) => buyGear(p, id));
    celebrate();
  };
  const buyTreat = (id: UpgradeId) => {
    if (!canBuy(progress, id)) return;
    updateProgress((p) => buy(p, id));
    celebrate();
  };
  const run = (id: string) => {
    playSfx('bark');
    if (chapterRecord(progress, id).stars === 0 && STORIES[id]) router.push({ pathname: '/story', params: { scene: `${id}_intro` } });
    else router.push({ pathname: '/play', params: { chapter: id } });
  };

  const rooms = [
    ...LEVELS.map((level) => ({ key: level.id, level, open: isChapterOpen(progress, CHAPTER_IDS, level.id), stars: chapterRecord(progress, level.id).stars, soon: false })),
    ...COMING.map((c) => ({ key: c.title, level: c, open: false, stars: 0, soon: true })),
  ];
  const bones = loaded ? progress.bones : 0;

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        snapToInterval={pageW + gap}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: (width - pageW) / 2, gap, alignItems: 'center' }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (pageW + gap)))}
        style={{ flexGrow: 0 }}
      >
        {rooms.map((r, i) => (
          <View key={r.key} style={[styles.room, { width: pageW, height: height * 0.72 }]}>
            <ImageBackground source={ROOMS[r.level.background]} style={StyleSheet.absoluteFill} imageStyle={{ borderRadius: 24 }} resizeMode="cover">
              {!r.open && <View style={styles.locked} />}
              {/* The party gear lives in the living room, where the party is. */}
              {i === 0 && hasGear(progress, 'arch') && <Animated.Image entering={ZoomIn.springify().damping(10)} source={ART.arch} style={styles.arch} />}
              {i === 0 && hasGear(progress, 'balloons') && (
                <>
                  <Animated.Image entering={ZoomIn.springify().damping(10)} source={ART.balloon} style={[styles.balloon, { left: '58%' }]} />
                  <Animated.Image entering={ZoomIn.delay(80).springify().damping(10)} source={ART.balloon} style={[styles.balloon, { right: '8%' }]} />
                </>
              )}
              {i === 0 && hasGear(progress, 'presents') && (
                <>
                  <Animated.Image entering={ZoomIn.springify().damping(10)} source={ART.present} style={[styles.present, { left: '30%' }]} />
                  <Animated.Image entering={ZoomIn.delay(60).springify().damping(10)} source={ART.present2} style={[styles.present, { left: '38%', width: 30, height: 30 }]} />
                </>
              )}
              {i === 0 && hasGear(progress, 'cake') && <Animated.Image entering={ZoomIn.springify().damping(10)} source={HUD.cake} style={styles.cake} />}
              {i === 0 && <Animated.Image source={barking ? PUP.bark : PUP.sit} style={[styles.pup, pupStyle]} resizeMode="contain" />}
              <View style={styles.roomLabel}>
                <Text style={styles.chapter}>Chapter {r.level.chapter}</Text>
                <Text style={styles.roomTitle}>{r.level.title}</Text>
                <View style={styles.stars}>
                  {[0, 1, 2].map((s) => (
                    <Image key={s} source={ART.star} style={[styles.star, { opacity: s < r.stars ? 1 : 0.25 }]} />
                  ))}
                </View>
                {r.soon ? (
                  <Text style={styles.lockedText}>Coming soon</Text>
                ) : r.open ? (
                  <Pressable style={styles.run} onPress={() => run(r.key)} accessibilityRole="button" accessibilityLabel={`Run Chapter ${r.level.chapter}`}>
                    <Text style={styles.runText}>{r.stars > 0 ? 'Run again' : 'Run!'}</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.lockedText}>Finish Chapter {r.level.chapter - 1} to open</Text>
                )}
              </View>
            </ImageBackground>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {rooms.map((r, i) => (
          <View key={r.key} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.bar}>
        <Animated.View style={[styles.chip, bonesStyle]}>
          <Image source={HUD.bone} style={styles.boneIcon} />
          <Text style={styles.chipText}>{bones}</Text>
        </Animated.View>
        <Pressable style={styles.decorate} onPress={() => setShop('gear')} accessibilityRole="button">
          <Text style={styles.decorateText}>Decorate</Text>
        </Pressable>
      </View>

      {shop && (
        <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOut.duration(150)} style={styles.sheet}>
          <View style={styles.sheetTabs}>
            {(['gear', 'treats'] as const).map((tab) => (
              <Pressable key={tab} style={[styles.tab, shop === tab && styles.tabOn]} onPress={() => setShop(tab)} accessibilityRole="button">
                <Text style={styles.tabText}>{tab === 'gear' ? 'Party gear' : 'Treats'}</Text>
              </Pressable>
            ))}
          </View>
          {shop === 'gear' ? (
            <View style={styles.gearRow}>
              {GEAR.map((g) => {
                const have = hasGear(progress, g.id);
                const can = canBuyGear(progress, g.id);
                return (
                  <Pressable key={g.id} style={[styles.gear, have && styles.gearOwned, !can && !have && styles.gearOff]} onPress={() => buyOne(g.id)} accessibilityRole="button" accessibilityLabel={`${g.name}, ${have ? 'in the room' : `${g.cost} bones`}`}>
                    <Image source={GEAR_ART[g.id]} style={styles.gearArt} resizeMode="contain" />
                    <Text style={styles.gearName}>{g.name}</Text>
                    <Text style={styles.gearCost}>{have ? 'In the room' : `${g.cost} bones`}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.gearRow}>
              {UPGRADES.map((u) => {
                const level = upgradeLevel(progress, u.id);
                const cost = nextCost(progress, u.id);
                const can = canBuy(progress, u.id);
                return (
                  <Pressable key={u.id} style={[styles.gear, cost === null && styles.gearOwned, !can && cost !== null && styles.gearOff]} onPress={() => buyTreat(u.id)} accessibilityRole="button" accessibilityLabel={`${u.name}, ${cost === null ? 'maxed out' : `${cost} bones`}`}>
                    <Image source={TREAT_ART[u.id]} style={styles.gearArt} resizeMode="contain" />
                    <Text style={styles.gearName}>{u.name}</Text>
                    <Text style={styles.gearBlurb}>{u.blurb}</Text>
                    <View style={styles.pips}>
                      {u.costs.map((_, i) => (
                        <View key={i} style={[styles.pip, i < level && styles.pipOn]} />
                      ))}
                    </View>
                    <Text style={styles.gearCost}>{cost === null ? 'Maxed' : `${cost} bones`}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable style={styles.close} onPress={() => setShop(null)} accessibilityRole="button">
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </Animated.View>
      )}

      <Pressable style={styles.back} onPress={() => router.navigate('/')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to title">
        <Text style={styles.backText}>Title</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.velvetNight, justifyContent: 'center' },
  room: { borderRadius: 24, borderWidth: 3, borderColor: colors.cocoa, overflow: 'hidden', backgroundColor: colors.cocoa },
  locked: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,10,31,0.62)' },
  roomLabel: { position: 'absolute', left: 16, bottom: 14, gap: 2 },
  chapter: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.marshmallow, textShadowColor: colors.cocoa, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  roomTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.biscuitGold, textShadowColor: colors.cocoa, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  stars: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  star: { width: 22, height: 22 },
  run: { alignSelf: 'flex-start', backgroundColor: colors.biscuitGold, borderColor: colors.cocoa, borderWidth: 2.5, borderBottomWidth: 5, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 6 },
  runText: { fontFamily: fonts.display, fontSize: 24, color: colors.cocoa },
  lockedText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.marshmallow },
  arch: { position: 'absolute', right: '10%', bottom: '18%', width: 150, height: 112 },
  balloon: { position: 'absolute', bottom: '18%', width: 26, height: 78 },
  present: { position: 'absolute', bottom: '18%', width: 36, height: 36 },
  cake: { position: 'absolute', right: '28%', bottom: '19%', width: 50, height: 46 },
  pup: { position: 'absolute', left: '42%', bottom: '17%', width: 92, height: 92 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,244,226,0.3)' },
  dotOn: { backgroundColor: colors.biscuitGold },
  bar: { position: 'absolute', right: 18, top: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.marshmallow, borderColor: colors.cocoa, borderWidth: 2.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3 },
  boneIcon: { width: 28, height: 16, resizeMode: 'contain' },
  chipText: { fontFamily: fonts.display, fontSize: 24, color: colors.cocoa },
  decorate: { backgroundColor: colors.bubblegum, borderColor: colors.cocoa, borderWidth: 2.5, borderBottomWidth: 5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  decorateText: { fontFamily: fonts.display, fontSize: 22, color: colors.cocoa },
  sheet: { position: 'absolute', left: '8%', right: '8%', bottom: 14, backgroundColor: colors.marshmallow, borderColor: colors.cocoa, borderWidth: 3, borderBottomWidth: 7, borderRadius: 24, padding: 14, gap: 10 },
  sheetTabs: { flexDirection: 'row', gap: 8 },
  tab: { borderRadius: 14, borderWidth: 2.5, borderColor: colors.cocoa, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: '#FFE9C2' },
  tabOn: { backgroundColor: colors.biscuitGold, borderBottomWidth: 5 },
  tabText: { fontFamily: fonts.display, fontSize: 20, color: colors.cocoa },
  gearRow: { flexDirection: 'row', gap: 10 },
  gear: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: '#FFE9C2', borderColor: colors.cocoa, borderWidth: 2, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 6 },
  gearOwned: { backgroundColor: '#DFF5D0' },
  gearOff: { opacity: 0.45 },
  gearArt: { width: 40, height: 40 },
  gearName: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.cocoa, textAlign: 'center' },
  gearBlurb: { fontFamily: fonts.body, fontSize: 11, color: colors.cocoa, textAlign: 'center', opacity: 0.8 },
  gearCost: { fontFamily: fonts.body, fontSize: 13, color: colors.cocoa },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors.cocoa },
  pipOn: { backgroundColor: colors.kiwi },
  close: { alignSelf: 'flex-end', backgroundColor: colors.biscuitGold, borderColor: colors.cocoa, borderWidth: 2.5, borderBottomWidth: 5, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 6 },
  closeText: { fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.cocoa },
  back: { position: 'absolute', top: 14, left: 18, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(26,15,11,0.5)' },
  backText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.marshmallow },
});
