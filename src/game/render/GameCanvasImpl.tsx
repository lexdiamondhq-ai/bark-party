import {
  Canvas,
  FilterMode,
  MipmapMode,
  Picture,
  Skia,
  createPicture,
  useImage,
  type SkImage,
} from '@shopify/react-native-skia';
import { runOnJS, useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { STEP } from '../constants';
import { ATLAS_PAGES } from './atlasImages';
import { RECT, STRIDE } from './buildFrame';

type Props = {
  ops: SharedValue<number[]>;
  width: number;
  height: number;
  /** The room picture behind the level; its index is ATLAS_PAGES.length. */
  background: number;
};

const STEP_MS = STEP * 1000;

function logUiFps(frames: number) {
  console.log(`[legs probe] UI thread draws at ${frames} Hz`);
}

/**
 * Draws the op list from buildFrame. The simulation hands over a new list each of its steps; between
 * lists, every display frame draws each op part way from where it was to where it is now, so a
 * 120 Hz screen gets a fresh picture every frame.
 */
export function GameCanvas({ ops, width, height, background }: Props) {
  // ATLAS_PAGES has a fixed length, so this keeps the hook order stable.
  const pages = ATLAS_PAGES.map((src) => useImage(src)); // eslint-disable-line react-hooks/rules-of-hooks
  const bg = useImage(background);
  const images: (SkImage | null)[] = [...pages, bg];

  // How far this display frame sits between the previous simulation step and the latest one.
  const blend = useSharedValue(1);
  const clock = useSharedValue<{ seen: number[] | null; at: number; frames: number; start: number; logged: boolean }>({
    seen: null,
    at: 0,
    frames: 0,
    start: 0,
    logged: !__DEV__,
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
    const next = Math.min(1, (now - c.at) / STEP_MS);
    if (next !== blend.value) blend.value = next;
    if (!c.logged) {
      if (!c.start) c.start = now;
      c.frames++;
      if (now - c.start >= 1000) {
        c.logged = true;
        runOnJS(logUiFps)(c.frames);
      }
    }
  }, true);

  const picture = useDerivedValue(() => {
    const d = ops.value;
    const a = blend.value;
    return createPicture(
      (canvas) => {
        const paint = Skia.Paint();
        paint.setAntiAlias(true);
        for (let i = 0; i + STRIDE <= d.length; i += STRIDE) {
          const img = d[i];
          const dw = d[i + 7];
          const dh = d[i + 8];
          const rot = d[i + 9];
          const alpha = d[i + 10];
          if (alpha <= 0.01) continue;
          const cx = d[i + 12] + (d[i + 5] - d[i + 12]) * a;
          const cy = d[i + 13] + (d[i + 6] - d[i + 13]) * a;
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
              canvas.drawImageRectOptions(
                im,
                Skia.XYWHRect(d[i + 1], d[i + 2], d[i + 3], d[i + 4]),
                Skia.XYWHRect(-w / 2, -dh / 2, w, dh),
                FilterMode.Linear,
                MipmapMode.None,
                paint,
              );
            }
          }
          canvas.restore();
        }
      },
      { width, height },
    );
  }, [ops, blend, width, height, ...images]);

  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
