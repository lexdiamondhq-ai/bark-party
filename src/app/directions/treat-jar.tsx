// Direction B, "Treat Jar": bones fill a jar; treats are the upgrades, and the pup eats them.
// Chapters are a row of rooms underneath. Sketch: state is local, the jar starts with 120 bones.
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { UPGRADES, type UpgradeId } from '../../engine/progress';
import { HUD, PUP, ROOMS } from '../../game/art';
import { playSfx } from '../../game/audio';
import { LEVELS } from '../../game/level/chapter1';
import { colors, fonts, springs } from '../../theme/tokens';

const ART: Record<UpgradeId, number> = {
  heart: require('../../../assets/game/sprites/heart_full.png'),
  bark: require('../../../assets/game/sprites/bark_burst.png'),
  magnet: require('../../../assets/game/sprites/bone_gold.png'),
  jump: require('../../../assets/game/sprites/star.png'),
  mega: require('../../../assets/game/sprites/power_mega.png'),
  turbo: require('../../../assets/game/sprites/power_turbo.png'),
  twin: require('../../../assets/game/sprites/power_ball.png'),
  bubble: require('../../../assets/game/sprites/power_bubble.png'),
};
const HEART = require('../../../assets/game/sprites/heart.png');
const STAR = require('../../../assets/game/sprites/star.png');

const ROOM_LIST = [
  { level: LEVELS[0], stars: 2, open: true },
  { level: LEVELS[1], stars: 0, open: true },
  { level: { id: 'ch3', chapter: 3, title: 'The Park', background: 'room_park' as const }, stars: 0, open: false },
];

