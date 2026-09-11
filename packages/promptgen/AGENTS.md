# AGENTS.md

## Commands

- `bun run dev` – start the Bun dev server with HMR
- `bun run build` – bundle the SPA with `Bun.build` into `dist/`
- `bun run start` – serve the production bundle

## Notes

- Single-package Bun + React + TS + Tailwind v4 + MUI SPA.
- Entry points: `src/index.ts` (Bun server + `/api/*` routes) and `src/frontend.tsx` (React root), wired together by `src/index.html`.
- API keys are read server-side from the repository root `.env` (`D:\workplace\AuthorAI\.env`) via `src/server/env.ts` and are never exposed to the browser. Supported vars: `TAVILY_API_KEY`, `OPENROUTER_API_KEY`.
- `src/server/` holds server-only modules; it must never be imported by client code.
- The model is a free-form OpenRouter model ID entered in a plain text field by the user — no hardcoded model list, no dropdown, no server-side model default.
- Output languages are configurable via `PROMPTGEN_LANGUAGES` / `PROMPTGEN_DEFAULT_LANGUAGE`.
- Tailwind runs through `bun-plugin-tailwind` (wired in `bunfig.toml` and `build.ts`); design tokens live in `src/index.css` under `@theme`.
- `src/` is the only source directory (see `tsconfig.json`).
- Bun is the package manager: run `bun install`, not `npm install`.
- Part of the root Bun workspace: install from the repo root. The dev/prod server binds port `3001` by default (override with `PORT`) to avoid clashing with the root app on `3000`.
- Maintainers: KT-Society & Echo.
