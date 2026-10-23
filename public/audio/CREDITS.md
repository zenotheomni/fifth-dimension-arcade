# Audio credits

| File | Source | License |
|---|---|---|
| `court-vision-theme.mp3`, `court-vision-theme.m4a` | "ZENO 5" — original track by Jenks / Fifth Dimension Imperial, supplied by the owner (Oct 2026). Re-encoded for web: loudness-normalized to −16 LUFS (true peak −1.5 dBTP, linear), 44.1 kHz stereo, MP3 128 kbps CBR + AAC-LC 128 kbps. | © Fifth Dimension Imperial — all rights reserved; used by the owner. |
| `fifth-glide-theme.mp3`, `fifth-glide-theme.m4a` | "Thousand Yard Stare" — original track by Jenks / Fifth Dimension Imperial, supplied by the owner (Oct 2026). Same processing: −16 LUFS (true peak −1.5 dBTP, linear), 44.1 kHz stereo, MP3 128 kbps CBR + AAC-LC 128 kbps; trailing silence trimmed for a seamless loop. | © Fifth Dimension Imperial — all rights reserved; used by the owner. |
| `fifth-glide-2.mp3`, `fifth-glide-2.m4a` | "Wattup Yo" (Fifth Glide song 2) — original track by Jenks / Fifth Dimension Imperial, supplied by the owner (Oct 2026). Same processing: −16 LUFS, MP3 128 kbps + AAC-LC 128 kbps; 4.1 s trailing silence trimmed. Unlocks when a run outlasts Thousand Yard Stare; the two then alternate. | © Fifth Dimension Imperial — all rights reserved; used by the owner. |
| `street-shift-theme.mp3`, `street-shift-theme.m4a` | "Eucalyptus Vibes" — original track by Jenks / Fifth Dimension Imperial, supplied by the owner (Oct 2026; Drive `Jenks_EUCALYPTUS VIBES.wav`, no CLEAN label available). Same processing: −16 LUFS (true peak −1.5 dBTP), 44.1 kHz stereo, MP3 128 kbps CBR + AAC-LC 96 kbps. | © Fifth Dimension Imperial — all rights reserved; used by the owner. |
| `lobby-theme.mp3`, `lobby-theme.m4a` | "We Outside" (FCC clean) — original track by Jenks / Fifth Dimension Imperial, supplied by the owner (Oct 2026). Same processing: −16 LUFS, MP3 128 kbps + AAC-LC 128 kbps. | © Fifth Dimension Imperial — all rights reserved; used by the owner. |

v24 (Oct 2026): the four .m4a files were re-encoded to AAC-LC 96 kbps stereo (faststart) for a faster first play on phones (~1.85 MB per 2.5 min song, was ~2.5 MB). The .mp3 fallbacks are unchanged.

## Sound effects

Court Vision sound effects (swish, net snap, rim tick/clank, backboard thud,
floor bounce, release whoosh, flow-state whoosh, crowd swell, bonus chime) are
**synthesized at runtime with the Web Audio API** in
`src/arcade/courtVision3d/sfx3d.ts` (filtered noise + oscillators). No sample
files are used, so there are no third-party sample licenses.

## Scene slots

Music is assigned per scene in `src/arcade/audio/music.ts` (`SCENE_TRACKS`).
"We Outside" loops in the lobby, "ZENO 5" plays only in Court Vision, and the
Fifth Glide plays "Thousand Yard Stare" from the START tap (crossfade from the lobby song,
same as Court Vision). (The old 44 s `zeno-5.mp3` lobby loop was removed.)

Looping (Oct 2026): leading/trailing silence was trimmed from all three songs (lobby −0.19 s / −2.2 s,
ZENO 5 −1.2 s tail, Thousand Yard Stare −0.7 s tail) with 20/40 ms edge fades, and the player wraps
each song by crossfading (1.2 s) into a second copy of itself, so there's no gap at the loop point.
A "Now Playing" tab names the song when each scene's music starts.


v25 (Oct 2026): added Nova 5 (Street Shift) theme (Eucalyptus Vibes). AV cache-bust bumped to `?v=25`.
