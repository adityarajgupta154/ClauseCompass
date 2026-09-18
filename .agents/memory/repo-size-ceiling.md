---
name: Repo payload ceiling
description: Why check:size sits at 5 MiB, why README screenshots are written at 1000 px / q72, and why the journey GIF cannot be shrunk by re-encoding.
---
The repo payload check (`pnpm check:size`, last step of the CI preflight job) is a self-imposed ceiling under the hackathon's 10 MB cap. It moved 2 → 3 MiB (source alone) and 3 → 5 MiB on 18 Sep 2026 after the README screenshots; the user chose "compress first, then raise only as much as needed".

**Why:** the screenshot set at 1280 px / quality 82 weighed 1.06 MB; at 1000 px (never enlarged, `-resize 1000x>`) / quality 72 it is 0.61 MB and still legible, since the README shows nothing wider than 900 px. The journey GIF (461 KB) does not get smaller by re-encoding from its own frames: they are already bayer-dithered, so re-quantising at a smaller width or fewer colours comes out *larger*; only a regeneration from clean PNG frames (the screenshot script, live model) can shrink it.

**How to apply:** a red X on a commit whose build, lint and tests are green is this step, read the "Repo payload" line in the job log before anything else. Keep the screenshot script's WebP settings and the ceiling's history comment in step; do not "fix" the GIF by re-encoding.
