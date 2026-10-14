import {
  Canvas,
  FilterMode,
  MipmapMode,
  Picture,
  Skia,
  createPicture,
  type SkImage,
  type SkPicture,
  type SkPictureRecorder,
} from '@shopify/react-native-skia';
import { memo, useEffect, useState } from 'react';
import { runOnJS, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import atlas from './atlas.json';
import { ATLAS_PAGES } from './atlasImages';
import { HEADER, STRIP_AT, stripTable, type AtlasData } from './buildFrame';
import { LEGS_PROBE, type UiStats } from './devProbe';
import { advancePlayhead, drawOps, newPlayhead, type DrawScratch, type Playhead } from './drawOps';
import { loadAllArt, loadedArt } from './gameArt';

type Props = {
  ops: SharedValue<Float64Array>;
  width: number;
  height: number;
  /** The room picture behind the level; its index is ATLAS_PAGES.length. */
  background: number;
  /** Called once every picture the level draws with has loaded (over a dev tunnel that can take seconds). */
  onReady?: () => void;
  /** Frame readout for the dev overlay: refreshed once a second from the UI thread. */
  uiStats?: SharedValue<UiStats>;
};

/** Pictures stay alive this many frames after they are replaced, then are freed (see the frame callback). */
const KEEP = 4;
/** Where every leg and tail frame sits in the atlas, for the strip ops. */
const STRIPS = stripTable(atlas as unknown as AtlasData);
const NO_ART: (SkImage | null)[] = [];

/**
 * The atlas pages and the room, all at once: none until every one has finished loading (from the cache the
 * app started filling as it opened, or loaded now), so the level is never drawn with a piece missing.
 */
function useArt(background: number): (SkImage | null)[] | null {
  const [art, setArt] = useState<(SkImage | null)[] | null>(() => loadedArt([...ATLAS_PAGES, background]));
  useEffect(() => {
    if (art) return;
    let live = true;
    loadAllArt([...ATLAS_PAGES, background]).then((all) => {
      if (live) setArt(all);
    });
    return () => {
      live = false;
    };
  }, [art, background]);
  return art;
}

function logUiFps(frames: number) {
  console.log(`[legs probe] UI thread draws at ${frames} Hz`);
}

interface Clock {
  play: Playhead;
  /** What the last picture showed, so an unchanged frame is not recorded again. */
  drawnList: Float64Array | null;
  drawnA: number;
  drawnArt: number;
  /** Made on the UI thread on the first frame and reused for every frame after. */
  recorder: SkPictureRecorder | null;
  scratch: DrawScratch | null;
  made: SkPicture[];
  frames: number;
  start: number;
  logged: boolean;
  lastTs: number;
  statsStart: number;
  statsFrames: number;
  statsMax: number;
  statsOver: number;
}

/**
 * Draws the op lists from buildFrame. The simulation hands over a new list each of its steps; on every
 * display frame, one frame callback moves a playhead through the last two lists and blends each op
 * between where (and how) it was one step ago and where it is now, so a 120 Hz screen gets a fresh
 * picture every frame and nothing ever draws at a stale blend.
 */
export const GameCanvas = memo(function GameCanvas({ ops, width, height, background, onReady, uiStats }: Props) {
  const art = useArt(background);
  const images = art ?? NO_ART;

  useEffect(() => {
    if (art) onReady?.();
  }, [art, onReady]);

  // The empty picture shown before the first frame, made once (not on every render).
  const [blank] = useState(() => createPicture(() => {}, { width, height }));
  const picture = useSharedValue(blank);
  const clock = useSharedValue<Clock>({
    play: newPlayhead(),
    drawnList: null,
    drawnA: -1,
    drawnArt: -1,
    recorder: null,
    scratch: null,
    made: [],
    frames: 0,
    start: 0,
    logged: !(LEGS_PROBE && __DEV__),
    lastTs: 0,
    statsStart: 0,
    statsFrames: 0,
    statsMax: 0,
    statsOver: 0,
  });
  useFrameCallback((info) => {
    'worklet';
    const c = clock.value;
    const list = ops.value;
    // Nothing is drawn until every picture is in: the first frame shows the whole scene, the whole pup.
    const now = info.timestamp;
    if (uiStats) {
      if (c.lastTs) {
        const gap = now - c.lastTs;
        c.statsFrames++;
        if (gap > c.statsMax) c.statsMax = gap;
        if (gap > 25) c.statsOver++;
      }
      c.lastTs = now;
      if (!c.statsStart) c.statsStart = now;
      else if (now - c.statsStart >= 1000) {
        uiStats.set({ fps: c.statsFrames, max: Math.round(c.statsMax), over: c.statsOver });
        c.statsStart = now;
        c.statsFrames = 0;
        c.statsMax = 0;
        c.statsOver = 0;
      }
    }
    if (list.length < HEADER || images.length === 0) return;
    const p = c.play;
    advancePlayhead(p, now, list);
    let art = 0;
    for (let i = 0; i < images.length; i++) if (images[i]) art++;
    // Nothing new to show: the same moment of the same list (or a list where nothing moves), with the same art.
    if (p.list === c.drawnList && (p.a === c.drawnA || p.list![1] === 1) && art === c.drawnArt) return;
    c.drawnList = p.list;
    c.drawnA = p.a;
    c.drawnArt = art;
    if (!c.recorder) c.recorder = Skia.PictureRecorder();
    if (!c.scratch) {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      c.scratch = {
        paint,
        src: { x: 0, y: 0, width: 0, height: 0 },
        dst: { x: 0, y: 0, width: 0, height: 0 },
        color: new Float32Array(4),
        rgb: -1,
        alpha: 1,
        aa: true,
        filter: FilterMode.Linear,
        mipmap: MipmapMode.None,
        strips: STRIPS,
        stripAt: STRIP_AT,
      };
    }
    // One recorder for every frame, and no bounds: the ops are already culled to the screen, and bounds would
    // build a lookup tree for every picture. (A new recorder per frame told the UI thread's garbage collector
    // about a megabyte each, 120 times a second.)
    const canvas = c.recorder.beginRecording();
    drawOps(canvas, p.list!, p.a, images, c.scratch);
    const next = c.recorder.finishRecordingAsPicture();
    picture.value = next;
    // Free old pictures a few frames after they were replaced: the canvas has copied what it needs by then,
    // and on the web nothing else would ever free them.
    c.made.push(next);
    if (c.made.length > KEEP) c.made.shift()!.dispose();
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
