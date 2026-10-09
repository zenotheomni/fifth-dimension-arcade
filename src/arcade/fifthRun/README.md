# Fifth Glide (id: `fifth-run`)

Seeded 3-lane endless **on-foot** runner (three.js). Route `/arcade/fifth-run` (alias `/arcade/fifth-glide`), lazy-loaded chunk.
Display name **Fifth Glide**; internal game id stays `fifth-run` (scores / challenges / seeds).
Lobby retired the broken Fifth Gear driving build — same cabinet now launches this runner.

Theme: **how far you can run**. Galaxy run: Miami night → cosmic highway → deep space.
Vibe: Temple Run / Subway Surfers — swipe lanes, jump, slide, collect 💫 stars.

Player: **rigged astronaut** (`render/humanRunner.ts`, `public/art/runner/astronaut.glb`, Rocketbox MIT
base + EVA suit/helmet/PLSS — see CREDITS.md). AnimationMixer blends mocap run (time-scaled to game
speed), a leap pose for jumps, crouch for slides, idle on the start line; bank/lean/crash tumble on a
parent group. Visor/metal reflect a small neon PMREM env (`render/env.ts`); a chase spot keeps the suit
reading white. The procedural hooded `RunnerFigure` is the instant/failed-load fallback.
Temple Run kit — low barriers (jump), overhead beams (slide), gaps (jump or fall), boulders / crate stacks
(switch lanes); full-width BBB / OOO / GGG rows force the jump / slide. Past 1.1 km, **oncoming cars**
drive at you down a lane (switch lanes to dodge).

## Oncoming cars (`CARS` / `carChanceAt` in `sim/constants.ts`, `maybeCar` in `sim/track.ts`)
- None before 1100 m (~30 s). Each open stretch then rolls a car: 8% at 1100 m, rising linearly to 50% by 4200 m.
- A car drives toward you at 8–15 m/s. It is placed so it meets you ≥ max(0.5 s, 10 m) after the previous row, so
  there is always time to change lanes, and its lane is kept clear of other obstacles and star lines until it has passed.
  Headlights + flares read from well ahead.
- Hitting one costs a life (like a boulder) unless you're invincible (then you smash it).

## Chase (core tension)
- A small **UFO** (`render/ufo.ts`: ~0.72 m metal saucer, glowing dome, chasing rim lights, violet under-glow,
  tractor beam when it catches you) is **always on screen** like Temple Run's monsters: a little behind and above the
  runner, beside his head toward the middle of the road (never over him), clamped inside the frame for any lane / FOV.
  `threat` 0..1 pulls it in: clean = higher, further back, out over the next lane; stumble = swoops down over his
  shoulder; caught = right above him, beam on. CSS `.fr-threat` darkens the edges, rumble SFX.
- Camera: raised chase cam (y 4.2, z 7.0, looking at y 0.55 14 m ahead, ~10° down): more road ahead + the UFO in view.
- Hit a small obstacle (hurdle / beam / pipe) → stumble: threat = 0.75, speed ×0.62 easing back over 1.1 s, 0.5 s i-frames.
- Stumble again while threat ≥ 0.3 (≈3 s of clean running to recover; recovery is up to 45% faster in the warm-up) → **caught**.
- **3 lives.** Caught by the UFO, falling into a gap, or hitting a boulder / car costs one. Temple Run continue: the
  fall (~1.05 s, he drops into the pit) or crash (~0.85 s) plays, then he respawns **at the same spot** (just past the
  gap for a fall), flashing with 2.5 s grace, and keeps running (no restart). 3rd life lost = game over.
- Gaps are **potholes** (`render/pothole.ts`): a jagged, irregular opening cut in the road shader (`uHoles` +
  `uHoleSeed`, `potR()` shared with the pit mesh), broken/chipped asphalt band, radial + web cracks, dark earth/gravel
  walls 7 m deep, faint warm glow from below (a touch stronger at distance, plus a faint warm haze, so it reads ~1.5 s
  out), broken asphalt slabs, bent rebar and gravel on the rim. Shapes are seeded per obstacle id and cached.
