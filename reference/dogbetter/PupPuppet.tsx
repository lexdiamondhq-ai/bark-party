import { Image } from 'expo-image';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import frames from '@/components/brand/pupFrames.json';
import { aboutPivot, CANVAS, GROUND, HOP, REST, stickerBox, type PuppetFrame } from '@/engine/pupPuppet';

type Sticker = 'sit' | 'bark' | 'down';

const BASE = require('@/assets/brand/pup/base.png');
/**
 * The walking sticker bent into frames by scripts/pup-frames.py, each part packed on one sprite sheet: the
 * legs (stride, rest frame, settle) and the tail wag. A frame shows by sliding its sheet in a fixed window.
 */
const LEGS_SHEET = require('@/assets/brand/pup/legs.png');
const TAIL_SHEET = require('@/assets/brand/pup/tail.png');
const STICKER_ART: Record<Sticker, number> = {
  sit: require('@/assets/brand/mascot.png'),
  bark: require('@/assets/brand/mascot-bark.png'),
  down: require('@/assets/brand/mascot-down.png'),
};

/** Height of the puppet stage at a given width. */
export function puppetHeight(width: number) {
  return (width * CANVAS.h) / CANVAS.w;
}

/** The ground line, from the top of the stage, at a given width. */
export function puppetGround(width: number) {
  return (width * GROUND) / CANVAS.w;
}

/**
 * The real mascot art, animated: the walking sticker bent into a trot (legs and tail grow out of the body,
 * nothing is cut), and the untouched sit, speak, and lie-down stickers, which he hops between. The hop moves
 * the whole dog about his paws and the shadow tightens as he leaves the ground. All on the UI thread.
 */
/** Every image the puppet shows: the base, the two sprite sheets, and the three pose stickers. */
const IMAGE_COUNT = 6;

export function PupPuppet({ frame, width, onLoaded }: { frame: SharedValue<PuppetFrame>; width: number; onLoaded?: () => void }) {
  // In a development build every image downloads from the bundler, so the walk waits until all have loaded.
  const loaded = useRef(0);
  const onLoad = () => {
    loaded.current += 1;
    if (loaded.current === IMAGE_COUNT) onLoaded?.();
  };
  const s = width / CANVAS.w;
  const height = puppetHeight(width);
  const ground = puppetGround(width);

  const puppetStyle = useAnimatedStyle(() => ({ opacity: frame.get().puppet }));
  // Squash and stretch about the paws: React Native scales about the centre, so shift to keep the paws down.
  const hopStyle = useAnimatedStyle(() => {
    const f = frame.get();
    return {
      transform: [{ translateY: -f.lift * s + (ground - height / 2) * (1 - f.scaleY) }, { scaleX: f.scaleX }, { scaleY: f.scaleY }],
    };
  });
  const shadowStyle = useAnimatedStyle(() => {
    const f = frame.get();
    const up = f.lift / HOP.height;
    return { opacity: 1 - up * 0.45, transform: [{ scaleX: (1 - up * 0.22) * f.scaleX }] };
  });

  const legsBox = boxOf(frames.legsBox, s);
  const tailBox = boxOf(frames.tailBox, s);
  const shadow = { width: width * 0.8, height: 34 * s };
  return (
    <View style={{ width, height }} pointerEvents="none">
      <Animated.View style={[styles.abs, { left: (width - shadow.width) / 2, top: ground - shadow.height / 2 }, shadow, shadowStyle]}>
        <Svg width={shadow.width} height={shadow.height}>
          <Defs>
            <RadialGradient id="pupShadow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.22} />
              <Stop offset="0.6" stopColor="#000000" stopOpacity={0.1} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={shadow.width / 2} cy={shadow.height / 2} rx={shadow.width / 2} ry={shadow.height / 2} fill="url(#pupShadow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, hopStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, puppetStyle]}>
          <Image source={BASE} style={[styles.abs, { left: 0, top: 0, width, height }]} contentFit="fill" recyclingKey="pup-base" onLoad={onLoad} />
          <Sprite sheet={TAIL_SHEET} meta={frames.tailSheet} box={tailBox} frame={frame} slot="tail" onLoad={onLoad} />
          <Sprite sheet={LEGS_SHEET} meta={frames.legsSheet} box={legsBox} frame={frame} slot="legsA" onLoad={onLoad} />
          <Sprite sheet={LEGS_SHEET} meta={frames.legsSheet} box={legsBox} frame={frame} slot="legsB" />
          <Sprite sheet={LEGS_SHEET} meta={frames.legsSheet} box={legsBox} frame={frame} slot="rest" />
          <Sprite sheet={TAIL_SHEET} meta={frames.tailSheet} box={tailBox} frame={frame} slot="tailB" />
        </Animated.View>
        <PoseSticker name="sit" frame={frame} s={s} onLoad={onLoad} />
        <PoseSticker name="bark" frame={frame} s={s} onLoad={onLoad} />
        <PoseSticker name="down" frame={frame} s={s} onLoad={onLoad} />
      </Animated.View>
    </View>
  );
}

