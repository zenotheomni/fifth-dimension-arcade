# Fifth Floor Arcade — Quality Bar

**Standing rule for every arcade game.** Ship to this bar on the first playable build. Thin prototypes and “we’ll build it up later” are not deliverables to Jenks.

Reference games: **Fifth Glide** and **Court Vision**. If a new game doesn’t feel like those, it isn’t ready.

## Full-screen presence

- Hero objects **fill the frame**. Ball, pins, runner, hoop — big and readable, not tiny toys in a void.
- Composition like Court Vision: ball owns the bottom of the screen; the target (hoop / pin deck / goal) owns depth and still reads large.
- Like Fifth Glide: the runner and path fill the view; the world feels close and playable.

## Scale

- Prefer **near-camera / big props**. No long-distance miniature alleys or courts.
- Far targets stay substantial (readable materials, clear silhouette). If you need to zoom out to “see the whole lane,” the camera is wrong.

## Materials & vibe

- Surfaces should feel **physical under neon** (wood, resin, paint, metal) — not abstract neon-only geometry.
- **Nostalgic classic arcade** energy (Sega / N64 era Jenks likes): fun, bold, legit — cyberpunk Fifth Floor neon on real-looking stuff.
- Dense enough to feel like a venue, not a sparse dark void with a thin play strip.

## Controls

- **Phone-first, one-motion**: flick / swipe. Never fight the UI.
- Instructions stay short; the feel teaches the game.

## Ship gate

Before PR / before showing Jenks:

1. Does it fill the screen like Glide or Court Vision?
2. Are materials and scale legible on a phone in one glance?
3. Is one-motion control obvious and fair?

If any answer is no, rebuild — don’t ship a thin draft and “iterate toward” the bar.
