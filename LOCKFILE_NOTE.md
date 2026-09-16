# package-lock

There is **no** `package-lock.json` on this branch (same as `main`).

A stub lock was briefly committed on `main` and **broke** `npm install` (`Cannot create property 'name' on boolean 'true'`). It was removed so Vercel / local installs can resolve from `package.json` alone.

The full lock (~104KB; ~80KB minified; lockfileVersion 3, 232 package entries) exceeds MCP `push_files` / `create_or_update_file` payload limits, so it could not be committed here either.

Full lock on the builder box: `/workspace/fifth-dimension-arcade/package-lock.json`.

To add a full lock later:
- Push from a local clone with authenticated git, or
- Drop the file via GitHub UI

Vercel: Install command `npm install` (see DEPLOY.md).
