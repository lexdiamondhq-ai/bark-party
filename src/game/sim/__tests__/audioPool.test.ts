// Sound during a run must never build a native player: in expo-audio 57 that is a synchronous call on the JS
// thread, the same thread that steps the game. This counts every player audio.ts makes, with a stand-in for
// expo-audio, and checks a whole run's worth of sounds and music switches makes none after preloadSfx().
// (Lives with the sim tests because src/game/audio.ts has no test folder of its own.)

const mockMade: { id: number; plays: number; seeks: number; paused: number; loop: boolean; volume: number }[] = [];

jest.mock('expo-audio', () => ({
  setAudioModeAsync: () => Promise.resolve(),
  createAudioPlayer: () => {
    const p = { id: mockMade.length, plays: 0, seeks: 0, paused: 0, loop: false, volume: 1 };
    mockMade.push(p);
    return {
      get volume() {
        return p.volume;
      },
      set volume(v: number) {
        p.volume = v;
      },
      get loop() {
        return p.loop;
      },
      set loop(v: boolean) {
        p.loop = v;
      },
      play: () => {
        p.plays++;
      },
      pause: () => {
        p.paused++;
      },
      remove: () => {},
      seekTo: () => {
        p.seeks++;
        return Promise.resolve();
      },
    };
  },
}));

const made = mockMade;

type AudioModule = typeof import('../../audio');
type Sources = typeof import('../../audioSources');

/** A fresh copy of audio.ts (its pools live at module level) and an empty count. */
function fresh(): { audio: AudioModule; names: string[] } {
  made.length = 0;
  let audio!: AudioModule;
  let sources!: Sources;
  jest.isolateModules(() => {
    // A fresh module per test needs require inside isolateModules (jest-expo leaves import() untransformed).
    /* eslint-disable @typescript-eslint/no-require-imports */
    audio = require('../../audio');
    sources = require('../../audioSources');
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return { audio, names: Object.keys(sources.SOUND_SOURCES) };
}

describe('audio: no player is ever made mid-run', () => {
  it('preloadSfx makes the whole pool for every sound and one player per track, then a run makes none', () => {
    const { audio, names } = fresh();
    const sfx = names.filter((n) => !n.startsWith('music_'));
    const music = names.filter((n) => n.startsWith('music_'));
    audio.initAudio();
    audio.preloadSfx();
    expect(made.length).toBe(sfx.length * 3 + music.length);
    const before = made.length;
    // A busy run: every sound many times over, the level track, the boss's entrance, the win, a pause and a retry.
    audio.playMusic('music_living');
    for (let i = 0; i < 20; i++) for (const n of sfx) audio.playSfx(n);
    audio.pauseMusic(true);
    audio.pauseMusic(false);
    audio.playMusic('music_boss');
    audio.playMusic('none');
    audio.playMusic('music_boss');
    audio.playMusic('music_living');
    expect(made.length).toBe(before);
  });

  it('quick repeats of one sound take turns over three players, each started from the top', () => {
    const { audio } = fresh();
    audio.preloadSfx();
    const start = made.map((p) => p.plays);
    for (let i = 0; i < 6; i++) audio.playSfx('bone');
    const used = made.filter((p, i) => p.plays > start[i]);
    expect(used.length).toBe(3);
    expect(used.every((p) => p.plays - start[made.indexOf(p)] === 2 && p.seeks >= 2)).toBe(true);
  });

  it('switching tracks pauses the old one and replays a kept player from the top', () => {
    const { audio, names } = fresh();
    audio.preloadSfx();
    audio.playMusic('music_living');
    audio.playMusic('music_boss');
    audio.playMusic('music_living');
    const loops = made.filter((p) => p.loop);
    // One player per track, made by preloadSfx; switching back and forth makes no more.
    expect(loops.length).toBe(names.filter((n) => n.startsWith('music_')).length);
    const living = loops.find((p) => p.plays === 2)!;
    expect(living.paused).toBe(1);
    expect(living.seeks).toBe(2);
  });

  it('muted: sounds stay silent and the music plays at zero volume', () => {
    const { audio } = fresh();
    audio.preloadSfx();
    audio.setMuted(true);
    const plays = made.reduce((s, p) => s + p.plays, 0);
    audio.playSfx('bark');
    expect(made.reduce((s, p) => s + p.plays, 0)).toBe(plays);
    audio.playMusic('music_living');
    expect(made.find((p) => p.loop && p.plays === 1)!.volume).toBe(0);
  });
});
