/**
 * Schutz gegen **Satz-Wiederholungen**.
 *
 * Symptom: Nach einer Fortsetzung (Ausgabelimit) oder beim Zusammenbau der Pass-Teile steht an der
 * Naht derselbe Satz (oder ein Block von 1–3 Sätzen) zweimal — das Modell erzählt den Anschluss
 * noch einmal. Innerhalb einer Antwort wiederholt es gelegentlich auch direkt aufeinanderfolgende
 * Sätze.
 *
 * **Regel: nur wörtliche Doppelungen.** Verglichen wird normalisiert (Kleinschreibung, Satzzeichen
 * und Leerraum entfernt). Entfernt wird ausschließlich
 *   - ein Satz, der **unmittelbar** demselben Satz folgt (innerhalb eines Textes), oder
 *   - der Überlappungsblock an der **Naht** zweier Textstücke (größter Treffer gewinnt).
 *
 * Absichtlich **nicht** angetastet: kurze Sätze unter `MIN_SENTENCE_CHARS` (ein „Ja." darf zweimal
 * fallen), unmittelbar aufeinanderfolgende Sätze mit anderem Wortlaut (rhetorische Wiederholung)
 * und alles, was nicht wörtlich identisch ist. Es wird also nichts geglättet, was der Autor oder
 * das Modell bewusst so geschrieben hat — nur echte Doppelungen fallen weg.
 *
 * Alle Funktionen arbeiten mit **Zeichenbereichen** auf dem Original: Der zurückgegebene Text ist
 * bis auf die entfernten Bereiche zeichengleich (kein Neu-Zusammensetzen, keine Reformierung).
 */

/**
 * Sätze mit **weniger** Wörtern werden nie entfernt — kurze Ausrufe („Ja.", „Nein.", „Los.")
 * dürfen sich wiederholen, und rhetorische Kurzsätze sind Stilmittel. Gemessen wird in **Wörtern**,
 * nicht in Zeichen: „Die Menge schwieg." ist ein echter Satz und darf weg, „Ja." nicht.
 */
export const MIN_SENTENCE_WORDS = 3;

/** Höchstens so viele Sätze werden an einer Naht als Überlappung geprüft. */
const MAX_SEAM_SENTENCES = 3;

/** Ab dieser Länge wird auch eine Überlappung **mitten im Satz** abgeschnitten (Zeichen). */
const MIN_PARTIAL_OVERLAP_CHARS = 40;

/** So weit reicht der Blick zurück für die Teil-Überlappung (Zeichen). */
const PARTIAL_LOOKBACK_CHARS = 400;

interface Span {
  start: number;
  end: number;
  text: string;
}

/** Zerlegt den Text in Satz-Bereiche (Originalpositionen). Absatzumbrüche sind Trennstellen. */
function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  const boundary = /(?<=[.!?…]["“”'»)]?)\s+/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(text)) !== null) {
    const end = match.index;
    if (end > start) spans.push({ start, end, text: text.slice(start, end) });
    start = match.index + match[0].length;
  }
  if (start < text.length) {
    spans.push({ start, end: text.length, text: text.slice(start) });
  }
  return spans;
}

