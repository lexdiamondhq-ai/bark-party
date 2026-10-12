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
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { ATLAS_PAGES } from './atlasImages';
import { RECT, STRIDE } from './buildFrame';

type Props = {
  ops: SharedValue<number[]>;
  width: number;
  height: number;
  /** The room picture behind the level; its index is ATLAS_PAGES.length. */
  background: number;
};

/** Draws the op list from buildFrame. Runs on the UI thread every time `ops` changes. */
export function GameCanvas({ ops, width, height, background }: Props) {
  // ATLAS_PAGES has a fixed length, so this keeps the hook order stable.
  const pages = ATLAS_PAGES.map((src) => useImage(src)); // eslint-disable-line react-hooks/rules-of-hooks
  const bg = useImage(background);
  const images: (SkImage | null)[] = [...pages, bg];

  const picture = useDerivedValue(() => {
    const d = ops.value;
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
          canvas.save();
          canvas.translate(d[i + 5], d[i + 6]);
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
  }, [ops, width, height, ...images]);

  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
