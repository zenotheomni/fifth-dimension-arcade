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
No traffic: Temple Run kit only — low barriers (jump), overhead beams (slide), gaps (jump or fall),
tall crate stacks (switch lanes); full-width BBB / OOO / GGG rows force the jump / slide.

## Chase (core tension)
- A wall of dark energy (`render/darkEnergy.ts`: layered domain-warped fbm smoke slabs + violet
  filaments) follows the runner; `threat` 0..1 pulls it in, CSS `.fr-threat` darkens the edges, rumble SFX.
- Hit an obstacle → stumble: threat = 0.75, speed ×0.62 easing back over 1.1 s, 0.5 s i-frames.
- Stumble again while threat ≥ 0.3 (≈3 s of clean running to recover; recovery is up to 45% faster in the warm-up) → **caught**.
- **3 lives.** Caught or falling into a gap costs one; respawn at the same distance with the smoke reset and 2.5 s grace. 3rd life lost = game over.

## Controls
- Swipe ← / → (or A/D, arrows): change lane
- Swipe ↑ (W, ↑, Space): jump · swipe ↓ (S, ↓): slide (mid-air = fast-fall into a slide)
- Inputs are buffered ~0.22 s

## Scoring (score = distance, metres)
- `score = floor(metres run) + stars × 3` (STAR_M). Leaderboard ranks this number.
- Star streak (combo) is tracked for callouts / best streak only.
- Rare Fifth Dimension logo (`public/art/glide-logo-512.webp`, from Jenks's emblem): **10 s** invincible
  (can't be caught or fall, smashes through obstacles) + **1.5× speed surge** (eased in 0.4 s / out 1 s, wider FOV,
  speed lines, smoke fades away), then 1.5 s grace.

## Difficulty curve (first-timer friendly)
- Speed `21 → 58 m/s`, `k = 1300` (≈29 m/s at 15 s, ≈36 at 30 s, ≈44 at 60 s). Stars move: bob (some need a jump), drift-in, zig-zag snake, bait lines before crates, high floaters.
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