- Star streak: while invincible (logo, incl. the blinking last 3 s) or in respawn grace, smashing / passing through
  things never breaks the streak or shows "Combo lost"; a real hit while vulnerable does.

## Debug
`?debug=1` shows an overlay logging WebGL context loss/restore, canvas resizes (applied / ignored + reason), DPR and
post-processing changes, NaN/Inf pixels (small HDR probe render every 30 frames + reflection target sample), long frames
and visibility changes.

## Controls
- Swipe ← / → (or A/D, arrows): change lane
- Swipe ↑ (W, ↑, Space): jump · swipe ↓ (S, ↓): slide (mid-air = fast-fall into a slide)
- Inputs are buffered ~0.22 s

## Scoring (score = distance, metres)
- `score = floor(metres run) + stars × 3` (STAR_M). Leaderboard ranks this number.
- Star streak (combo) is tracked for callouts / best streak only.
- Rare Fifth Dimension logo (`public/art/glide-logo-512.webp`, from Jenks's emblem): **10 s** invincible
  (can't be caught or fall, smashes through obstacles) + **1.5× speed surge** (eased in 0.4 s / out 1 s, wider FOV,
  speed lines, the UFO falls away). He blinks for the last 3 s (`BLINK_S`) and is still invincible; when it ends he is
  vulnerable straight away (no post-boost grace).

## Difficulty curve (first-timer friendly)
- Speed `30 → 60 m/s`, `k = 3000` (≈37.5 m/s at 1 km, ≈43.6 at 2.5 km). Stars come in Temple Run coin lines: 8–15 stars 3 m apart in one lane (arcing over hurdles / gaps), then ≥ 40 m (≥ ~1.1 s) of nothing; some lines bob slowly (render only).
- Obstacles: low rubble hurdle (jump; clear whenever feet are above 0.6 m), high beam (slide), chest-high pipe (jump or slide), boulder (change lane), gap (jump). Hits only when the body box intersects the obstacle box; a falling jump floats briefly (hang assist) over a hurdle just ahead.
- Chaser: a ~0.95 m UFO; off-frame when you run clean, a small craft at the bottom of the frame after a stumble.
- Warm-up `WARM_M = 750 m` (≈ first 40 s): no double-crate / mixed rows until mid-warm-up, up to ~2.9× row spacing,
  no crate in the start lane early, 110 m empty runway. Level held at 0 for 460 m, then `(s−460)/(s−460+950)`.
- Harness: `node scripts/fr-tune.mjs` (full) / `node scripts/fr-quick.mjs` (bots only). The `rookie`
  bot is calibrated to a real first run (old curve: median 32 s); target rookie median ≥ 60 s,
  nobody out before 30 s.

## Determinism
`sim/` pure TS, fixed 120 Hz. Seed: `fifth-run|<seed>`.

## Captures
    npx vite build && npx vite preview --port 4173 &
    node scripts/fr-shots.mjs run end video
Out: `glide2-*`. Chase build: `PORT=4183 node scripts/glide3-shots.mjs` → glide3-howto/run/invincible/end.png + glide3-run.mp4.

## Image quality / grade

- Renders at full device pixel ratio (cap 2.5 high tier, 2 low tier). The adaptive loop sheds planar-reflection updates first (every 2nd, then 3rd frame); it drops resolution (to 0.7× minimum) only after two consecutive sub-50 fps seconds; post-processing goes last.
- Composer: 4× MSAA on the HDR buffer plus SMAA (high) after ACES tone mapping. Max anisotropic filtering is applied to every texture, including the suit.
- Night grade: exposure 0.8, bloom 0.62 with luminance threshold 0.86, so only emissive sources glow. Darker fog, horizon haze, and facades; neon rails, gates, and lamp halos are toned down; speed lines are subtle; the invincible shield alpha is about 0.09.
- Tower windows and road markings are analytically anti-aliased with `fwidth`, and far window grids resolve to average coverage instead of shimmering.
