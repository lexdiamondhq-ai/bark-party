import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { SOUND_SOURCES, type SoundName } from './audioSources';

// Short sounds get a small pool of players so quick repeats (bones, barks) can overlap.
const POOL = 3;
const VOLUME: Partial<Record<SoundName, number>> = {
  bone: 0.55,
  land: 0.5,
  slide: 0.6,
  blip: 0.5,
  squirrel_chitter: 0.6,
};

let ready = false;
let muted = false;
const pools = new Map<string, { players: AudioPlayer[]; next: number }>();
let music: AudioPlayer | null = null;
let musicName = '';

function isSound(name: string): name is SoundName {
  return name in SOUND_SOURCES;
}

export function initAudio() {
  if (ready) return;
  ready = true;
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
}

export function setMuted(value: boolean) {
  muted = value;
  if (music) music.volume = muted ? 0 : 0.55;
}

export function isMuted() {
  return muted;
}

export function playSfx(name: string) {
  if (muted || !isSound(name) || name.startsWith('music_')) return;
  try {
    let pool = pools.get(name);
    if (!pool) {
      pool = { players: [], next: 0 };
      pools.set(name, pool);
    }
    let p = pool.players[pool.next];
    if (!p) {
      p = createAudioPlayer(SOUND_SOURCES[name]);
      p.volume = VOLUME[name] ?? 0.9;
      pool.players[pool.next] = p;
    }
    pool.next = (pool.next + 1) % POOL;
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Sound is a bonus; never let it stop the game.
  }
}

/** Starts a looping track, or stops music with 'none'. */
export function playMusic(name: string) {
  if (name === musicName) return;
  musicName = name;
  try {
    if (music) {
      music.pause();
      music.remove();
      music = null;
    }
    if (name === 'none' || !isSound(name)) return;
    music = createAudioPlayer(SOUND_SOURCES[name]);
    music.loop = true;
    music.volume = muted ? 0 : 0.55;
    music.play();
  } catch {
    music = null;
  }
}

export function pauseMusic(paused: boolean) {
  if (!music) return;
  if (paused) music.pause();
  else music.play();
}

/** Loads the short sounds before the level starts so the first bark is not late. */
export function preloadSfx() {
  for (const name of Object.keys(SOUND_SOURCES) as SoundName[]) {
    if (name.startsWith('music_') || pools.has(name)) continue;
    try {
      const p = createAudioPlayer(SOUND_SOURCES[name]);
      p.volume = VOLUME[name] ?? 0.9;
      pools.set(name, { players: [p], next: POOL > 1 ? 1 : 0 });
    } catch {
      /* ignore */
    }
  }
}
