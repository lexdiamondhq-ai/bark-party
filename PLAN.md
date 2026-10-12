# Dog Runner: smooth legs, deeper story, real game feel

Repo: `/Users/alexmedina/bark-party-game`, branch `claude/story-mode`, GitHub `lexdiamondhq-ai/bark-party`.
Checks here are `npm test` (jest), `npx tsc --noEmit`, `npx expo lint`.
Serve to the iPhone with `npx expo start --tunnel` and a QR code (Skia, Reanimated and Gesture Handler are all bundled in Expo Go).

## Context

Dog Runner is the Bark Party story runner: the Dog Better pup auto-runs through Chapter 1 (the living room), jumps, slides, barks at squirrels, frees three pups from crates, and chases Big Nutsy for the cake.
It works, but it is a first pass: the pup's legs stutter, the rescued friends are still portraits that hop, the HUD uses text glyphs, there is no save, no chapter map, nothing to spend bones on, and the "juice" (camera, shake, hit pauses) is minimal.

Alex's own brief, in order: (1) every dog's legs flow smoothly and beautifully, (2) heavily enhance the game's features and aesthetics.
The pasted template talks about an endless lane-runner; Alex chose **story only, make it deeper**, wants to **pick how the friends travel from 2-3 rendered options**, and wants the **metagame included this round** (directions shown first).

Hard rules that shape this plan: never improvise character art (AGENTS §4), show 2-3 directions before any new screen (§3), smallest change that works (§8), and `assets/dogbetter/` is an untracked dump of Dog Better files that must not be committed.

## Findings from reading the code

- Legs: `tools/pack_atlas.py:57` packs only 25 of the 49 stride frames (`i*2`), and `buildFrame.ts:350` does `floor(stride*25) % 25`.
  The sheet's last frame equals its first, so every cycle shows a duplicate (a hitch).
  There is no crossfade; Dog Better's `pupPuppet.ts:legFrames()` blends two adjacent frames.
  In the air the legs hard-cut to frame 6/18 and snap back on landing.
  Stride rate is `vx*dt/90` (3.3 cycles/s at speed 300), faster than Dog Better's ~2/s trot.
- Render: `GameView.tsx` steps the sim at a fixed 60 Hz and draws whatever state the last step left, with no interpolation; the hero pose can repeat or skip on a ProMotion phone.
- Friends: `buildFrame.ts:214` draws sitting portraits hopping on the hero trail. No leg art exists for any breed in this repo or in Dog Better (`assets/dogbetter/breeds/*.png` are also sitting portraits).
- HUD: hearts are `♥` text, the bone is the 🦴 emoji, pause is the text `II`, although `heart_full`, `heart_empty` and `bone_icon` exist in `art/svg` and the atlas.
- Feel: camera is a plain lerp to `hero.x - 0.28*viewW`; shake is one scalar; no hit-stop; landing dust ignores fall speed; stomp has no squash on the enemy.
- State: `GameView` holds pause/game-over as booleans; there is no persisted progress, no chapter select, and `index.tsx` always starts Chapter 1.
- Untracked: `assets/dogbetter/` (coaches, 100+ lesson webps, mascot, breeds, pup sheets) is not referenced by any code; `art/dogbetter-pup/` already holds the pup sheets the atlas uses.

## Phase 0: housekeeping (no Alex input)

1. Add `assets/dogbetter/` to `.gitignore` (it is Dog Better's art, not this game's; `art/dogbetter-pup/` and `assets/game/dogbetter/` already hold what the game uses).
   Leave the files on disk.
2. Keep `package-lock.json` as is unless a later `npx expo install` touches it.

## Phase 1: the hero's legs flow (Alex's first ask)

Files: `tools/pack_atlas.py`, `src/game/sprites.ts`, `src/game/constants.ts`, `src/game/sim/types.ts`, `src/game/sim/world.ts`, new `src/game/render/pupPose.ts`, `src/game/render/buildFrame.ts`, `src/game/GameView.tsx`, `src/game/render/GameCanvasImpl.tsx`.

Verified before planning: sheet leg frame 48 is pixel-identical to frame 0, and tail frame 10 to tail 0 (checked with PIL).
So the loop is 48 unique leg frames and 10 unique tail frames, never 49 / 11.
Dog Better's 210 px stride does not transfer (it is a 0.5 body-length/s walk; the runner moves 3.9 body lengths/s); a run reads at about one body length per cycle, so the current 90-unit stride is in the right band and the crossfade, not the frame count, is what makes it smooth.

