# package-lock

`package-lock.json` on `main` is the full lockfile (lockfileVersion 3) committed for reproducible installs.

Vercel / CI should use `npm ci` (or `npm install` with this lock) so dependency versions match the builder box. See DEPLOY.md for deploy notes.
