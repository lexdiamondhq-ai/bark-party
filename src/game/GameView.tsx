import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInLeft,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, fonts, springs } from '../theme/tokens';
import { initAudio, pauseMusic, playMusic, playSfx, preloadSfx, isMuted, setMuted } from './audio';
import { COACH_CHEER, DOGS, HUD, ROOMS, ROOM_SIZE } from './art';
import { NO_BOOSTS, type RunBoosts } from '../engine/progress';
import { POWER, STEP, VIEW_H } from './constants';
import type { CoachId, LevelDef } from './level/types';
import { GameCanvas } from './render/GameCanvas';
import { ATLAS_PAGES } from './render/atlasImages';
import atlas from './render/atlas.json';
import { buildFrame, OpList, type AtlasData, type FrameSetup, type PupProbe } from './render/buildFrame';
import { LEGS_PROBE } from './render/devProbe';
import { NO_INPUT, type GameEvent, type Input, type PowerKind } from './sim/types';
import { cameraTarget, continueFromCheckpoint, createWorld, drainEvents, levelResult, resizeView, setReduceMotion, snapPrev, stepWorld, type LevelResult } from './sim/world';
import type { DogId } from './sprites';
import { BOSS_NAME, DOG_NAMES } from './story';

function createStartWorld(level: LevelDef, viewW: number, startX: number | undefined, boosts: RunBoosts) {
  const w = createWorld(level, viewW, 11, boosts);
  if (startX && __DEV__) {
    w.hero.x = startX;
    w.respawnX = startX;
    w.camX = cameraTarget(w);
    snapPrev(w);
  }
  return w;
}

/** Development only (LEGS_PROBE): one second of per-frame timing, printed to the console, to check the legs never stutter. */
type ProbeRow = { dt: number; steps: number; legA: number; legB: number; legT: number; tuckT: number; buildMs: number; setMs: number; ops: number };
type Probe = { label: string; rows: ProbeRow[]; until: number };

function reportProbe(p: Probe) {
  const rows = p.rows;
  if (rows.length < 10) return;
  const dts = rows.map((r) => r.dt).sort((a, b) => a - b);
  const median = dts[Math.floor(dts.length / 2)];
  const slow = rows.filter((r) => r.dt > median * 1.5).length;
  const idle = rows.filter((r) => r.steps === 0).length;
  let maxJump = 0;
  let stalls = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (b.tuckT > 0 || a.tuckT > 0) continue;
    const jump = ((b.legA - a.legA + 48) % 48) + (b.legT - a.legT);
    maxJump = Math.max(maxJump, jump);
    if (b.legA === a.legA && b.legT === a.legT) stalls++;
  }
  const avg = (f: (r: ProbeRow) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
  console.log(
    `[legs probe: ${p.label}] ${rows.length} frames, median dt ${(median * 1000).toFixed(2)} ms (${Math.round(1 / median)} Hz), ` +
      `${slow} slow, ${idle} zero-step, ${stalls} repeated leg frames, max leg advance ${maxJump.toFixed(2)} frames/tick, ` +
      `build ${avg((r) => r.buildMs).toFixed(2)} ms, set ${avg((r) => r.setMs).toFixed(2)} ms, ${Math.round(avg((r) => r.ops))} ops`,
  );
  console.table(rows.map((r) => ({ ...r, dt: +(r.dt * 1000).toFixed(2), legT: +r.legT.toFixed(2), tuckT: +r.tuckT.toFixed(2), buildMs: +r.buildMs.toFixed(2), setMs: +r.setMs.toFixed(2) })));
}
const SWIPE_DOWN = 26;
const BARK_SIZE = 96;

/**
 * Frame timing. A frame within SNAP seconds of one step counts as exactly one step. The JS thread's frames
 * run at the step rate (60 Hz) and their times jitter by a few milliseconds; without this the step counter
 * sits on the edge and the world steps twice in one frame and not at all in the next, about one frame in four
 * (measured in the simulator), which shows as a stop and a jump. Real frame lengths come in whole display
 * frames (8.3, 16.7, 25, 33 ms), so a missed frame is never snapped. At most MAX_STEPS steps run in one frame;
 * after a longer stall the world waits for it instead of racing ahead, so the picture never skips more than a step.
 */
