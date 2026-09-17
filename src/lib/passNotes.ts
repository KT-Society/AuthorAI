/**
 * Sanitizing für Pass-Notizen (Kohärenz/Stil).
 *
 * Kleine Modelle notieren gern „Änderungen", bei denen beide Seiten identisch sind:
 *   • "ein Schlund, der die Realität zu zerfressen schien" wurde zu
 *     "ein Schlund, der die Realität zu zerfressen schien" zur Verbesserung des Rhythmus.
 * Solche Zeilen dokumentieren nichts und verstopfen den Prüfbericht — sie fliegen raus.
 * Wird im Server (Pass-Ergebnis) verwendet und ist dort auch getestet.
 */

// Nur doppelte Anführungszeichen als Delimiter — Apostrophe („Valerius' Verrat")
// bleiben Teil des Zitats, sonst würden unterschiedliche Zitate gleich aussehen.
const QUOTE_CHARS = "\"„“”«»‹›";
const QUOTED_RE = new RegExp(`[${QUOTE_CHARS}]([^${QUOTE_CHARS}]+)[${QUOTE_CHARS}]`, "g");

/** Markiert eine Vorher/Nachher-Aussage. */
const CHANGE_MARKERS = [
  "wurde zu",
  "wird zu",
  "wurde durch",
  "wurde in",
  "ersetzt durch",
  "geändert zu",
  "umformuliert zu",
  "angepasst zu",
  "verkürzt zu",
  "verändert zu",
  "→",
  "->",
  "replaced with",
  "changed to",
  "instead of",
];

/** Vergleichsform: Kleinschreibung, Anführungszeichen/Satzzeichen egal, Leerraum normalisiert. */
function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”„«»‹›‘’‚]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * True, wenn die Notiz eine Vorher/Nachher-Änderung behauptet, bei der beide
 * Seiten identisch sind (auch abgesehen von Satzzeichen/Leerraum).
 */
export function isNoOpNote(note: string): boolean {
  const spans = [...note.matchAll(QUOTED_RE)].map((match) => match[1]);
  if (spans.length < 2) return false;

  const lower = note.toLowerCase();
  if (!CHANGE_MARKERS.some((marker) => lower.includes(marker))) return false;

  // `noUncheckedIndexedAccess`: Die beiden Zitate werden ausdrücklich gelesen (fehlend = leer).
  const before = comparable(spans[0] ?? "");
  const after = comparable(spans[1] ?? "");
  return before.length > 0 && before === after;
}

/** Entfernt No-Op-Notizen und meldet, wie viele verworfen wurden. */
export function filterNoOpNotes(notes: string[]): { notes: string[]; dropped: number } {
  const kept = notes.filter((note) => !isNoOpNote(note));
  return { notes: kept, dropped: notes.length - kept.length };
}
