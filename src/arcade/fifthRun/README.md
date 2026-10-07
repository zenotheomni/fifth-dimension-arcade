# Fifth Glide (id: `fifth-run`)

Seeded 3-lane endless **on-foot** runner (three.js). Route `/arcade/fifth-run`, lazy-loaded chunk.
Display name **Fifth Glide**; internal game id stays `fifth-run` (scores / challenges / seeds).
Lobby retired the broken Fifth Gear driving build — same cabinet now launches this runner.

Theme: **how far you can run**. Galaxy run: Miami night → cosmic highway → deep space.
Vibe: Temple Run / Subway Surfers — swipe lanes, jump, slide, collect 💫 stars.

Player: procedural hooded streetwear runner (`RunnerFigure`). Traffic cars stay as obstacles
(Draco GLTF sports coupe when available; procedural fallback).

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

## Determinism
`sim/` pure TS, fixed 120 Hz. Seed: `fifth-run|<seed>`.

## Captures
    npx vite build && npx vite preview --port 4173 &
    node scripts/fr-shots.mjs run end video
Out: `glide-run.png`, `glide-end.png`, `glide-run.mp4` (via OUT / rename).
