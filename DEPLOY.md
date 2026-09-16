# Deploy Fifth Dimension Arcade (Vercel)

Repo: [zenotheomni/fifth-dimension-arcade](https://github.com/zenotheomni/fifth-dimension-arcade)

**Stack:** Next.js App Router + TypeScript. Public path `/arcade`.

## Import project

1. Open [vercel.com/new](https://vercel.com/new) and import `zenotheomni/fifth-dimension-arcade`.
2. Framework preset: **Next.js**. Root directory: `.` (repo root).
3. Build command: `npm run build`.
4. Install command: `npm install` (no committed `package-lock.json` in this M1 push; pins are `next@16.3.5`, `react@19.2.8`).
5. Deploy Production from `main` after this PR merges.

`next.config.ts` sets `basePath: "/arcade"` so routes and `/_next` assets live under `/arcade`.
`vercel.json` redirects `/` → `/arcade`.

After the first deploy, the lobby is at:

`https://<project>.vercel.app/arcade`

## Link from 5Dimperial.com

Keep this app as its own Vercel project. On `5Dimperial.com`:

- Prefer a **rewrite/proxy** so `https://5dimperial.com/arcade` **and** `/arcade/_next/*` hit this deployment.
- Or a prominent link from the main site to the Vercel `/arcade` URL until DNS/proxy is ready.

Do **not** fold arcade routes into Shopify storefront pages or `5D-Landing-Page` for v1.

## Local check before ship

```bash
npm install
npm run build
npm start
# open http://localhost:3000/arcade
```
