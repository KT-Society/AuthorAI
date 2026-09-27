/**
 * Erkennt und entfernt **Wiederholungs-Schleifen** in LLM-Prosa.
 *
 * Server **und** Client importieren dieses Modul — deshalb in `lib/` und frei von
 * `server/`-Abhängigkeiten. Genutzt wird es nach jedem Schritt, der Modelltext **anhängt**
 * (Continuation-Loop beim Ausbau, `completeProse`) oder Chunks zusammensetzt (Kohärenz,
 * Stil): Genau dort entsteht das gefürchtete Muster „dieselben Sätze immer wieder",
 * weil das Modell nur den Schwanz des Textes sieht und die Fortsetzung am Kontext
 * entlang dreht, statt voranzukommen.
 */

/**
 * Vergleicht zwei Texte über ein Shingle-Set (Wort-3-Gramme, normalisiert).
 * Rückgabe ist ein Jaccard-ähnlicher Wert: |A∩B| / min(|A|, |B|) — 0 heißt
 * keine Überlappung, 1 heißt vollständig in der anderen Menge enthalten.
 *
 * `min` filtert Shingles, die kürzer als 3 Wörter sind (rein numerische Kurzsätze,
 * Interjektionen) — sie sind zu generisch, um Wiederholung zu beweisen.
 */
export function proseSimilarity(a: string, b: string): number {
  const setA = shingles(a);
  const setB = shingles(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  if (setB.size > setA.size) {
    const smaller = setA;
    const larger = setB;
    let overlap = 0;
    for (const shingle of smaller) if (larger.has(shingle)) overlap += 1;
    return overlap / smaller.size;
  }
  let overlap = 0;
  for (const shingle of setB) if (setA.has(shingle)) overlap += 1;
  return overlap / setB.size;
}

function shingles(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set<string>();
  for (let index = 0; index + 3 <= words.length; index += 1) {
    const gram = words.slice(index, index + 3).join(" ");
    // Rein numerische Gramme sind zu generisch („1 2 3") — sie beweisen nichts.
    if (/\d/.test(gram)) continue;
    set.add(gram);
  }
  return set;
}

/** Mindestlänge eines Anhängs in Zeichen, ab der geprüft wird (davor ist Zufall erlaubt). */
const MIN_APPEND_CHARS = 200;

/**
 * Entfernt einen Wiederholungs-Schwanz aus einem Anhäng-Text und liefert den
 * bereinigten Text plus einen Hinweis (falls gekürzt wurde).
 *
 * Ablauf für jeden aneinandergesetzten Block:
 * 1. Identische Wiederholung innerhalb des Anhängs selbst
 *    (Modell liefert dieselbe Passage zweimal hintereinander) → nur das erste
 *    Vorkommen bleibt.
 * 2. Überlappung mit dem **Anker** (der bestehende Text, typisch die letzten
 *    2.000 Zeichen, die das Modell als Kontext sah) → das Modell hat den
 *    Kontext neu geschrieben statt zu fortzusetzen; der Echoteil fliegt raus.
 * 3. Auffällig gleichförmige Passagen (fünf hintereinander identische Shingles)
 *    werden im verbleibenden Text gestutzt.
 */
export function trimRepeatedProse(
  appended: string,
  anchor: string,
): { text: string; note?: string } {
  const input = appended.trim();
  if (input.length < MIN_APPEND_CHARS) return { text: input };

  let text = input;
  let trimmed = false;

  // 1. Identische Block-Wiederholung innerhalb des Anhängs (zwei hintereinander).
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const block of blocks) {
    const previous = kept[kept.length - 1];
    if (previous && sameProse(previous, block)) {
      trimmed = true;
      continue;
    }
    kept.push(block);
  }
  text = kept.join("\n\n");

  // 2. Echo des Kontext-Ankers: Schon 35 % Überlappung mit dem sichtbaren Kontext
  //    heißt „neu geschrieben statt fortgesetzt" — das Ecko fliegt raus.
  const anchorTail = anchor.trim().slice(-2000);
  if (anchorTail.length > 80) {
    const boundary = echoBoundary(text, anchorTail);
    if (boundary !== undefined) {
      text = text.slice(boundary).trim();
      trimmed = true;
    }
  }

  // 3. Schleifen im Verbleibenden (identische Shingle-Folge ≥ 3 Wörter, fünfmal).
  const before = text;
  text = trimShingleLoops(text);
  if (text !== before) trimmed = true;

  if (!trimmed) return { text };
  return {
    text,
    note: "⚠️ In der Fortsetzung wurde wiederholte Prosa (Echo/Loop) entfernt, bevor sie angehängt wurde.",
  };
}

