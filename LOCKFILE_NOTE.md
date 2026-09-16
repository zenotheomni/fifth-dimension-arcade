# package-lock

Full lock is materialized by `.github/workflows/materialize-lockfile.yml` from `scripts/lock.b64.part0`–`part3` (gzip+base64 of the builder lock).

After that workflow commits `package-lock.json` on `main`, Vercel / CI should use `npm ci` (or `npm install` with this lock). See DEPLOY.md.
