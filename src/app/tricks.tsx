// Tricks: a quick swipe through everything the pup can do, shown once before the first run and
// any time from the party room. Each card is the real art and one line.
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PupWalker } from '../components/PupWalker';
import { HUD, PUP } from '../game/art';
import { playSfx } from '../game/audio';
import { STORIES } from '../game/story';
import { updateProgress, useProgress } from '../lib/progress';
import { chapterRecord } from '../engine/progress';
import { colors, fonts } from '../theme/tokens';

const ART = {
  star: require('../../assets/game/sprites/star.png'),
  squirrel: require('../../assets/game/sprites/squirrel_run_0.png'),
  bone: require('../../assets/game/sprites/bone_gold.png'),
  present: require('../../assets/game/sprites/present_red.png'),
  mega: require('../../assets/game/sprites/power_mega.png'),
  turbo: require('../../assets/game/sprites/power_turbo.png'),
  ball: require('../../assets/game/sprites/tennis_ball.png'),
  bubble: require('../../assets/game/sprites/bubble.png'),
  balloon: require('../../assets/game/sprites/balloon_post_up.png'),
  cake: require('../../assets/game/sprites/cake.png'),
  acorn: require('../../assets/game/sprites/acorn_golden.png'),
};

type Card = { title: string; line: string; art: 'walker' | 'bark' | 'down' | number; tint?: string };

const CARDS: Card[] = [
  { title: 'Tap to jump', line: 'Tap anywhere. Hold the tap for a big jump.', art: 'walker', tint: colors.biscuitGold },
  { title: 'Double jump', line: 'Tap again in the air to go even higher.', art: ART.star, tint: colors.blueRaspberry },
  { title: 'Slide', line: 'Swipe down to slide under acorns and over trouble.', art: 'down', tint: colors.poolTeal },
  { title: 'Zoomies', line: 'Come out of a slide and the pup zooms for a moment.', art: 'walker', tint: colors.kiwi },
  { title: 'Bark!', line: 'Hit BARK to swat squirrels and knock acorns away.', art: 'bark', tint: colors.tomato },
  { title: 'Stomp', line: 'Land on a squirrel to bounce right off it.', art: ART.squirrel, tint: colors.biscuitGold },
  { title: 'Bones', line: 'Bones buy party gear and treats. Golden bones earn stars.', art: ART.bone, tint: colors.biscuitGold },
  { title: 'Presents', line: 'Open one and the pup gets a power for a few seconds.', art: ART.present, tint: colors.bubblegum },
  { title: 'Mega Pup', line: 'Grow huge and run straight through the squirrels.', art: ART.mega, tint: colors.biscuitGold },
  { title: 'Turbo', line: 'Run faster, and every bone counts double.', art: ART.turbo, tint: colors.kiwi },
  { title: 'Ball Mouth', line: 'BARK fires tennis balls that fly ahead and stun.', art: ART.ball, tint: colors.poolTeal },
  { title: 'Bubble', line: 'A shield that takes one hit for you, then pops.', art: ART.bubble, tint: colors.blueRaspberry },
  { title: 'Free the pups', line: 'Run into a crate and the pup jumps into your wagon.', art: HUD.wagon, tint: colors.tomato },
  { title: 'Balloon posts', line: 'Pass one and you try again from there.', art: ART.balloon, tint: colors.bubblegum },
  { title: 'The boss', line: 'Bark the golden acorns back at Big Nutsy to win the cake.', art: ART.cake, tint: colors.grapeSodaChip },
];

export default function Tricks() {
  const { width, height } = useWindowDimensions();
  const { then } = useLocalSearchParams<{ then?: string }>();
  const { progress } = useProgress();
  const [page, setPage] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const cardW = Math.min(width * 0.5, 440);
  const gap = 14;

  const go = () => {
    playSfx('bark');
    updateProgress((p) => (p.sawTricks ? p : { ...p, sawTricks: true }));
    if (!then) {
      router.back();
      return;
    }
    if (chapterRecord(progress, then).stars === 0 && STORIES[then]) router.replace({ pathname: '/story', params: { scene: `${then}_intro` } });
    else router.replace({ pathname: '/play', params: { chapter: then } });
  };
  const last = page >= CARDS.length - 1;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Tricks</Text>
      <ScrollView
        ref={scroll}
        horizontal
        snapToInterval={cardW + gap}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: (width - cardW) / 2, gap, alignItems: 'center' }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardW + gap)))}
        style={{ flexGrow: 0 }}
      >
        {CARDS.map((c, i) => (
          <View key={c.title} style={[styles.card, { width: cardW, height: Math.min(height * 0.62, 300) }]}>
            <View style={[styles.artWrap, { backgroundColor: c.tint ?? colors.biscuitGold }]}>
              {c.art === 'walker' ? (
                <PupWalker width={132} />
              ) : c.art === 'bark' ? (
                <Image source={PUP.bark} style={styles.pupArt} resizeMode="contain" />
              ) : c.art === 'down' ? (
                <Image source={PUP.down} style={styles.pupArt} resizeMode="contain" />
              ) : (
                <Image source={c.art} style={styles.art} resizeMode="contain" />
              )}
            </View>
            <Text style={styles.cardNo}>
              {i + 1} / {CARDS.length}
            </Text>
            <Text style={styles.cardTitle}>{c.title}</Text>
            <Text style={styles.cardLine}>{c.line}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {CARDS.map((c, i) => (
          <View key={c.title} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>
      <View style={styles.actions}>
        {!last && (
          <Pressable
            style={[styles.btn, styles.glass]}
            onPress={() => {
              const next = Math.min(CARDS.length - 1, page + 1);
              scroll.current?.scrollTo({ x: next * (cardW + gap), animated: true });
              setPage(next);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.btnLight}>Next</Text>
          </Pressable>
        )}
        <Pressable style={[styles.btn, styles.gold]} onPress={go} accessibilityRole="button">
          <Text style={styles.btnDark}>{then ? "Let's go!" : 'Done'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.velvetNight, justifyContent: 'center', gap: 10, paddingBlock: 12 },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.biscuitGold, textAlign: 'center', transform: [{ rotate: '-3deg' }], textShadowColor: colors.cocoa, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  card: { backgroundColor: colors.marshmallow, borderColor: colors.cocoa, borderWidth: 3, borderBottomWidth: 7, borderRadius: 24, padding: 14, gap: 4, alignItems: 'center' },
  artWrap: { width: '100%', flex: 1, borderRadius: 16, borderWidth: 2.5, borderColor: colors.cocoa, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  art: { width: 110, height: 110 },
  pupArt: { width: 150, height: 130 },
  cardNo: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: colors.cocoa, opacity: 0.6, marginTop: 6 },
  cardTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.cocoa },
  cardLine: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: colors.cocoa, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,244,226,0.3)' },
  dotOn: { backgroundColor: colors.biscuitGold },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  btn: { minWidth: 150, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  gold: { backgroundColor: colors.biscuitGold, borderColor: colors.cocoa, borderBottomWidth: 6 },
  glass: { backgroundColor: 'rgba(255,244,226,0.14)', borderColor: 'rgba(255,244,226,0.35)' },
  btnDark: { fontFamily: fonts.bodyHeavy, fontSize: 19, color: colors.cocoa },
  btnLight: { fontFamily: fonts.bodyHeavy, fontSize: 18, color: colors.marshmallow },
});