/** Zwei Blöcke gelten als identisch, wenn ihre 3-Gramme ≥ 85 % überlappen. */
function sameProse(a: string, b: string): boolean {
  if (a === b) return true;
  return proseSimilarity(a, b) >= 0.85;
}

/**
 * Findet die Grenze, ab der `text` nur noch den Anker-Echo wiederholt.
 * Rückgabe ist der Offset **hinter** dem Echo (oder `undefined`, wenn kein Echo).
 */
function echoBoundary(text: string, anchor: string): number | undefined {
  const anchorSet = shingles(anchor);
  if (anchorSet.size === 0) return undefined;

  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  let offset = 0;
  let echoBlocks = 0;
  for (const block of blocks) {
    const similarity = overlapRatio(shingles(block), anchorSet);
    if (similarity >= 0.35) {
      offset += block.length + 2; // „\n\n"
      echoBlocks += 1;
      continue;
    }
    break;
  }
  // Erst ab zwei Echo-Blöcken kürzen — ein einzelner ähnlicher Absatz ist legitim.
  if (echoBlocks < 2) return undefined;
  return offset;
}

function overlapRatio(block: Set<string>, anchor: Set<string>): number {
  if (block.size === 0 || anchor.size === 0) return 0;
  const smaller = block.size <= anchor.size ? block : anchor;
  const larger = block.size <= anchor.size ? anchor : block;
  let overlap = 0;
  for (const shingle of smaller) if (larger.has(shingle)) overlap += 1;
  return overlap / smaller.size;
}

/** Mindestanzahl hintereinander identischer Sätze, ab der gestutzt wird. */
const LOOP_THRESHOLD = 3;

/**
 * Stutzt Satz-Loops: dasselbe Modell-Satz-Muster drei- bis fünfmal hintereinander
 * („Er stand auf. Er ging zur Tür. Er stand auf. Er ging zur Tür."). Verglichen
 * wird normalisiert (Kleinschreibung, ohne Satzzeichen) — die erste Runde bleibt stehen.
 */
function trimShingleLoops(text: string): string {
  // Dieselbe Satzgrenzen-Konvention wie `splitLongParagraph` in `server/story.ts`.
  const sentences = text.split(/(?<=[.!?…»”"”])\s+/).filter((part) => part.trim().length > 0);
  if (sentences.length < LOOP_THRESHOLD * 2) return text;

  const normalized = sentences.map((sentence) =>
    sentence
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim(),
  );

  const keep: string[] = [];
  let index = 0;
  let changed = false;
  while (index < sentences.length) {
    const current = normalized[index] ?? "";
    if (current) {
      let run = 1;
      while ((normalized[index + run] ?? "") === current) run += 1;
      if (run >= LOOP_THRESHOLD) {
        // Nur das erste Vorkommen der Schleife behalten.
        keep.push(sentences[index] ?? "");
        index += run;
        changed = true;
        continue;
      }
    }
    keep.push(sentences[index] ?? "");
    index += 1;
  }
  if (!changed) return text;
  return keep.map((part) => part.trim()).filter(Boolean).join(" ");
}
