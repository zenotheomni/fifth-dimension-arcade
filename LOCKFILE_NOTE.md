# package-lock follow-up

Remote `package-lock.json` is a stub (root packages only) because full lock (~104KB) exceeds MCP `push_files` payload comfort on this path.

Full lockfile lives on the builder box at `/workspace/fifth-dimension-arcade/package-lock.json` (lockfileVersion 3).

Vercel / CI can still build with `npm install` from `package.json`. Prefer committing the full lock later via GitHub UI, `gh`, or a local git push for reproducible deploys.
