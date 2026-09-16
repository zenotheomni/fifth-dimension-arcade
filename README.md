# Fifth Dimension Arcade

Mobile-web arcade for [5Dimperial](https://5dimperial.com) — **The Fifth Floor** lobby, Court Vision, Fifth Run.

**Stack:** Vite 7 · React 19 · TypeScript · react-router-dom  
**Base path:** `/arcade/` (works on `*.vercel.app/arcade` and later `5Dimperial.com/arcade`)

## M1 scope

- Lobby shell (cabinets, dock, desktop QR gate)
- Placeholder routes for Court Vision, Fifth Run, Challenge, NFC Key
- Arcade-core: identity, cabinet config, analytics stub
- API stubs: `POST /scores`, `POST /challenges`, `GET /challenges/:id`

See `CREATIVE_BRIEF.md` (source of truth) and `BRAND_PLACEMENT.md`.

## Develop

```bash
npm install
npm run dev
# → http://127.0.0.1:5173/arcade/
```

## Build

```bash
npm run build
npm run preview
```

## Deploy (Vercel)

Root of this repo. `vercel.json` rewrites `/arcade` SPA + `/api` serverless. Output builds to `dist/arcade` so assets resolve under `/arcade/`.

## Routes

| Path | Page |
|------|------|
| `/arcade` | The Fifth Floor lobby |
| `/arcade/court-vision` | Court Vision shell |
| `/arcade/fifth-run` | Fifth Run shell |
| `/arcade/challenge/:id` | Challenge placeholder |
| `/arcade/key` | NFC key landing |

Owner: 5Dimperial / Jenks · Builder: Fifth Floor
