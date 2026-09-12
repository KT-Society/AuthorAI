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

/**
 * Generischer SSE-Leser für die `/api/*`-Stream-Routen: ruft jedes `data:`-Ereignis ab.
 * Fehler **vor** dem Start kommen als JSON, Fehler danach als `{ type: "error" }`-Ereignis.
 */
export async function streamEvents(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
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
  let serverError: string | null = null;

  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return; // Unvollständiger Rahmen — der Rest kommt mit dem nächsten Chunk.
    }

    if (event.type === "error") {
      serverError = typeof event.error === "string" ? event.error : "Unbekannter Fehler.";
      return;
    }
    onEvent(event);
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

  if (serverError) throw new Error(serverError);
}

export async function streamJson(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
): Promise<string> {
  let full = "";

  await streamEvents(path, body, (event) => {
    if (event.type === "delta" && typeof event.text === "string") {
      full += event.text;
      handlers.onDelta(event.text);
      return;
    }
    if (event.type === "done" && typeof event.text === "string") {
      // Der Server schickt den fertigen (nachbearbeiteten) Text — der hat Vorrang.
      full = event.text;
    }
  });

  if (full.trim().length === 0) throw new Error("Der Server hat keinen Text geliefert.");
  return full;
}
