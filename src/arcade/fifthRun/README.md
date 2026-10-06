# Fifth Gear (id: `fifth-run`)

Seeded 3-lane endless **car** runner (three.js). Route `/arcade/fifth-run`, lazy-loaded chunk.
Display name **Fifth Gear**; internal game id stays `fifth-run` (scores / challenges / seeds).

Theme: **how far you can drive**. Galaxy run: Miami night → cosmic highway → deep space.
Vibe: Subway Surfers / Temple Run — but cars. Dodge, weave, collect stars.

Cars: Draco GLTF sports coupe (three.js Ferrari sample) with recolored clearcoat body paint,
lit lamps, soft ground shadows. Procedural coupe is the instant fallback. Player slightly smaller;
raised chase cam for lane readability.

## Controls
- Swipe ← / → (or A/D, arrows): change lane
- Swipe ↑ (W, ↑, Space): boost hop · swipe ↓ (S, ↓): drift / duck
- Inputs are buffered ~0.22 s

## Scoring
- Distance: `1 pt per metre`
- Time lasted: `5 pts per second`
- Stars: `25` flat each + `10 × combo` (x2@10 … x5@100)
- Final: `floor(distance) + floor(timeS×5) + stars×25 + starComboPts`

## Lives & traffic
- **3 lives** (respawns). Hit car / barrier / overhead / gap → lose a life.
- **Oncoming traffic** with independent motion toward the player (not parked blockers).
  Spawned in staggered waves; density + approach speed ramp over distance.
- Occasional barriers / rails / gaps as spice.

## Power-ups
- **💫 Shooting stars**
- **🖐️ Open hand:** invulnerable / invisible **15s**

## Determinism
`sim/` pure TS, fixed 120 Hz. Seed: `fifth-run|<seed>`.

## Captures
    npx vite build && npx vite preview --port 4173 &
    node scripts/fr-shots.mjs run end video
Out: `fr-gear-v3-run.png`, `fr-gear-end.png`, `fr-gear-v3-run.mp4` (via OUT / rename).
