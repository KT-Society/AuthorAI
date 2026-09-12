#!/usr/bin/env bun
/**
 * Versionsupdate an **einer** Stelle steuern: `bun run version:bump <version>`
 *
 *   bun run version:bump 0.4.1            # Zielversion setzen
 *   bun run version:bump patch            # major | minor | patch aus der aktuellen Version
 *   bun run version:bump 0.4.1 --dry-run  # nur zeigen, nichts schreiben
 *   bun run version:bump 0.4.1 --force    # auch rückwärts (Downgrade)
 *
 * Warum ein Skript: Die Version steht an **sechs** Stellen (siehe docs/release.md).
 * Wird eine vergessen, driften README, Installer und App auseinander. Das Skript schreibt
 * alle Stellen, prüft danach nach und bricht ab, wenn ein Muster nicht mehr passt.
 *
 * Bewusst NICHT angefasst: `META_VERSION` (data/author.ts) und `BACKUP_VERSION`
 * (lib/backup.ts) — das sind **Datenformat-Versionen**, keine App-Versionen.
 *
 * Exit-Code 1 bei Fehlern.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

/** Muss mit dem Platzhalter in docs/changelog.md übereinstimmen. */
const CHANGELOG_PLACEHOLDER =
  "_Nichts offen — nächste Themen siehe [`roadmap.md`](roadmap.md)._";

interface Target {
  /** Anzeigepfad relativ zum Repo. */
  file: string;
  /** Beschreibung, was gesetzt wird. */
  what: string;
  /** Ersetzt den Inhalt; liefert null, wenn das Muster nicht passt. */
  apply: (content: string, version: string) => string | null;
}

