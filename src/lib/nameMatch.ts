/**
 * Gemeinsamer Kern der Dublettenprüfung für **Namen und Titel**.
 *
 * Weltenbau-Titel und Figuren-Namen brauchen dieselbe Rechnung, aber unterschiedliche
 * Füllwörter: bei Titeln sind es Artikel, bei Figuren zusätzlich Anreden und Ränge
 * („Prinzessin Lysara" = „Lysara"). Deshalb hier nur der Kern — die Füllwortlisten liegen in
 * `worldMatch.ts` bzw. `characterMatch.ts`.
 */

export interface TokenOverlap {
  /** Gemeinsame Tokens. */
  shared: number;
  /** Vereinigung beider Token-Mengen. */
  union: number;
  /** Größe der kleineren Menge. */
  smaller: number;
}

/** Kleinbuchstaben, Akzente/Umlaute entfernt, Füllwörter und Sonderzeichen raus. */
export function normalizeName(text: string, stops: Set<string>): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !stops.has(token))
    .join(" ")
    .trim();
}

export function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

export function tokenOverlap(normalizedA: string, normalizedB: string): TokenOverlap {
  const a = tokenSet(normalizedA);
  const b = tokenSet(normalizedB);
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return { shared, union: new Set([...a, ...b]).size, smaller: Math.min(a.size, b.size) };
}

/** Hohe Überlappung beider Mengen (Jaccard). */
export function highOverlap(overlap: TokenOverlap, threshold = 0.6): boolean {
  return overlap.union > 0 && overlap.shared / overlap.union >= threshold;
}

/** Enthält eine Menge die andere (Anteil `ratio` der kleineren). */
export function containedIn(overlap: TokenOverlap, ratio = 0.8): boolean {
  return overlap.smaller > 0 && overlap.shared / overlap.smaller >= ratio;
}
