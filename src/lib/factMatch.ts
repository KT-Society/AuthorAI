/**
 * Dublettenschutz für **Kanon-Einträge** (Fakten und Beziehungen).
 *
 * Dieselbe Aussage wird bei wiederholter Ableitung gern leicht anders formuliert:
 * „Elias Thorne verlor alles durch das Imperium" ↔ „Durch das Imperium verlor Elias Thorne
 * alles". Ein exakter Textvergleich greift zu kurz — deshalb derselbe Token-Abgleich wie bei
 * Weltenbau und Figuren, nur auf die **Aussage** statt auf einen Namen.
 */

import type { CanonFact, CharacterRelation } from "@/data/continuity";

import { containedIn, highOverlap, normalizeName, tokenOverlap } from "./nameMatch";

/** Füllwörter, die Aussagen künstlich ähnlich machen (normalisierte Form). */
const STOP_WORDS = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "eines",
  "the", "a", "an", "und", "oder", "sowie", "aber", "als", "wie", "ist", "sind", "war",
  "waren", "wird", "werden", "hat", "haben", "durch", "von", "vom", "zu", "zum", "zur",
  "in", "im", "an", "am", "auf", "mit", "fuer", "für", "bei", "aus", "nach", "ueber", "über",
  "sein", "seine", "seinen", "seiner", "ihre", "ihrer", "ihren", "was", "dass",
]);

const normalizeCache = new Map<string, string>();

/** Aussage normalisieren (Kleinschreibung, Akzente, Satzzeichen, Füllwörter raus). */
export function normalizeStatement(statement: string): string {
  const cached = normalizeCache.get(statement);
  if (cached !== undefined) return cached;

  const normalized = normalizeName(statement, STOP_WORDS);

  if (normalizeCache.size > 2000) normalizeCache.clear();
  normalizeCache.set(statement, normalized);
  return normalized;
}

/**
 * Beschreiben zwei Aussagen (wahrscheinlich) denselben Fakt?
 * - exakt nach Normalisierung
 * - hohe Wort-Überlappung (Jaccard ≥ 0,7) — bei Aussagen strenger als bei Namen
 * - eine Aussage enthält die andere (≥ 4 gemeinsame Wörter)
 */
export function statementsMatch(a: string, b: string): boolean {
  const na = normalizeStatement(a);
  const nb = normalizeStatement(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const overlap = tokenOverlap(na, nb);
  if (overlap.shared === 0) return false;
  if (highOverlap(overlap, 0.7)) return true;

  // „verlor alles durch das Imperium" steckt in „Elias verlor alles durch das Imperium" —
  // erst ab vier gemeinsamen Wörtern, sonst gilt jede kurze Aussage als enthalten.
  return overlap.shared >= 4 && containedIn(overlap, 0.85);
}

/** Gleiche Beziehung? (Richtung + Typ entscheiden, die Formulierung nicht.) */
export function relationsMatch(a: CharacterRelation, b: CharacterRelation): boolean {
  return a.fromId === b.fromId && a.toId === b.toId && a.kind === b.kind;
}

/** Sucht den vorhandenen Fakt, der die Aussage schon abdeckt. */
export function findDuplicateFact(
  candidate: { statement: string; entityId?: string },
  existing: CanonFact[],
): CanonFact | undefined {
  return existing.find((fact) => {
    // Dieselbe Aussage bei **derselben** Entität (oder ohne Entitätsbezug) zählt als Dublette.
    if (candidate.entityId && fact.entityId && fact.entityId !== candidate.entityId) return false;
    return statementsMatch(fact.statement, candidate.statement);
  });
}

/** Sucht die vorhandene Beziehung, die der Kandidatin entspricht. */
export function findDuplicateRelation(
  candidate: CharacterRelation,
  existing: CharacterRelation[],
): CharacterRelation | undefined {
  return existing.find((relation) => relationsMatch(relation, candidate));
}

/** Zerlegt Fakten in Unikate und Dubletten (der erste Treffer bleibt). */
export function dedupeFacts(facts: CanonFact[]): { kept: CanonFact[]; removed: CanonFact[] } {
  const kept: CanonFact[] = [];
  const removed: CanonFact[] = [];
  for (const fact of facts) {
    if (findDuplicateFact(fact, kept)) removed.push(fact);
    else kept.push(fact);
  }
  return { kept, removed };
}

/** Zerlegt Beziehungen in Unikate und Dubletten (der erste Treffer bleibt). */
export function dedupeRelations(relations: CharacterRelation[]): {
  kept: CharacterRelation[];
  removed: CharacterRelation[];
} {
  const kept: CharacterRelation[] = [];
  const removed: CharacterRelation[] = [];
  for (const relation of relations) {
    if (findDuplicateRelation(relation, kept)) removed.push(relation);
    else kept.push(relation);
  }
  return { kept, removed };
}
