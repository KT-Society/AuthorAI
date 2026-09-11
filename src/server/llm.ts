/**
 * Server-only LLM helper (OpenRouter).
 *
 * Reuses the promptgen environment loader for the API key. This module must
 * NEVER be imported by client code.
 */

import { getOpenRouterKey } from "@promptgen/server/env";
import { ApiError } from "@promptgen/server/api";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatOptions {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

export async function chatCompletion(options: ChatOptions): Promise<string> {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new ApiError(
      "Kein OPENROUTER_API_KEY in der .env gefunden. Bitte im Repo-Root ergänzen.",
      500,
    );
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

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://habitatai.biz",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(`OpenRouter-Aufruf fehlgeschlagen (HTTP ${response.status}).`, 502);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new ApiError("OpenRouter hat keine Antwort geliefert.", 502);
  }
  return content;
}

/** Strips markdown code fences and isolates the outermost JSON object. */
export function cleanJsonBlock(text: string): string {
  const cleaned = text.replace(/```json\n?|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return cleaned;
  return cleaned.substring(start, end + 1);
}
