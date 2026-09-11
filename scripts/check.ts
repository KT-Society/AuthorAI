#!/usr/bin/env bun
/**
 * Repo-Checks ohne Dependencies (auch in CI nutzbar): `bun run check`
 *
 *  1. Syntax  — Bun-Transpiler über src/ und packages/promptgen/src
 *  2. Imports — relative, @/* und @promptgen/* müssen existieren
 *  3. Links   — relative Markdown-Links (inkl. Bilder) müssen existieren
 *
 * Exit-Code 1 bei Fehlern.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

const ALIASES: { prefix: string; dir: string }[] = [
  { prefix: "@promptgen/", dir: path.join(ROOT, "packages/promptgen/src") },
  { prefix: "@/", dir: path.join(ROOT, "src") },
];

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".html"];
const SOURCE_DIRS = ["src", "packages/promptgen/src"];
const MARKDOWN_ROOTS = [
  "README.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "docs",
  "packages/promptgen/AGENTS.md",
  "packages/promptgen/README.md",
  "packages/promptgen/docs",
];

let failures = 0;
const fail = (message: string) => {
  failures += 1;
  console.log(`✗ ${message}`);
};

function walkFiles(entry: string, predicate: (file: string) => boolean, out: string[] = []): string[] {
  if (!fs.existsSync(entry)) return out;
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(entry)) {
      if (child === "node_modules" || child === "dist") continue;
      walkFiles(path.join(entry, child), predicate, out);
    }
    return out;
  }
  if (predicate(entry)) out.push(entry);
  return out;
}

/* ── 1. Syntax ─────────────────────────────────────────────────────────── */

const transpiler = new Bun.Transpiler({ loader: "tsx" });
let sourceCount = 0;

for (const dir of SOURCE_DIRS) {
  for (const file of walkFiles(path.join(ROOT, dir), (f) => /\.(ts|tsx)$/.test(f))) {
    sourceCount += 1;
    try {
      transpiler.transformSync(fs.readFileSync(file, "utf8"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(`Syntax: ${path.relative(ROOT, file)} — ${message.split("\n")[0]}`);
    }
  }
}

/* ── 2. Imports ────────────────────────────────────────────────────────── */

function tryResolve(base: string): boolean {
  for (const ext of ["", ...EXTS]) if (fs.existsSync(base + ext)) return true;
  for (const ext of EXTS) if (fs.existsSync(path.join(base, `index${ext}`))) return true;
  return false;
}

function resolveSpecifier(fromFile: string, spec: string): boolean {
  for (const alias of ALIASES) {
    if (spec.startsWith(alias.prefix)) {
      return tryResolve(path.join(alias.dir, spec.slice(alias.prefix.length)));
    }
  }
  if (spec.startsWith(".")) {
    return tryResolve(path.resolve(path.dirname(fromFile), spec));
  }
  return true; // externes Paket
}

const importRe = /(?:import|export)\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g;

for (const dir of SOURCE_DIRS) {
  for (const file of walkFiles(path.join(ROOT, dir), (f) => /\.(ts|tsx)$/.test(f))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(importRe)) {
      const spec = match[1];
      if (!spec) continue;
      if (!resolveSpecifier(file, spec)) {
        fail(`Import: ${path.relative(ROOT, file)} → ${spec}`);
      }
    }
  }
}

/* ── 3. Markdown-Links ─────────────────────────────────────────────────── */

let linkCount = 0;
const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;

for (const root of MARKDOWN_ROOTS) {
  for (const file of walkFiles(path.join(ROOT, root), (f) => f.endsWith(".md"))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(linkRe)) {
      const target = match[1];
      if (!target || /^https?:\/\//.test(target) || target.startsWith("#") || target.startsWith("mailto:")) {
        continue;
      }
      const clean = target.split("#")[0];
      if (!clean) continue;
      linkCount += 1;
      if (!fs.existsSync(path.resolve(path.dirname(file), clean))) {
        fail(`Link: ${path.relative(ROOT, file)} → ${target}`);
      }
    }
  }
}

/* ── Ergebnis ──────────────────────────────────────────────────────────── */

console.log(
  `checked ${sourceCount} source files, ${linkCount} links — ${failures === 0 ? "OK" : `${failures} problem(s)`}`,
);
process.exit(failures === 0 ? 0 : 1);
