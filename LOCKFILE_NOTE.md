# package-lock follow-up

Remote `package-lock.json` on this branch is the **stub** (root packages only). The full lock (~104KB; ~80KB minified; 232 package entries) exceeds MCP `push_files` / `create_or_update_file` payload limits on this path, so it could not be committed here.

Full lockfile lives on the builder box at `/workspace/fifth-dimension-arcade/package-lock.json` (lockfileVersion 3).

Vercel / CI can still build with `npm install` from `package.json` (see DEPLOY.md). Prefer committing the full lock later via GitHub UI, authenticated `gh`, or a local git push for reproducible deploys.
