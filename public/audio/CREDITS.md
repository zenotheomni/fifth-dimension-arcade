# Audio credits

| File | Source | License |
|---|---|---|
| `court-vision-theme.mp3`, `court-vision-theme.m4a` | "ZENO 5" — original track by Jenks / Fifth Dimension Imperial, supplied by the owner (Oct 2026). Re-encoded for web: loudness-normalized to −16 LUFS (true peak −1.5 dBTP, linear), 44.1 kHz stereo, MP3 128 kbps CBR + AAC-LC 128 kbps. | © Fifth Dimension Imperial — all rights reserved; used by the owner. |
| `lobby-theme.mp3`, `lobby-theme.m4a` | "We Outside" (FCC clean) — original track by Jenks / Fifth Dimension Imperial, supplied by the owner (Oct 2026). Same processing: −16 LUFS, MP3 128 kbps + AAC-LC 128 kbps. | © Fifth Dimension Imperial — all rights reserved; used by the owner. |

## Sound effects

Court Vision sound effects (swish, net snap, rim tick/clank, backboard thud,
floor bounce, release whoosh, flow-state whoosh, crowd swell, bonus chime) are
**synthesized at runtime with the Web Audio API** in
`src/arcade/courtVision3d/sfx3d.ts` (filtered noise + oscillators). No sample
files are used, so there are no third-party sample licenses.

## Scene slots

Music is assigned per scene in `src/arcade/audio/music.ts` (`SCENE_TRACKS`).
"We Outside" loops in the lobby, "ZENO 5" plays only in Court Vision, and the
Fifth Glide slot is empty for now. (The old 44 s `zeno-5.mp3` lobby loop was removed.)
