/**
 * Laufzeit-Pfade.
 *
 * In der Entwicklung liegt das Arbeitsverzeichnis im Repo-Root. In einem
 * kompilierten Standalone-Binary (`bun build --compile`) gibt es kein Repo mehr —
 * Daten müssen dann neben dem Binary liegen.
 */

import path from "node:path";

/**
 * Verzeichnis für laufzeit-erzeugte Daten (z. B. `covers/`).
 *
 * - Entwicklung (`bun …`): das aktuelle Arbeitsverzeichnis.
 * - Standalone-Binary: das Verzeichnis, in dem das Binary liegt.
 */
export function runtimeRoot(): string {
  const execName = path.basename(process.execPath).toLowerCase();
  const runsUnderBun = execName.startsWith("bun");
  return runsUnderBun ? process.cwd() : path.dirname(process.execPath);
}

/** Standard-Port: Root-App 3000 (überschreibbar per `PORT`). */
export function runtimePort(fallback = 3000): number {
  const parsed = Number.parseInt(process.env.PORT ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** True, wenn wir als kompiliertes Standalone-Binary laufen (nicht unter `bun`). */
export function isStandaloneBinary(): boolean {
  return !path.basename(process.execPath).toLowerCase().startsWith("bun");
}
