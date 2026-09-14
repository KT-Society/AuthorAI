/**
 * JSONL-Streaming: Viele Extraktions- und Prüf-Routen bitten das Modell um **eine JSON-Zeile
 * pro Objekt** (statt eines großen Dokuments). Dann kann der Server jeden fertigen Eintrag
 * sofort melden, und die Oberfläche sieht die Vorschläge entstehen, statt auf das Ende zu warten.
 *
 * Diese Datei hält den Umgang damit an **einer** Stelle: tolerantes Zeilen-Parsing (Modelle
 * schmuggeln gern Fences, Kommas oder Klammern mit) und das Puffern der Textstücke.
 *
 * Die Live-Objekte sind **unvalidiert** — verbindlich ist immer das Ergebnis aus dem
 * `done`-Ereignis, das die jeweilige Route am Ende nach derselben Normalisierung wie im
 * Nicht-Streaming-Weg liefert.
 */

/** Streift Aufzählungs-/Array-Reste ab, damit auch halb-JSONL noch lesbar ist. */
export function parseJsonlLine(raw: string): Record<string, unknown> | null {
  const line = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/^[,[\]]+/, "")
    .replace(/[,\]]+$/, "")
    .trim();
  if (!line.startsWith("{")) return null;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Sammelt Textstücke und ruft `onObject` für jede fertige Zeile. `flush()` verarbeitet den Rest
 * (das Modell lässt die letzte Zeile oft ohne Zeilenumbruch enden).
 */
export function createJsonlConsumer(onObject: (object: Record<string, unknown>) => void): {
  push: (delta: string) => void;
  flush: () => void;
} {
  let buffer = "";

  const consume = (line: string) => {
    const parsed = parseJsonlLine(line);
    if (parsed) onObject(parsed);
  };

  return {
    push(delta: string) {
      buffer += delta;
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    },
    flush() {
      if (buffer.trim().length > 0) consume(buffer);
      buffer = "";
    },
  };
}

/** Der Standard-Zusatz für Stream-Prompts: das Ausgabeformat verständlich vorschreiben. */
export function jsonlFormatBlock(language: string, example: string): string {
  return `STREAMING FORMAT — CRITICAL:
Instead of one JSON document, output **one JSON object per line** (JSONL, newline-delimited).
Example line:
${example}
Rules: no array brackets, no commas between lines, one object per line, nothing else on the line.
Write each object as soon as you are sure about it, then continue with the next line.
Every string value is still in ${language}.`;
}

/**
 * Verarbeitet einen **fertigen** Text nachträglich durch denselben Zeilen-Parser.
 *
 * Sicherheitsnetz für Provider, die keine echten Textstücke liefern (kein SSE, leerer Stream
 * oder ein einzelner Block am Ende): Dann kommt über `push` nichts an, obwohl die Antwort
 * vollständig vorliegt. Aufrufer rufen das nur, wenn live **nichts** gesammelt wurde — sonst
 * würden bereits gemeldete Objekte doppelt verarbeitet.
 */
export function consumeJsonlText(
  text: string,
  onObject: (object: Record<string, unknown>) => void,
): void {
  const consumer = createJsonlConsumer(onObject);
  consumer.push(text);
  consumer.flush();
}
