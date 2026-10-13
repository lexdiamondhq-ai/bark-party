import { router } from 'expo-router';
import { useEffect } from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { nextChapter } from '../engine/progress';
import { PupWalker } from '../components/PupWalker';
import { DOGS, HUD, ROOMS } from '../game/art';
import { initAudio, playMusic, playSfx } from '../game/audio';
import { CHAPTER_IDS, LEVELS, levelById } from '../game/level/chapter1';
import { useProgress } from '../lib/progress';
import { colors, fonts } from '../theme/tokens';

export default function Title() {
  const { width } = useWindowDimensions();
  const run = useSharedValue(0);
  const hop = useSharedValue(0);
  const logo = useSharedValue(0);

  useEffect(() => {
    initAudio();
    playMusic('music_menu');
    run.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
    hop.value = withRepeat(withSequence(withTiming(1, { duration: 170 }), withTiming(0, { duration: 170 })), -1, false);
    logo.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1, true);
  }, [hop, logo, run]);

  // The pup gallops across the bottom with friends in tow.
  const runStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -260 + run.value * (width + 420) }] }));
  const hopStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -hop.value * 10 }, { rotate: `${(hop.value - 0.5) * 8}deg` }],
  }));
  // The wagon rattles along a beat behind the pup's hops.
  const wagonStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -(1 - hop.value) * 3 }, { rotate: `${(0.5 - hop.value) * 3}deg` }],
  }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ rotate: '-6deg' }, { scale: 1 + logo.value * 0.04 }] }));

  const { progress } = useProgress();
  const next = levelById(nextChapter(progress, CHAPTER_IDS)) ?? LEVELS[0];
  const start = () => {
    playSfx('bark');
    router.push('/party');
  };

  return (
    <ImageBackground source={ROOMS.room_yard} style={styles.root} resizeMode="cover" imageStyle={{ width: '100%', height: '100%' }}>
      <View style={styles.scrim} />
      <Animated.Text style={[styles.logo, logoStyle]} accessibilityRole="header">
        Dog Runner
      </Animated.Text>
      <Text style={styles.tag}>
        Chapter {next.chapter}: {next.title}
      </Text>
      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.gold]} onPress={start} accessibilityRole="button">
          <Text style={styles.btnDark}>Play</Text>
        </Pressable>
      </View>

      <Animated.View style={[styles.parade, runStyle]} pointerEvents="none">
        <Animated.View style={[styles.wagon, wagonStyle]}>
          <Image source={DOGS.husky} style={[styles.rider, { left: 14 }]} />
          <Image source={DOGS.frenchie} style={[styles.rider, { left: 56 }]} />
          <Image source={HUD.wagon} style={styles.wagonImg} />
        </Animated.View>
        <View style={styles.rope} />
        <Animated.View style={hopStyle}>
          <PupWalker width={104} stridesPerSecond={2.4} />
        </Animated.View>
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,10,31,0.35)' },
  logo: {
    fontFamily: fonts.display,
    fontSize: 76,
    lineHeight: 86,
    color: colors.biscuitGold,
    textShadowColor: colors.cocoa,
    textShadowOffset: { width: 0, height: 6 },
    textShadowRadius: 0,
  },
  tag: { fontFamily: fonts.bodyHeavy, fontSize: 18, color: colors.marshmallow, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 14, marginBottom: 70 },
  btn: { minWidth: 170, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  gold: { backgroundColor: colors.biscuitGold, borderColor: colors.cocoa, borderBottomWidth: 6 },
  glass: { backgroundColor: 'rgba(255,244,226,0.14)', borderColor: 'rgba(255,244,226,0.35)' },
  btnDark: { fontFamily: fonts.bodyHeavy, fontSize: 22, color: colors.cocoa },
  btnLight: { fontFamily: fonts.bodyHeavy, fontSize: 20, color: colors.marshmallow },
  parade: { position: 'absolute', left: 0, bottom: 10, flexDirection: 'row', alignItems: 'flex-end' },
  wagon: { width: 128, height: 78, justifyContent: 'flex-end' },
  wagonImg: { width: 128, height: 59, resizeMode: 'contain' },
  rider: { position: 'absolute', bottom: 24, width: 52, height: 52, resizeMode: 'contain' },
  rope: { width: 44, height: 3, marginBottom: 36, marginLeft: -4, marginRight: -2, backgroundColor: colors.cocoa, borderRadius: 2, transform: [{ rotate: '-8deg' }] },
});
