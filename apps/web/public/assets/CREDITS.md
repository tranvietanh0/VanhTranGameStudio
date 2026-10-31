# Asset credits

All 3D assets shipped in this folder are public domain (CC0 1.0). Attribution is not required;
we credit the authors anyway.

| File | Source pack | Author | License | Source URL |
|---|---|---|---|---|
| `office-kit.glb` | Furniture Kit 2.0 | Kenney (www.kenney.nl) | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `characters.glb` | Mini Characters 1.0 | Kenney (www.kenney.nl) | CC0 1.0 | https://kenney.nl/assets/mini-characters |

License check (2026-10-31): both asset pages list "License: Creative Commons CC0", and the
`License.txt` inside each downloaded zip reads "License: (Creative Commons Zero, CC0)
http://creativecommons.org/publicdomain/zero/1.0/". CC0 deed:
https://creativecommons.org/publicdomain/zero/1.0/

## What was taken

- **Furniture Kit**: 36 models (desk, corner desk, office chair, monitor, keyboard, laptop, lamps,
  plants, sofas, lounge chairs, tables, rugs, bookcases, kitchen bits, coat rack, bin...). Materials
  are flat colours; the app re-tints them by material name (`src/scene/palette.ts`, `KIT_COLORS`).
- **Mini Characters**: 9 of the 12 characters (`male-a/b/d/e/f`, `female-b/c/d/f`) sharing one
  512 px colour atlas, plus one copy of the `idle`, `walk`, `sit`, `holding-both`,
  `interact-right` and `emote-yes` clips. Typing, seated-idle and waving are procedural clips on
  the same rig (`src/scene/crowd/rig.ts`).

## How the files were built

`apps/web/scripts/build-assets.ts` (dev-time only, uses `@gltf-transform/*` and `meshoptimizer`
from a scratch directory; they are not app dependencies). It merges the chosen models into one
GLB per pack (one root node per model, named by its key), drops unused clips and vertex
attributes (tangents, second UV set), then runs dedup, prune, weld and meshopt compression with
quantization. The app decodes meshopt with drei's `useGLTF` (no Draco, no CDN).
