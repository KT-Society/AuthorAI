/**
 * Robustes Extrahieren von Prosa aus LLM-Rohausgaben.
 *
 * Die Pipeline fordert das Format `<TEXT>…</TEXT>` + `<NOTES>…</NOTES>` an, aber
 * Modelle halten sich nicht immer daran. Zwei Regeln sind hier entscheidend:
 *
 * 1. Ein geschlossener `<TEXT>`-Block hat IMMER Vorrang. Alles außerhalb
 *    (Notes, Kommentare, Nachplappern) darf die Prosa nicht beschädigen.
 * 2. Heuristisches Abschneiden an einem Notes-Marker passiert nur, wenn es
 *    keinen geschlossenen Textblock gibt — sonst wird bei einem `<NOTES>`
 *    mitten im Text echter Prosatext gelöscht.
 *
 * Gilt für Server (Ablage) und Client (Anzeige/Export) — daher in `lib/`.
 */

const TEXT_TAG = /<\/?text>/gi;
const NOTES_TAG = /<\/?notes>/gi;

/** Entfernt alle Pipeline-Marker aus einem bereits isolierten Prosa-Block. */
function stripMarkers(text: string): string {
  return text.replace(TEXT_TAG, "").replace(NOTES_TAG, "").trim();
}

/** Entfernt Notes-Inhalte (nicht die Prosa) — auch wenn sie im Textblock stehen. */
function dropNotes(text: string): string {
  return text
    .replace(/<notes>[\s\S]*?<\/notes>/gi, "")
    .replace(/\n\s*<notes>[\s\S]*$/i, "")
    .replace(/\n\s*NOTES:\s*[\s\S]*$/i, "");
}

export function extractProse(raw: string): string {
  if (!raw) return "";

  // 1. Bevorzugt: vollständiger <TEXT>-Block (Notes darin werden verworfen).
  const closed = raw.match(/<text>([\s\S]*?)<\/text>/i);
  if (closed?.[1] !== undefined) return stripMarkers(dropNotes(closed[1]));

  // 2. Sonst: Text beginnt hinter einem öffnenden <TEXT>.
  let text = raw;
  const open = text.search(/<text>/i);
  if (open !== -1) text = text.slice(open + 6);

  return stripMarkers(dropNotes(text));
}

/** Endet der Text auf einem Satzzeichen (statt mitten im Satz/Wort)? */
const SENTENCE_END = /[.!?…]["'»”‘’)\]}]*$/;

export function looksTruncated(text: string): boolean {
  const trimmed = text.trim().replace(/[*_`]+$/, "").trim();
  if (!trimmed) return false;
  return !SENTENCE_END.test(trimmed);
}
