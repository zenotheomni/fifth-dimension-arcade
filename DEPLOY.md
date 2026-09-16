# Deploy Fifth Dimension Arcade (Vercel)

Repo: [zenotheomni/fifth-dimension-arcade](https://github.com/zenotheomni/fifth-dimension-arcade)

Ship path: **Vite + React on `main`**. Do not merge the Next.js PR (#2).

## Import project

1. Open [vercel.com/new](https://vercel.com/new) and import `zenotheomni/fifth-dimension-arcade`.
2. Framework preset: **Other** (or Vite). Root directory: `.` (repo root).
3. Build command: `npm run build` (from `vercel.json` / `package.json`).
4. Output directory: `dist` — Vite writes the SPA under `dist/arcade/` so URLs are `/arcade/...`.
5. Install command: `npm install`.
6. Deploy Production from `main`.

After the first deploy, the lobby is at:

`https://<project>.vercel.app/arcade`

API stubs:

- `POST /api/scores`
- `POST /api/challenges`
- `GET /api/challenges/:id`

## Link from 5Dimperial.com

Keep this app as its own Vercel project. On `5Dimperial.com`:

- Prefer a **rewrite/proxy** so `https://5dimperial.com/arcade` (and `/arcade/*`, including static assets under `/arcade/assets/*`) hit this deployment.
- Or a prominent link from the main site to the Vercel `/arcade` URL until DNS/proxy is ready.

Do **not** fold arcade routes into Shopify storefront pages or `5D-Landing-Page` for v1.

## Local check before ship

```bash
npm install
npm run build
npm run preview
# open http://127.0.0.1:4173/arcade/
```

## Stack note

Open PRs that rewrite to Next.js are out of scope for M1. Stay on Vite until a deliberate stack decision after M1 is live.
