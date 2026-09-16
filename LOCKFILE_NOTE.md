# package-lock follow-up

Remote `package-lock.json` remains a stub (root packages only) on this branch because the full lock (~104KB; ~80KB minified JSON) exceeds MCP `push_files` / `create_or_update_file` payload limits on this path.

Full lockfile lives on the builder box at `/workspace/fifth-dimension-arcade/package-lock.json` (lockfileVersion 3, 232 package entries).

Vercel / CI can still build with `npm install` from `package.json` (see DEPLOY.md). Prefer committing the full lock later via GitHub UI, authenticated `gh`, or a local git push for reproducible deploys.
