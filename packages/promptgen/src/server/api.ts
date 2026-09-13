/**
 * Server-only upstream integrations (Tavily + OpenRouter).
 *
 * API keys are read from the environment (root `.env`) and are never sent to
 * the browser. This module must NEVER be imported by client code.
 */

import { getOpenRouterKey, getTavilyKey } from "./env";

const TAVILY_API_URL = "https://api.tavily.com/search";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Optionaler Anbieter-Override (vom Root-Server aufgelöst; Standalone nutzt die `.env`). */
export interface ProviderOverride {
  /** Vollständige Chat-Completions-URL. */
  url: string;
  apiKey: string;
  /** `custom` unterdrückt den OpenRouter-Referer. */
  label?: string;
}

export interface GenerateInput {
  slug: string;
  model: string;
  language: string;
  provider?: ProviderOverride;
}

interface TavilyResponse {
  results?: unknown[];
  answer?: string;
}

async function searchTavily(query: string): Promise<TavilyResponse> {
  const apiKey = getTavilyKey();
  if (!apiKey) {
    throw new ApiError(
      "Kein TAVILY_API_KEY in der .env gefunden. Bitte im Repo-Root ergänzen.",
      500,
    );
  }

  const response = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: `Explain the character canon of ${query} in detail. Focus on biography, personality, and relationships.`,
      search_depth: "advanced",
      include_answer: true,
      max_results: 5,
    }),
  });

  if (!response.ok) {
    throw new ApiError(`Tavily-Suche fehlgeschlagen (HTTP ${response.status}).`, 502);
  }

  return (await response.json()) as TavilyResponse;
}

function cleanJSON(text: string): string {
  // Remove markdown code blocks if present
  const cleaned = text.replace(/```json\n?|```/g, "").trim();
  // Find the first { and last } to isolate the JSON object
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return cleaned;
  return cleaned.substring(start, end + 1);
}

async function synthesizeSoul(
  slug: string,
  research: TavilyResponse,
  model: string,
  language: string,
  provider?: ProviderOverride,
): Promise<Record<string, string>> {
  const apiKey = provider?.apiKey || getOpenRouterKey();
  const url = provider?.url || OPENROUTER_API_URL;
  if (!apiKey) {
    throw new ApiError(
      "Kein API-Key für den LLM-Anbieter gefunden — bitte in den Einstellungen (Anbieter) oder in der .env hinterlegen.",
      500,
    );
  }

  const systemPrompt = `
    You are an expert character analyst and AI Soul designer. 
    Your task is to generate a comprehensive character prompt for the character "${slug}".
    Use the provided research data to fill 12 specific sections.

    LANGUAGE LOCK — MANDATORY:
    - Every string value in the JSON MUST be written in ${language}.
    - This applies to ALL 12 sections. Do NOT switch to English at any point, especially not in later sections.
    - Only the JSON property names stay English; all content is prose in ${language}.

    CRITICAL RULE: Each section MUST contain at least 3 distinct sentences.
    FORMAT: Respond ONLY with a valid JSON object. 
    Property names and string values MUST use double quotes. 
    Escape any internal double quotes with a backslash (\\").
    Strictly NO comments (// or /* */) or extra text inside the JSON.
    No markdown formatting, no conversational text.

    JSON KEYS: 
    head, core, bio, trivia, appearance, personality, relationships, occupation, skills, speech, goals, emotes.

    SECTIONS DEFINITION:
    - head: System instructions and identity override.
    - core: The fundamental essence of the character.
    - bio: Static canonical background history.
    - trivia: Minor details, likes, dislikes, quirks.
    - appearance: Visual description and "aura".
    - personality: Psychological profile and behaviors.
    - relationships: How they interact with others.
    - occupation: What they do in their world.
    - skills: Abilities, powers, or special knowledge.
    - speech: Linguistic style and typical vocabulary.
    - goals: Short-term and long-term motivations.
    - emotes: How they express emotions in *asterisks*.
  `;

  const userPrompt = `
    Character: ${slug}
    Research Data: ${JSON.stringify(research.results)}
    Context Answer: ${research.answer}

    Remember: write every section in ${language}, not in English.
  `;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  // Der Referer ist eine OpenRouter-Eigenheit; fremde Anbieter ignorieren ihn besser.
  if (provider?.label !== "custom") headers["HTTP-Referer"] = "https://habitatai.biz";

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const name = provider?.label === "custom" ? "Anbieter" : "OpenRouter";
    throw new ApiError(`${name}-Synthese fehlgeschlagen (HTTP ${response.status}).`, 502);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new ApiError("Der LLM-Anbieter hat keine Antwort geliefert.", 502);
  }

  try {
    return JSON.parse(cleanJSON(rawContent)) as Record<string, string>;
  } catch {
    console.error("[api] Failed to parse LLM response:", rawContent);
    throw new ApiError(
      "LLM hat ungültiges JSON geliefert. Probier ein anderes Modell oder versuch es nochmal! 💀",
      502,
    );
  }
}

export async function generateSoul(input: GenerateInput): Promise<Record<string, string>> {
  const research = await searchTavily(input.slug);
  return synthesizeSoul(input.slug, research, input.model, input.language, input.provider);
}
