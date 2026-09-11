#!/usr/bin/env bun
/**
 * Standalone-Release: Server **und** UI in einer ausführbaren Datei — plus Beigaben.
 *
 *   bun run build:binary
 *
 *   release/
 *   ├─ authorai(.exe)     Server + UI (eine Datei)
 *   ├─ LICENSE            MIT — muss bei Weitergabe dabei sein
 *   ├─ README.md
 *   └─ .env.example
 *
 * Bewusst NICHT in `dist/`, weil der Web-Build (`bun run build`) `dist/` leert.
 */

import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import tailwind from "bun-plugin-tailwind";

const root = process.cwd();
const outDir = path.join(root, "release");
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

const extras = ["LICENSE", "README.md", ".env.example"];
for (const file of extras) {
  try {
    await copyFile(path.join(root, file), path.join(outDir, file));
  } catch {
    console.warn(`· ${file} nicht gefunden — übersprungen`);
  }
}

console.log(`✓ Release bereit: ${path.relative(root, outDir)}`);
console.log(`  Enthält: ${path.basename(outfile)}, ${extras.join(", ")}`);
console.log("  Start: Binary ausführen, .env daneben legen, http://localhost:3000 öffnen");
