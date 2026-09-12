/**
 * Client-Wrapper für die SSE-Routen (`/api/chapter/draft/stream`, `/api/chapter/expand/stream`).
 *
 * Der Server fällt intern auf einen normalen Aufruf zurück, wenn der Provider kein SSE
 * liefert — hier kommt also immer ein Ergebnis an. Fehler **vor** dem Start kommen als
 * JSON-Fehler, Fehler danach als `{ type: "error" }`-Ereignis.
 */

export interface StreamHandlers {
  /** Wird für jedes Textstück aufgerufen (Live-Vorschau). */
  onDelta: (text: string) => void;
}

export async function streamJson(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
): Promise<string> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    let message = `Serverfehler (HTTP ${response.status}).`;
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data.error === "string" && data.error.trim()) message = data.error;
    } catch {
      // Kein JSON → generische Meldung behalten.
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let failure: string | null = null;

  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    try {
      const event = JSON.parse(payload) as { type?: string; text?: string; error?: string };
      if (event.type === "delta" && typeof event.text === "string") {
        full += event.text;
        handlers.onDelta(event.text);
        return;
      }
      if (event.type === "done" && typeof event.text === "string") {
        // Der Server schickt den fertigen (nachbearbeiteten) Text — der hat Vorrang.
        full = event.text;
        return;
      }
      if (event.type === "error") {
        failure = event.error ?? "Unbekannter Fehler.";
      }
    } catch {
      // Unvollständiger Rahmen — der Rest kommt mit dem nächsten Chunk.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer.trim().length > 0) consume(buffer);

  if (failure) throw new Error(failure);
  if (full.trim().length === 0) throw new Error("Der Server hat keinen Text geliefert.");
  return full;
}
