#!/usr/bin/env bun
/**
 * Standalone-Binary: Server **und** UI in einer ausführbaren Datei.
 *
 *   bun run build:binary        →  dist/authorai  (bzw. dist\authorai.exe)
 *
 * Das Binary liest Keys aus einer `.env` neben dem Binary (oder aus
 * Umgebungsvariablen) und legt Cover in `covers/` beim Binary ab.
 */

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import tailwind from "bun-plugin-tailwind";

const outDir = path.join(process.cwd(), "dist");
const outfile = path.join(outDir, process.platform === "win32" ? "authorai.exe" : "authorai");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  plugins: [tailwind],
  compile: { outfile },
  minify: true,
  target: "bun",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`✓ Standalone-Binary: ${path.relative(process.cwd(), outfile)}`);
