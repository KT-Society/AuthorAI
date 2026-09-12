/**
 * Dublettenschutz für Figuren.
 *
 * Die Manuskript-Extraktion liefert Figuren so, wie sie im Text heißen — das Register kennt sie
 * oft schon unter anderem Namen: **„Prinzessin Lysara"** vs. **„Lysara"**, „König Theron" vs.
 * „Theron". Deshalb werden Anreden, Ränge und Artikel vor dem Vergleich entfernt; danach gelten
 * dieselben Regeln wie beim Weltenbau (normalisierter Vergleich + Token-Überlappung).
 */

import type { Character } from "@/data/characters";

import { containedIn, highOverlap, normalizeName, tokenOverlap } from "./nameMatch";

/**
 * Füllwörter in **normalisierter** Form (Kleinschreibung, Akzente entfernt):
 * „König" → `konig`, „Gräfin" → `grafin`, „Kapitän" → `kapitan`.
 */
const TITLES = new Set([
  // Artikel/Pronomen
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "eines",
  "the", "a", "an", "le", "la", "les",
  // Adel
  "prinz", "prinzessin", "konig", "konigin", "kaiser", "kaiserin", "erzherzog", "erzherzogin",
  "herzog", "herzogin", "graf", "grafin", "freiherr", "baron", "baronin", "furst", "furstin",
  "zar", "zarin", "sultan", "sultanin", "emir", "scheich", "wesir", "lady", "lord", "sir",
  "ser", "dame", "madam", "mister", "mrs", "ms",
  // Militär
  "general", "generalin", "oberst", "oberstin", "major", "majorin", "kapitan", "kapitanin",
  "leutnant", "fahnrich", "feldwebel", "kommandant", "kommandantin", "admiral", "admiralin",
  "hauptmann", "rittmeister", "wachtmeister",
  // Geistlich
  "pater", "pfarrer", "pfarrerin", "bruder", "schwester", "abt", "abtin", "bischof",
  "kardinal", "pastor", "imam", "rabbi", "monch", "nonne", "diakon",
  // Gelehrsamkeit / Amt
  "meister", "meisterin", "magister", "doktor", "dr", "professor", "professorin", "konsul",
  "senator", "senatorin", "prasident", "prasidentin", "kanzler", "kanzlerin", "minister",
  "ministerin", "richter", "richterin", "burggraf", "vogt", "amtmann",
]);

/** Cache: dieselben Namen werden bei Dublettenprüfungen hundertfach normalisiert. */
const normalizeCache = new Map<string, string>();

/** Kleinbuchstaben, Akzente/Umlaute entfernt, Anreden/Ränge/Artikel und Sonderzeichen raus. */
export function normalizeCharacterName(name: string): string {
  const cached = normalizeCache.get(name);
  if (cached !== undefined) return cached;

  const normalized = normalizeName(name, TITLES);

  if (normalizeCache.size > 4000) normalizeCache.clear();
  normalizeCache.set(name, normalized);
  return normalized;
}

/**
 * Wahrscheinlich dieselbe Figur?
 * - exakt nach Normalisierung („Prinzessin Lysara" = „Lysara")
 * - hohe Token-Überlappung (Jaccard ≥ 0,6)
 * - einer enthält den anderen (ab 2 Tokens) — **oder** ein einzelnes, aussagekräftiges Token
 *   (≥ 4 Zeichen): „Lysara" ↔ „Lysara Thorne". Kurze Einzeltoken („Ja", „Bo") bleiben außen vor.
 */
export function characterNamesMatch(a: string, b: string): boolean {
  const na = normalizeCharacterName(a);
  const nb = normalizeCharacterName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const overlap = tokenOverlap(na, nb);
  if (overlap.shared === 0) return false;
  if (highOverlap(overlap)) return true;
  if (!containedIn(overlap)) return false;
  if (overlap.smaller >= 2) return true;

  // Einzelnes Token: nur wenn es lang genug ist, um unterscheidend zu sein.
  const single = na.length <= nb.length ? na : nb;
  return single.length >= 4;
}

/**
 * Sucht die vorhandene Figur, die dem Kandidaten entspricht — **nur im selben Projekt**
 * (gleiche `bookId`), damit Figuren aus anderen Büchern nicht vermischt werden.
 */
export function findMatchingCharacter(
  candidate: { name: string; bookId?: string },
  existing: Character[],
): Character | undefined {
  const scope = existing.filter((entry) => (entry.bookId ?? "") === (candidate.bookId ?? ""));
  return scope.find((entry) => characterNamesMatch(entry.name, candidate.name));
}

export interface CharacterDedupeResult<T> {
  kept: T[];
  removed: T[];
}

/**
 * Zerlegt eine Figurenliste in Unikate und Dubletten (der **erste** Treffer bleibt).
 * Sortierstabile Reihenfolge: der erste Eintrag der Liste gilt als der etablierte.
 */
export function dedupeCharacters(characters: Character[]): CharacterDedupeResult<Character> {
  const kept: Character[] = [];
  const removed: Character[] = [];
  for (const character of characters) {
    if (findMatchingCharacter(character, kept)) removed.push(character);
    else kept.push(character);
  }
  return { kept, removed };
}