const SNAP = 0.004;
const MAX_STEPS = 2;
/** If the level's pictures have not loaded by then (a dropped dev tunnel), the count-in starts anyway. */
const ART_WAIT_MS = 8000;

type Props = {
  level: LevelDef;
  /** Treats bought in the shop. */
  boosts?: RunBoosts;
  onWin: (result: LevelResult) => void;
  /** Quit from the pause menu: the bones picked up so far still count. */
  onQuit: (result: LevelResult) => void;
  /** Development only: start the run at this x (for testing later parts of a level). */
  startX?: number;
};

type Callout = { key: number; coach?: CoachId; dog?: DogId; text: string };

const POWER_NAMES: Record<PowerKind, string> = { mega: 'Mega Pup', turbo: 'Turbo', ball: 'Ball Mouth', bubble: 'Bubble' };
const POWER_TIPS: Record<PowerKind, string> = {
  mega: 'Run right through them!',
  turbo: 'Bones count double. Go go go!',
  ball: 'BARK fires tennis balls!',
  bubble: 'One free hit.',
};
const POWER_ICON: Record<PowerKind, number> = {
  mega: require('../../assets/game/sprites/power_mega.png'),
  turbo: require('../../assets/game/sprites/power_turbo.png'),
  ball: require('../../assets/game/sprites/power_ball.png'),
  bubble: require('../../assets/game/sprites/power_bubble.png'),
};
const POWER_MAX: Record<'mega' | 'turbo' | 'ball', number> = { mega: POWER.megaTime, turbo: POWER.turboTime, ball: POWER.ballTime };

/** Seconds left on each timed power, for the bars. Written by the game loop, read on the UI thread. */
type PowerLeft = Record<'mega' | 'turbo' | 'ball', number>;
type PowersOn = { mega: boolean; turbo: boolean; ball: boolean; bubble: number };

/**
 * What the HUD shows. The game loop writes it as things happen; each piece of the HUD reads only its own
 * part and re-renders alone, so a bone, a callout or a banner never re-renders the whole screen (and
 * never holds up the game loop on the JS thread while the run is on).
 */
interface HudState {
  hearts: number;
  bones: number;
  friends: DogId[];
  powers: PowersOn;
  boss: { hits: number; needed: number } | null;
  callout: Callout | null;
  banner: { key: number; text: string } | null;
}

