/** Client wrapper for the Tavily-backed research lookup. */

import { postJson } from "./http";

export interface ResearchResult {
  title: string;
  url: string;
  content: string;
}

export interface ResearchResponse {
  answer: string;
  results: ResearchResult[];
}

export async function runResearch(query: string, maxResults = 5): Promise<ResearchResponse> {
  return postJson<ResearchResponse>("/api/research", { query, maxResults });
}
