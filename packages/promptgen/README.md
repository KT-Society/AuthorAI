# canon-slug-generator

Bun + React + TypeScript + Tailwind v4 + MUI single-page app for generating structured character prompts.

## Commands

- `bun install` – install dependencies
- `bun run dev` – start the Bun dev server (HMR)
- `bun run build` – bundle to `dist/` with `Bun.build`
- `bun run start` – serve the production bundle

## Notes

- Native Bun toolchain: `Bun.serve` for dev/prod and `Bun.build` + `bun-plugin-tailwind` for bundling.
- `src/` is the only source directory.
- Part of the root Bun workspace. Install from the repo root (`bun install`) so root and this package share one lockfile.
- Dev server listens on port `3001` by default (override with `PORT`) so it can run alongside the root app on `3000`.

## Developers

**KT-Society & Echo** — MIT licensed (see [`LICENSE`](LICENSE)).
