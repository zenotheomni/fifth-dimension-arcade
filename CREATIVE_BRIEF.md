# Fifth Dimension Arcade — Creative Brief (source of truth)
Owner: Creative Director · Builder: Fifth Floor
Updated: 2026-09-16
Decision: Ship mobile WEB now. Native app later.

## Build order
1. M1 — Lobby shell + routes + analytics
2. M2 — Court Vision Endless
3. M3 — Challenge links
4. M4 — Fifth Run Endless + Challenge
5. M5 — NFC `/arcade/key`
6. M6 — Accounts + PWA
7. M7 — Native app shell (later)

## Feel
Night phone arcade, streetwear-clean, after-hours glow. Not cartoon, not NBA 2K clutter, not hard-sell. Soft CTAs only after a run ends.

## Shared palette (directional)
| Token | Hex |
|---|---|
| Void black | `#0A0A0C` |
| Ink purple | `#1A1028` |
| Signal orange | `#FF5A1F` |
| Soft white | `#F2F0EA` |
| CRT mint | `#7DFFC3` |
| Muted gray | `#6B6B73` |

## Shared copy locks
- Flow state.
- Fifth State unlocked.
- Run it back.
- Almost. Rearrange. Run it back.

## Non-goals (v1)
- No Break & Rack / Lane Drift gameplay
- No pay-to-win / IAP
- No checkout overlay mid-play
- Boutique / record store need not be finished (dock placeholders OK)
- Feng Shui not required for v1 (seasonal skin/soundtrack later only)
- No giant watermarks on HUD

## Routes
- `/arcade` — The Fifth Floor lobby
- `/arcade/court-vision`
- `/arcade/fifth-run`
- `/arcade/challenge/:id`
- `/arcade/key` — NFC landing

## API (app-safe)
- `POST /scores` `{ game, mode, score, meta }`
- `POST /challenges` → id + URL
- `GET /challenges/:id`
- Shared arcade-core for identity, scores, challenges, cabinet config

---

## The Fifth Floor (lobby)
Dark floor, soft glow on cabinets, ambient hum. Brand mark on carpet / ticket-stub energy.

Cabinets (swipe):
1. Court Vision — lit, NEW
2. Fifth Run — lit
3. Break & Rack — COMING UP
4. Lane Drift — COMING UP

Bottom dock: Boutique · Record Store · Theater  
Friend line under cabinet: `BEAT ___'S [score]`  
Desktop: “Open on your phone” + QR  
Cabinet preview = 3s gameplay loop on glass (not thumbnail grid)

---

## Court Vision
Finger-flick basketball. Hold ball → pull aim/power → release. Optional one mid-air nudge.

### Modes (v1)
Endless + Challenge (`:60 Heat` later)

### Scoring
- Make = 2
- Swish = 3
- Streak x3 / x5 / x10 → 1.5x / 2x / 3x
- Perfect release = +1
- Bank off backboard logo = +2 “5D bounce”
- Miss resets multiplier

### Brand placement
1. Small 5D mark on rim plate / front support
2. Center-court mark ~15–20% opacity
3. Micro stamp on ball seam
4. Backboard = faint geometry ONLY — NO big logo
5. Sideline type banners; max one small mark in corner

### Camera / art
3/4 high angle; hoop upper third; ball in thumb zone. Crowd = silhouettes in 5D fits, no faces.

### Copy locks
| Moment | Line |
|---|---|
| First make | You’re in. |
| x5 streak | Flow state. |
| x10 streak | Nothing in the way. |
| New PB | Fifth State unlocked. |
| Lost challenge | Almost. Rearrange. Run it back. |
| Won challenge | You shifted the scoreboard. |

End doors (always): **Challenge a friend** · **Enter boutique**

SFX: soft swish + bass; mint flash on swish / 5D bounce; screen shake only on swish (2–3 frames)

---

## Fifth Run
3-lane endless runner (Subway Surfers cousin). Swipe L/R lanes, up = jump, down = slide. Optional pulse (short invuln/magnet) from streaks — not paywall.

### Modes (v1)
Endless + Challenge

### Pickups
- 5D Mark = +10
- Vinyl = +25
- Key = +50 (rare)
- Near-miss = +5
- 5 marks no hit = 2x for 10s

### World
Night megacity tunnel — boutique windows, record-store neon, theater marquee. Obstacles = static blocks / dead billboards / gray mannequins (no faces). Logos on world objects, not HUD watermark.

### Copy locks
| Moment | Line |
|---|---|
| Start | You’re already moving. |
| First key | Key acquired. |
| x2 multiplier | Flow state. |
| New PB | Fifth State unlocked. |
| Crash | Glitch. Rearrange. Run it back. |
| Beat friend | You outran their reality. |

End doors: **Challenge a friend** · **Enter record store**

---

## Start now
Build **M1** on the existing 5Dimperial stack. If blocked on repo/hosting/access, ask Jenks once. Do not wait on Creative Director for another paste of this brief — read this file.
