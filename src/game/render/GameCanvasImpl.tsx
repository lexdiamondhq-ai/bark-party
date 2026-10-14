import {
  Canvas,
  FilterMode,
  MipmapMode,
  Picture,
  Skia,
  createPicture,
  useImage,
  type SkCanvas,
  type SkImage,
} from '@shopify/react-native-skia';
import { memo } from 'react';
import { runOnJS, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { STEP } from '../constants';
import { ATLAS_PAGES } from './atlasImages';
import { RECT, STRIDE } from './buildFrame';

type Props = {
  ops: SharedValue<Float64Array>;
  width: number;
  height: number;
  /** The room picture behind the level; its index is ATLAS_PAGES.length. */
  background: number;
};

const STEP_MS = STEP * 1000;

function logUiFps(frames: number) {
  console.log(`[legs probe] UI thread draws at ${frames} Hz`);
}

/** Draws one op list at blend `a` (0 = one step ago, 1 = now). Runs on the UI thread. */
function drawOps(canvas: SkCanvas, d: Float64Array, a: number, images: (SkImage | null)[]) {
  'worklet';
  const b = 1 - a;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  for (let i = 0; i + STRIDE <= d.length; i += STRIDE) {
    const img = d[i];
    const alpha = d[i + 17] * b + d[i + 10] * a;
    if (alpha <= 0.01) continue;
    const cx = d[i + 12] * b + d[i + 5] * a;
    const cy = d[i + 13] * b + d[i + 6] * a;
    const dw = d[i + 14] * b + d[i + 7] * a;
    const dh = d[i + 15] * b + d[i + 8] * a;
    const rot = d[i + 16] * b + d[i + 9] * a;
    canvas.save();
    canvas.translate(cx, cy);
    if (rot !== 0) canvas.rotate((rot * 180) / Math.PI, 0, 0);
    if (img === RECT) {
      const c = d[i + 11];
      paint.setColor(Float32Array.of(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1));
      paint.setAlphaf(alpha);
      canvas.drawRect(Skia.XYWHRect(-dw / 2, -dh / 2, dw, dh), paint);
    } else {
      const im = images[img];
      if (im) {
        if (dw < 0) canvas.scale(-1, 1);
        const w = Math.abs(dw);
        paint.setColor(Float32Array.of(0, 0, 0, 1));
        paint.setAlphaf(alpha);
        canvas.drawImageRectOptions(im, Skia.XYWHRect(d[i + 1], d[i + 2], d[i + 3], d[i + 4]), Skia.XYWHRect(-w / 2, -dh / 2, w, dh), FilterMode.Linear, MipmapMode.None, paint);
      }
    }
    canvas.restore();
  }
}

/**
 * Draws the op list from buildFrame. The simulation hands over a new list each of its steps; on every
 * display frame, one frame callback blends each op from where (and how) it was one step ago to where
 * it is now and draws the picture, so a 120 Hz screen gets a fresh picture every frame and nothing
 * else ever draws at a stale blend.
 */
export const GameCanvas = memo(function GameCanvas({ ops, width, height, background }: Props) {
  // ATLAS_PAGES has a fixed length, so this keeps the hook order stable.
  const pages = ATLAS_PAGES.map((src) => useImage(src)); // eslint-disable-line react-hooks/rules-of-hooks
  const bg = useImage(background);
  const images: (SkImage | null)[] = [...pages, bg];

  const picture = useSharedValue(createPicture(() => {}, { width, height }));
  const clock = useSharedValue<{ seen: Float64Array | null; at: number; frames: number; start: number; logged: boolean; drawn: number }>({
    seen: null,
    at: 0,
    frames: 0,
    start: 0,
    logged: !__DEV__,
    drawn: -1,
  });
  useFrameCallback((info) => {
    'worklet';
    const c = clock.value;
    const now = info.timestamp;
    const list = ops.value;
    if (list !== c.seen) {
      c.seen = list;
      c.at = now;
    }
    const a = Math.min(1, (now - c.at) / STEP_MS);
    // Nothing changed since the last draw (paused): keep the picture.
    if (a === 1 && c.drawn === 1) return;
    c.drawn = a;
    picture.value = createPicture((canvas) => drawOps(canvas, list, a, images), { width, height });
    if (!c.logged) {
      if (!c.start) c.start = now;
      c.frames++;
      if (now - c.start >= 1000) {
        c.logged = true;
        runOnJS(logUiFps)(c.frames);
      }
    }
  }, true);

  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
});
