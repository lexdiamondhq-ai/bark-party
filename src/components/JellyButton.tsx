import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, springs, squashWidth, typeScale } from '../theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  /** Gold means "press me". Use it for at most one button per glass panel. */
  gold?: boolean;
  accessibilityHint?: string;
  /** The button sits on a candy color, so its label is Cocoa. */
  onCandy?: boolean;
};

/** Pressable jelly: 64 pt tall minimum, squashes on touch down with the squish spring. */
export function JellyButton({ label, onPress, gold = false, accessibilityHint, onCandy = false }: Props) {
  const height = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: height.value }, { scaleX: squashWidth(height.value) }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPressIn={() => {
        height.set(withSpring(0.9, springs.squish));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      }}
      onPressOut={() => {
        height.set(withSpring(1, springs.squish));
      }}
      onPress={onPress}
    >
      <Animated.View style={[styles.jelly, gold ? styles.gold : styles.glass, style]}>
        <Text style={[styles.label, { color: gold || onCandy ? colors.cocoa : colors.marshmallow }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  jelly: {
    minHeight: 64,
    minWidth: 220,
    paddingHorizontal: 28,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.cocoa,
    borderBottomWidth: 6, // the jelly lip
  },
  gold: { backgroundColor: colors.biscuitGold },
  glass: { backgroundColor: 'rgba(255,244,226,0.14)', borderColor: 'rgba(255,244,226,0.35)' },
  label: { fontFamily: fonts.bodyHeavy, fontSize: typeScale.button[0], lineHeight: typeScale.button[1] },
});
