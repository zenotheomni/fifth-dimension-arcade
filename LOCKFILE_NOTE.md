# package-lock

There is **no** `package-lock.json` on `main` right now.

A stub lock was briefly committed and **broke** `npm install` (`Cannot create property 'name' on boolean 'true'`). It was removed so Vercel / local installs can resolve from `package.json` alone.

To add a full lock later (lockfileVersion 3, ~100KB):
- Push from a local clone with authenticated git, or
- Drop the file via GitHub UI

The MCP `push_files` / `create_or_update_file` path cannot carry a file that large.

Vercel: Install command `npm install` (see DEPLOY.md).
