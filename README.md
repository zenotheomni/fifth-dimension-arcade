# Fifth Floor Arcade

Mobile-web arcade for [Fifth Dimension / 5D Imperial](https://5dimperial.com).

- **Stack:** Vite 7 + React 19 + TypeScript + Phaser 3
- **Base path:** `/arcade/`
- **Live:** https://fifth-dimension-arcade.vercel.app/arcade

## Scripts

```bash
npm install
npm run dev      # http://127.0.0.1:5173/arcade/
npm run build
npm run preview
```

## Routes

| Path | Notes |
|------|--------|
| `/arcade` | Title screen → game select |
| `/arcade/court-vision` | Phaser Court Vision |
| `/arcade/fifth-run` | Shell (gameplay later) |
| `/arcade/challenge/:id` | Friend challenge |
| `/arcade/key` | NFC key shell |

See `CREDITS.md` for music / engine / brand asset credits.

Owner: 5Dimperial / Jenks · Builder: Fifth Floor

## Backend

Scores, leaderboards, challenges, and contests: see [`ARCADE_BACKEND.md`](./ARCADE_BACKEND.md).
