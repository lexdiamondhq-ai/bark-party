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

**Status 2026-10-12: 4a items 1, 2 and 4 done.**
`src/engine/progress.ts` (rules, 8 tests), `src/lib/progress.ts` (AsyncStorage store with `useProgress`), `GameView` `RunState` with the Ready/Go count-in, chapter-aware `play`, `results`, `story` and title.
Chapter 2 "The Kitchen" is in `src/game/level/chapter2.ts` with new props (counter, stool, fridge, bowl, checker floor) drawn in `tools/gen_sprites.js`; the test autopilot clears it.
Item 3 (Chapter 1 secret rooms) is still open; the chapter map and shop wait for the 4b pick.

### 4b. Metagame screens (Alex picks a direction)

Render 3 distinct directions in the chat as phone-size images, each with the real pup and breed art, before building:

- **Party Prep**: the chapter map is the party room filling up; bones buy party gear that visibly appears on the title parade (hats and bandanas are new art, so this direction lists exactly which drawings it needs).
- **Treat Jar**: bones fill a jar on the map; upgrades are treats the pup eats (extra heart, longer bark, bone magnet, higher double jump); the freed pups form the "party crew" that runs the title parade. No new character art.
- **Pup Passport**: each chapter is a stamp; the shop is a sticker book; upgrades are stickers stuck on the pup's collar. Stickers reuse existing props and pickups as art.

Build the picked one: `src/app/map.tsx`, `src/app/shop.tsx`, `src/components/game/*`, upgrade effects wired into `PHYS` through `createWorld(level, viewW, seed, upgrades)`.

**Status 2026-10-12: Alex picked C, the Pup Passport, and confirmed the sentence.**
The three sketches were built as real tappable screens on the tunnel (`src/app/directions/*`, since removed) rather than stills.
`src/app/passport.tsx` is now the map and the shop: stamps per chapter (tap NEXT to run, story the first time), "Soon" stamps for the park and the yard, stickers that call `buy()` and land on the collar.
Flow: Title -> Passport -> Story (first time) -> Run -> Results -> Outro -> Passport; quitting a run also returns to the passport with the bones banked.
Upgrades reach the sim through `createWorld(level, viewW, seed, boosts)`.

## Still open after this round

- Phase 4a item 3: Chapter 1 secret rooms behind a slide, with golden bones.
- Phase 3 item 6: the allocation audit on the iPhone (the probe shows build 0.1 ms and op handoff 1-2 ms per step, so pooling has not been justified).
- Phase 1 step 8: typed-array op handoff, only if the audit shows the 2 ms matters.
- Party hats and bandanas as cosmetics would be new character art and need Alex's assets.

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

## Motion pass 2 (2026-10-12, after Alex said the motion still did not flow)

- The frame is now built twice per step (now, and one step ago) and the canvas blends every op's position, size, tilt and fade at the display rate (`buildFrame.ts` `View`, `OpList.takePrevFrom`, `GameCanvasImpl`). Camera shake, bobs, spins and the wagon's tilt all glide at 120 Hz.
- The hero runs with a gallop rig (`pupPose.ts` `gallopBody`, `gallopLegIndex`, `GALLOP` knobs): bound, pitch, stretch and squash, legs sweeping gathered to extended, dust on each contact.
- The wagon rolls on a slow wheel bounce and a wide-window tilt (`followers.ts`).
- `tools/composite_frames.py out.mp4 120` renders a 120 fps video with the same half-step blend the phone draws; `DUMP_STEPS=1` dumps one step per frame.

## Power Treats (2026-10-13, Alex: "make some level ups that make the dog bigger, faster, shoot balls")

1. Art (props only): `tennis_ball`, `bubble`, and four icons `power_mega`, `power_turbo`, `power_ball`, `power_bubble` in `tools/gen_sprites.js`; rendered, packed, shown to Alex. Proof: the prop sheet.
2. Sim (`world.ts`): presents grant a random power; `hero.powers` timers for mega, turbo, ball, bubble; mega crushes enemies and ignores acorns and scales the hit box; turbo multiplies speed and bone value; ball mouth turns BARK into tennis balls that stun, pop acorns and hit the boss; bubble eats one hit. Proof: `power.test.ts`, one test per power.
3. Render: the pup drawn at 1.6x under mega, the bubble around it, balls in flight, bigger dust. Proof: a 120 fps clip of mega and ball mouth shown to Alex before the shop.
4. HUD: a chip per live power with a draining ring; the present pop names the power. Proof: web screenshots.
5. Progress: four more treats (Mega lasts longer, Turbo lasts longer, Twin balls, Start with a Bubble) in `engine/progress.ts`, read by the sim through `RunBoosts`. Proof: progress tests and the Treats tab on the web build.
6. Levels: two more presents per chapter in risky spots. Proof: the autopilot still clears both chapters.

## Readability pass (2026-10-14, Alex: "the game is going too fast, it's tough to see what's coming")

Measured first with `src/game/sim/__tests__/pacing.test.ts` (`PACING=1 npm test -- pacing` prints the table) at the iPhone's view width.
Before: runners on screen 0.85-1.0 s before bark range and already 110-155 units into their run; acorns 0.37 s before bark range; throwers throw 0.7 s after appearing; three spots stack a squirrel, a thrower and an acorn inside 0.2 s; five coach tips fire inside 1.2 s of a hazard.

