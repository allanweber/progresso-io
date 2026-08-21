# Vendored fonts

Self-hosted webfonts used by `src/app/layout.tsx` via `next/font/local`.

They are **vendored on purpose**: `next/font/google` downloads the font files
from `fonts.gstatic.com` at build time, and that fetch intermittently 404s in CI
(GitHub Actions), which failed the E2E web server (it couldn't compile the root
layout). Vendoring removes the build-time network dependency entirely.

- `dm-sans-latin-wght-normal.woff2` — DM Sans (variable, weight axis), latin subset
- `space-grotesk-latin-wght-normal.woff2` — Space Grotesk (variable, weight axis), latin subset

Both are the `latin` variable (`wght`) files from the Fontsource packages
(`@fontsource-variable/dm-sans`, `@fontsource-variable/space-grotesk`), which
repackage the upstream SIL Open Font License fonts. To refresh:

```sh
pnpm add -D @fontsource-variable/dm-sans @fontsource-variable/space-grotesk
cp node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2 src/app/fonts/
cp node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2 src/app/fonts/
pnpm remove @fontsource-variable/dm-sans @fontsource-variable/space-grotesk
```
