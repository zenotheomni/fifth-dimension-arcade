# Fifth Run

Seeded 3-lane endless runner (three.js). Route `/arcade/fifth-run`, lazy-loaded chunk.

## Controls
- Swipe ← / → (or A/D, arrows): change lane
- Swipe ↑ (W, ↑, Space): jump · swipe ↓ (S, ↓): slide (mid-air = fast-fall into a slide)
- Inputs are buffered ~0.22 s, so an early swipe still fires on landing.

## Scoring
- Distance: 1 pt per metre.
- Stars: 5 pts × combo multiplier (x2 at 10 straight stars, x3 at 30, x4 at 60, x5 at 100). Missing a star resets the combo.
- “5” emblem: 5× star points for 6 s. Magnet: pulls stars from all lanes for 8 s. Shield: absorbs one hit.
- One hit ends the run. Lane-changing into a car you're alongside is a stumble, not a crash.

## Determinism
`sim/` is pure TS: no `Math.random`, no transcendental functions, fixed 120 Hz step, speed is a
function of distance only. The track is generated from the seed alone (`fifth-run|<seed>`), so a
challenge seed gives both players an identical highway.

## Harness
    node scripts/fr-tune.mjs --seeds 100 --oracle 12
Checks determinism, input-independence of the layout, a passable lane on every row, exhaustive
survivability search per seed (240 s), bot survival times (novice/decent/expert/perfect) and the ramp.

## Captures
    npx vite build && npx vite preview --port 4173 &
    node scripts/fr-shots.mjs            # idle run jump powerup crash end video (API mocked)
Debug handle in the browser: `__FR` (`setManual`, `advance(ms)`, `setAutopilot('perfect')`, `input('jump')`).
