/**
 * Client-Wrapper für die Kontinuitäts-Extraktion.
 *
 * Spricht ausschließlich mit dem lokalen Server (`/api/*`); Keys bleiben serverseitig.
 */

import type { ExtractedContinuity } from "@/data/continuity";
import type { Storyboard } from "@/data/story";

import { postJson } from "./http";

export interface ContinuityExtractRequest {
  storyboard: Storyboard;
  characters: { name: string; role?: string }[];
  worldNames?: string[];
  knownStatements?: string[];
  knownRelations?: string[];
  model: string;
  language: string;
}

export async function extractContinuity(
  input: ContinuityExtractRequest,
): Promise<ExtractedContinuity> {
  const data = await postJson<Partial<ExtractedContinuity>>("/api/continuity/extract", input);
  return {
    facts: Array.isArray(data.facts) ? data.facts : [],
    relations: Array.isArray(data.relations) ? data.relations : [],
  };
}
