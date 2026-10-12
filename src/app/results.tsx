import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn, FadeInUp } from 'react-native-reanimated';

import { ROOMS } from '../game/art';
import { playMusic, playSfx } from '../game/audio';
import { LEVELS, levelById } from '../game/level/chapter1';
import { STORIES } from '../game/story';
import { colors, fonts } from '../theme/tokens';

export default function Results() {
  const p = useLocalSearchParams<Record<string, string>>();
  const stars = Number(p.stars ?? 1);
  const level = levelById(p.chapter) ?? LEVELS[0];
  const outro = STORIES[level.id]?.outro;
  const next = () => (outro ? router.replace({ pathname: '/story', params: { scene: `${level.id}_outro` } }) : router.replace('/passport'));

  useEffect(() => {
    playMusic('none');
    playSfx('victory');
  }, []);

  return (
    <ImageBackground source={ROOMS[level.background]} style={styles.root} resizeMode="cover" imageStyle={{ width: '100%', height: '100%' }}>
      <View style={styles.scrim} />
      <Text style={styles.title}>{level.winTitle}</Text>
      <View style={styles.stars}>
        {[0, 1, 2].map((i) => (
          <Animated.Text
            key={i}
            entering={ZoomIn.delay(300 + i * 350).springify().damping(9)}
            style={[styles.star, { opacity: i < stars ? 1 : 0.25 }]}
          >
            ★
          </Animated.Text>
        ))}
      </View>
      <Animated.View entering={FadeInUp.delay(1400)} style={styles.panel}>
        <Row label="Bones" value={`${p.bones} / ${p.bonesTotal}`} />
        <Row label="Golden bones" value={`${p.gold} / ${p.goldTotal}`} />
        <Row label="Pups freed" value={`${p.rescued} / ${p.rescueTotal}`} />
        <Row label="Time" value={`${p.time} s`} />
      </Animated.View>
      <Animated.View entering={FadeInUp.delay(1700)} style={styles.actions}>
        <Pressable style={[styles.btn, styles.gold]} onPress={next}>
          <Text style={styles.btnDark}>Continue</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.glass]} onPress={() => router.replace({ pathname: '/play', params: { chapter: level.id } })}>
          <Text style={styles.btnLight}>Play again</Text>
        </Pressable>
      </Animated.View>
    </ImageBackground>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,10,31,0.6)' },
  title: {
    fontFamily: fonts.display,
    fontSize: 48,
    color: colors.biscuitGold,
    transform: [{ rotate: '-6deg' }],
    textShadowColor: colors.cocoa,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0,
  },
  stars: { flexDirection: 'row', gap: 10 },
  star: { fontSize: 54, color: colors.biscuitGold, textShadowColor: colors.cocoa, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  panel: {
    backgroundColor: 'rgba(255,244,226,0.12)',
    borderColor: 'rgba(255,244,226,0.35)',
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 10,
    minWidth: 300,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  label: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.marshmallow },
  value: { fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.marshmallow },
  actions: { flexDirection: 'row', gap: 14, marginTop: 6 },
  btn: { minWidth: 180, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  gold: { backgroundColor: colors.biscuitGold, borderColor: colors.cocoa, borderBottomWidth: 6 },
  glass: { backgroundColor: 'rgba(255,244,226,0.14)', borderColor: 'rgba(255,244,226,0.35)' },
  btnDark: { fontFamily: fonts.bodyHeavy, fontSize: 20, color: colors.cocoa },
  btnLight: { fontFamily: fonts.bodyHeavy, fontSize: 20, color: colors.marshmallow },
});
