# Fifth Glide astronaut (`public/art/runner/astronaut.glb`) — how it was built

Source (MIT, Microsoft Rocketbox — https://github.com/microsoft/Microsoft-Rocketbox):
- `Assets/Avatars/Adults/Male_Adult_18/Export/Male_Adult_18.fbx` + `Textures/m023_body_{color,normal}.tga`
- `Assets/Animations/all_animations_max_motextr_xy/m_run_fast_01.max.fbx` (run)
- `Assets/Animations/all_animations_max_motextr_static/m_idle_neutral_01.max.fbx` (idle), `m_crouch_idle.max.fbx` (slide)

Steps (scratch dir served at `/glide-assets/rb/` by `python3 -m http.server` from /workspace):
1. Textures (Python/PIL): suit albedo = off-white × local fold detail of the original cloth texture
   (luminance / blurred luminance), gloves light grey, boots white uppers / dark soles; roughness map
   0.7–0.95 with noise; normal map = original body normal (1k). PLSS panel texture drawn procedurally.
2. `convert.html` (three.js FBXLoader → GLTFExporter, run headless via `convert.mjs`): drops the head
   + hood triangles, inflates the body along normals (≈2.6 cm torso/legs, less on hands/feet), adds
   rigid helmet (shell + gold metal visor + lamps + neck rings) on `Bip01_Head`, PLSS backpack with
   5D emblem patch + chest module on `Bip01_Spine2`, wrist/arm bearing rings on the arm bones; strips
   face/scale tracks and horizontal root motion from the clips.
3. `npx @gltf-transform/cli optimize astro-raw.glb astronaut.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify false --palette false`