1. **Atlas**: `pack_atlas.py` packs `pup_leg_0..47` (every sheet frame, not every other) plus `pup_leg_rest` and `pup_tail_0..10`.
   `sprite_sizes()` reads literal lines from `sprites.ts`, so either list 48 lines or extend the regex to expand a `pup_leg_{0..47}` range (a spread in `sprites.ts` would silently drop frames).
   Fits on the existing two pages (page 1 is only 2048x140 today); no third page.
2. **`src/game/render/pupPose.ts`** (new, pure, no Skia): `LEG_FRAMES = 48`, `TUCK_UP = 12`, `TUCK_DOWN = 36`, `TAIL_FRAMES = 11`, `TUCK_BLEND = 0.08`, `REST_BLEND = 0.15`, `WAG_HZ = 2.4`.
   `legFrames(phase)` -> `{a, b, t}` with `b = (a + 1) % 48` so the wrap is seamless by construction.
   `puppetPose(hero, t)` -> `{legA, legB, legT, tuckT, fallT, restT, tailA, tailB, tailT}`:
   `tuckT` eases from `airTime` / `sinceLand` (fields that already exist), `fallT = smooth((120 - vy) / 240)` crossfades rising tuck to falling tuck through the apex instead of cutting at `vy > 0`, `restT` comes from a new `hero.restBlend`.
   `clamp01` and `smooth` ported from Dog Better's `pupPuppet.ts`.
3. **Draw order in `drawPuppet`**: base, tail A, tail B at `tailT`, stride frame A at `(1 - tuckT)(1 - restT)`, frame B over it at `x legT` (adjacent frames nearly coincide, so stacking gives no opacity dip), tuck up/down at `tuckT`, rest at `restT`.
   Run <-> tuck and run <-> rest are true crossfades (the stride pair fades out) so there are never double legs.
   `GameCanvasImpl` already skips ops under alpha 0.01, so the steady state is two leg ops.
4. **Stride in the sim** (`constants.ts`: `STRIDE_LEN = 96`, `MAX_STRIDE_SPEED = 360`): advance by real displacement `min(dx, MAX_STRIDE_SPEED * dt) / STRIDE_LEN`, only on the ground, so blocked legs freeze instead of treadmilling under the rest frame.
   On landing set `stride = TUCK_DOWN / 48` so the gait resumes from the pose the tuck fades out of.
   `hero.restBlend` ramps up while blocked and down otherwise over `REST_BLEND`.
5. **Render interpolation, keep the 60 Hz fixed step**: physics (`landTolerance`, `jumpCut` with `dt*12`) and `world.test.ts` depend on the fixed step, and interpolation fixes both the 120 Hz duplicate-frame problem and the 0-or-2-step hitch that exists at 60 Hz today.
   `World.prev = {x, y, camX, t, stride}` snapshotted at the top of `stepWorld`; `snapPrev(world)` exported and called from `createWorld`, `respawn` and the dev `startX` teleport.
   `FrameSetup.alpha` (default 1); `buildFrame` lerps hero x/y, camX, `t` (so every `sin(t * ...)` bob and the tail wag are smooth) and stride with wrap.
   Enemies and particles stay at 60 Hz positions in this pass.
   `GameView` passes `alpha = acc / STEP` after the step loop.
6. **120 Hz**: `CADisableMinimumFrameDurationOnPhone: true` is already in the Expo SDK 57 iOS template, and Reanimated requests 120 on the UI thread; whether the JS `requestAnimationFrame` runs at 120 under RN 0.86 is unverified, so step 7 measures it.
   Pin `ios.infoPlist.CADisableMinimumFrameDurationOnPhone: true` in `app.json` so it survives a template change.
   Contingency if JS RAF stays at 60 while the UI thread is at 120: move frame building into a `useFrameCallback` worklet (not planned unless measured).
7. **Measurement, `__DEV__` only**: a probe in `GameView` armed for 1 s at level start and on the first jump; per tick records `dt, steps, alpha, legA, legB, legT, tuckT, buildMs, setMs, opCount`, then one `console.table` and a summary (median dt, frames over 1.5x median, zero-step frames, max legA jump).
   `drawHero` writes the drawn frame numbers into `setup.probe` so the log shows exactly what was drawn.
   A `useFrameCallback` counter in `GameCanvasImpl` logs UI-thread fps once, to compare with the JS rate.
   Pass: median dt ~8.3 ms (or 16.7), no 0/2-step pattern in `legA`, `legT` never jumps.
