# Credits & licenses

## Music

- **ZENO 5** — from *ZENO RELOADED* by Jenks / Fifth Dimension Imperial
- Bundled: `public/audio/zeno-5.mp3` → `/arcade/audio/zeno-5.mp3`
- Used with owner permission (Jenks / 5D Imperial).

## Engine / runtime

- [Phaser 3](https://phaser.io/) — MIT
- [React](https://react.dev/) / [Vite](https://vitejs.dev/) — MIT

## Fonts

- [Bungee](https://fonts.google.com/specimen/Bungee) — SIL Open Font License 1.1 (display logotype)
- [Inter](https://fonts.google.com/specimen/Inter) — SIL Open Font License 1.1 (UI)

## Brand & art

- Fifth Dimension emblem, wordmark, star-swirl — Jenks / 5D Imperial
- Title / court / box backgrounds — original pixel plates generated for this arcade (no baked UI/text). Concept mockups are direction-only and are **not** shipped in-game.

## SFX

- Procedural Web Audio in `src/arcade/courtVision/sfx.ts` (original)

## Fifth Glide (`src/arcade/fifthRun/`, id `fifth-run`)

- **Player** — procedural hooded runner (`render/runnerFigure.ts`), original.
- **Traffic car mesh** — `public/art/cars/sports.glb` is the [three.js Ferrari glTF sample](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf)
  (Draco-compressed). Loaded via `GLTFLoader` + `DRACOLoader`; body paint recolored per traffic variant.
  Decoder wasm/js vendored under `public/draco/` from three.js examples (Apache-2.0 / three.js license).
- Barriers, gantries, gates, lamps, palms, stars and power-ups — procedural geometry (`render/props.ts`), original.
- Sky, wet neon road + planar reflection, instanced towers with procedural windows — custom GLSL
  (`render/shaders.ts`), original.
- Planet, glow, comet streak, chevron, shooting-star textures — canvas at runtime (`render/textures.ts`), original.
- SFX — procedural Web Audio (`sfx.ts`), original.
- In-world “5” emblem on gates and the rare 5D logo invuln pickup — `public/art/emblem-160.webp`, Jenks / 5D Imperial.
- Libraries: [three.js](https://threejs.org/) — MIT (incl. GLTF/DRACO loaders, BufferGeometryUtils);
  [postprocessing](https://github.com/pmndrs/postprocessing) — Zlib (bloom + ACES tone mapping).
