/**
 * Gespeicherte Sammlungen — **eine** Quelle der Wahrheit für Client (Persistenz-Wrapper) und
 * Server (SQLite-Store, Whitelist gegen Müll-Zeilen).
 */

export const STATE_COLLECTIONS = [
  "books",
  "characters",
  "world",
  "plot",
  "research",
  "ideas",
  "coverPresets",
  "notifications",
  "facts",
  "relations",
  "series",
  "meta",
] as const;

export type StateCollection = (typeof STATE_COLLECTIONS)[number];

const KNOWN = new Set<string>(STATE_COLLECTIONS);

export function isStateCollection(value: string): value is StateCollection {
  return KNOWN.has(value);
}