1. Run speed 300 -> 260 (Chapter 2 320 -> 280), with gravity and jump speeds scaled so every jump still reaches the same furniture and pits. Proof: both autopilots still win; the reach guide in each level file is updated.
2. Camera leads farther with speed (`feel.ts` `cameraLead`, capped so the wagon stays mostly in frame). Proof: `feel.test.ts`.
3. Runners sleep until they enter the view, then hop on the spot with a sparkle before charging (`world.ts` `stepEnemies`). Proof: the pacing table shows pre-run 0 and at least 1.1 s on screen.
4. Throwers wind up for half a second before the acorn leaves (`Enemy.windup`, a lean-back pose in `buildFrame.ts`), lob a higher, slower arc, never throw while another acorn is still near the pup, and a landing mark on the floor shows where the acorn comes down (`Acorn.landX`/`landT`, new `land_mark` prop). The boss keeps its 0.8 s lob. Proof: pacing table, and `DUMP_WARN=1 DUMP_FRAMES=out.json npx jest dumpFrames` + `tools/composite_frames.py` for the clip.
5. Levels: stacked spots pulled apart and every coach tip moved to at least 1.5 s before the hazard it talks about. Proof: the pacing test asserts no tip is "busy" and no two answers fall inside 0.6 s.
6. The pacing test asserts the budget for good: runners >= 1.0 s, acorns >= 0.6 s, throwers and cats >= 1.3 s, blocks >= 1.4 s, vacuums >= 1.0 s, throwers wind up >= 0.45 s, no two answers inside 0.6 s, no tip inside 1.2 s of a hazard. Budgets count ground covered at the level speed, so Turbo is the player's own risk.
   Chapter 1 lost the runner at 3150 and the blocks at 6760: both landed on top of another hazard with nowhere readable to move them.

## Chapter 3: The Park (2026-10-16, Alex: "let's start building on it")

1. `src/game/level/chapter3.ts`: stumps, benches, picnic tables and two playground towers on `room_park`; frees Olive (lab), Ziggy (shepherd) and Bijou (poodle); boss Pine Nutsy (4 hits). Props drawn in `tools/gen_sprites.js` (park_bench, tree_stump, picnic_table, play_tower, flower_bed, bush, floor_park).
2. Story: `CH3_INTRO` and `CH3_OUTRO` in `story.ts`; the Chapter 2 outro now points at the park, the Chapter 3 outro at the yard.
3. Music: `music_park` in `tools/make_audio.py` (150 bpm whistle, banjo-ish strums, birds).
4. Two render pops found by the frame-pipeline probe on the new level and fixed for every chapter: a knocked-out cat or toy blocks started its spin from its old timer (now reset when knocked out), and the hurt wobble jumped in and out (now eases from still and dies away, `PHYS.hurtPose`).
Proof: all chapter tests (autopilot win, pacing budgets, glitch runs, frame pipeline) pass for ch3; web screenshots of the story, the run and the boss. Not checked on a real iPhone yet.

## Stutter pass (2026-10-16, Alex: "It's still glitchy when jumping and stutters.")

Work happens in a separate worktree on branch `claude/stutter-fix`, so the build on Alex's phone does not change mid-test.
The Mac copy is fast-forwarded only when the round is ready.

Baseline from Alex's iPhone (production bundle, two one-second meter samples mid-jump): JS 60 Hz, worst gap 19-20 ms, no 0-step or 2-step ticks; UI 118-120 Hz, worst gap 23 ms with Reduce Motion off and 8 ms with it on.
One second per sample is too little to judge, so this round also makes the meter count over the whole run.

Checked in the installed libraries before planning:
- RN 0.86 `requestAnimationFrame` is `setTimeout(0)` and passes `performance.now()` at the moment it runs, so any JS task queued ahead of it shows up as timing jitter (`TimerManager.cpp`).
- expo-audio 57 `play()` is synchronous on the JS thread and calls `AVAudioSession.setActive(true)` every time; `keepAudioSessionActive` does not change that.
- Every expo-audio play also re-registers a time observer on the main thread, and every seek, start, stop and end sends a status event to the JS thread, even with no listener (`AudioPlayer.swift`, `EventEmitter.swift`). A jump with bones fires 4-5 sounds, so about 15 extra JS tasks.
- expo-haptics 57 builds a new feedback generator on the main thread (the thread that draws the game) for every haptic.
- Reading `uiStats` on the JS thread is a blocking call into the UI thread, and the meter text lives in `GameView` state, so the meter re-renders the whole play screen once a second.

Steps:
1. A test harness that replays phone-like timing (60 Hz display link, small delays plus spikes and stalls) through the real tick clock and the real `advancePlayhead`, and counts held and skipped pictures.
   Proof: it shows holds and skips on the current code before anything changes.
2. Tick clock on a whole-frame grid (`src/game/render/stepClock.ts`): frame lengths are counted in 120 Hz display frames, two per step, so a late callback can no longer leave the step counter stuck on an edge.
   Proof: unit tests plus the harness, no doubled or skipped steps for delays under 12 ms.
3. Every list reaches the canvas in order: the JS side queues each list onto the UI thread instead of overwriting one shared value, and a two-step tick hands over both lists.
   Proof: the harness shows no skips from late lists; framePipeline and uiThread tests still pass.
4. The meter: its own small component, fed once a second from the UI thread without a blocking read, with run totals (slow screen frames and what happened just before them, held and skipped pictures, late JS ticks, sound and haptic counts and JS cost).
   Proof: the line on the web build, then on Alex's phone.
5. Sounds: the same sound at most once per tick, bone sounds at most one per 100 ms, and slow status timers on every player.
   Proof: audioPool tests.
6. Haptics: at most one per tick (the strongest), which is not something a hand can feel.
   Proof: unit test of the filter.
7. Checks, commit, push, fast-forward the Mac copy, and Alex plays a whole chapter and screenshots the meter on the pause screen.

Not in this round without Alex's OK (feel changes): shorter hit freezes, fewer haptics, pose easing in the air, camera changes.
