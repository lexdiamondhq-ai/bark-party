// Saved progress on the phone: one small store every screen reads, written through AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { emptyProgress, parseProgress, type Progress } from '../engine/progress';

const KEY = 'barkparty.progress.v1';

let progress: Progress = emptyProgress();
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Reads the save once; later calls return the same promise. Safe to call from every screen. */
export function loadProgress(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        progress = parseProgress(raw ? JSON.parse(raw) : null);
      })
      .catch(() => {
        progress = emptyProgress();
      })
      .then(() => {
        loaded = true;
        emit();
      });
  }
  return loading;
}

export function getProgress(): Progress {
  return progress;
}

export function isProgressLoaded(): boolean {
  return loaded;
}

/** Applies a pure change from engine/progress and writes it. The write failing never loses the in-memory state. */
export function updateProgress(change: (p: Progress) => Progress): Progress {
  const next = change(progress);
  if (next === progress) return progress;
  progress = next;
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

/** Development: wipe the save. */
export function resetProgress(): void {
  progress = emptyProgress();
  emit();
  AsyncStorage.removeItem(KEY).catch(() => {});
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The saved progress, kept current on every screen. Starts loading on first use. */
export function useProgress(): { progress: Progress; loaded: boolean } {
  const p = useSyncExternalStore(subscribe, getProgress, getProgress);
  const ready = useSyncExternalStore(subscribe, isProgressLoaded, isProgressLoaded);
  if (!loaded && !loading) loadProgress();
  return { progress: p, loaded: ready };
}
