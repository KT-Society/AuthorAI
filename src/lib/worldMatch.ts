/**
 * Dublettenschutz für Welteneinträge.
 *
 * Mehrere Scans liefern dasselbe Konzept gern unter leicht anderem Namen
 * („Die Zerstörung der Welt" ↔ „Die Zerstörung der alten Welt"). Ein reiner
 * Titel-Vergleich greift zu kurz — deshalb normalisieren und vergleichen wir
 * über Tokens. Läuft im Client (Scan-Filter, Aufräumen) und im Server.
 */

export interface WorldTitleLike {
  title: string;
  category: string;
  bookId?: string;
}

/** Artikel/Füllwörter, die den Vergleich verzerren. */
const ARTICLES = new Set([
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einen",
  "einem",
  "eines",
  "the",
  "a",
  "an",
  "le",
  "la",
  "les",
  "el",
  "los",
  "las",
]);

/** Cache: dieselben Titel werden bei Dublettenprüfungen hundertfach normalisiert. */
const normalizeCache = new Map<string, string>();

/** Kleinbuchstaben, Akzente/Umlaute entfernt, Artikel und Sonderzeichen raus. */
export function normalizeWorldTitle(title: string): string {
  const cached = normalizeCache.get(title);
  if (cached !== undefined) return cached;

  const normalized = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !ARTICLES.has(token))
    .join(" ")
    .trim();

  if (normalizeCache.size > 4000) normalizeCache.clear();
  normalizeCache.set(title, normalized);
  return normalized;
}

function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

/**
 * Beschreiben zwei Titel (wahrscheinlich) dasselbe Konzept?
 * - exakt nach Normalisierung
 * - hohe Token-Überlappung (Jaccard ≥ 0,6): „Zerstörung Welt" ↔ „Zerstörung alte Welt"
 * - einer enthält den anderen vollständig (ab 2 Tokens)
 */
export function worldTitlesMatch(a: string, b: string): boolean {
  const na = normalizeWorldTitle(a);
  const nb = normalizeWorldTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = tokenSet(na);
  const tb = tokenSet(nb);
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  if (shared === 0) return false;

  const union = new Set([...ta, ...tb]).size;
  if (shared / union >= 0.6) return true;

  const smaller = Math.min(ta.size, tb.size);
  return smaller >= 2 && shared / smaller >= 0.8;
}

/**
 * Sucht den vorhandenen Eintrag, der dem Kandidaten entspricht.
 * Erst in derselben Kategorie, dann kategorieübergreifend (Konzepte wandern gern
 * zwischen „Lore" und „Fraktion"). Verglichen wird nur innerhalb desselben Projekts.
 */
export function findMatchingEntry<T extends WorldTitleLike>(
  candidate: WorldTitleLike,
  existing: T[],
): T | undefined {
  const scope = existing.filter((entry) => (entry.bookId ?? "") === (candidate.bookId ?? ""));
  const sameCategory = scope.find(
    (entry) =>
      entry.category === candidate.category && worldTitlesMatch(entry.title, candidate.title),
  );
  return sameCategory ?? scope.find((entry) => worldTitlesMatch(entry.title, candidate.title));
}

/** Zerlegt eine Liste in Unikate und Dubletten (der erste Treffer bleibt). */
export function dedupeWorldEntries<T extends WorldTitleLike>(
  entries: T[],
): { kept: T[]; removed: T[] } {
  const kept: T[] = [];
  const removed: T[] = [];
  for (const entry of entries) {
    if (findMatchingEntry(entry, kept)) removed.push(entry);
    else kept.push(entry);
  }
  return { kept, removed };
}
