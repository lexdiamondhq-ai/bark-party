# Bark Party

iPhone party game of three-second dog microgames. Expo SDK 58, Expo Router, React Native Skia, Reanimated, Gesture Handler, expo-haptics and expo-audio.

The style guide is the source of truth for look, screens and motion: https://claude.ai/artifact/MiWbuu8tPfKX7aSH2cYQvD

## Layout

| Path | What it is |
|---|---|
| `src/engine/` | Game rules as pure TypeScript: pacing, microgame catalog, shuffle deck, solo run, party lobby and turns, standings. No React, no timers; randomness comes in through an `Rng` so tests can seed it. |
| `src/engine/__tests__/` | Unit tests for the rules (`npm test`). |
| `src/theme/tokens.ts` | Colors, springs, type scale and motion timings from the style guide. |
| `src/app/` | Expo Router screens. `index.tsx` is Home; `preview.tsx` is a rules preview that walks the real engine with "Nailed it" and "Missed" standing in for microgames. |
| `src/components/` | Shared UI: jelly button, command card, tennis-ball lives. |

## Commands

```bash
npm install
npm test            # rules unit tests
npm run typecheck   # tsc --noEmit
npx expo start      # dev server; press i for the iOS simulator
```

Skia, Reanimated and Gesture Handler are native modules. If a module is missing in Expo Go, make a development build (`npx expo run:ios`, or `eas build --profile development`).