/** Normalform für den Vergleich: Kleinschreibung, ohne Satzzeichen/Anführungszeichen, ein Leerzeichen. */
export function normalizeSentence(value: string): string {
  return value
    .toLowerCase()
    .replace(/[„“”"'‚‘’«»›‹()\[\]{}<>]/g, " ")
    .replace(/[.!?,;:…—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Darf dieser Satz überhaupt als Doppelung entfernt werden? (Mindest-Wortzahl) */
function isRemovable(span: Span | undefined): span is Span {
  if (!span) return false;
  const words = normalizeSentence(span.text).split(" ").filter(Boolean).length;
  return words >= MIN_SENTENCE_WORDS;
}

/**
 * Überlappung **mitten im Satz**: Das Modell setzt manchmal mit den letzten Wörtern des Vorteils an
 * statt mit einem neuen Satz. Gesucht wird der längste gemeinsame Text zwischen dem Ende von
 * `previous` und dem Anfang von `next` — verlangt werden mindestens
 * `MIN_PARTIAL_OVERLAP_CHARS` Zeichen **und** Schnitte an Wortgrenzen, damit kurze Zufallstreffer
 * („und dann") nichts zerstören. 0 = keine brauchbare Überlappung.
 */
function partialOverlapLength(previous: string, next: string): number {
  const window = previous.slice(-PARTIAL_LOOKBACK_CHARS);
  const max = Math.min(window.length, next.length);
  for (let size = max; size >= MIN_PARTIAL_OVERLAP_CHARS; size -= 1) {
    const candidate = window.slice(window.length - size);
    if (!next.startsWith(candidate)) continue;
    const before = window[window.length - size - 1];
    const after = next[size];
    const startsAtBoundary = before === undefined || /[\s„“"'(»\-–—]/.test(before);
    const endsAtBoundary = after === undefined || /[\s.,;:!?…„“"')»\-–—]/.test(after);
    if (startsAtBoundary && endsAtBoundary) return size;
  }
  return 0;
}

/** Baut den Text neu, ohne die markierten Bereiche (samt ihres Trenners) — alles andere bleibt gleich. */
function withoutSpans(text: string, spans: Span[], drop: Set<number>): string {
  let out = "";
  let cursor = 0;
  for (const [index, span] of spans.entries()) {
    if (!drop.has(index)) continue;
    out += text.slice(cursor, span.start);
    cursor = span.end;
    while (cursor < text.length && /\s/.test(text[cursor] ?? "")) cursor += 1;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * Entfernt Sätze, die **unmittelbar** demselben Satz folgen (wörtlich, normalisiert verglichen).
 * Kette „A A A" → nur das erste A bleibt.
 */
export function dropRepeatedSentences(text: string): { text: string; removed: number } {
  const spans = sentenceSpans(text);
  const drop = new Set<number>();
  for (let index = 1; index < spans.length; index += 1) {
    const previous = spans[index - 1];
    const current = spans[index];
    if (!isRemovable(previous) || !isRemovable(current)) continue;
    if (normalizeSentence(previous.text) !== normalizeSentence(current.text)) continue;
    // Die spätere Ausführung fällt weg; die Kette wird dadurch automatisch vollständig gekürzt.
    drop.add(index);
  }
  if (drop.size === 0) return { text, removed: 0 };
  return { text: withoutSpans(text, spans, drop), removed: drop.size };
}

/**
 * Schneidet die wörtliche Überlappung an der **Naht** ab: Endet `previous` mit denselben Sätzen,
 * mit denen `next` beginnt, fallen sie aus `next` heraus (größter Treffer gewinnt, max. 3 Sätze).
 */
export function dedupeSeam(previous: string, next: string): { text: string; removed: number } {
  const tail = sentenceSpans(previous);
  const head = sentenceSpans(next);
  const max = Math.min(MAX_SEAM_SENTENCES, tail.length, head.length);

  for (let size = max; size >= 1; size -= 1) {
    const tailBlock = tail.slice(tail.length - size);
    const headBlock = head.slice(0, size);
    if (headBlock.length < size) continue;
    const identical = tailBlock.every((span, position) => {
      const counterpart = headBlock[position];
      if (!isRemovable(span) || !isRemovable(counterpart)) return false;
      return normalizeSentence(span.text) === normalizeSentence(counterpart.text);
    });
    if (!identical) continue;

    const first = headBlock[0];
    const last = headBlock[size - 1];
    if (!first || !last) continue;
    const rest = next.slice(last.end).replace(/^[ \t]+/, "").replace(/^\n+/, "");
    return { text: rest, removed: size };
  }

  // Kein Satz-Treffer: Vielleicht setzt das Modell **mitten im Satz** an.
  const partial = partialOverlapLength(previous, next);
  if (partial > 0) {
    const rest = next.slice(partial).replace(/^[ \t]+/, "").replace(/^\n+/, "");
    return { text: rest, removed: 1 };
  }

  return { text: next, removed: 0 };
}

/**
 * Fügt Textstücke mit Absatzabstand zusammen und entfernt dabei die Überlappung an **jeder** Naht.
 * Ersatz für `parts.join("\n\n")`.
 */
export function joinWithoutRepeats(parts: string[]): { text: string; removed: number } {
  let result = parts[0] ?? "";
  let removed = 0;
  for (const part of parts.slice(1)) {
    const seam = dedupeSeam(result, part);
    removed += seam.removed;
    result = `${result}\n\n${seam.text}`;
  }
  return { text: result, removed };
}

/**
 * Beides in einem: erst innere Doppelungen, dann gibt es nichts mehr zu tun (Naht-Aufrufer nutzen
 * `dedupeSeam`/`joinWithoutRepeats`). Für Stellen, die nur einen einzelnen Textblock prüfen.
 */
export function cleanRepetitions(text: string): { text: string; removed: number } {
  return dropRepeatedSentences(text);
}
