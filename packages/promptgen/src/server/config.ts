/**
 * Server-side public configuration (non-secret).
 *
 * Languages are configurable without a rebuild via the root `.env`:
 *   PROMPTGEN_LANGUAGES="German,English,Japanese"
 *   PROMPTGEN_DEFAULT_LANGUAGE="German"
 *
 * The model is a free-form OpenRouter model ID provided by the client —
 * there is deliberately no hardcoded model list or default.
 */

import { hasOpenRouterKey, hasPollinationsKey, hasTavilyKey } from "./env";

export const DEFAULT_LANGUAGES = ["German", "English", "Japanese", "French"];
export const DEFAULT_LANGUAGE = "German";

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getLanguages(): string[] {
  const raw = parseList(process.env.PROMPTGEN_LANGUAGES);
  return raw.length > 0 ? raw : DEFAULT_LANGUAGES;
}

export function getDefaultLanguage(): string {
  return process.env.PROMPTGEN_DEFAULT_LANGUAGE?.trim() || DEFAULT_LANGUAGE;
}

export function getPublicConfig() {
  return {
    tavily: hasTavilyKey(),
    openrouter: hasOpenRouterKey(),
    pollinations: hasPollinationsKey(),
    languages: getLanguages(),
    defaultLanguage: getDefaultLanguage(),
  };
}
