import { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { COACHES, WORLDS } from '../engine';
import type { RoundPlan } from '../engine';
import { COMMAND_TILT_DEG, DISPLAY_MIN_PT, colors, fonts, motion, springs, typeScale } from '../theme/tokens';

// Bagel Fat One runs about 0.5 em per character; an 11-character command at 88 pt is wider than a phone.
const BAGEL_EM_PER_CHAR = 0.5;

/** Largest command size up to 88 pt that fits the width, never below the 24 pt display minimum. */
export function commandFontSize(command: string, width: number): number {
  const fit = Math.floor(width / (command.length * BAGEL_EM_PER_CHAR));
  return Math.max(DISPLAY_MIN_PT, Math.min(typeScale.command[0], fit));
}

/** The command card: one word, one coach, the world's accent. Slams in on the bouncy spring. */
/** onCandy: the card sits on a candy color (a player's turn), so all text is Cocoa. */
export function CommandCard({ plan, onCandy = false }: { plan: RoundPlan; onCandy?: boolean }) {
  const { width } = useWindowDimensions();
  // The tilt and the drop need some room, so fit to 85% of the screen.
  const size = commandFontSize(plan.command, width * 0.85);
  const ink = onCandy ? colors.cocoa : colors.marshmallow;
  const reduceMotion = useReducedMotion();
  const world = WORLDS[plan.world];
  const s = useSharedValue(reduceMotion ? 1 : 1.6);
  const o = useSharedValue(0);

  useEffect(() => {
    // Reduce Motion: every slam becomes a fade.
    if (reduceMotion) {
      s.value = 1;
      o.value = 0;
      o.value = withTiming(1, { duration: motion.reduceMotionFadeMs });
    } else {
      s.value = 1.6;
      o.value = 1;
      s.value = withSpring(1, springs.bouncy);
    }
  }, [plan.number, reduceMotion, s, o]);

  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }, { rotate: `${COMMAND_TILT_DEG}deg` }] }));

  return (
    <View style={styles.wrap} accessibilityRole="header" accessibilityLabel={`${plan.command} ${plan.hint}`}>
      <Text style={[styles.coach, { color: ink }]}>
        {plan.boss ? 'Boss round · ' : ''}Coach {COACHES[plan.coach].name} · {world.name}
      </Text>
      <Animated.Text
        style={[styles.command, { color: ink, fontSize: size, lineHeight: size + 16, textShadowColor: world.rimA }, style]}
        numberOfLines={1}
      >
        {plan.command}
      </Animated.Text>
      <Text style={[styles.hint, { color: ink }]}>{plan.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  coach: { fontFamily: fonts.bodyBold, fontSize: typeScale.label[0], lineHeight: typeScale.label[1], opacity: 0.8 },
  command: {
    fontFamily: fonts.display,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0,
  },
  hint: { fontFamily: fonts.bodyBold, fontSize: typeScale.body[0], lineHeight: typeScale.body[1] },
});
