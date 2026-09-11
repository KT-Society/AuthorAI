/**
 * Server-only research lookup via Tavily.
 * Uses the TAVILY_API_KEY from the repository root `.env`. Never imported by client code.
 */

import { ApiError } from "@promptgen/server/api";
import { getTavilyKey } from "@promptgen/server/env";

const TAVILY_API_URL = "https://api.tavily.com/search";

export interface ResearchResult {
  title: string;
  url: string;
  content: string;
}

export interface ResearchResponse {
  answer: string;
  results: ResearchResult[];
}

export async function runResearch(query: string, maxResults: number): Promise<ResearchResponse> {
  const apiKey = getTavilyKey();
  if (!apiKey) {
    throw new ApiError("Kein TAVILY_API_KEY in der .env gefunden. Bitte im Repo-Root ergänzen.", 500);
  }

  const response = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: Math.max(1, Math.min(10, maxResults)),
    }),
  });

  if (!response.ok) {
    throw new ApiError(`Tavily-Recherche fehlgeschlagen (HTTP ${response.status}).`, 502);
  }

  const data = (await response.json()) as {
    answer?: string;
    results?: { title?: string; url?: string; content?: string }[];
  };

  return {
    answer: typeof data.answer === "string" ? data.answer : "",
    results: (data.results ?? [])
      .map((item) => ({
        title: typeof item.title === "string" ? item.title : "Quelle",
        url: typeof item.url === "string" ? item.url : "",
        content: typeof item.content === "string" ? item.content : "",
      }))
      .filter((item) => item.content.length > 0),
  };
}