8. **Ops transport, after the probe has a baseline**: `OpList` on a `Float64Array` (capacity 12 x 512) with `n`, double-buffered, `ops.value = data.subarray(0, n)`; `SharedValue<Float64Array>`; hoist `Skia.Paint()` out of the per-frame worklet.
   Whether worklets copy or share typed arrays is unverified; double-buffering keeps it safe either way, and the probe's `setMs` shows the before/after.
9. **Tests** `src/game/render/__tests__/pupPose.test.ts`: `legFrames(0.999).b === 0`, 48 distinct `a` over a cycle, tuck and landing ramps hit 0 and 1 at the right times, stride freezes and `restBlend` reaches 1 against a solid box (via `stepWorld`, like the existing world test).

Sequencing: atlas -> pupPose + tests -> sim fields and stride -> buildFrame blends -> interpolation -> probe -> typed-array ops measured against the probe.

**Status 2026-10-12: done.**
Offline check: `DUMP_FRAMES=... npx jest dumpFrames` + `tools/composite_frames.py` showed a clean stride, tuck, apex, landing and rest.
Alex's iPhone probe answered step 6: the JS loop's `requestAnimationFrame` runs at 60 Hz while the UI thread draws at 119 Hz.
So the contingency was built: each draw op carries its position one step earlier, and `GameCanvasImpl` blends every op toward its new position on every display frame (`useFrameCallback`), so 120 Hz screens get 120 distinct pictures.
The JS-side `alpha` lerp from step 5 was removed again (it would double-blend); `World.prev` and the per-entity `px/py` now feed the ops.
Probes: 0 repeated leg frames on the simulator and on the iPhone; build 0.1 ms, op handoff 1.1-2.0 ms per step.
Step 8 (typed-array ops) is deferred: 2 ms of a 16.7 ms JS step is inside budget; revisit in the Phase 3 allocation audit.
Not verified by me: how the 120 Hz blend feels in the hand (Alex's iPhone).

## Phase 2: how the friends travel (Alex picks)

Before any code, render three phone-size images in the chat, each with the real breed portraits (never a placeholder) behind the pup on the real living-room floor:

- **A. Weighty hop**: the portraits as they are, but the hop reads as a real bound (crouch, stretch, land squash, dust, staggered timing, catch-up on jumps).
  No new art.
- **B. Party wagon**: the freed pups ride in a little red wagon the hero tows; it bounces, tips on jumps, and fills up as pups are freed.
  Needs one new prop drawing (wagon), shown in the image for Alex's OK.
- **C. Balloon float**: each freed pup drifts behind on a party balloon, bobbing and swinging; balloon posts already exist in the art set.
  Needs one small prop drawing (balloon string), shown for OK.

Build only the picked one.
If Alex later supplies walking art per breed, the Phase 1 puppet pipeline (`gait.ts`, `drawPuppet`) is reused for them, which is why the gait code is written generically.

**Status 2026-10-12: Alex picked B, the party wagon, and confirmed the sentence.**
Built in `src/game/render/followers.ts` (wagon on the trail, seats, rope, boarding arc) and `world.boarding` in the sim (`BOARD_TIME` 0.55 s from crate to seat).
The hop and balloon prototypes and the balloon props were removed; the wagon prop lives in `tools/gen_sprites.js` -> `art/svg/wagon.svg` -> atlas.
Clips were made with `DUMP_CLIP=1 DUMP_FRAMES=... npx jest dumpFrames` and `tools/composite_frames.py out.gif`.

## Phase 3: game feel and aesthetics on Chapter 1 (no Alex input)

Files: `src/game/sim/world.ts`, `src/game/sim/types.ts`, `src/game/render/buildFrame.ts`, `src/game/GameView.tsx`, `src/game/constants.ts`, `art/svg/*`, `tools/render_sprites.js`.

1. **Feel module** `src/game/sim/feel.ts` (pure, tested): a shake table keyed by event (`land_hard`, `stomp`, `bark`, `hurt`, `boss_hit`, `rescue`) with amplitude, frequency, decay and a reduce-motion scale; `hitstop(ms)` that freezes the sim for 2-4 frames on stomp, bark hit and boss hit; `cameraTarget` with lookahead that eases forward with `vx` and down/up with `vy`, plus a soft floor so the camera never shows under the pit.
2. **Squash and stretch everywhere**: enemies squash on stomp and pop on stun, pickups pop when taken, the bark burst scales from the muzzle, landing squash scales with fall speed, dust count and size scale with fall speed.
3. **Momentum**: sliding into the end of a slide gives a short "zoomies" burst (speed x1.25 for 0.6 s with speed lines), so the slide is a reward, not just a dodge.
   Platform edges give a tiny ledge hop.
   These are the canine-traversal items from the brief that fit the existing tap/swipe/bark input without new art.
4. **HUD from real art**: render `heart_full`, `heart_empty`, `bone_icon` to PNG with `tools/render_sprites.js` and use them in the HUD; draw the pause icon as two rounded bars; the bone counter stays in Bagel Fat One with the bump spring.
   Boss bar becomes a cake-themed meter (uses the existing `cake` sprite).
5. **Followers**: whatever Phase 2 picked, plus the trail stays per-friend so three friends never overlap.
6. **Allocation audit**: measure `stepWorld` + `buildFrame` time per tick on device for 10 s (same dev ring buffer).
   Pool particles and acorns only if the JS tick exceeds ~3 ms; otherwise leave the arrays (the brief asks for pooling, but a pool that saves nothing is complexity).

## Phase 4: deeper story structure and metagame (directions first, then build)

### 4a. Structure (no Alex input)

Files: `src/game/level/*`, `src/game/story.ts`, `src/app/*`, new `src/lib/progress.ts`, new `src/engine/progress.ts`.

1. Persisted progress with AsyncStorage (`npx expo install @react-native-async-storage/async-storage`, works in Expo Go): per chapter stars, best bones, golden bones found, pups freed; a bones wallet; owned upgrades.
   Pure rules in `src/engine/progress.ts` with tests (what unlocks, what a run adds, what an upgrade costs).
2. Formal screen flow with Expo Router: Title -> Chapter map -> Story -> Play (Active / Paused / Game over) -> Results -> Upgrades/Shop -> map.
   `GameView` gets a `RunState` ('ready' | 'running' | 'paused' | 'gameover' | 'won') instead of two booleans, with a short "Ready? Go!" count-in.
3. Chapter 1 tuning pass with the new verbs (zoomies, ledge hop) and two secret rooms reached by a slide under furniture, each with a golden bone (uses existing furniture sprites).
4. Chapter 2 "The Kitchen" level data on the existing `room_kitchen` art, reusing the living room sprite set plus the stolen-snacks story beat already written in `CH1_OUTRO`.
   New kitchen props would be new art; the first cut uses what exists and marks props that need drawings for Alex.

### 4b. Metagame screens (Alex picks a direction)

Render 3 distinct directions in the chat as phone-size images, each with the real pup and breed art, before building:

- **Party Prep**: the chapter map is the party room filling up; bones buy party gear that visibly appears on the title parade (hats and bandanas are new art, so this direction lists exactly which drawings it needs).
- **Treat Jar**: bones fill a jar on the map; upgrades are treats the pup eats (extra heart, longer bark, bone magnet, higher double jump); the freed pups form the "party crew" that runs the title parade. No new character art.
- **Pup Passport**: each chapter is a stamp; the shop is a sticker book; upgrades are stickers stuck on the pup's collar. Stickers reuse existing props and pickups as art.

Build the picked one: `src/app/map.tsx`, `src/app/shop.tsx`, `src/components/game/*`, upgrade effects wired into `PHYS` through `createWorld(level, viewW, seed, upgrades)`.

## Order and Alex checkpoints

1. Phase 0 and Phase 1 together, then a tunnel QR so Alex checks the legs on the iPhone.
2. Phase 2 images in the chat; Alex picks.
3. Phase 3 and the picked friend style, QR check.
4. Phase 4a, then Phase 4b images; Alex picks; build; final QR check.

Commits after each phase with one-sentence subjects (for example "Make the pup's legs flow at full frame rate.").

## Verification

- After every phase: `npm test`, `npx tsc --noEmit`, `npx expo lint`, all read by me.
- Legs: the dev ring buffer printout (no repeated or skipped leg frames at the display rate), then Alex on the iPhone over the tunnel QR.
- Feel: play Chapter 1 end to end on the web build (`npx expo start --web`, keyboard: Space jump, Down slide, X bark) and try to break it: pause during hitstop, double tap on the first frame, bark on the boss during hurt, quit mid-respawn.
- Progress: tests for `engine/progress.ts`; on device, kill the app after a run and confirm stars and bones survive.
- Reduce Motion on in iOS Settings: shake, hitstop and confetti scale down, nothing jitters.
- Done means the tunnel dev server is running and the QR is in the chat.

## Not verified yet (will check during the build)

- Whether the JS `requestAnimationFrame` runs at 120 Hz on the iPhone 16 Pro under RN 0.86 (the plist key is in the template; the probe in Phase 1 step 7 answers this).
- Whether worklets copy or share a `Float64Array` (double-buffering keeps step 8 safe either way).
- Real JS tick cost on the iPhone (decides pooling in Phase 3 step 6).