function createHud(initial: HudState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<HudState>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
type Hud = ReturnType<typeof createHud>;

function useHud<T>(hud: Hud, pick: (s: HudState) => T): T {
  return useSyncExternalStore(hud.subscribe, () => pick(hud.get()));
}

/** A live power on the HUD: its sticker, and a bar that drains (on the UI thread) as it runs out. */
function PowerChip({ kind, left, max, count = 0 }: { kind: PowerKind; left: SharedValue<PowerLeft>; max: number; count?: number }) {
  const fill = useAnimatedStyle(() => {
    const v = kind === 'bubble' ? 0 : left.value[kind];
    return { width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` };
  });
  return (
    <Animated.View entering={ZoomIn.springify().damping(12)} exiting={FadeOut.duration(200)} style={styles.power}>
      <Image source={POWER_ICON[kind]} style={styles.powerIcon} />
      {kind === 'bubble' ? (
        <Text style={styles.powerCount}>x{count}</Text>
      ) : (
        <View style={styles.powerBar}>
          <Animated.View style={[styles.powerFill, fill]} />
        </View>
      )}
    </Animated.View>
  );
}

const HudHearts = memo(function HudHearts({ hud, max }: { hud: Hud; max: number }) {
  const hearts = useHud(hud, (s) => s.hearts);
  return (
    <View style={styles.hudRow} pointerEvents="none">
      {Array.from({ length: max }, (_, i) => (
        <Heart key={i} full={i < hearts} />
      ))}
    </View>
  );
});

const HudBones = memo(function HudBones({ hud, bump }: { hud: Hud; bump: SharedValue<number> }) {
  const bones = useHud(hud, (s) => s.bones);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  return (
    <Animated.View style={[styles.chip, style]} pointerEvents="none">
      <Image source={HUD.bone} style={styles.boneIcon} />
      <Text style={styles.chipText}>{bones}</Text>
    </Animated.View>
  );
});

const HudFriends = memo(function HudFriends({ hud }: { hud: Hud }) {
  const friends = useHud(hud, (s) => s.friends);
  return (
    <View style={styles.hudRow} pointerEvents="none">
      {friends.map((d) => (
        <Image key={d} source={DOGS[d]} style={styles.friend} />
      ))}
    </View>
  );
});

const HudPowers = memo(function HudPowers({ hud, left, megaMax, turboMax }: { hud: Hud; left: SharedValue<PowerLeft>; megaMax: number; turboMax: number }) {
  const on = useHud(hud, (s) => s.powers);
  return (
    <View style={styles.hudRow} pointerEvents="none">
      {on.mega && <PowerChip kind="mega" left={left} max={megaMax} />}
      {on.turbo && <PowerChip kind="turbo" left={left} max={turboMax} />}
      {on.ball && <PowerChip kind="ball" left={left} max={POWER_MAX.ball} />}
      {on.bubble > 0 && <PowerChip kind="bubble" left={left} max={1} count={on.bubble} />}
    </View>
  );
});

const HudBoss = memo(function HudBoss({ hud, name }: { hud: Hud; name: string }) {
  const boss = useHud(hud, (s) => s.boss);
  if (!boss) return null;
  return (
    <Animated.View entering={FadeIn} pointerEvents="none" style={[styles.bossBar, { bottom: 14 }]}>
      <Image source={HUD.cake} style={styles.bossCake} />
      <View>
        <Text style={styles.bossName}>{name}</Text>
        <View style={styles.hudRow}>
          {Array.from({ length: boss.needed }, (_, i) => (
            <View key={i} style={[styles.pip, i < boss.needed - boss.hits ? styles.pipFull : null]} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
});

const HudCallout = memo(function HudCallout({ hud, left }: { hud: Hud; left: number }) {
  const callout = useHud(hud, (s) => s.callout);
  if (!callout) return null;
  return (
    <Animated.View
      key={`callout-${callout.key}`}
      entering={SlideInLeft.springify().damping(16)}
      exiting={SlideOutLeft.duration(200)}
      pointerEvents="none"
      style={[styles.callout, { left, top: 8 }]}
    >
      <Image
        source={callout.coach ? COACH_CHEER[callout.coach] : DOGS[callout.dog!]}
        style={callout.coach ? styles.calloutCoach : styles.calloutDog}
        resizeMode="contain"
      />
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>{callout.text}</Text>
      </View>
    </Animated.View>
  );
});

const HudBanner = memo(function HudBanner({ hud }: { hud: Hud }) {
  const banner = useHud(hud, (s) => s.banner);
  if (!banner) return null;
  return (
    <Animated.View key={`banner-${banner.key}`} entering={ZoomIn.springify().damping(10)} exiting={FadeOut} pointerEvents="none" style={styles.bannerWrap}>
      <Text style={styles.banner}>{banner.text}</Text>
    </Animated.View>
  );
});

/** The run from the player's side: a count-in, then running, with pauses, game over and the win. */
type RunState = 'ready' | 'running' | 'paused' | 'gameover' | 'won';

/** Seconds of "Ready?" then "Go!" before the dog starts. */
const COUNT_IN = { ready: 0.9, go: 0.5 };

export function GameView({ level, boosts = NO_BOOSTS, onWin, onQuit, startX }: Props) {
  const { width, height } = useWindowDimensions();
  const k = height / VIEW_H;
  const viewW = width / k;

  const [world] = useState(() => createStartWorld(level, viewW, startX, boosts));
  const [hud] = useState(() =>
    createHud({
      hearts: world.maxHearts,
      bones: 0,
      friends: [],
      powers: { mega: false, turbo: false, ball: false, bubble: world.hero.powers.bubble },
      boss: null,
      callout: null,
      banner: null,
    }),
  );
  const ops = useSharedValue<Float64Array>(new Float64Array(0));
  const powerLeft = useSharedValue<PowerLeft>({ mega: 0, turbo: 0, ball: 0 });
  const input = useRef<Input>({ ...NO_INPUT });
  const jumpTouch = useRef<{ id: string; y: number; slid: boolean } | null>(null);
  const runState = useRef<RunState>('ready');
  const reduceMotion = useRef(false);
  const doneRef = useRef(false);
  const probe = useRef<Probe | null>(LEGS_PROBE && __DEV__ ? { label: 'level start', rows: [], until: 0 } : null);
  const probedJump = useRef(false);
  /** Steps the world has taken this run; each list for the canvas carries it. */
  const stepCount = useRef(0);

  const [state, setState] = useState<RunState>('ready');
  const [countIn, setCountIn] = useState<'ready' | 'go' | null>('ready');
  const [muted, setMutedState] = useState(isMuted());
  const [artReady, setArtReady] = useState(false);
  const markArtReady = useCallback(() => setArtReady(true), []);
  const setRun = useCallback((s: RunState) => {
    runState.current = s;
    setState(s);
  }, []);

  const barkScale = useSharedValue(1);
  const barkStyle = useAnimatedStyle(() => ({ transform: [{ scale: barkScale.value }] }));
  const boneBump = useSharedValue(1);

  useEffect(() => {
    resizeView(world, viewW);
  }, [viewW, world]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        reduceMotion.current = v;
        setReduceMotion(world, v);
      })
      .catch(() => {});
    initAudio();
    preloadSfx();
    playMusic(level.music);
    return () => playMusic('none');
  }, [level.music, world]);

  // The count-in waits for the level's pictures: over a slow dev tunnel they can take seconds, and the dog
  // must never start running through a room that is not drawn yet.
  useEffect(() => {
    const t = setTimeout(markArtReady, ART_WAIT_MS);
    return () => clearTimeout(t);
  }, [markArtReady]);

  // Count-in: "Ready?" then "Go!", and the dog is off.
  useEffect(() => {
    if (!artReady) return;
    const go = setTimeout(() => {
      setCountIn('go');
      playSfx('whoosh');
      setRun('running');
    }, COUNT_IN.ready * 1000);
    const done = setTimeout(() => setCountIn(null), (COUNT_IN.ready + COUNT_IN.go) * 1000);
    return () => {
      clearTimeout(go);
      clearTimeout(done);
    };
  }, [artReady, setRun]);

  // Callouts and banners are siblings, so their keys come from separate counters, never the clock.
  const keys = useRef({ callout: 0, banner: 0 });
  const timers = useRef<{ callout: ReturnType<typeof setTimeout> | null; banner: ReturnType<typeof setTimeout> | null }>({ callout: null, banner: null });
  useEffect(() => {
    const t = timers.current;
    return () => {
      if (t.callout) clearTimeout(t.callout);
      if (t.banner) clearTimeout(t.banner);
    };
  }, []);
  const showCallout = useCallback(
    (c: Omit<Callout, 'key'>, ms = 2800) => {
      hud.set({ callout: { ...c, key: ++keys.current.callout } });
      const t = timers.current;
      if (t.callout) clearTimeout(t.callout);
      t.callout = setTimeout(() => hud.set({ callout: null }), ms);
    },
    [hud],
  );
  const showBanner = useCallback(
    (text: string) => {
      hud.set({ banner: { key: ++keys.current.banner, text } });
      const t = timers.current;
      if (t.banner) clearTimeout(t.banner);
      t.banner = setTimeout(() => hud.set({ banner: null }), 1800);
    },
    [hud],
  );

  // An effect event: it always sees the latest props (onWin is a new function on every render of the
  // screen) without being a dependency, so the game loop below never tears down and restarts mid-run.
  const handleEvents = useEffectEvent((events: GameEvent[]) => {
    for (const e of events) {
      switch (e.type) {
        case 'sfx':
          playSfx(e.name);
          break;
        case 'haptic':
          if (Platform.OS === 'web') break;
          if (e.kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          else if (e.kind === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          else if (e.kind === 'selection') Haptics.selectionAsync().catch(() => {});
          else
            Haptics.impactAsync(
              e.kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : e.kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
            ).catch(() => {});
          break;
        case 'callout':
          showCallout({ coach: e.coach, text: e.text });
          break;
        case 'hurt':
          hud.set({ hearts: Math.max(0, e.hearts) });
          break;
        case 'power':
          showBanner(POWER_NAMES[e.kind].toUpperCase() + '!');
          if (e.kind !== 'bubble') showCallout({ coach: 'leo', text: POWER_TIPS[e.kind] }, 2200);
          break;
        case 'bubble_pop':
          showBanner('POP!');
          break;
        case 'rescue':
          hud.set({ friends: [...hud.get().friends, e.dog] });
          showCallout({ dog: e.dog, text: `${DOG_NAMES[e.dog]} is free! Woof!` }, 2200);
          break;
        case 'checkpoint':
          break;
        case 'boss_start':
          hud.set({ boss: { hits: 0, needed: world.boss?.hitsNeeded ?? 3 } });
          showBanner((level.boss?.name ?? BOSS_NAME).toUpperCase() + '!');
          break;
        case 'boss_hit':
          hud.set({ boss: { hits: e.hits, needed: e.needed } });
          break;
        case 'boss_defeated':
          showBanner('GOT THE CAKE!');
          break;
        case 'won':
          if (!doneRef.current) {
            doneRef.current = true;
            setRun('won');
            onWin(levelResult(world));
          }
          break;
        case 'gameover':
          setRun('gameover');
          break;
        case 'music':
          playMusic(e.name);
          break;
      }
    }
  });

  // The game loop: fixed 60 Hz steps on the JS thread, then one list of draw ops for the UI thread.
  useEffect(() => {
    const out = new OpList();
    const pup: PupProbe = { legA: 0, legB: 0, legT: 0, tuckT: 0 };
    const setup: FrameSetup = {
      atlas: atlas as unknown as AtlasData,
      background: { image: ATLAS_PAGES.length, w: ROOM_SIZE.w, h: ROOM_SIZE.h },
      k,
      screenW: width,
      screenH: height,
      reduceMotion: false,
      probe: pup,
    };
    let raf = 0;
    let last = 0;
    let acc = 0;
    let lastBones = -1;
    let drawn = false;
    let barsOn = false;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      let elapsed = last ? (now - last) / 1000 : 0;
      last = now;
      const s = runState.current;
      if (s !== 'running' && s !== 'won') {
        acc = 0;
        // Before "Go!", draw the still scene once so the count-in has something behind it.
        if (s !== 'ready' || drawn) return;
      }
      if (Math.abs(elapsed - STEP) < SNAP) elapsed = STEP;
      acc += elapsed;
      let steps = 0;
      while (s !== 'ready' && acc >= STEP && steps < MAX_STEPS) {
        const i = input.current;
        stepWorld(world, i, STEP);
        stepCount.current++;
        i.jumpPressed = false;
        i.slidePressed = false;
        i.barkPressed = false;
        acc -= STEP;
        steps++;
      }
      if (acc >= STEP) acc = 0;
      if (steps === 0 && s !== 'ready') return;
      drawn = true;
      // One op list per step; the canvas draws the frames in between (see GameCanvasImpl).
      const p = probe.current;
      const t0 = p ? performance.now() : 0;
      setup.reduceMotion = reduceMotion.current;
      buildFrame(world, setup, out);
      const t1 = p ? performance.now() : 0;
      ops.set(out.handOff(stepCount.current, world.prev.t === world.t));
      if (p) {
        if (!p.until) p.until = now + 1000;
        p.rows.push({ dt: elapsed, steps, legA: pup.legA, legB: pup.legB, legT: pup.legT, tuckT: pup.tuckT, buildMs: t1 - t0, setMs: performance.now() - t1, ops: out.count });
        if (now >= p.until) {
          probe.current = null;
          reportProbe(p);
        }
      }
      const events = drainEvents(world);
      if (events.length) handleEvents(events);
      // Power chips appear and go as powers start and end; their bars drain on the UI thread.
      const pw = world.hero.powers;
      const on = hud.get().powers;
      if (on.mega !== pw.mega > 0 || on.turbo !== pw.turbo > 0 || on.ball !== pw.ball > 0 || on.bubble !== pw.bubble) {
        hud.set({ powers: { mega: pw.mega > 0, turbo: pw.turbo > 0, ball: pw.ball > 0, bubble: pw.bubble } });
      }
      const timed = pw.mega > 0 || pw.turbo > 0 || pw.ball > 0;
      if (timed || barsOn) powerLeft.set({ mega: pw.mega, turbo: pw.turbo, ball: pw.ball });
      barsOn = timed;
      if (world.bones !== lastBones) {
        if (lastBones >= 0) boneBump.set(withSequence(withTiming(1.3, { duration: 60 }), withSpring(1, springs.bouncy)));
        lastBones = world.bones;
        hud.set({ bones: world.bones });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [boneBump, height, hud, k, ops, powerLeft, width, world]);

  const togglePause = () => {
    const s = runState.current;
    if (s !== 'running' && s !== 'paused') return;
    const next = s === 'running' ? 'paused' : 'running';
    setRun(next);
    pauseMusic(next === 'paused');
    playSfx('button');
  };

  // Keyboard for the web build and the simulator: space or up jumps, down slides, X barks.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const down = (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (ev.code === 'Space' || ev.code === 'ArrowUp') {
        input.current.jumpPressed = true;
        input.current.jumpHeld = true;
      } else if (ev.code === 'ArrowDown') input.current.slidePressed = true;
      else if (ev.code === 'KeyX' || ev.code === 'KeyB') input.current.barkPressed = true;
      else if (ev.code === 'Escape') togglePause();
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === 'Space' || ev.code === 'ArrowUp') input.current.jumpHeld = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  // Touch: tap anywhere to jump (hold for higher), swipe down to slide.
  const onTouchStart = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      if (jumpTouch.current) continue;
      jumpTouch.current = { id: String(t.identifier), y: t.pageY, slid: false };
      input.current.jumpPressed = true;
      input.current.jumpHeld = true;
      if (LEGS_PROBE && __DEV__ && !probedJump.current && !probe.current) {
        probedJump.current = true;
        probe.current = { label: 'first jump', rows: [], until: 0 };
      }
    }
  };
  const onTouchMove = (e: GestureResponderEvent) => {
    const jt = jumpTouch.current;
    if (!jt || jt.slid) return;
    for (const t of e.nativeEvent.changedTouches) {
      if (String(t.identifier) !== jt.id) continue;
      if (t.pageY - jt.y > SWIPE_DOWN) {
        jt.slid = true;
        input.current.slidePressed = true;
        input.current.jumpHeld = false;
      }
    }
  };
  const onTouchEnd = (e: GestureResponderEvent) => {
    const jt = jumpTouch.current;
    if (!jt) return;
    for (const t of e.nativeEvent.changedTouches) {
      if (String(t.identifier) === jt.id) {
        jumpTouch.current = null;
        input.current.jumpHeld = false;
      }
    }
  };

  const bark = () => {
    input.current.barkPressed = true;
    barkScale.set(withSequence(withTiming(0.86, { duration: 50 }), withSpring(1, springs.squish)));
  };

  const retry = () => {
    continueFromCheckpoint(world);
    drainEvents(world);
    // A boss that went back to waiting makes its entrance again, bar and all.
    hud.set({ hearts: world.hero.hearts, boss: world.boss && world.boss.phase !== 'waiting' ? hud.get().boss : null });
    setRun('running');
    playMusic(world.phase === 'boss' ? 'music_boss' : level.music);
  };

  const quit = () => {
    setRun('paused');
    playMusic('none');
    onQuit(levelResult(world));
  };

  const isPaused = state === 'paused';
  const gameOver = state === 'gameover';

  const pad = Math.max(16, width * 0.03);

  return (
    <View style={styles.root}>
      <View
        style={StyleSheet.absoluteFill}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <GameCanvas ops={ops} width={width} height={height} background={ROOMS[level.background]} onReady={markArtReady} />
      </View>

      {/* HUD */}
      <View pointerEvents="box-none" style={[styles.hud, { left: pad, top: 12 }]}>
        <HudHearts hud={hud} max={world.maxHearts} />
        <HudBones hud={hud} bump={boneBump} />
        <HudFriends hud={hud} />
        <HudPowers hud={hud} left={powerLeft} megaMax={POWER_MAX.mega + boosts.megaBonus} turboMax={POWER_MAX.turbo + boosts.turboBonus} />
      </View>

      <HudBoss hud={hud} name={level.boss?.name ?? BOSS_NAME} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pause"
        onPress={togglePause}
        style={[styles.pause, { right: pad, top: 12 }]}
        hitSlop={12}
      >
        <View style={styles.pauseBars}>
          <View style={styles.pauseBar} />
          <View style={styles.pauseBar} />
        </View>
      </Pressable>

      {/* Bark button */}
      <Animated.View style={[styles.barkWrap, { right: pad + 8, bottom: 20 }, barkStyle]}>
        <View
          accessibilityRole="button"
          accessibilityLabel="Bark"
          onTouchStart={(e) => {
            e.stopPropagation();
            bark();
          }}
          style={styles.bark}
        >
          <Text style={styles.barkText}>BARK!</Text>
        </View>
      </Animated.View>

      <HudCallout hud={hud} left={pad + 150} />

      <HudBanner hud={hud} />

      {countIn && (
        <Animated.View key={`count-${countIn}`} entering={ZoomIn.springify().damping(9)} exiting={FadeOut.duration(150)} pointerEvents="none" style={styles.bannerWrap}>
          <Text style={[styles.banner, countIn === 'go' ? styles.go : null]}>{countIn === 'ready' ? 'Ready?' : 'GO!'}</Text>
        </Animated.View>
      )}

      {(isPaused || gameOver) && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.scrim}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{gameOver ? 'Ruh-roh!' : 'Paused'}</Text>
            {gameOver && <Text style={styles.panelBody}>Shake it off and try again from the last balloon post.</Text>}
            <Pressable style={[styles.btn, styles.btnGold]} onPress={gameOver ? retry : togglePause}>
              <Text style={styles.btnTextDark}>{gameOver ? 'Try again' : 'Keep running'}</Text>
            </Pressable>
            {!gameOver && (
              <Pressable
                style={[styles.btn, styles.btnGlass]}
                onPress={() => {
                  setMuted(!muted);
                  setMutedState(!muted);
                }}
              >
                <Text style={styles.btnText}>{muted ? 'Sound: off' : 'Sound: on'}</Text>
              </Pressable>
            )}
            <Pressable style={[styles.btn, styles.btnGlass]} onPress={quit}>
              <Text style={styles.btnText}>Back to the party</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

/** One heart of the HUD: the real sticker, which pops when it is lost. */
function Heart({ full }: { full: boolean }) {
  const scale = useSharedValue(1);
  const wasFull = useRef(full);
  useEffect(() => {
    if (wasFull.current && !full) scale.set(withSequence(withTiming(1.5, { duration: 80 }), withSpring(1, springs.bouncy)));
    wasFull.current = full;
  }, [full, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.Image source={full ? HUD.heartFull : HUD.heartEmpty} style={[styles.heart, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.velvetNight, overflow: 'hidden' },
  hud: { position: 'absolute', gap: 6 },
  hudRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heart: { width: 34, height: 31, resizeMode: 'contain' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.marshmallow,
    borderColor: colors.cocoa,
    borderWidth: 2.5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 2,
    gap: 6,
  },
  boneIcon: { width: 28, height: 16, resizeMode: 'contain' },
  chipText: { fontFamily: fonts.display, fontSize: 24, color: colors.cocoa },
  friend: { width: 34, height: 34, resizeMode: 'contain' },
  power: { alignItems: 'center', gap: 2 },
  powerIcon: { width: 36, height: 36, resizeMode: 'contain' },
  powerBar: { width: 36, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: colors.cocoa, backgroundColor: 'rgba(255,244,226,0.5)', overflow: 'hidden' },
  powerFill: { height: '100%', backgroundColor: colors.kiwi },
  powerCount: { fontFamily: fonts.display, fontSize: 14, color: colors.marshmallow, textShadowColor: colors.cocoa, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  bossBar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26,15,11,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 10,
  },
  bossCake: { width: 40, height: 37, resizeMode: 'contain' },
  bossName: { fontFamily: fonts.display, fontSize: 24, color: colors.marshmallow, marginBottom: 2 },
  pip: { width: 26, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.marshmallow },
  pipFull: { backgroundColor: colors.tomato },
  pause: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,244,226,0.18)',
    borderColor: 'rgba(255,244,226,0.5)',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBars: { flexDirection: 'row', gap: 5 },
  pauseBar: { width: 6, height: 20, borderRadius: 3, backgroundColor: colors.marshmallow },
  barkWrap: { position: 'absolute' },
  bark: {
    width: BARK_SIZE,
    height: BARK_SIZE,
    borderRadius: BARK_SIZE / 2,
    backgroundColor: colors.biscuitGold,
    borderColor: colors.cocoa,
    borderWidth: 3,
    borderBottomWidth: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barkText: { fontFamily: fonts.display, fontSize: 24, color: colors.cocoa, transform: [{ rotate: '-6deg' }] },
  callout: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-end', maxWidth: 440 },
  calloutCoach: { width: 44, height: 80 },
  calloutDog: { width: 56, height: 56 },
  bubble: {
    marginLeft: 2,
    marginBottom: 8,
    backgroundColor: colors.marshmallow,
    borderColor: colors.cocoa,
    borderWidth: 2.5,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexShrink: 1,
  },
  bubbleText: { fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.cocoa },
  bannerWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  banner: {
    fontFamily: fonts.display,
    fontSize: 64,
    color: colors.biscuitGold,
    textShadowColor: colors.cocoa,
    textShadowOffset: { width: 0, height: 5 },
    textShadowRadius: 0,
    transform: [{ rotate: '-6deg' }],
  },
  go: { fontSize: 96, color: colors.kiwi },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,10,31,0.72)', alignItems: 'center', justifyContent: 'center' },
  panel: {
    backgroundColor: 'rgba(255,244,226,0.12)',
    borderColor: 'rgba(255,244,226,0.35)',
    borderWidth: 2,
    borderRadius: 28,
    padding: 22,
    gap: 12,
    alignItems: 'center',
    minWidth: 320,
  },
  panelTitle: { fontFamily: fonts.display, fontSize: 44, color: colors.marshmallow },
  panelBody: { fontFamily: fonts.body, fontSize: 17, color: colors.marshmallow, textAlign: 'center', maxWidth: 300 },
  btn: { minWidth: 240, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  btnGold: { backgroundColor: colors.biscuitGold, borderColor: colors.cocoa, borderBottomWidth: 6 },
  btnGlass: { backgroundColor: 'rgba(255,244,226,0.14)', borderColor: 'rgba(255,244,226,0.35)' },
  btnText: { fontFamily: fonts.bodyHeavy, fontSize: 20, color: colors.marshmallow },
  btnTextDark: { fontFamily: fonts.bodyHeavy, fontSize: 20, color: colors.cocoa },
});