function boxOf([x0, y0, x1, y1]: number[], s: number) {
  return { left: x0 * s, top: y0 * s, width: (x1 - x0) * s, height: (y1 - y0) * s };
}

type Slot = 'legsA' | 'legsB' | 'rest' | 'tail' | 'tailB';

/**
 * A frame-sized window onto a sprite sheet. Each frame of the walk only moves the sheet (and sets one
 * opacity), so the phone does a handful of cheap updates per frame instead of redrawing dozens of images.
 * Legs use three windows: the current frame, the next one blending in, and the rest frame for stopping.
 */
function Sprite({ sheet, meta, box, frame, slot, onLoad }: { sheet: number; meta: { cols: number; count: number; frame: number[] }; box: { left: number; top: number; width: number; height: number }; frame: SharedValue<PuppetFrame>; slot: Slot; onLoad?: () => void }) {
  const fw = box.width;
  const fh = box.height;
  const rows = Math.ceil(meta.count / meta.cols);
  const style = useAnimatedStyle(() => {
    const f = frame.get();
    const index = slot === 'legsA' ? f.legA : slot === 'legsB' ? f.legB : slot === 'rest' ? REST : slot === 'tail' ? f.tailA : f.tailB;
    const opacity = slot === 'legsA' || slot === 'tail' ? 1 : slot === 'legsB' ? (f.legB === f.legA ? 0 : f.legT) : slot === 'rest' ? f.restT : f.tailB === f.tailA ? 0 : f.tailT;
    const col = index % meta.cols;
    const row = Math.floor(index / meta.cols);
    return { opacity, transform: [{ translateX: -col * fw }, { translateY: -row * fh }] };
  });
  return (
    <View style={[styles.abs, box, styles.window]}>
      <Animated.View style={[styles.abs, { left: 0, top: 0, width: fw * meta.cols, height: fh * rows }, style]}>
        <Image source={sheet} style={StyleSheet.absoluteFill} contentFit="fill" recyclingKey={`pup-sheet-${slot}`} onLoad={onLoad} />
      </Animated.View>
    </View>
  );
}

function PoseSticker({ name, frame, s, onLoad }: { name: Sticker; frame: SharedValue<PuppetFrame>; s: number; onLoad: () => void }) {
  const b = stickerBox(name);
  const box = { left: b.left * s, top: b.top * s, width: b.width * s, height: b.height * s };
  // Hops and tips turn about the paws, so the dog stays planted.
  const feet = { x: box.left + box.width / 2, y: box.top + box.height };
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const style = useAnimatedStyle(() => {
    const f = frame.get();
    const opacity = name === 'sit' ? f.sit : name === 'bark' ? f.barkPose : f.down;
    const tip = name === 'bark' ? f.barkRot : 0;
    const hop = name === 'bark' ? f.barkY * s : 0;
    const { tx, ty } = aboutPivot(tip, feet, centre);
    return { opacity, transform: [{ translateX: tx }, { translateY: ty + hop }, { rotate: `${tip}rad` }] };
  });
  return (
    <Animated.View style={[styles.abs, box, style]}>
      <Image source={STICKER_ART[name]} style={StyleSheet.absoluteFill} contentFit="fill" recyclingKey={`pup-sticker-${name}`} onLoad={onLoad} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  window: { overflow: 'hidden' },
});
