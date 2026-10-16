// The Dog Better pup trotting, as plain views: the body sticker with the leg stride and the tail wag
// played from small sprite sheets inside clipped windows. For the title parade and story panels,
// where there is no game canvas. Sheets come from tools/pup_walker_sheets.py.
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import meta from './pupWalker.json';

const SHEETS = {
  base: require('../../assets/game/dogbetter/pup_walker_base.png'),
  legs: require('../../assets/game/dogbetter/pup_walker_legs.png'),
  tail: require('../../assets/game/dogbetter/pup_walker_tail.png'),
};

type Props = {
  /** Width on screen; the pup keeps its proportions. */
  width: number;
  /** Strides per second (0 stands still on the first frame). */
  stridesPerSecond?: number;
  wagsPerSecond?: number;
  flip?: boolean;
};

export function PupWalker({ width, stridesPerSecond = 2.2, wagsPerSecond = 2.4, flip = false }: Props) {
  const s = width / meta.canvas[0];
  const legFrame = useSharedValue(0);
  const tailFrame = useSharedValue(0);

  useEffect(() => {
    if (stridesPerSecond > 0) {
      legFrame.set(withRepeat(withTiming(meta.legs.frames, { duration: 1000 / stridesPerSecond, easing: Easing.linear }), -1, false));
    } else legFrame.set(0);
    tailFrame.set(withRepeat(withTiming(meta.tail.frames, { duration: 1000 / wagsPerSecond, easing: Easing.linear }), -1, false));
  }, [legFrame, tailFrame, stridesPerSecond, wagsPerSecond]);

  // Slide the sheet so the current frame sits in the window.
  const legsStyle = useAnimatedStyle(() => {
    const f = Math.floor(legFrame.value) % meta.legs.frames;
    return { transform: [{ translateX: -(f % meta.legs.cols) * meta.legs.frame[0] * s }, { translateY: -Math.floor(f / meta.legs.cols) * meta.legs.frame[1] * s }] };
  });
  const tailStyle = useAnimatedStyle(() => {
    const f = Math.floor(tailFrame.value) % meta.tail.frames;
    return { transform: [{ translateX: -(f % meta.tail.cols) * meta.tail.frame[0] * s }, { translateY: -Math.floor(f / meta.tail.cols) * meta.tail.frame[1] * s }] };
  });

  return (
    <View style={{ width, height: meta.canvas[1] * s, transform: [{ scaleX: flip ? -1 : 1 }] }}>
      <Image source={SHEETS.base} style={{ width, height: meta.canvas[1] * s }} />
      <View style={[styles.window, { left: meta.tail.box[0] * s, top: meta.tail.box[1] * s, width: meta.tail.frame[0] * s, height: meta.tail.frame[1] * s }]}>
        <Animated.Image source={SHEETS.tail} style={[{ width: meta.tail.sheet[0] * s, height: meta.tail.sheet[1] * s }, tailStyle]} />
      </View>
      <View style={[styles.window, { left: meta.legs.box[0] * s, top: meta.legs.box[1] * s, width: meta.legs.frame[0] * s, height: meta.legs.frame[1] * s }]}>
        <Animated.Image source={SHEETS.legs} style={[{ width: meta.legs.sheet[0] * s, height: meta.legs.sheet[1] * s }, legsStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { position: 'absolute', overflow: 'hidden' },
});
