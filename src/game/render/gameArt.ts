// The level's pictures (the sprite atlas pages and the rooms behind) as Skia images, loaded once per app run
// and kept. The play screen gets them all at once, so a level never starts with part of the scene missing,
// or part of the pup: its body, legs and tail sit on both atlas pages.
import { loadData, Skia, type SkImage } from '@shopify/react-native-skia';

const done = new Map<number, SkImage>();
const loading = new Map<number, Promise<SkImage | null>>();

/**
 * Skia decodes a picture the first time it is drawn, on the UI thread, so a 2048 px atlas page would stall the
 * level's first frames. Decoding it here, once, keeps that off the screen; if that is not possible the lazy
 * picture still works.
 */
function decoded(img: SkImage): SkImage {
  try {
    const raster = img.makeNonTextureImage();
    if (raster && raster !== img) {
      img.dispose();
      return raster;
    }
  } catch {
    // No GPU context on this thread: keep the lazily decoded picture.
  }
  return img;
}

/** Loads one picture by its require() id (or joins its loading). Resolves null if it cannot load; a later call tries again. */
export function loadArt(src: number): Promise<SkImage | null> {
  const ready = done.get(src);
  if (ready) return Promise.resolve(ready);
  let p = loading.get(src);
  if (!p) {
    p = loadData<SkImage>(src, (data) => Skia.Image.MakeImageFromEncoded(data))
      .then((img) => (img ? decoded(img) : null))
      .catch(() => null)
      .then((img) => {
        loading.delete(src);
        if (img) done.set(src, img);
        return img;
      });
    loading.set(src, p);
  }
  return p;
}

/** All of these pictures if every one has already loaded, else null. */
export function loadedArt(srcs: readonly number[]): SkImage[] | null {
  const all: SkImage[] = [];
  for (const s of srcs) {
    const img = done.get(s);
    if (!img) return null;
    all.push(img);
  }
  return all;
}

/** Every one of these pictures, once all have finished loading (any that failed are null). */
export function loadAllArt(srcs: readonly number[]): Promise<(SkImage | null)[]> {
  return Promise.all(srcs.map(loadArt));
}
