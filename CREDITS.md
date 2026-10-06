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

## Fifth Gear (`src/arcade/fifthRun/`, id `fifth-run`)

No third-party art, models, textures or audio — everything in the game is generated in code:

- Runner, ’59-style Cadillac (fins, bullet taillights, whitewalls), barriers, gantries, gates, lamps, palms,
  keys and power-ups — procedural low-poly geometry (`render/runnerFigure.ts`, `render/props.ts`), original.
- Sky, wet neon road + planar reflection, instanced towers with procedural windows — custom GLSL
  (`render/shaders.ts`), original.
- Planet, glow, comet streak, chevron textures — drawn to canvas at runtime (`render/textures.ts`), original.
- SFX — procedural Web Audio (`sfx.ts`), original.
- In-world “5” emblem on gates and the 5× pickup — `public/art/emblem-160.webp`, Jenks / 5D Imperial.
- Libraries: [three.js](https://threejs.org/) — MIT (incl. `examples/jsm/utils/BufferGeometryUtils.js`);
  [postprocessing](https://github.com/pmndrs/postprocessing) — Zlib (bloom + ACES tone mapping).