export default function TreatJar() {
  const { height } = useWindowDimensions();
  const [bones, setBones] = useState(120);
  const [levels, setLevels] = useState<Partial<Record<UpgradeId, number>>>({});
  const [eating, setEating] = useState(false);
  const [hearts, setHearts] = useState<number[]>([]);
  const hop = useSharedValue(0);
  const pupStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -hop.value * 30 }, { scaleY: 1 + hop.value * 0.1 }, { scaleX: 1 - hop.value * 0.05 }] }));
  const jarBump = useSharedValue(1);
  const jarStyle = useAnimatedStyle(() => ({ transform: [{ scale: jarBump.value }] }));

  const eat = (id: UpgradeId) => {
    const u = UPGRADES.find((x) => x.id === id)!;
    const level = levels[id] ?? 0;
    const cost = u.costs[level];
    if (cost === undefined || bones < cost) return;
    setBones(bones - cost);
    setLevels({ ...levels, [id]: level + 1 });
    setEating(true);
    setTimeout(() => setEating(false), 500);
    setHearts((h) => [...h, Date.now()]);
    playSfx('bone_gold');
    hop.set(withSequence(withTiming(1, { duration: 130 }), withSpring(0, springs.bouncy)));
    jarBump.set(withSequence(withTiming(0.92, { duration: 70 }), withSpring(1, springs.bouncy)));
  };

  const fill = Math.min(1, bones / 200);
  const jarH = height * 0.42;

  return (
    <ImageBackground source={ROOMS.room_cosy} style={styles.root} resizeMode="cover" imageStyle={{ width: '100%', height: '100%' }}>
      <View style={styles.scrim} />
      <View style={styles.top}>
        {/* The jar and the pup. */}
        <View style={styles.jarSide}>
          <Animated.View style={[styles.jar, { height: jarH }, jarStyle]}>
            <View style={styles.lid} />
            <View style={[styles.fillBox, { height: Math.max(18, (jarH - 40) * fill) }]}>
              {Array.from({ length: Math.min(14, Math.ceil(bones / 10)) }, (_, i) => (
                <Image key={i} source={HUD.bone} style={[styles.jarBone, { transform: [{ rotate: `${((i * 37) % 60) - 30}deg` }] }]} />
              ))}
            </View>
            <View style={styles.shine} />
            <Text style={styles.jarCount}>{bones}</Text>
          </Animated.View>
          <Animated.Image source={eating ? PUP.bark : PUP.sit} style={[styles.pup, pupStyle]} resizeMode="contain" />
          {hearts.map((key) => (
            <Animated.Image key={key} entering={ZoomIn.springify().damping(8)} exiting={FadeOut} source={HEART} style={styles.flyHeart} />
          ))}
        </View>

        {/* Treats. */}
        <View style={styles.treats}>
          <Text style={styles.heading}>Treats</Text>
          {UPGRADES.map((u) => {
            const level = levels[u.id] ?? 0;
            const cost = u.costs[level];
            const can = cost !== undefined && bones >= cost;
            return (
              <Pressable key={u.id} style={[styles.treat, !can && cost !== undefined && styles.treatOff, cost === undefined && styles.treatMax]} onPress={() => eat(u.id)}>
                <Image source={ART[u.id]} style={styles.treatArt} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.treatName}>{u.name}</Text>
                  <Text style={styles.treatBlurb}>{u.blurb}</Text>
                </View>
                <View style={styles.pips}>
                  {u.costs.map((_, i) => (
                    <View key={i} style={[styles.pip, i < level && styles.pipOn]} />
                  ))}
                </View>
                <View style={[styles.cost, cost === undefined && styles.costMax]}>
                  <Text style={styles.costText}>{cost === undefined ? 'Max' : cost}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Chapters. */}
      <View style={styles.rooms}>
        {ROOM_LIST.map((r) => (
          <Pressable key={r.level.id} style={[styles.roomCard, !r.open && styles.roomLocked]} onPress={() => r.open && playSfx('bark')}>
            <Image source={ROOMS[r.level.background]} style={styles.roomImg} />
            <View style={styles.roomText}>
              <Text style={styles.roomTitle}>{r.level.title}</Text>
              <View style={styles.stars}>
                {[0, 1, 2].map((s) => (
                  <Image key={s} source={STAR} style={[styles.star, { opacity: s < r.stars ? 1 : 0.25 }]} />
                ))}
              </View>
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.back} onPress={() => router.back()} hitSlop={10}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.tag}>B: Treat Jar</Text>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,10,31,0.42)' },
  top: { flex: 1, flexDirection: 'row', paddingHorizontal: 24, paddingTop: 18, gap: 16 },
  jarSide: { width: '38%', alignItems: 'center', justifyContent: 'flex-end', flexDirection: 'row', gap: 8 },
  jar: { width: 130, borderRadius: 26, borderWidth: 3, borderColor: colors.cocoa, backgroundColor: 'rgba(255,244,226,0.22)', justifyContent: 'flex-end', overflow: 'hidden' },
  lid: { position: 'absolute', top: 0, left: 0, right: 0, height: 22, backgroundColor: colors.poolTeal, borderBottomWidth: 3, borderColor: colors.cocoa },
  fillBox: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-end', justifyContent: 'center', gap: 2, paddingHorizontal: 8, paddingBottom: 8 },
  jarBone: { width: 34, height: 20, resizeMode: 'contain' },
  shine: { position: 'absolute', top: 34, left: 12, width: 8, height: '45%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  jarCount: { position: 'absolute', top: 30, alignSelf: 'center', fontFamily: fonts.display, fontSize: 30, color: colors.marshmallow, textShadowColor: colors.cocoa, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  pup: { width: 120, height: 110, marginBottom: -6 },
  flyHeart: { position: 'absolute', right: 40, top: 20, width: 34, height: 34 },
  treats: { flex: 1, gap: 6 },
  heading: { fontFamily: fonts.display, fontSize: 28, color: colors.biscuitGold, transform: [{ rotate: '-4deg' }], textShadowColor: colors.cocoa, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  treat: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.marshmallow, borderColor: colors.cocoa, borderWidth: 2.5, borderBottomWidth: 5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6 },
  treatOff: { opacity: 0.55 },
  treatMax: { backgroundColor: '#DFF5D0' },
  treatArt: { width: 38, height: 34 },
  treatName: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.cocoa },
  treatBlurb: { fontFamily: fonts.body, fontSize: 12, color: colors.cocoa, opacity: 0.8 },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.cocoa },
  pipOn: { backgroundColor: colors.kiwi },
  cost: { minWidth: 48, alignItems: 'center', backgroundColor: colors.biscuitGold, borderColor: colors.cocoa, borderWidth: 2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  costMax: { backgroundColor: colors.kiwi },
  costText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cocoa },
  rooms: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingBottom: 14, paddingTop: 10 },
  roomCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.marshmallow, borderColor: colors.cocoa, borderWidth: 2.5, borderBottomWidth: 5, borderRadius: 18, padding: 6 },
  roomLocked: { opacity: 0.45 },
  roomImg: { width: 64, height: 44, borderRadius: 10 },
  roomText: { gap: 2 },
  roomTitle: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cocoa },
  stars: { flexDirection: 'row', gap: 3 },
  star: { width: 16, height: 16 },
  back: { position: 'absolute', top: 14, left: 18, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(26,15,11,0.5)' },
  backText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.marshmallow },
  tag: { position: 'absolute', top: 18, right: 18, fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.marshmallow, opacity: 0.7 },
});
