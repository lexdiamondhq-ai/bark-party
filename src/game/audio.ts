import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { SOUND_SOURCES, type SoundName } from './audioSources';

// Short sounds get a small pool of players so quick repeats (bones, barks) can overlap. Every player is made
// before the run starts: making one is a native call on the game's own thread, so it must never happen mid-run.
const POOL = 3;
const VOLUME: Partial<Record<SoundName, number>> = {
  bone: 0.55,
  land: 0.5,
  slide: 0.6,
  blip: 0.5,
  squirrel_chitter: 0.6,
};
const MUSIC_VOLUME = 0.55;

let ready = false;
let muted = false;
const pools = new Map<string, { players: AudioPlayer[]; next: number }>();
/** One looping player per music track, made once and kept, so a switch (the boss's entrance) is a pause and a play. */
const tracks = new Map<string, AudioPlayer>();
let music: AudioPlayer | null = null;
let musicName = '';

function isSound(name: string): name is SoundName {
  return name in SOUND_SOURCES;
}

const isMusic = (name: string) => name.startsWith('music_');

export function initAudio() {
  if (ready) return;
  ready = true;
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
}

export function setMuted(value: boolean) {
  muted = value;
  if (music) music.volume = muted ? 0 : MUSIC_VOLUME;
}

export function isMuted() {
  return muted;
}

/** The whole pool for one sound, made in one go. */
function poolFor(name: SoundName) {
  let pool = pools.get(name);
  if (!pool) {
    const players: AudioPlayer[] = [];
    for (let i = 0; i < POOL; i++) {
      const p = createAudioPlayer(SOUND_SOURCES[name]);
      p.volume = VOLUME[name] ?? 0.9;
      players.push(p);
    }
    pool = { players, next: 0 };
    pools.set(name, pool);
  }
  return pool;
}

function trackFor(name: SoundName) {
  let p = tracks.get(name);
  if (!p) {
    p = createAudioPlayer(SOUND_SOURCES[name]);
    p.loop = true;
    tracks.set(name, p);
  }
  return p;
}

export function playSfx(name: string) {
  if (muted || !isSound(name) || isMusic(name)) return;
  try {
    const pool = poolFor(name);
    const p = pool.players[pool.next];
    pool.next = (pool.next + 1) % pool.players.length;
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Sound is a bonus; never let it stop the game.
  }
}

/** Starts a looping track from the top, or stops music with 'none'. */
export function playMusic(name: string) {
  if (name === musicName) return;
  musicName = name;
  try {
    if (music) {
      music.pause();
      music = null;
    }
    if (name === 'none' || !isSound(name)) return;
    const p = trackFor(name);
    p.volume = muted ? 0 : MUSIC_VOLUME;
    p.seekTo(0).catch(() => {});
    p.play();
    music = p;
  } catch {
    music = null;
  }
}

export function pauseMusic(paused: boolean) {
  if (!music) return;
  if (paused) music.pause();
  else music.play();
}

/** Makes every player before the level starts (all the short sounds and the music tracks), so the run never has to. */
export function preloadSfx() {
  for (const name of Object.keys(SOUND_SOURCES) as SoundName[]) {
    try {
      if (isMusic(name)) trackFor(name);
      else poolFor(name);
    } catch {
      /* ignore */
    }
  }
}
