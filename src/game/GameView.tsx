import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'react-native-reanimated';

import { colors, fonts, springs } from '../theme/tokens';
import { initAudio, pauseMusic, playMusic, playSfx, preloadSfx, isMuted, setMuted } from './audio';
import { COACH_CHEER, DOGS, HUD, ROOMS, ROOM_SIZE } from './art';
import { NO_BOOSTS, type RunBoosts } from '../engine/progress';
import { STEP, VIEW_H } from './constants';
import type { CoachId, LevelDef } from './level/types';
import { GameCanvas } from './render/GameCanvas';
import { ATLAS_PAGES } from './render/atlasImages';
import atlas from './render/atlas.json';
import { buildFrame, OpList, type AtlasData, type PupProbe } from './render/buildFrame';
import { NO_INPUT, type GameEvent, type Input } from './sim/types';
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

/** Development only: one second of per-frame timing, printed to the console, to check the legs never stutter. */
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

/** The run from the player's side: a count-in, then running, with pauses, game over and the win. */
type RunState = 'ready' | 'running' | 'paused' | 'gameover' | 'won';

/** Seconds of "Ready?" then "Go!" before the dog starts. */
const COUNT_IN = { ready: 0.9, go: 0.5 };

export function GameView({ level, boosts = NO_BOOSTS, onWin, onQuit, startX }: Props) {
  const { width, height } = useWindowDimensions();
  const k = height / VIEW_H;
  const viewW = width / k;

  const [world] = useState(() => createStartWorld(level, viewW, startX, boosts));
  const ops = useSharedValue<number[]>([]);
  const input = useRef<Input>({ ...NO_INPUT });
  const jumpTouch = useRef<{ id: string; y: number; slid: boolean } | null>(null);
  const runState = useRef<RunState>('ready');
  const reduceMotion = useRef(false);
  const doneRef = useRef(false);
  const probe = useRef<Probe | null>(__DEV__ ? { label: 'level start', rows: [], until: 0 } : null);
  const probedJump = useRef(false);

  const [hearts, setHearts] = useState(world.maxHearts);
  const [bones, setBones] = useState(0);
  const [friends, setFriends] = useState<DogId[]>([]);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [boss, setBoss] = useState<{ hits: number; needed: number } | null>(null);
  const [banner, setBanner] = useState<{ key: number; text: string } | null>(null);
  const [state, setState] = useState<RunState>('ready');
  const [countIn, setCountIn] = useState<'ready' | 'go' | null>('ready');
  const [muted, setMutedState] = useState(isMuted());
  const setRun = useCallback((s: RunState) => {
    runState.current = s;
    setState(s);
  }, []);

  const barkScale = useSharedValue(1);
  const barkStyle = useAnimatedStyle(() => ({ transform: [{ scale: barkScale.value }] }));
  const boneBump = useSharedValue(1);
  const boneStyle = useAnimatedStyle(() => ({ transform: [{ scale: boneBump.value }] }));

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

  // Count-in: "Ready?" then "Go!", and the dog is off.
  useEffect(() => {
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
  }, [setRun]);

  const calloutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCallout = useCallback((c: Omit<Callout, 'key'>, ms = 2800) => {
    setCallout({ ...c, key: Date.now() });
    if (calloutTimer.current) clearTimeout(calloutTimer.current);
    calloutTimer.current = setTimeout(() => setCallout(null), ms);
  }, []);
  const showBanner = useCallback((text: string) => {
    setBanner({ key: Date.now(), text });
    setTimeout(() => setBanner(null), 1800);
  }, []);

  const handleEvents = useCallback(
    (events: GameEvent[]) => {
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
            setHearts(Math.max(0, e.hearts));
            break;
          case 'rescue':
            setFriends((f) => [...f, e.dog]);
            showCallout({ dog: e.dog, text: `${DOG_NAMES[e.dog]} is free! Woof!` }, 2200);
            break;
          case 'checkpoint':
            break;
          case 'boss_start':
            setBoss({ hits: 0, needed: world.boss?.hitsNeeded ?? 3 });
            showBanner(BOSS_NAME.toUpperCase() + '!');
            break;
          case 'boss_hit':
            setBoss({ hits: e.hits, needed: e.needed });
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
    },
    [onWin, setRun, showBanner, showCallout, world],
  );

  // The game loop: fixed 60 Hz steps on the JS thread, then one frame of draw ops for the UI thread.
  useEffect(() => {
    const atlasData = atlas as unknown as AtlasData;
    const out = new OpList();
    const pup: PupProbe = { legA: 0, legB: 0, legT: 0, tuckT: 0 };
    let raf = 0;
    let last = 0;
    let acc = 0;
    let lastBones = -1;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!last) last = now;
      const elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = runState.current;
      if (s !== 'running' && s !== 'won') {
        acc = 0;
        if (s !== 'ready' || out.count > 0) return;
        // Before "Go!", draw the still scene once so the count-in has something behind it.
      }
      acc += elapsed;
      let steps = 0;
      while (s !== 'ready' && acc >= STEP && steps < 4) {
        const i = input.current;
        stepWorld(world, i, STEP);
        i.jumpPressed = false;
        i.slidePressed = false;
        i.barkPressed = false;
        acc -= STEP;
        steps++;
      }
      if (steps === 4) acc = 0;
      if (steps === 0 && s !== 'ready') return;
      // One op list per step; the canvas draws the frames in between (see GameCanvasImpl).
      const t0 = __DEV__ ? performance.now() : 0;
      out.data = [];
      buildFrame(world, {
        atlas: atlasData,
        background: { image: ATLAS_PAGES.length, w: ROOM_SIZE.w, h: ROOM_SIZE.h },
        k,
        screenW: width,
        screenH: height,
        reduceMotion: reduceMotion.current,
        probe: pup,
      }, out);
      const t1 = __DEV__ ? performance.now() : 0;
      ops.set(out.data);
      const p = probe.current;
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
      if (world.bones !== lastBones) {
        if (lastBones >= 0) boneBump.set(withSequence(withTiming(1.3, { duration: 60 }), withSpring(1, springs.bouncy)));
        lastBones = world.bones;
        setBones(world.bones);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [boneBump, handleEvents, height, k, ops, width, world]);

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
      if (__DEV__ && !probedJump.current && !probe.current) {
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
    setHearts(world.hero.hearts);
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
        <GameCanvas ops={ops} width={width} height={height} background={ROOMS[level.background]} />
      </View>

      {/* HUD */}
      <View pointerEvents="box-none" style={[styles.hud, { left: pad, top: 12 }]}>
        <View style={styles.hudRow} pointerEvents="none">
          {Array.from({ length: world.maxHearts }, (_, i) => (
            <Heart key={i} full={i < hearts} />
          ))}
        </View>
        <Animated.View style={[styles.chip, boneStyle]} pointerEvents="none">
          <Image source={HUD.bone} style={styles.boneIcon} />
          <Text style={styles.chipText}>{bones}</Text>
        </Animated.View>
        <View style={styles.hudRow} pointerEvents="none">
          {friends.map((d) => (
            <Image key={d} source={DOGS[d]} style={styles.friend} />
          ))}
        </View>
      </View>

      {boss && (
        <Animated.View entering={FadeIn} pointerEvents="none" style={[styles.bossBar, { bottom: 14 }]}>
          <Image source={HUD.cake} style={styles.bossCake} />
          <View>
            <Text style={styles.bossName}>{BOSS_NAME}</Text>
            <View style={styles.hudRow}>
              {Array.from({ length: boss.needed }, (_, i) => (
                <View key={i} style={[styles.pip, i < boss.needed - boss.hits ? styles.pipFull : null]} />
              ))}
            </View>
          </View>
        </Animated.View>
      )}

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

      {callout && (
        <Animated.View
          key={callout.key}
          entering={SlideInLeft.springify().damping(16)}
          exiting={SlideOutLeft.duration(200)}
          pointerEvents="none"
          style={[styles.callout, { left: pad + 150, top: 8 }]}
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
      )}

      {banner && (
        <Animated.View key={banner.key} entering={ZoomIn.springify().damping(10)} exiting={FadeOut} pointerEvents="none" style={styles.bannerWrap}>
          <Text style={styles.banner}>{banner.text}</Text>
        </Animated.View>
      )}

      {countIn && (
        <Animated.View key={countIn} entering={ZoomIn.springify().damping(9)} exiting={FadeOut.duration(150)} pointerEvents="none" style={styles.bannerWrap}>
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
              <Text style={styles.btnText}>Quit to title</Text>
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
