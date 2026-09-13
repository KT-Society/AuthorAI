/**
 * Server-only LLM helper.
 *
 * Der wirksame Anbieter kommt aus `server/provider.ts`: OpenRouter (Standard, Key aus der `.env`)
 * oder ein eigener OpenAI-kompatibler Anbieter (Base-URL + Key aus den Einstellungen). Dieser
 * Modul darf **nie** aus Client-Code importiert werden und gibt Keys **nie** nach außen.
 */

import { ApiError } from "@promptgen/server/api";

import { cacheEnabled, cacheGet, cacheKey, cacheSet } from "./cache";
import { resolveChatEndpoint } from "./provider";
import type { ChatEndpoint, ProviderMode } from "./provider";

function noKeyMessage(label: ProviderMode): string {
  return label === "custom"
    ? "Kein API-Key für den eigenen Anbieter — bitte in den Einstellungen unter „Anbieter“ hinterlegen."
    : "Kein OPENROUTER_API_KEY in der .env gefunden. Bitte im Repo-Root ergänzen oder in den Einstellungen einen eigenen Anbieter einstellen.";
}

function providerHeaders(endpoint: ChatEndpoint, stream: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${endpoint.apiKey}`,
    "Content-Type": "application/json",
  };
  // Der Referer ist eine OpenRouter-Eigenheit; fremde Anbieter ignorieren ihn besser.
  if (endpoint.label === "openrouter") headers["HTTP-Referer"] = "https://habitatai.biz";
  if (stream) headers.Accept = "text/event-stream";
  return headers;
}

/** Fehlertext ohne Key — mit dem Provider-Detail, falls vorhanden (z. B. „invalid model"). */
async function providerError(label: ProviderMode, response: Response): Promise<string> {
  const name = label === "custom" ? "Anbieter" : "OpenRouter";
  let detail = "";
  try {
    const data = (await response.json()) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const raw = typeof data.error === "string" ? data.error : (data.error?.message ?? data.message ?? "");
    detail = raw.slice(0, 200);
  } catch {
    // Kein JSON im Fehlerfall → nur der Status.
  }
  return detail
    ? `${name}-Aufruf fehlgeschlagen (HTTP ${response.status}): ${detail}`
    : `${name}-Aufruf fehlgeschlagen (HTTP ${response.status}).`;
}

export interface ChatOptions {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  /**
   * Antwort cachen — **nur** für wiederholbare Analysen setzen (Extraktion, Fakten-Check,
   * Timeline). Bei kreativen Generierungen nie, sonst liefert „erneut generieren" dasselbe.
   */
  cache?: boolean;
}

export interface ChatResult {
  content: string;
  /** Grund des Modellendes laut Provider — "length" bedeutet Token-Limit (abgeschnitten). */
  finishReason: string | null;
}

export async function chatCompletionDetailed(options: ChatOptions): Promise<ChatResult> {
  const endpoint = resolveChatEndpoint();
  if (!endpoint.apiKey) {
    throw new ApiError(noKeyMessage(endpoint.label), 500);
  }

  const useCache = options.cache === true && cacheEnabled();
  const key = useCache ? cacheKey({ ...options, provider: endpoint.url }) : "";

  if (useCache) {
    const hit = cacheGet(key);
    if (hit) {
      console.log(`[cache] hit ${key} (${options.model})`);
      return hit;
    }
  }

  const body: Record<string, unknown> = {
    model: options.model,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
  };
  if (options.json) body.response_format = { type: "json_object" };
  if (typeof options.maxTokens === "number") body.max_tokens = options.maxTokens;
  if (typeof options.temperature === "number") body.temperature = options.temperature;

  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: providerHeaders(endpoint, false),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(await providerError(endpoint.label, response), 502);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string | null }[];
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new ApiError(
      endpoint.label === "custom"
        ? "Der Anbieter hat keine Antwort geliefert."
        : "OpenRouter hat keine Antwort geliefert.",
      502,
    );
  }
  const result: ChatResult = { content, finishReason: choice?.finish_reason ?? null };
  // Nur brauchbare Antworten cachen (kein Abbruch ins Token-Limit).
  if (useCache && result.finishReason !== "length") cacheSet(key, result);
  return result;
}

/** Bequeme Variante, wenn nur der Text gebraucht wird. */
export async function chatCompletion(options: ChatOptions): Promise<string> {
  return (await chatCompletionDetailed(options)).content;
}

/**
 * Streaming-Variante (OpenRouter SSE): meldet Textstücke über `onDelta` und liefert am Ende
 * das vollständige Ergebnis — gleiche Form wie `chatCompletionDetailed`.
 *
 * Fällt automatisch auf den normalen Aufruf zurück, wenn der Provider kein SSE liefert
 * (kein Body, `text/event-stream` fehlt oder der Stream leer bleibt). **Nie** gecacht:
 * eine Live-Vorschau ist per Definition ein neuer Lauf.
 */
export async function chatCompletionStream(
  options: ChatOptions,
  onDelta: (text: string) => void,
): Promise<ChatResult> {
  const endpoint = resolveChatEndpoint();
  if (!endpoint.apiKey) {
    throw new ApiError(noKeyMessage(endpoint.label), 500);
  }

  const body: Record<string, unknown> = {
    model: options.model,
    stream: true,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
  };
  if (options.json) body.response_format = { type: "json_object" };
  if (typeof options.maxTokens === "number") body.max_tokens = options.maxTokens;
  if (typeof options.temperature === "number") body.temperature = options.temperature;

  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: providerHeaders(endpoint, true),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(await providerError(endpoint.label, response), 502);
  }
  if (!response.body) {
    // Kein Stream verfügbar → normaler Aufruf (ohne Vorschau).
    return chatCompletionDetailed({ ...options, cache: false });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finishReason: string | null = null;

  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]" || payload.length === 0) return;
    try {
      const parsed = JSON.parse(payload) as {
        choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
      };
      const choice = parsed.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) {
        content += delta;
        onDelta(delta);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    } catch {
      // Unvollständiger Rahmen — der Rest kommt mit dem nächsten Chunk.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE-Rahmen: Zeilen mit "data: {...}", getrennt durch Leerzeilen.
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  // Letzte Zeile ohne abschließenden Zeilenumbruch nicht verlieren.
  if (buffer.trim().length > 0) consume(buffer);

  if (content.trim().length === 0) {
    // Stream war leer (Provider ohne SSE-Inhalt) → normaler Aufruf.
    return chatCompletionDetailed({ ...options, cache: false });
  }
  return { content, finishReason };
}

/** Strips markdown code fences and isolates the outermost JSON object. */
export function cleanJsonBlock(text: string): string {
  const cleaned = text.replace(/```json\n?|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return cleaned;
  return cleaned.substring(start, end + 1);
}
