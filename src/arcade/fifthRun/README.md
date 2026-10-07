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
Traffic cars stay as obstacles (Draco GLTF sports coupe when available; procedural fallback).

## Controls
- Swipe ← / → (or A/D, arrows): change lane
- Swipe ↑ (W, ↑, Space): jump · swipe ↓ (S, ↓): slide (mid-air = fast-fall into a slide)
- Inputs are buffered ~0.22 s

## Scoring
- Distance: `1 pt per metre`
- Time lasted: `5 pts per second`
- Stars: `25` flat each + `10 × combo` (x2@10 … x5@100)
- Final: `floor(distance) + floor(timeS×5) + stars×25 + starComboPts`

## Lives & traffic
- **3 lives** (respawns). Hit car / barrier / overhead / gap → lose a life.
- **Oncoming traffic** plus barriers / rails / gaps.
- Rare **Fifth Dimension logo** pickup → invulnerable **15s** (go through everything).

## Difficulty curve (first-timer friendly)
- Speed `14 → 44 m/s`, `k = 1600` (≈21.5 m/s at 30 s, ≈27 at 60 s, ≈31 at 90 s).
- Warm-up `WARM_M = 750 m` (≈ first 40 s, strongest in the first 30 s): single-car rows only (multi-car rows fade in after mid-warm-up),
  slower oncoming cars (7–10 m/s), up to ~2.9× wave spacing; first rows keep traffic out of the
  start lane; 110 m empty runway. Level held at 0 for 460 m, then `(s−460)/(s−460+950)`.
- Harness: `node scripts/fr-tune.mjs` (full) / `node scripts/fr-quick.mjs` (bots only). The `rookie`
  bot is calibrated to a real first run (old curve: median 32 s); target rookie median ≥ 60 s,
  nobody out before 30 s.

## Determinism
`sim/` pure TS, fixed 120 Hz. Seed: `fifth-run|<seed>`.

## Captures
    npx vite build && npx vite preview --port 4173 &
    node scripts/fr-shots.mjs run end video
Out: `glide2-run.png`, `glide2-jump.png`, `glide2-end.png`, `glide2-run.mp4` (`PREFIX=` / `OUT=` to change).

## Image quality / grade

- Renders at full device pixel ratio (cap 2.5 high tier, 2 low tier). The adaptive loop sheds planar-reflection updates first (every 2nd, then 3rd frame); it drops resolution (to 0.7× minimum) only after two consecutive sub-50 fps seconds; post-processing goes last.
- Composer: 4× MSAA on the HDR buffer plus SMAA (high) after ACES tone mapping. Max anisotropic filtering is applied to every texture, including the GLB cars and suit.
- Night grade: exposure 0.8, bloom 0.62 with luminance threshold 0.86, so only emissive sources glow. Darker fog, horizon haze, and facades; neon rails, gates, and lamp halos are toned down; speed lines are subtle; the invincible shield alpha is about 0.09.
- Tower windows and road markings are analytically anti-aliased with `fwidth`, and far window grids resolve to average coverage instead of shimmering.
