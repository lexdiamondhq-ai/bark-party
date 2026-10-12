// Direction A, "Party Prep": the map is the party itself. Each chapter is a room you walk into,
// and bones buy party gear that appears in the room for good. Sketch: state is local, bones start at 150.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { HUD, PUP, ROOMS } from '../../game/art';
import { playSfx } from '../../game/audio';
import { LEVELS } from '../../game/level/chapter1';
import { colors, fonts, springs } from '../../theme/tokens';

const ART = {
  balloon: require('../../../assets/game/sprites/balloon_post_up.png'),
  arch: require('../../../assets/game/sprites/party_arch.png'),
  present: require('../../../assets/game/sprites/present_red.png'),
  present2: require('../../../assets/game/sprites/present_blue.png'),
  star: require('../../../assets/game/sprites/star.png'),
};

type GearId = 'balloons' | 'presents' | 'arch' | 'cake';
const GEAR: { id: GearId; name: string; cost: number; art: number }[] = [
  { id: 'balloons', name: 'Balloons', cost: 20, art: ART.balloon },
  { id: 'presents', name: 'Presents', cost: 35, art: ART.present },
  { id: 'arch', name: 'Party arch', cost: 60, art: ART.arch },
  { id: 'cake', name: 'Cake stand', cost: 80, art: HUD.cake },
];

const ROOM_LIST = [
  { level: LEVELS[0], stars: 2, open: true },
  { level: LEVELS[1], stars: 0, open: true },
  { level: { id: 'ch3', chapter: 3, title: 'The Park', background: 'room_park' as const }, stars: 0, open: false },
];

export default function PartyPrep() {
  const { width, height } = useWindowDimensions();
  const [bones, setBones] = useState(150);
  const [owned, setOwned] = useState<GearId[]>([]);
  const [shop, setShop] = useState(false);
  const [page, setPage] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const pupHop = useSharedValue(0);
  const pupStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -pupHop.value * 26 }, { rotate: `${-pupHop.value * 8}deg` }] }));
  const [barking, setBarking] = useState(false);
  const pageW = width * 0.62;

  const buy = (g: (typeof GEAR)[number]) => {
    if (owned.includes(g.id) || bones < g.cost) return;
    setBones(bones - g.cost);
    setOwned([...owned, g.id]);
    setBarking(true);
    setTimeout(() => setBarking(false), 450);
    playSfx('bone_gold');
    pupHop.set(withSequence(withTiming(1, { duration: 140 }), withSpring(0, springs.bouncy)));
  };

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled={false}
        snapToInterval={pageW + 16}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: (width - pageW) / 2, gap: 16, alignItems: 'center' }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (pageW + 16)))}
        style={{ flexGrow: 0 }}
      >
        {ROOM_LIST.map((r, i) => (
          <View key={r.level.id} style={[styles.room, { width: pageW, height: height * 0.72 }]}>
            <ImageBackground source={ROOMS[r.level.background]} style={StyleSheet.absoluteFill} imageStyle={{ borderRadius: 24 }} resizeMode="cover">
              {!r.open && <View style={styles.locked} />}
              {/* Party gear lives in the first room. */}
              {i === 0 && owned.includes('arch') && <Animated.Image entering={ZoomIn.springify().damping(10)} source={ART.arch} style={styles.arch} />}
              {i === 0 && owned.includes('balloons') && (
                <>
                  <Animated.Image entering={ZoomIn.springify().damping(10)} source={ART.balloon} style={[styles.balloon, { left: '8%' }]} />
                  <Animated.Image entering={ZoomIn.delay(80).springify().damping(10)} source={ART.balloon} style={[styles.balloon, { right: '8%' }]} />
                </>
              )}
              {i === 0 && owned.includes('presents') && (
                <>
                  <Animated.Image entering={ZoomIn.springify().damping(10)} source={ART.present} style={[styles.present, { left: '30%' }]} />
                  <Animated.Image entering={ZoomIn.delay(60).springify().damping(10)} source={ART.present2} style={[styles.present, { left: '38%', width: 30, height: 30 }]} />
                </>
              )}
              {i === 0 && owned.includes('cake') && <Animated.Image entering={ZoomIn.springify().damping(10)} source={HUD.cake} style={styles.cake} />}
              {i === 0 && (
                <Animated.Image source={barking ? PUP.bark : PUP.sit} style={[styles.pup, pupStyle]} resizeMode="contain" />
              )}
              <View style={styles.roomLabel}>
                <Text style={styles.chapter}>Chapter {r.level.chapter}</Text>
                <Text style={styles.roomTitle}>{r.level.title}</Text>
                <View style={styles.stars}>
                  {[0, 1, 2].map((s) => (
                    <Image key={s} source={ART.star} style={[styles.star, { opacity: s < r.stars ? 1 : 0.25 }]} />
                  ))}
                </View>
                {r.open ? (
                  <Pressable style={styles.run} onPress={() => playSfx('bark')}>
                    <Text style={styles.runText}>Run!</Text>
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
        {ROOM_LIST.map((r, i) => (
          <View key={r.level.id} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.bar}>
        <View style={styles.chip}>
          <Image source={HUD.bone} style={styles.boneIcon} />
          <Text style={styles.chipText}>{bones}</Text>
        </View>
        <Pressable style={styles.decorate} onPress={() => setShop(true)}>
          <Text style={styles.decorateText}>Decorate</Text>
        </Pressable>
      </View>

      {shop && (
        <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOut.duration(150)} style={styles.sheet}>
          <Text style={styles.sheetTitle}>Party gear</Text>
          <View style={styles.gearRow}>
            {GEAR.map((g) => {
              const have = owned.includes(g.id);
              const can = !have && bones >= g.cost;
              return (
                <Pressable key={g.id} style={[styles.gear, have && styles.gearOwned, !can && !have && styles.gearOff]} onPress={() => buy(g)}>
                  <Image source={g.art} style={styles.gearArt} resizeMode="contain" />
                  <Text style={styles.gearName}>{g.name}</Text>
                  <Text style={styles.gearCost}>{have ? 'In the room' : `${g.cost} bones`}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.close} onPress={() => setShop(false)}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </Animated.View>
      )}

      <Pressable style={styles.back} onPress={() => router.back()} hitSlop={10}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.tag}>A: Party Prep</Text>
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
  sheet: { position: 'absolute', left: '12%', right: '12%', bottom: 14, backgroundColor: colors.marshmallow, borderColor: colors.cocoa, borderWidth: 3, borderBottomWidth: 7, borderRadius: 24, padding: 16, gap: 12 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.cocoa },
  gearRow: { flexDirection: 'row', gap: 10 },
  gear: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: '#FFE9C2', borderColor: colors.cocoa, borderWidth: 2, borderRadius: 16, paddingVertical: 10 },
  gearOwned: { backgroundColor: '#DFF5D0' },
  gearOff: { opacity: 0.45 },
  gearArt: { width: 44, height: 44 },
  gearName: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cocoa },
  gearCost: { fontFamily: fonts.body, fontSize: 13, color: colors.cocoa },
  close: { alignSelf: 'flex-end', backgroundColor: colors.biscuitGold, borderColor: colors.cocoa, borderWidth: 2.5, borderBottomWidth: 5, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 6 },
  closeText: { fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.cocoa },
  back: { position: 'absolute', top: 14, left: 18, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(26,15,11,0.5)' },
  backText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.marshmallow },
  tag: { position: 'absolute', top: 18, left: '50%', marginLeft: -60, width: 120, textAlign: 'center', fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.marshmallow, opacity: 0.7 },
});