const TARGETS: Target[] = [
  {
    file: "package.json",
    what: "version",
    apply: (content, version) => substitute(content, /("version"\s*:\s*")[^"]+(")/, `$1${version}$2`),
  },
  {
    file: "packages/promptgen/package.json",
    what: "version",
    apply: (content, version) => substitute(content, /("version"\s*:\s*")[^"]+(")/, `$1${version}$2`),
  },
  {
    file: "installer/authorai.iss",
    what: "MyAppVersion",
    apply: (content, version) =>
      substitute(content, /(#define\s+MyAppVersion\s+")[^"]+(")/, `$1${version}$2`),
  },
  {
    file: "installer/authorai.nsi",
    what: "APP_VERSION",
    apply: (content, version) =>
      substitute(content, /(!define\s+APP_VERSION\s+")[^"]+(")/, `$1${version}$2`),
  },
  {
    file: "installer/authorai.nsi",
    what: "VIProductVersion",
    apply: (content, version) =>
      substitute(
        content,
        /(VIProductVersion\s+")[^"]+(")/,
        `$1${version}.0$2`,
      ),
  },
  {
    file: "README.md",
    what: "Versionszeile",
    apply: (content, version) =>
      substitute(content, /(\*\*Version:\*\*\s*)[^\s·]+/, `$1${version}`),
  },
  {
    file: "docs/README.md",
    what: "Versionszeile",
    apply: (content, version) =>
      substitute(content, /(\*\*Version:\*\*\s*)[^\s·]+/, `$1${version}`),
  },
];

function substitute(content: string, pattern: RegExp, replacement: string): string | null {
  if (!pattern.test(content)) return null;
  return content.replace(pattern, replacement);
}

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function currentVersion(): string {
  const pkg = JSON.parse(read("package.json")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

function isValidVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value);
}

/** `patch` → nächste Version aus der aktuellen ableiten. */
function resolveTarget(input: string, current: string): string {
  if (isValidVersion(input)) return input;
  if (input !== "major" && input !== "minor" && input !== "patch") {
    throw new Error(`Ungültige Version „${input}". Erwartet: x.y.z oder major|minor|patch.`);
  }
  const [major = 0, minor = 0, patch = 0] = current.split(".").map((part) => Number(part) || 0);
  if (input === "major") return `${major + 1}.0.0`;
  if (input === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function compare(a: string, b: string): number {
  const [a1 = 0, a2 = 0, a3 = 0] = a.split(".").map(Number);
  const [b1 = 0, b2 = 0, b3 = 0] = b.split(".").map(Number);
  return a1 - b1 || a2 - b2 || a3 - b3;
}

function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Changelog: `[Unreleased]` wird zur Release-Version, oben entsteht ein frischer Platzhalter.
 * Enthält `[Unreleased]` nur den Platzhalter, passiert **nichts** (kein leerer Release).
 */
function updateChangelog(content: string, version: string): { next: string; changed: boolean } {
  const heading = "## [Unreleased]";
  const start = content.indexOf(heading);
  if (start === -1) return { next: content, changed: false };

  const rest = content.slice(start + heading.length);
  const nextSection = rest.indexOf("\n## [");
  const body = nextSection === -1 ? rest : rest.slice(0, nextSection);
  // „Leer" heißt: nur Platzhalter, Trennlinien und Leerraum — nichts zu veröffentlichen.
  const meaningful = body
    .replace(CHANGELOG_PLACEHOLDER, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^-{3,}$/.test(line));
  if (meaningful.length === 0) return { next: content, changed: false };

  const block = `${heading}\n\n${CHANGELOG_PLACEHOLDER}\n\n---\n\n## [${version}] — ${today()}\n${body.replace(/^\n+/, "")}`;
  const tail = nextSection === -1 ? "" : rest.slice(nextSection).replace(/^\n/, "");
  return { next: `${content.slice(0, start)}${block}${tail ? `\n${tail}` : ""}`, changed: true };
}

/* ─────────────────────────────── CLI ─────────────────────────────── */

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positional = args.filter((arg) => !arg.startsWith("--"));
const dryRun = flags.has("--dry-run");
const force = flags.has("--force");

if (flags.has("--help") || positional.length === 0) {
  console.log(`AuthorAI · Versionsupdate

  bun run version:bump <x.y.z>        Zielversion setzen
  bun run version:bump patch|minor|major
  Optionen:
    --dry-run   nur anzeigen, nichts schreiben
    --force     auch rückwärts (Downgrade)

  Stellen: package.json · packages/promptgen/package.json · installer/authorai.iss ·
           installer/authorai.nsi (2×) · README.md · docs/README.md · docs/changelog.md`);
  // Explizite Hilfe ist kein Fehler, ein Aufruf ohne Argumente schon.
  process.exit(flags.has("--help") ? 0 : 1);
}

const current = currentVersion();
let target: string;
try {
  target = resolveTarget(positional[0] ?? "", current);
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : "Unbekannter Fehler."}`);
  process.exit(1);
}

if (target === current) {
  console.log(`· Version ist bereits ${current} — nichts zu tun.`);
  process.exit(0);
}

const direction = compare(target, current);
if (direction < 0 && !force) {
  console.error(
    `✗ ${target} liegt vor ${current} (Downgrade). Mit --force erzwingen.\n` +
      `  (Datenformat-Versionen META_VERSION/BACKUP_VERSION werden bewusst nicht angefasst.)`,
  );
  process.exit(1);
}

console.log(
  `${dryRun ? "Dry-Run" : "Setze"} Version: ${current} → ${target}${direction < 0 ? " (Downgrade)" : ""}\n`,
);

const writes: { file: string; what: string; content: string }[] = [];
const problems: string[] = [];

// Mehrfach-Ziele pro Datei zusammenführen (z. B. authorai.nsi: zwei Defines).
const byFile = new Map<string, Target[]>();
for (const entry of TARGETS) {
  byFile.set(entry.file, [...(byFile.get(entry.file) ?? []), entry]);
}

for (const [file, entries] of byFile) {
  let content = read(file);
  const done: string[] = [];
  for (const entry of entries) {
    const next = entry.apply(content, target);
    if (next === null) {
      problems.push(`${file}: Muster für „${entry.what}" nicht gefunden`);
      continue;
    }
    content = next;
    done.push(entry.what);
  }
  if (done.length > 0) {
    writes.push({ file, what: done.join(" + "), content });
    console.log(`  ✓ ${file} — ${done.join(", ")}`);
  }
}

// Changelog zuletzt (eigene Logik).
const changelog = updateChangelog(read("docs/changelog.md"), target);
if (changelog.changed) {
  writes.push({ file: "docs/changelog.md", what: "Release-Abschnitt", content: changelog.next });
  console.log(`  ✓ docs/changelog.md — [Unreleased] → [${target}] — ${today()}`);
} else {
  console.log(
    `  · docs/changelog.md — unverändert (unter [Unreleased] steht noch nichts zu veröffentlichen)`,
  );
}

if (problems.length > 0) {
  console.error(`\n✗ Abgebrochen, nichts geschrieben:`);
  for (const problem of problems) console.error(`   ${problem}`);
  console.error(`   Bitte die betroffene Datei prüfen (Muster in scripts/version.ts anpassen).`);
  process.exit(1);
}

if (dryRun) {
  console.log(`\n· Dry-Run: ${writes.length} Datei(en) würden geschrieben.`);
  process.exit(0);
}

for (const write of writes) {
  fs.writeFileSync(path.join(ROOT, write.file), write.content, "utf8");
}

// Nachprüfung: steht die Zielversion wirklich überall?
const stale: string[] = [];
for (const [file, entries] of byFile) {
  const content = read(file);
  for (const entry of entries) {
    if (entry.apply(content, target) !== null && !content.includes(target)) {
      stale.push(`${file} (${entry.what})`);
    }
  }
}
for (const file of ["README.md", "docs/README.md"]) {
  if (!read(file).includes(target)) stale.push(file);
}
if (stale.length > 0) {
  console.error(`\n✗ Nachprüfung fehlgeschlagen: ${stale.join(", ")}`);
  process.exit(1);
}

const installed = currentVersion();
if (installed !== target) {
  console.error(`\n✗ package.json meldet ${installed}, erwartet ${target}.`);
  process.exit(1);
}

console.log(`\n✓ Version ${target} gesetzt (${writes.length} Datei(en)).`);
console.log(`  Erinnerung: META_VERSION und BACKUP_VERSION sind Datenformate — nicht bumpen.`);
console.log(`  Release:    pwsh -File scripts/release.ps1 -Sign -Installer`);
