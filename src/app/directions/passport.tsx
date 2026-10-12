// Direction C, "Pup Passport": every chapter is a stamp in a little passport; upgrades are stickers
// you stick on the pup's collar. Sketch: state is local, 90 bones to spend.
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

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
};
const STAR = require('../../../assets/game/sprites/star.png');

const STAMPS = [
  { level: LEVELS[0], stars: 2, done: true },
  { level: LEVELS[1], stars: 0, done: false },
  { level: { id: 'ch3', chapter: 3, title: 'The Park', background: 'room_park' as const }, stars: 0, done: false },
  { level: { id: 'ch4', chapter: 4, title: 'The Yard', background: 'room_yard' as const }, stars: 0, done: false },
];

export default function Passport() {
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<'stamps' | 'stickers'>('stamps');
  const [bones, setBones] = useState(90);
  const [stuck, setStuck] = useState<UpgradeId[]>([]);
  const flip = useSharedValue(1);
  const pageStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: flip.value }] }));
  const wag = useSharedValue(0);
  const pupStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wag.value * 6}deg` }] }));

  const turn = (to: 'stamps' | 'stickers') => {
    if (to === tab) return;
    playSfx('whoosh');
    flip.set(withSequence(withTiming(0, { duration: 120 }, () => {}), withTiming(1, { duration: 160 })));
    setTimeout(() => setTab(to), 120);
  };
  const stick = (id: UpgradeId) => {
    const u = UPGRADES.find((x) => x.id === id)!;
    if (stuck.includes(id) || bones < u.costs[0]) return;
    setBones(bones - u.costs[0]);
    setStuck([...stuck, id]);
    playSfx('bone_gold');
    wag.set(withSequence(withTiming(1, { duration: 90 }), withTiming(-1, { duration: 90 }), withSpring(0, springs.wobble)));
  };

  const bookW = Math.min(width * 0.82, 860);
  const bookH = height * 0.8;

  return (
    <View style={styles.root}>
      <View style={[styles.book, { width: bookW, height: bookH }]}>
        {/* Left page: the pup. */}
        <View style={styles.page}>
          <Text style={styles.passport}>PUP PASSPORT</Text>
          <View style={styles.photoFrame}>
            <Animated.Image source={PUP.sit} style={[styles.photo, pupStyle]} resizeMode="contain" />
            {stuck.map((id, i) => (
              <Animated.Image key={id} entering={ZoomIn.springify().damping(9)} source={ART[id]} style={[styles.collarSticker, { left: 26 + i * 30, transform: [{ rotate: `${(i % 2 ? 1 : -1) * 12}deg` }] }]} resizeMode="contain" />
            ))}
          </View>
          <Text style={styles.name}>Pup</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Bones</Text>
            <Image source={HUD.bone} style={styles.boneIcon} />
            <Text style={styles.value}>{bones}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Stars</Text>
            <Image source={STAR} style={styles.starIcon} />
            <Text style={styles.value}>{STAMPS.reduce((s, c) => s + c.stars, 0)}</Text>
          </View>
          <View style={styles.tabs}>
            {(['stamps', 'stickers'] as const).map((t) => (
              <Pressable key={t} style={[styles.tabBtn, tab === t && styles.tabOn]} onPress={() => turn(t)}>
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
              {STAMPS.map((s, i) => (
                <Animated.View key={s.level.id} entering={FadeIn.delay(i * 60)} style={[styles.stampWrap, { transform: [{ rotate: `${(i % 2 ? 1 : -1) * 6}deg` }] }]}>
                  <View style={[styles.stamp, !s.done && styles.stampEmpty]}>
                    {s.done ? (
                      <Image source={ROOMS[s.level.background]} style={styles.stampImg} />
                    ) : (
                      <Text style={styles.stampNext}>{i === 1 ? 'NEXT' : '?'}</Text>
                    )}
                  </View>
                  {s.done && (
                    <View style={styles.ribbon}>
                      <Text style={styles.ribbonText}>STAMPED</Text>
                    </View>
                  )}
                  <Text style={styles.stampTitle}>{s.level.title}</Text>
                  <View style={styles.starsRow}>
                    {[0, 1, 2].map((k) => (
                      <Image key={k} source={STAR} style={[styles.starIcon, { opacity: k < s.stars ? 1 : 0.2 }]} />
                    ))}
                  </View>
                </Animated.View>
              ))}
            </View>
          ) : (
            <View style={styles.stickers}>
              <Text style={styles.stickerHeading}>Peel a sticker onto the collar</Text>
              {UPGRADES.map((u) => {
                const have = stuck.includes(u.id);
                const can = !have && bones >= u.costs[0];
                return (
                  <Pressable key={u.id} style={[styles.sticker, have && styles.stickerGone, !can && !have && styles.stickerOff]} onPress={() => stick(u.id)}>
                    <Image source={ART[u.id]} style={styles.stickerArt} resizeMode="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stickerName}>{u.name}</Text>
                      <Text style={styles.stickerBlurb}>{u.blurb}</Text>
                    </View>
                    <Text style={styles.stickerCost}>{have ? 'On collar' : `${u.costs[0]}`}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Animated.View>
      </View>

      <Pressable style={styles.back} onPress={() => router.back()} hitSlop={10}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.tag}>C: Pup Passport</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.velvetNight, alignItems: 'center', justifyContent: 'center' },
  book: { flexDirection: 'row', backgroundColor: colors.grapeSoda, borderRadius: 22, borderWidth: 3, borderColor: colors.cocoa, padding: 10, gap: 10 },
  page: { flex: 1, backgroundColor: colors.marshmallow, borderRadius: 14, padding: 14, gap: 6 },
  spine: { width: 4, borderRadius: 2, backgroundColor: 'rgba(26,15,11,0.35)' },
  passport: { fontFamily: fonts.bodyHeavy, fontSize: 12, letterSpacing: 2, color: colors.cocoa, opacity: 0.7 },
  photoFrame: { width: 150, height: 130, borderRadius: 12, borderWidth: 2.5, borderColor: colors.cocoa, backgroundColor: '#FFE9C2', alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' },
  photo: { width: 130, height: 120 },
  collarSticker: { position: 'absolute', bottom: 34, width: 30, height: 28 },
  name: { fontFamily: fonts.display, fontSize: 32, color: colors.cocoa },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { width: 60, fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.cocoa, opacity: 0.7 },
  boneIcon: { width: 28, height: 16, resizeMode: 'contain' },
  starIcon: { width: 18, height: 18 },
  value: { fontFamily: fonts.display, fontSize: 24, color: colors.cocoa },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 'auto' },
  tabBtn: { flex: 1, alignItems: 'center', borderRadius: 14, borderWidth: 2.5, borderColor: colors.cocoa, paddingVertical: 6, backgroundColor: '#FFE9C2' },
  tabOn: { backgroundColor: colors.biscuitGold, borderBottomWidth: 5 },
  tabText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cocoa, opacity: 0.7 },
  tabTextOn: { opacity: 1 },
  stamps: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', alignContent: 'center', gap: 8 },
  stampWrap: { alignItems: 'center', gap: 4, width: '42%' },
  stamp: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: colors.tomato, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE9C2' },
  stampEmpty: { borderStyle: 'dashed', borderColor: colors.cocoa, opacity: 0.5 },
  stampImg: { width: 96, height: 96 },
  stampNext: { fontFamily: fonts.display, fontSize: 24, color: colors.cocoa },
  ribbon: { position: 'absolute', top: 38, backgroundColor: colors.tomato, borderColor: colors.cocoa, borderWidth: 2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 1, transform: [{ rotate: '-14deg' }] },
  ribbonText: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: colors.marshmallow, letterSpacing: 1 },
  stampTitle: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.cocoa },
  starsRow: { flexDirection: 'row', gap: 3 },
  stickers: { flex: 1, gap: 6 },
  stickerHeading: { fontFamily: fonts.display, fontSize: 22, color: colors.cocoa },
  sticker: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFE9C2', borderColor: colors.cocoa, borderWidth: 2, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  stickerGone: { backgroundColor: '#DFF5D0' },
  stickerOff: { opacity: 0.5 },
  stickerArt: { width: 36, height: 32 },
  stickerName: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cocoa },
  stickerBlurb: { fontFamily: fonts.body, fontSize: 12, color: colors.cocoa, opacity: 0.8 },
  stickerCost: { fontFamily: fonts.display, fontSize: 20, color: colors.cocoa },
  back: { position: 'absolute', top: 14, left: 18, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(26,15,11,0.5)' },
  backText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.marshmallow },
  tag: { position: 'absolute', top: 18, right: 18, fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.marshmallow, opacity: 0.7 },
});
