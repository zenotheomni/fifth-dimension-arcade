# Fifth Run (v2)

Seeded 3-lane endless runner (three.js). Route `/arcade/fifth-run`, lazy-loaded chunk.

Theme: **how far you can run**. Score is driven by **distance + shooting stars** — stars heavily boost distance points.

## Controls
- Swipe ← / → (or A/D, arrows): change lane
- Swipe ↑ (W, ↑, Space): jump · swipe ↓ (S, ↓): slide (mid-air = fast-fall into a slide)
- Inputs are buffered ~0.22 s, so an early swipe still fires on landing.

## Scoring
- Distance: `1 pt per metre`.
- Stars: `25` flat distance-equivalent points each, plus `10 × combo` (x2 at 10, x3 at 30, x4 at 60, x5 at 100).
- Final: `floor(distance) + stars×25 + starComboPts`. Missing a star resets the combo.

## Lives & traffic
- **3 lives.** Hit a car / barrier / overhead / gap → lose a life, brief respawn i-frames. Out of lives → run ends.
- Cars are **oncoming** (approach the runner); headlights face you.

## Power-ups
- **💫 Shooting stars:** collectibles (see scoring).
- **🖐️ Open hand:** invulnerable / invisible for **15 seconds**.

## Determinism
`sim/` is pure TS: no `Math.random`, no transcendental functions, fixed 120 Hz step, speed is a
function of distance only. Oncoming car positions are derived from `runner.s` alone. The track is
generated from the seed (`fifth-run|<seed>`).

## Harness
    node scripts/fr-tune.mjs --seeds 100 --oracle 12

## Captures
    npx vite build && npx vite preview --port 4173 &
    node scripts/fr-shots.mjs run end video
Debug handle: `__FR` (`setManual`, `advance(ms)`, `setAutopilot('perfect')`, `input('jump')`).
